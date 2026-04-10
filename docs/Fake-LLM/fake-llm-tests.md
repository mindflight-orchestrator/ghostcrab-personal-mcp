Oui, et c'est la bonne approche. Voici pourquoi et comment.

***

## Le Problème Réel avec les Embeddings en Test

```
Test avec vrai LLM        Test avec fake embedder
────────────────────      ──────────────────────
appel API externe         pas de réseau
200-500ms par appel       < 1ms
coût par token            gratuit
flaky si API down         déterministe
rate limiting             illimité
```

Et surtout : **90% de ce qu'on teste dans GhostCrab n'implique pas la sémantique des vecteurs** — BM25, filtres JSONB, traversal de graphe, counts. Payer le coût d'un vrai embedding pour tester `ghostcrab_count` n'a aucun sens.

***

## L'Architecture : Embedding comme Dépendance Injectable

La modification est minime dans `src/db/client.ts` — extraire l'embedder en interface.

```typescript
// src/embeddings/types.ts
export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  dimensions: number
}

// src/embeddings/openai.ts  ← production
import OpenAI from 'openai'

export class OpenAIEmbedder implements EmbeddingProvider {
  dimensions = 1536
  private client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  async embed(text: string): Promise<number[]> {
    const res = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    })
    return res.data[0].embedding
  }
}

// src/embeddings/ollama.ts  ← local LLM alternatif
export class OllamaEmbedder implements EmbeddingProvider {
  dimensions = 768  // selon le modèle
  constructor(
    private model = 'nomic-embed-text',
    private baseUrl = 'http://localhost:11434'
  ) {}

  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      body: JSON.stringify({ model: this.model, prompt: text })
    })
    const data = await res.json()
    return data.embedding
  }
}
```

***

## Les 3 Fake Embedders pour les Tests

### Fake 1 — Null Embedder (le plus simple)

```typescript
// src/embeddings/null.ts
// Pour les tests qui ne touchent pas du tout la recherche sémantique
export class NullEmbedder implements EmbeddingProvider {
  dimensions = 1536

  async embed(_text: string): Promise<number[]> {
    // Retourne null → le champ embedding reste NULL en DB
    // Le search hybride fall-back automatiquement sur BM25 seul
    return []
  }
}
```

Usage : tous les tests de `ghostcrab_count`, `ghostcrab_learn`, `ghostcrab_remember`, `ghostcrab_status`, `ghostcrab_traverse`. Soit ~80% des tests.

***

### Fake 2 — Deterministic Hash Embedder (le plus utile)

```typescript
// src/embeddings/fake.ts
// Produit un vecteur déterministe à partir du contenu
// Deux textes similaires → vecteurs différents (pas de vraie sémantique)
// Même texte → même vecteur (déterministe → tests reproductibles)

export class FakeEmbedder implements EmbeddingProvider {
  dimensions = 1536

  async embed(text: string): Promise<number[]> {
    // Seed déterministe depuis le texte
    let seed = this.hashCode(text)
    const vector: number[] = []

    for (let i = 0; i < this.dimensions; i++) {
      // LCG simple — déterministe, pas de dépendance externe
      seed = (seed * 1664525 + 1013904223) & 0xffffffff
      // Normaliser entre -1 et 1
      vector.push((seed / 0x7fffffff))
    }

    // Normaliser le vecteur (cosine similarity requiert ça)
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0))
    return vector.map(v => v / norm)
  }

  private hashCode(str: string): number {
    let hash = 5381
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i)
      hash = hash & 0xffffffff
    }
    return Math.abs(hash)
  }
}
```

Usage : tests qui vérifient que le champ embedding est bien stocké, que l'index ivfflat fonctionne, que la recherche hybride retourne des résultats.

***

### Fake 3 — Fixture Embedder (pour les tests sémantiques réels)

```typescript
// src/embeddings/fixture.ts
// Charge des embeddings pré-calculés depuis un fichier JSON
// Générés une fois avec un vrai LLM, commités dans tests/fixtures/

import embeddingFixtures from '../../tests/fixtures/embeddings.json'

export class FixtureEmbedder implements EmbeddingProvider {
  dimensions = 1536

  async embed(text: string): Promise<number[]> {
    const key = text.trim().toLowerCase()
    if (embeddingFixtures[key]) {
      return embeddingFixtures[key]
    }
    // Fallback : FakeEmbedder pour les textes sans fixture
    console.warn(`[FixtureEmbedder] No fixture for: "${text.substring(0,50)}..."`)
    return new FakeEmbedder().embed(text)
  }
}
```

```json
// tests/fixtures/embeddings.json
// Généré UNE FOIS avec : npm run generate:fixtures
{
  "gdpr article 49 data transfer": [0.023, -0.041, 0.187, ...],
  "stripe payment webhook handler": [-0.012, 0.098, 0.034, ...],
  "implement oauth pkce flow": [0.156, -0.023, 0.091, ...]
}
```

```typescript
// scripts/generate-fixtures.ts — script one-shot
// Lance avec : DATABASE_URL=... OPENAI_API_KEY=... npx ts-node scripts/generate-fixtures.ts

const TEST_TEXTS = [
  "gdpr article 49 data transfer",
  "stripe payment webhook handler",
  "implement oauth pkce flow",
  // ... ajouter au fur et à mesure des besoins
]

async function generate() {
  const embedder = new OpenAIEmbedder()
  const fixtures: Record<string, number[]> = {}
  for (const text of TEST_TEXTS) {
    fixtures[text.trim().toLowerCase()] = await embedder.embed(text)
    console.log(`✓ ${text}`)
  }
  fs.writeFileSync('tests/fixtures/embeddings.json', JSON.stringify(fixtures, null, 2))
}
```

***

## Injection dans le Serveur

```typescript
// src/index.ts — sélection selon NODE_ENV

import { OpenAIEmbedder }   from './embeddings/openai.js'
import { OllamaEmbedder }   from './embeddings/ollama.js'
import { FakeEmbedder }     from './embeddings/fake.js'
import { NullEmbedder }     from './embeddings/null.js'

function resolveEmbedder(): EmbeddingProvider {
  const provider = process.env.EMBEDDING_PROVIDER ?? 'null'

  switch (provider) {
    case 'openai':   return new OpenAIEmbedder()
    case 'ollama':   return new OllamaEmbedder(
                       process.env.OLLAMA_MODEL,
                       process.env.OLLAMA_URL
                     )
    case 'fake':     return new FakeEmbedder()
    case 'null':
    default:         return new NullEmbedder()
  }
}

export const embedder = resolveEmbedder()
```

```bash
# .env.test
EMBEDDING_PROVIDER=fake    # déterministe, pas de réseau

# .env.development
EMBEDDING_PROVIDER=ollama  # local, gratuit, lent
OLLAMA_MODEL=nomic-embed-text
OLLAMA_URL=http://localhost:11434

# .env.production
EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

***

## Matrice de Tests par Fake Embedder

| Suite de tests | Embedder | Pourquoi |
|---|---|---|
| `ghostcrab_count`, `ghostcrab_status`, `ghostcrab_learn`, `ghostcrab_traverse` | `NullEmbedder` | Pas de sémantique — BM25 + JSONB suffisent |
| `ghostcrab_remember` (store + retrieve) | `FakeEmbedder` | Vérifie que le vecteur est stocké, pas sa qualité |
| `ghostcrab_search` mode `bm25` | `NullEmbedder` | BM25 pur, embedding non utilisé |
| `ghostcrab_search` mode `hybrid` | `FakeEmbedder` | Vérifie que le score hybride fonctionne |
| `ghostcrab_pack` ranking | `FakeEmbedder` | Vérifie l'ordre des résultats, pas leur pertinence sémantique |
| Tests de pertinence sémantique réelle | `FixtureEmbedder` | Seuls tests qui nécessitent de vraie sémantique |

**Résultat pratique** : `FixtureEmbedder` est utilisé dans 5-10% des tests. Le reste tourne avec `NullEmbedder` ou `FakeEmbedder` — aucun appel réseau, suite complète en moins de 5 secondes.