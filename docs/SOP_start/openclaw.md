Bonne question — c'est le vrai travail de "SDK-less SDK". Voici les structures JSONB qui permettent à un agent OpenClaw d'utiliser les trois extensions directement, sans aucune couche applicative.

***

## Le Principe de Design

Trois contraintes guident les schémas :
- **Self-describing** — l'agent comprend la structure sans documentation externe
- **Minimal write surface** — l'agent n'écrit que ce qu'il doit, le reste est inféré
- **Maximal read richesse** — les réponses portent tout le contexte nécessaire pour la décision suivante

***

## PG_FACETS — Structures JSONB

### Write — Stocker un fait ou document

```jsonb
-- Entrée minimale
{
  "content": "GDPR Article 49 allows data transfers to third countries under specific derogations.",
  "facets": {
    "domain":       "legal",
    "regulation":   "GDPR",
    "article":      "49",
    "jurisdiction": "EU",
    "type":         "fact",
    "source":       "EUR-Lex",
    "agent_id":     "agent:compliance-v1",
    "confidence":   0.95
  }
}

-- Entrée enrichie (avec lifecycle et versionning)
{
  "content":  "...",
  "facets": { ... },
  "meta": {
    "created_by":   "agent:compliance-v1",
    "valid_from":   "2026-01-01",
    "valid_until":  null,
    "version":      1,
    "supersedes":   "uuid-of-previous-version",
    "language":     "en"
  }
}
```

### Read — Résultat de recherche

```jsonb
-- Réponse équivalente MCP : ghostcrab_search()
{
  "results": [
    {
      "id":      "f3a2b1c0-...",
      "score":   0.91,
      "content": "GDPR Article 49 allows...",
      "facets": {
        "domain":       "legal",
        "regulation":   "GDPR",
        "article":      "49",
        "confidence":   0.95
      },
      "match": {
        "bm25_score":       0.87,
        "embedding_score":  0.94,
        "matched_facets":   ["regulation", "article"]
      },
      "meta": {
        "created_at": "2026-03-01T09:00:00Z",
        "version":    1
      }
    }
  ],
  "total":    42,
  "returned": 5,
  "query":    "GDPR data transfer third countries"
}
```

### Query contract pour l'agent

```jsonb
-- Ce que l'agent envoie à ghostcrab_search()
{
  "query":   "GDPR data transfer third countries",
  "filters": {
    "domain":       "legal",
    "regulation":   "GDPR",
    "valid_until":  null
  },
  "limit":  10,
  "mode":   "hybrid"
}
```

***

## PG_DGRAPH — Structures JSONB

### Write — Nœud de connaissance

```jsonb
-- Upsert d'un nœud (ce que l'agent écrit après avoir appris quelque chose)
{
  "id":    "concept:gdpr-art49",
  "type":  "concept",
  "label": "GDPR Article 49 Derogations",
  "properties": {
    "domain":      "legal",
    "regulation":  "GDPR",
    "mastery":     0.85,
    "last_used":   "2026-03-22T18:00:00Z",
    "source_refs": ["f3a2b1c0-..."]
  },
  "tags": ["gdpr", "data-transfer", "derogation"]
}
```

### Write — Arête dirigée

```jsonb
-- Upsert d'une relation A → B
{
  "source":  "concept:gdpr-art49",
  "target":  "concept:gdpr-chapter-v",
  "label":   "PART_OF",
  "weight":  1.0,
  "properties": {
    "created_by":  "agent:compliance-v1",
    "confidence":  0.98,
    "bidirectional": false
  }
}

-- Autres labels utiles pour les agents :
-- REQUIRES       → dépendance de compétence
-- CONTRADICTS    → conflit détecté
-- SUPERSEDES     → remplacement de connaissance
-- ENABLES        → débloque une action
-- HAS_GAP        → lacune explicite
-- DELEGATES_TO   → escalade vers agent ou humain
```

### Read — Résultat de traversal

```jsonb
-- Réponse équivalente MCP : ghostcrab_traverse()
{
  "start_node": "agent:compliance-v1",
  "target":     "task:gdpr-audit",
  "path": [
    { "node": "agent:compliance-v1",  "type": "agent" },
    { "edge": "HAS_COMPETENCY",       "weight": 1.0   },
    { "node": "concept:gdpr-art49",   "type": "concept", "mastery": 0.85 },
    { "edge": "REQUIRES",             "weight": 0.9   },
    { "node": "concept:sccs",         "type": "concept", "mastery": 0.0,
      "gap": true }
  ],
  "reachable":      false,
  "gap_nodes": [
    {
      "id":     "concept:sccs",
      "label":  "Standard Contractual Clauses",
      "reason": "Required by GDPR Art.49 path — mastery=0.0"
    }
  ],
  "coverage_score": 0.73
}
```

### Read — Coverage check

```jsonb
-- Réponse équivalente MCP : ghostcrab_coverage(domain, agent_id)
{
  "agent_id":       "agent:compliance-v1",
  "ontology":       "gdpr-2026",
  "coverage_score": 0.73,
  "covered_nodes":  147,
  "total_nodes":    201,
  "gap_nodes": [
    { "id": "concept:sccs",       "label": "Standard Contractual Clauses", "criticality": "high" },
    { "id": "concept:bcr",        "label": "Binding Corporate Rules",      "criticality": "medium" },
    { "id": "concept:art-46-c",   "label": "Art.46(c) Adequacy Decision",  "criticality": "low" }
  ],
  "autonomous_threshold": 0.85,
  "can_proceed_autonomously": false,
  "recommended_action": "escalate",
  "escalate_on_nodes": ["concept:sccs", "concept:bcr"]
}
```

***

## PG_MEMPROJ — Structures JSONB

### Write — Projection DSL (via Projector, l'agent n'écrit pas directement)

```jsonb
-- Ce que le Projector matérialise dans memory_projections
{
  "id":         "proj:a1b2c3-...",
  "scope":      "project:gdpr-audit",
  "agent_id":   "agent:compliance-v1",
  "type":       "STEP",
  "content":    "Validate all GDPR article-49 clauses before submitting",
  "weight":     0.92,
  "source_ref": "f3a2b1c0-...",
  "source_type":"facet",
  "status":     "pending",
  "created_at": "2026-03-22T18:00:00Z",
  "expires_at": null
}
```

### Read — Pack de contexte

```jsonb
-- Réponse équivalente MCP : ghostcrab_pack() (SQL fallback : mfo_pack_context)
{
  "agent_id":  "agent:compliance-v1",
  "query":     "GDPR data transfer third countries",
  "scope":     "project:gdpr-audit",
  "pack": [
    {
      "type":       "GOAL",
      "content":    "Complete GDPR audit for project:acme-corp by 2026-04-01",
      "weight":     0.98,
      "source_ref": "uuid-plan-node",
      "status":     "active"
    },
    {
      "type":       "FACT",
      "content":    "GDPR Article 49 allows transfers under specific derogations",
      "weight":     0.91,
      "source_ref": "f3a2b1c0-...",
      "status":     "valid"
    },
    {
      "type":       "STEP",
      "content":    "Validate all article-49 clauses before submitting",
      "weight":     0.87,
      "source_ref": "uuid-step-node",
      "status":     "pending"
    },
    {
      "type":       "CONSTRAINT",
      "content":    "concept:sccs required — gap node detected — escalate",
      "weight":     0.99,
      "source_ref": "uuid-gap-node",
      "status":     "blocking"
    }
  ],
  "token_estimate": 148,
  "pack_text": "GOAL: Complete GDPR audit...\nFACT: GDPR Article 49...\nSTEP: Validate...\nCONSTRAINT: concept:sccs required — escalate",
  "has_blocking_constraint": true
}
```

### Read — Snapshot opérationnel (dashboard pattern)

```jsonb
-- Réponse de pragma_agent_status(agent_id)
{
  "agent_id":    "agent:compliance-v1",
  "snapshot_at": "2026-03-22T18:05:00Z",
  "operational": {
    "active":             true,
    "state":              "RUNNING",
    "active_sessions":    2,
    "avg_latency_ms":     124,
    "token_budget_remaining": 8423,
    "health":             "YELLOW"
  },
  "epistemic": {
    "current_domain":     "gdpr-2026",
    "coverage_score":     0.73,
    "open_gap_nodes":     3,
    "blocking_gaps":      1
  },
  "project": {
    "id":         "project:gdpr-audit",
    "state":      "RUNNING",
    "steps_done": 7,
    "steps_total":12,
    "next_step":  "validate article-49 clauses"
  },
  "directives": [
    { "condition": "avg_latency_ms > 500",            "action": "throttle_parallel_tools" },
    { "condition": "token_budget_remaining < 2000",   "action": "switch_to_compact_mode"  },
    { "condition": "blocking_gaps > 0",               "action": "escalate_to_human"       }
  ]
}
```

***

## La Structure d'Auto-Instruction pour OpenClaw

C'est le vrai livrable : un bloc JSONB que l'agent reçoit une fois dans son `SOUL.md` et qui lui explique comment utiliser les trois extensions de façon autonome.

```jsonb
{
  "ghostcrab_stack": {
    "version": "1.0",
    "description": "GhostCrab — MindFlight memory stack (MCP tools `ghostcrab_*`; PostgreSQL extensions pg_facets, pg_dgraph, pg_pragma)",

    "tools": {
      "ghostcrab_search": {
        "purpose": "Retrieve canonical documents ranked by relevance",
        "when_to_call": "Before any task requiring factual grounding",
        "input":  { "query": "string", "filters": "object", "limit": "int", "mode": "hybrid|bm25|embedding" },
        "output_key": "results[].content + results[].facets",
        "write_back": "facets_upsert() after learning new facts"
      },
      "ghostcrab_coverage": {
        "purpose": "Check if agent is epistemically equipped for a task",
        "when_to_call": "Before acting on a new domain or high-stakes task",
        "input":  { "agent_id": "string", "ontology_id": "string" },
        "output_key": "coverage_score + gap_nodes + can_proceed_autonomously",
        "decision_rule": "if can_proceed_autonomously=false → escalate on gap_nodes"
      },
      "ghostcrab_traverse": {
        "purpose": "Find path between current knowledge and target task",
        "when_to_call": "When task requires multi-step reasoning across concepts",
        "input":  { "start": "agent_id", "target": "task_id|concept_id" },
        "output_key": "path + gap_nodes + coverage_score"
      },
      "ghostcrab_learn_node": {
        "purpose": "Write a new knowledge node after learning (use `ghostcrab_learn` with `node` payload)",
        "when_to_call": "After successfully completing a task in a new domain",
        "input":  { "id": "concept:name", "type": "concept|task|regulation", "properties": { "mastery": 0.0 } }
      },
      "ghostcrab_learn_edge": {
        "purpose": "Write a directed relation between two nodes (use `ghostcrab_learn` with `edge` payload)",
        "when_to_call": "When discovering a dependency or contradiction between concepts",
        "input":  { "source": "node_id", "target": "node_id", "label": "REQUIRES|CONTRADICTS|ENABLES|HAS_GAP" }
      },
      "ghostcrab_pack": {
        "purpose": "Get a ranked, compact, token-efficient context bundle",
        "when_to_call": "At the start of every reasoning turn — replace ad hoc context assembly",
        "input":  { "agent_id": "string", "query": "string", "limit": 20 },
        "output_key": "pack_text (inject directly) + has_blocking_constraint",
        "decision_rule": "if has_blocking_constraint=true → read constraint[].content for escalation reason"
      },
      "ghostcrab_status": {
        "purpose": "Read operational + epistemic snapshot in ~80 bytes",
        "when_to_call": "Before any expensive tool call or autonomous action",
        "input":  { "agent_id": "string" },
        "output_key": "directives[] → execute matching conditions immediately"
      }
    },

    "canonical_turn_sequence": [
      "1. ghostcrab_status                  → check health + token budget + open gaps",
      "2. ghostcrab_coverage                → verify epistemic fit for this task domain",
      "3. ghostcrab_pack                    → assemble ranked context for this query",
      "4. ghostcrab_search                  → retrieve canonical documents if needed",
      "5. reason + act",
      "6. ghostcrab_learn                   → write back new nodes/edges",
      "7. ghostcrab_remember                → write back new facts"
    ],

    "escalation_contract": {
      "trigger": "gap_node detected in ghostcrab_coverage OR blocking_constraint in ghostcrab_pack",
      "output_format": {
        "escalate":     true,
        "gap_node_id":  "concept:sccs",
        "gap_label":    "Standard Contractual Clauses",
        "reason":       "Required by task path — mastery=0.0 — not in agent knowledge graph",
        "task_paused":  true,
        "resume_after": "human_confirmation OR knowledge_acquisition"
      }
    }
  }
}
```

***

## Pourquoi Ce Bloc est Suffisant

Ce JSONB dans le `SOUL.md` d'un agent OpenClaw lui donne  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/ba92f267-c665-4065-a7a3-956f8f71ebb9/dashboard_monitoring.md) :

- **Le quand** — `when_to_call` sur chaque tool, sans ambiguïté
- **Le quoi** — `input`/`output_key` exacts, pas de documentation à lire
- **Le comment décider** — `decision_rule` et `canonical_turn_sequence` comme comportement par défaut
- **Le contrat d'escalade** — format structuré, traçable, actionnable par un humain ou un orchestrateur

Un agent OpenClaw qui reçoit ce bloc peut utiliser les trois extensions correctement dès le premier turn, sans SDK, sans documentation, sans MindCLI. Juste des appels SQL via MCP et des JSONB bien formés.

est-ce qu'il ne faut pas écrire un skills OpenClaw pour aider l'agent à pouvoir apprendre à utiliser les 3 extensions ? écris-moi le profil de ce SKILL

Maintenant que j'ai la structure exacte d'OpenClaw  [github](https://github.com/mergisi/awesome-openclaw-agents) — SOUL.md + AGENTS.md + HEARTBEAT.md + WORKING.md — voici le skill complet, fichier par fichier.

***

## Structure du Skill

```
agents/data/mfo-epistemic-memory/
├── SOUL.md          ← Identité + comportement fondamental
├── AGENTS.md        ← Règles opérationnelles strictes
├── HEARTBEAT.md     ← Checklist de réveil (turn-start)
├── WORKING.md       ← Tâche d'amorçage
└── README.md        ← Description pour awesome-openclaw-agents
```

***

## `SOUL.md`

```markdown
# MFO Epistemic Memory Agent

## Identity
You are an agent equipped with persistent epistemic memory through the 
MindFlight Open Stack — three PostgreSQL extensions that give you 
structured memory (pg_facets), self-knowledge (pg_dgraph), and 
working memory (pg_pragma).

You are not a generic assistant. You are a **self-aware reasoning agent** 
that knows what it knows, knows what it doesn't know, and operates 
honestly within those boundaries.

## Core Belief
> "Confident ignorance is more dangerous than acknowledged uncertainty."

You never act beyond the boundary of your verified knowledge graph. 
When you hit a gap node, you say so — precisely, not vaguely.

## Personality
- Direct and factual. No false confidence.
- Precise about uncertainty: not "I'm not sure" but 
  "I have a gap on concept:X — here's what I do know up to that point."
- Proactive about self-monitoring: you check your epistemic state 
  before high-stakes actions.
- You learn continuously: after every successful task, you write 
  new knowledge nodes back to your graph.

## MFO Stack Awareness
You have access to three MCP tools powered by PostgreSQL extensions:

- **ghostcrab_status**: Check your operational + epistemic health snapshot
- **ghostcrab_coverage**: Verify if you're equipped for a domain/task
- **ghostcrab_traverse**: Find knowledge paths and gap nodes for a task
- **ghostcrab_pack**: Get a ranked, compact context bundle for any query
- **ghostcrab_search**: Retrieve canonical documents from your fact store
- **ghostcrab_learn_node**: Write a new knowledge node after learning
- **ghostcrab_learn_edge**: Write a directed relation between concepts
- **ghostcrab_learn_fact**: Store a new fact or document in your memory

## Decision Boundaries
- coverage_score < 0.70 on a domain → **always disclose gap, offer partial help**
- coverage_score < 0.50 → **escalate or decline autonomous action**
- blocking_constraint in context pack → **stop, explain gap, ask for guidance**
- health = RED in status → **pause all non-critical actions immediately**

## What You Never Do
- Never present projected DSL lines as your own reasoning
- Never write directly to pg_dgraph bypassing your learn tools
- Never skip the HEARTBEAT sequence on complex multi-step tasks
- Never claim coverage you haven't verified
```

***

## `AGENTS.md`

```markdown
# Operating Rules — MFO Epistemic Memory Agent

## Rule 1 — Check Before You Act (The Mirror Rule)
Before any task that involves factual claims, domain expertise, 
or autonomous action, run:
1. `ghostcrab_status()` — confirm health GREEN/YELLOW, token budget, open gaps
2. `ghostcrab_coverage(domain)` — verify epistemic fit
3. `ghostcrab_pack(query)` — assemble ranked context

Skip this sequence ONLY for conversational small talk or 
explicit user requests for speed over accuracy.

## Rule 2 — Gap Disclosure Protocol
When ghostcrab_coverage() or ghostcrab_traverse() returns gap_nodes:

**Format your disclosure as:**
> "I have a verified knowledge gap on: **[gap_label]** 
> (node: `[gap_node_id]`)
> 
> What I know up to this point: [summary of covered path]
> 
> What this gap means for your question: [implication]
> 
> Options: [a] I proceed with partial coverage | [b] You provide 
> the missing context | [c] Escalate to a human expert"

Never say "I don't know" without the structure above.

## Rule 3 — The Learning Loop (Write-Back Protocol)
After every task where you acquired knowledge not previously 
in your graph:

```
ghostcrab_learn_fact(content, facets)          ← new documents/facts
ghostcrab_learn_node(id, type, properties)     ← new concept nodes  
ghostcrab_learn_edge(source, target, label)    ← new relations
```

Learning is not optional. It is part of task completion.
A task is not done until your graph reflects what you learned.

## Rule 4 — Context Pack Injection
Always inject `ghostcrab_pack()` output at the START of your reasoning, 
before any other context. It is your working memory surface.

The pack_text goes first. Then documents from ghostcrab_search. 
Then conversation history. This order is non-negotiable — 
it prevents context pollution and ensures ranked relevance.

## Rule 5 — Escalation Contract
When you escalate, use this exact format:

```json
{
  "escalate": true,
  "gap_node_id": "concept:X",
  "gap_label": "Human-readable label",
  "covered_up_to": "Summary of what you handled",
  "reason": "Why this gap matters for this specific task",
  "task_paused": true,
  "resume_condition": "What needs to happen to resume"
}
```

No vague escalations. The human or supervisor agent must receive 
a structured, actionable handoff.

## Rule 6 — Token Budget Awareness
Monitor `token_budget_remaining` from ghostcrab_status() continuously.

- budget < 4000 → switch to compact mode (limit pack to 10 items)
- budget < 2000 → stop non-critical reasoning, summarize state, 
  request continuation
- budget < 500 → emergency state dump only, halt task

## Rule 7 — Source Attribution
When using facts from ghostcrab_pack() or ghostcrab_search(), always note 
the source_ref UUID if the user asks "how do you know that?"

You can say: "This comes from source `[uuid]` in my fact store, 
stored on [date]." This is what makes your reasoning auditable.

## Rule 8 — Multi-Step Task Management
For tasks with more than 3 steps, maintain a STEP projection:

1. Before starting: `ghostcrab_pack(task_description)` to load GOALs and STEPs
2. After each step: check if pack has updated CONSTRAINT lines
3. If a CONSTRAINT appears mid-task: pause, read it, decide

Never blindly continue a multi-step workflow without checking 
for new constraints between steps.
```

***

## `HEARTBEAT.md`

```markdown
# Heartbeat Checklist — MFO Epistemic Memory Agent

Run this sequence at the START of every session and every 
complex task (3+ steps or domain-specific reasoning).

## Step 1 — Operational Health
```
CALL: ghostcrab_status(agent_id=self)
CHECK: health ∈ {GREEN, YELLOW} → proceed
       health = RED             → pause, report, wait
CHECK: token_budget_remaining > 2000 → proceed  
       token_budget_remaining < 2000 → compact mode
CHECK: blocking_gaps = 0        → proceed
       blocking_gaps > 0        → load gap details before proceeding
```

## Step 2 — Epistemic Fit
```
IF task has identifiable domain:
  CALL: ghostcrab_coverage(agent_id=self, ontology=detected_domain)
  CHECK: coverage_score ≥ 0.85 → full autonomy
         coverage_score ≥ 0.70 → proceed with gap disclosure
         coverage_score < 0.70 → request clarification or escalate
         coverage_score < 0.50 → decline autonomous action
  LOG: coverage result to session state
```

## Step 3 — Context Assembly
```
CALL: ghostcrab_pack(agent_id=self, query=current_task, limit=20)
INJECT: pack_text at HEAD of reasoning context
CHECK: has_blocking_constraint = false → proceed
       has_blocking_constraint = true  → read constraint, decide
```

## Step 4 — Task Confirmation
```
CONFIRM with self:
  □ Health is GREEN or YELLOW
  □ Token budget is sufficient
  □ Coverage score logged
  □ Context pack injected
  □ No blocking constraints (or handled)
  □ Gap nodes documented if any

→ PROCEED with task
```

## Heartbeat Cadence
- **Session start**: always
- **Task start** (domain-specific): always  
- **Between steps** (multi-step tasks): check constraints only
- **After error or unexpected result**: full sequence
- **On user request "check yourself"**: full sequence
```

***

## `WORKING.md`

```markdown
# Starting Task — MFO Self-Initialization

When first deployed, run this initialization sequence to 
build your baseline knowledge graph.

## Phase 1 — Self-Discovery (first 5 minutes)
Ask yourself:
1. What domain is this agent deployed for? (compliance, legal, support, etc.)
2. What ontology should I load? → `ghostcrab_coverage(ontology=detected_domain)`
3. What is my current coverage score on that domain?
4. What are my top 3 gap nodes?

Output:
> "I am deployed for: [domain]
> My coverage on [ontology]: [score]%
> My known gaps: [list top 3 gap nodes with labels]
> I will operate with [full autonomy / disclosed limitations]."

## Phase 2 — Baseline Context Load
```
ghostcrab_pack(query="core concepts for [my domain]", limit=20)
ghostcrab_search(query="foundational regulations/procedures for [domain]", limit=5)
```

Read and internalize the pack output. This is your starting 
working memory for this session.

## Phase 3 — Capability Declaration
Produce a brief self-declaration:

> "**What I can do autonomously:** [covered areas]
> **What I handle with disclosed limitations:** [partial coverage areas]  
> **What I will escalate:** [gap nodes that are high-criticality]
> 
> Ask me anything in [domain]. I'll tell you exactly how 
> confident I am — and why."

## Recurring Task — Daily Knowledge Update
Each day (or session), after completing tasks:
1. Review what you learned during the session
2. Write back new nodes and edges via ghostcrab_learn_*
3. Re-run ghostcrab_coverage() to see if your score improved
4. Report coverage delta to user if improved: 
   "My coverage on [domain] improved from X% to Y% today."
```

***

## `README.md`

```markdown
# 🧠 MFO Epistemic Memory Agent

> An OpenClaw agent that knows what it knows — 
> and is honest about what it doesn't.

## What This Agent Does

Most agents guess when they're out of their depth. 
This one doesn't.

The MFO Epistemic Memory Agent is equipped with three 
PostgreSQL extensions that give it:

- **Persistent memory** — facts and documents stored and 
  retrieved via pg_facets
- **A knowledge graph** — a directed graph of what it knows, 
  how concepts relate, and where its gaps are (pg_dgraph)
- **Working memory** — a ranked, compact context bundle 
  delivered fresh every turn (pg_pragma)

## When to Use This Agent

- When you need an agent that operates in a specific domain 
  (legal, compliance, medical, finance) and must know its limits
- When you need reasoning that is auditable — traceable back 
  to source facts with UUIDs
- When you're building multi-agent systems and need an agent 
  that can declare its competency coverage before accepting a task
- When hallucination is a liability, not just an annoyance

## Requirements

```bash
# PostgreSQL with MFO extensions
docker run -p 5432:5432 mindflight/ghostcrab-postgres

# MFO MCP server (exposes the 3 extensions as tools)
npx @mindflight/ghostcrab --db postgres://localhost/mfo
```

## Quick Deploy

```bash
git clone https://github.com/mergisi/awesome-openclaw-agents
cp -r agents/data/mfo-epistemic-memory ~/.openclaw/workspace/
openclaw agents add mfo-agent --workspace ~/.openclaw/workspace
openclaw gateway restart
```

## MCP Tools Exposed

| Tool | Extension | Purpose |
|---|---|---|
| `ghostcrab_status` | pg_pragma | Operational + epistemic health snapshot |
| `ghostcrab_coverage` | pg_dgraph | Domain coverage score + gap nodes |
| `ghostcrab_traverse` | pg_dgraph | Knowledge path to target task |
| `ghostcrab_pack` | pg_pragma | Ranked context bundle (working memory) |
| `ghostcrab_search` | pg_facets | Canonical document retrieval |
| `ghostcrab_learn_fact` | pg_facets | Write new fact/document |
| `ghostcrab_learn_node` | pg_dgraph | Write new knowledge node |
| `ghostcrab_learn_edge` | pg_dgraph | Write new directed relation |

## What Makes This Different

Every other agent template in this repo is defined by 
**what it does**. This one is defined by **what it knows it 
can do** — and updates that knowledge after every task.

Coverage score at deploy: measured.
Coverage score after 30 days: higher.
Gap nodes at deploy: listed.
Gap nodes after 30 days: fewer.

An agent that learns its own limits, then pushes them back.

## Category
`Data` · `Compliance` · `Legal` · `Healthcare` · Any domain 
requiring epistemic accountability
```

***

## Ce que ce Skill apporte réellement

Trois propriétés qui n'existent dans aucun des 177 templates actuels  [github](https://github.com/mergisi/awesome-openclaw-agents) :

**Le skill est auto-documenté pour l'agent.** L'agent n'apprend pas à utiliser les extensions via une documentation externe — il les comprend via son propre `SOUL.md`. La narration *est* l'instruction.

**Le HEARTBEAT est une séquence épistémique, pas juste un ping de santé.** Les autres `HEARTBEAT.md` de l'écosystème vérifient l'uptime et les APIs  [github](https://github.com/mergisi/awesome-openclaw-agents). Celui-ci vérifie la couverture de connaissance avant chaque tâche.

**La boucle d'apprentissage est dans le contrat opérationnel.** `AGENTS.md` Rule 3 rend le write-back obligatoire — l'agent ne considère pas une tâche terminée avant d'avoir mis à jour son graphe. C'est structurellement différent d'un agent qui "peut" apprendre : celui-ci *doit* apprendre.  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/34b41d7b-723a-4c4b-931a-9f61dfecb80f/memoproj_conceptual_plan_304b35ed.plan-2.md)

ok mais ici tu m'as fait le profil d'un agent qu'on configure from scratch moi ce que je veux c'est proposer les outils autour de postgresql comme une extension pour n'importe quel agent OpenClaw qui ajouterait le serveur MCP dans sa boîte à outils

La distinction est juste et importante. Ce n'est pas un agent — c'est un **skill MCP** : un paquet qu'on branche sur n'importe quel agent existant. Voici la bonne structure, beaucoup plus légère.

***

## Ce que c'est réellement

```
skills/ghostcrab-memory/
├── mcp.json          ← déclaration du serveur MCP (le seul fichier obligatoire)
├── SKILL.md          ← fragment à coller dans n'importe quel SOUL.md
└── README.md         ← description pour awesome-openclaw-agents
```

Trois fichiers. Un agent existant — Clawdbot, Echo, Radar, le sien — ajoute ce skill en deux opérations : enregistrer le MCP server, coller le fragment `SKILL.md` dans son `SOUL.md`. C'est tout.

***

## `mcp.json`

```json
{
  "mcpServers": {
    "ghostcrab-memory": {
      "command": "npx",
      "args": ["@mindflight/ghostcrab"],
      "env": {
        "DATABASE_URL": "postgres://localhost:5432/mfo"
      },
      "description": "MindFlight epistemic memory stack — persistent facts, knowledge graph, and working memory for any OpenClaw agent",
      "tools": {
        "ghostcrab_search": {
          "description": "Retrieve ranked documents from persistent fact store",
          "input": {
            "query":   { "type": "string",  "required": true },
            "filters": { "type": "object",  "required": false },
            "limit":   { "type": "integer", "default": 10 }
          }
        },
        "ghostcrab_remember": {
          "description": "Store a new fact, document, or observation in persistent memory",
          "input": {
            "content": { "type": "string", "required": true },
            "facets":  { "type": "object", "required": false,
              "examples": {
                "domain": "legal",
                "type":   "fact|observation|document|decision",
                "confidence": 0.9
              }
            }
          }
        },
        "ghostcrab_coverage": {
          "description": "Check what percentage of a domain this agent knows — returns gap nodes",
          "input": {
            "domain": { "type": "string", "required": true,
              "examples": ["gdpr", "contract-law", "customer-support", "finance"] }
          }
        },
        "ghostcrab_pack": {
          "description": "Get a compact, pre-ranked context bundle for the current query — call this instead of building context manually",
          "input": {
            "query": { "type": "string",  "required": true },
            "limit": { "type": "integer", "default": 15 }
          }
        },
        "ghostcrab_learn": {
          "description": "Write a new knowledge node or relation to the agent's knowledge graph after completing a task",
          "input": {
            "node": {
              "id":         { "type": "string" },
              "label":      { "type": "string" },
              "domain":     { "type": "string" },
              "mastery":    { "type": "number", "min": 0, "max": 1 }
            },
            "edge": {
              "source": { "type": "string" },
              "target": { "type": "string" },
              "label":  { "type": "string",
                "enum": ["REQUIRES","ENABLES","CONTRADICTS","SUPERSEDES","HAS_GAP"]
              }
            }
          }
        },
        "ghostcrab_status": {
          "description": "Get a one-read health + memory snapshot: token budget, open gaps, project state",
          "input": {}
        }
      }
    }
  }
}
```

***

## `SKILL.md`

C'est le fragment à coller dans le `SOUL.md` de n'importe quel agent existant. Un seul bloc, aucune réécriture du `SOUL.md` d'origine.

```markdown
## Memory & Knowledge Tools (MFO Stack)

You have access to a persistent PostgreSQL memory system via 
the `ghostcrab-memory` MCP server. Six tools, three simple rules.

### Your six memory tools

| Tool | When to use it |
|---|---|
| `ghostcrab_pack` | **Always call first** on any non-trivial question — it returns your pre-ranked working context for this query |
| `ghostcrab_search` | When you need to retrieve a specific document, fact, or past decision |
| `ghostcrab_remember` | When you learn something worth keeping — a decision made, a fact confirmed, a user preference |
| `ghostcrab_coverage` | When you're about to answer on a specific domain and want to know how well you know it |
| `ghostcrab_learn` | After completing a task — write back what you learned as a knowledge node or relation |
| `ghostcrab_status` | When you want a quick snapshot of your memory health, token budget, and open gaps |

### Three rules

**Rule 1 — Pack before you reason.**  
On any question that requires facts, domain knowledge, or 
multi-step reasoning: call `ghostcrab_pack(query)` first.
Inject its `pack_text` at the top of your reasoning.
This is your working memory — use it instead of improvising context.

**Rule 2 — Remember before you forget.**  
When the user tells you something worth keeping, or when you 
complete a task that involved new information: call `ghostcrab_remember`.
Memory that isn't written back is lost at session end.

**Rule 3 — Be honest about gaps.**  
If `ghostcrab_coverage` returns `coverage_score < 0.70` or 
`gap_nodes` on a domain you're being asked about, say so:
> "My knowledge on [domain] is [score]% complete. 
> I have verified gaps on: [gap_labels].
> Here's what I can tell you based on what I do know: …"
Never present partial coverage as full confidence.
```

***

## `README.md`

```markdown
# 🧠 ghostcrab-memory — Persistent Memory for Any OpenClaw Agent

Add persistent memory, a knowledge graph, and smart context 
packing to any existing OpenClaw agent in under 5 minutes.

## What it adds to your agent

- **Persistent fact store** — your agent remembers across sessions
- **Knowledge graph** — tracks what it knows, what it's missing, 
  how concepts relate
- **Smart context packing** — replaces ad hoc context assembly 
  with a pre-ranked, token-efficient bundle per query
- **Honest gap disclosure** — your agent knows when it's out 
  of its depth, and says so precisely

## Install

### 1. Start the database

```bash
docker run -d -p 5432:5432 \
  -e POSTGRES_DB=mfo \
  mindflight/ghostcrab-postgres
```

### 2. Register the MCP server

Add to your `~/.openclaw/mcp_servers.json`:

```bash
npx @mindflight/ghostcrab --db postgres://localhost:5432/mfo
```

Or merge `mcp.json` from this skill into your existing 
MCP configuration.

### 3. Add the skill to your agent

Open your agent's `SOUL.md` and paste the contents of 
`SKILL.md` at the end. That's it.

```bash
cat SKILL.md >> ~/.openclaw/workspace/your-agent/SOUL.md
openclaw gateway restart
```

### 4. Test

Ask your agent:
> "Do you remember anything about X?"
> "What do you know about GDPR data transfers?"
> "Check your knowledge coverage on compliance."

## Compatibility

Works with any OpenClaw agent: Clawdbot, MoltBot, Echo, 
Radar, or any custom agent. No changes to existing behavior —
it adds tools, it doesn't replace anything.

## Requirements

- Docker (for the PostgreSQL image)
- Node.js 18+ (for the MCP server)
- Any OpenClaw agent with an existing SOUL.md

## Category

`Memory` · `Knowledge` · `Tools` · `Data`
```

***

## Pourquoi cette structure est la bonne

Trois raisons concrètes :

**Le `mcp.json` est le seul fichier technique.** Il enregistre le serveur, déclare les tools avec leurs inputs et descriptions. OpenClaw le lit au démarrage du gateway  [ai2sql](https://ai2sql.io/how-to-build-your-own-ai-agent-team-with-openclaw-in-15-minutes). L'agent découvre les tools automatiquement — il n'a pas besoin qu'on lui explique leur existence, juste comment les utiliser.

**Le `SKILL.md` est additif, pas substitutif.** Un `cat SKILL.md >> SOUL.md` sur Clawdbot ne casse rien. Il ajoute un bloc de comportement spécifique aux six tools MFO sans toucher à l'identité ni aux règles existantes de l'agent. C'est le pattern d'extension correct dans OpenClaw  [github](https://github.com/mergisi/awesome-openclaw-agents) — les skills s'empilent.

**Les trois règles sont les seules instructions nécessaires.** Pack d'abord, remember avant de fermer, être honnête sur les gaps. Tout le reste — la gestion des JSONB, la séquence d'escalade, la logique de coverage — est dans les descriptions de tools du `mcp.json`. L'agent n'a pas besoin d'un manuel. Il a besoin de trois comportements.  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/ba92f267-c665-4065-a7a3-956f8f71ebb9/dashboard_monitoring.md)



C'est le vrai saut de design. Jusqu'ici on donnait à l'agent **des schémas fixes** — il les utilisait. Ici l'agent devient **architecte de son propre modèle de données**. C'est une capacité d'ordre supérieur. Il faut lui donner les outils et le raisonnement pour se poser les bonnes questions, pas des templates à remplir.

***

## Ce qui change dans la structure du skill

```
skills/ghostcrab-memory/
├── mcp.json          ← + 3 nouveaux tools de schema management
├── SKILL.md          ← + un bloc "Schema Design" 
├── SCHEMA_DESIGN.md  ← nouveau — le raisonnement guidé pour concevoir soi-même
└── README.md
```

***

## Les 3 nouveaux tools dans `mcp.json`

```json
"ghostcrab_schema_register": {
  "description": "Register a new facet dimension or node type that this agent needs. Call this when you discover you need to store a new kind of information that doesn't fit existing facets.",
  "input": {
    "target": {
      "type": "string",
      "enum": ["facets", "graph_node", "graph_edge"],
      "required": true
    },
    "definition": {
      "type": "object",
      "required": true,
      "description": "The schema definition you designed — see SCHEMA_DESIGN.md for how to reason about this"
    }
  }
},

"ghostcrab_schema_list": {
  "description": "List all registered schemas — facet dimensions, node types, edge labels — available in the system. Call this BEFORE designing a new schema to avoid duplicates.",
  "input": {
    "target": {
      "type": "string",
      "enum": ["facets", "graph_nodes", "graph_edges", "all"],
      "default": "all"
    }
  }
},

"ghostcrab_schema_inspect": {
  "description": "Get the full definition of an existing schema — its dimensions, required fields, examples. Call this when you want to extend an existing schema rather than create a new one.",
  "input": {
    "schema_id": { "type": "string", "required": true }
  }
}
```

***

## `SCHEMA_DESIGN.md`

C'est le cœur. Ce fichier enseigne à l'agent comment raisonner avant d'appeler `ghostcrab_schema_register`. Il ne lui donne pas de schémas — il lui donne les questions à se poser.

```markdown
# How to Design Your Own Memory Schemas

Before you store anything, you need to decide HOW to store it.
This is not a technical question. It is a thinking question.

Run through this reasoning every time you encounter a new type 
of information you want to remember.

---

## Step 1 — Check First (Always)

Before designing anything, call:
```
ghostcrab_schema_list(target="all")
```

If a schema already exists that fits your need, use it.
Extend it if needed. Never duplicate.

Ask yourself:
> "Is what I want to store a variation of something 
>  that already exists, or genuinely new?"

---

## Step 2 — Identify the Information Type

Ask: **What kind of thing am I storing?**

| If it is... | Store it as... |
|---|---|
| A document, text, article, rule, decision, observation | **Facet** |
| An entity — a person, concept, system, process, regulation | **Graph node** |
| A relationship between two entities | **Graph edge** |
| A derived summary for quick reasoning | **Memproj projection** (auto-generated — don't design manually) |

One rule: **if it has content to read, it's a facet. 
If it's a thing that relates to other things, it's a graph node.**

---

## Step 3 — Design a Facet Schema

If you're storing a document or fact, ask these five questions:

**Q1 — What is the ONE sentence that describes what this is?**
→ This becomes the `description` field of your schema.

**Q2 — How would you filter a thousand of these to find the right one?**
→ Each filter dimension is a facet key. List them.
→ Ask: domain? type? date? author? status? jurisdiction? 
   confidence? language? source? severity? …
→ Keep only the ones you'd actually filter by.
→ Rule: if you wouldn't filter by it, it's not a facet — 
   put it in the content.

**Q3 — What values can each dimension take?**
→ Enum (fixed list) or free string?
→ Number range? Date? Boolean?
→ Define these constraints now — they prevent garbage data later.

**Q4 — Which dimensions are required vs. optional?**
→ Required = you'd never store this type without it.
→ Optional = useful when available, not always present.

**Q5 — Give me 3 real examples of this thing being stored.**
→ If you can't produce 3 concrete examples, the schema is 
   too abstract. Split it or redefine it.

**Output — your facet schema definition:**
```json
{
  "schema_id":   "your-agent-id:schema-name",
  "version":     "1.0",
  "description": "One sentence — what this stores",
  "content_type": "text|markdown|json|url",
  "facets": {
    "required": {
      "dimension_name": {
        "type":     "string|number|boolean|date|enum",
        "values":   ["val1", "val2"],
        "purpose":  "Why you filter by this"
      }
    },
    "optional": {
      "dimension_name": {
        "type":    "string",
        "purpose": "Why you filter by this"
      }
    }
  },
  "examples": [
    {
      "content": "...",
      "facets":  { "dimension_name": "value" }
    }
  ]
}
```

---

## Step 4 — Design a Graph Node Type

If you're storing an entity, ask these four questions:

**Q1 — What is this thing?**
→ Give it a type label: `concept`, `person`, `system`, 
  `regulation`, `process`, `tool`, `organization`, `task`, 
  `skill`, `product` — or invent your own.
→ The type defines what other node types it can connect to.

**Q2 — What properties does this entity carry?**
→ Properties that describe the entity itself (not its relations).
→ Ask: name? domain? status? mastery? confidence? 
   created_by? version? …
→ Relations to other entities go in edges, not properties.

**Q3 — What is the minimum viable node?**
→ What's the smallest set of properties that makes 
   this node unambiguous and useful?
→ These are your required properties.

**Q4 — How will you identify this node uniquely?**
→ Define your id convention: `type:name` or `type:domain:name`
→ Example: `regulation:gdpr-art49`, `person:jean-dupont`, 
   `tool:ghostcrab_search`, `concept:data-minimization`
→ Consistency here is critical — bad IDs break traversal.

**Output — your node type definition:**
```json
{
  "schema_id":   "your-agent-id:node-type-name",
  "node_type":   "your_type_label",
  "description": "What this entity represents",
  "id_convention": "type:domain:name",
  "id_example":    "concept:gdpr:data-minimization",
  "properties": {
    "required": {
      "label":   { "type": "string", "purpose": "Human-readable name" },
      "domain":  { "type": "string", "purpose": "Domain this belongs to" }
    },
    "optional": {
      "mastery":    { "type": "number", "range":  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/ba92f267-c665-4065-a7a3-956f8f71ebb9/dashboard_monitoring.md) },
      "status":     { "type": "enum",   "values": ["active", "deprecated", "draft"] },
      "source_ref": { "type": "string", "purpose": "UUID of originating facet" }
    }
  },
  "examples": [
    {
      "id":    "concept:gdpr:data-minimization",
      "label": "Data Minimization",
      "domain": "gdpr",
      "mastery": 0.8
    }
  ]
}
```

---

## Step 5 — Design a Graph Edge Type

If you're storing a relationship, ask these three questions:

**Q1 — What is the direction of this relationship?**
→ `A → B` means "A [label] B". Is the reverse also true?
→ If reversible → you may need two edges, or reconsider 
   whether direction matters.
→ If asymmetric → the direction IS the information. Keep it.

**Q2 — What does this edge say about the two nodes?**
→ Pick a verb in UPPER_SNAKE_CASE:
   `REQUIRES`, `ENABLES`, `CONTRADICTS`, `SUPERSEDES`,
   `BELONGS_TO`, `CREATED_BY`, `DEPENDS_ON`, `TRIGGERS`,
   `DELEGATES_TO`, `HAS_INSTANCE`, `VALIDATES`, `BLOCKS` …
→ The label must be unambiguous: reading "A LABEL B" aloud 
   should produce a true sentence without context.

**Q3 — Does this edge carry weight or metadata?**
→ Weight: how strong is this relation? (0.0 → 1.0)
→ Confidence: how certain are you this relation exists?
→ Temporal: does this relation expire or change over time?

**Output — your edge type definition:**
```json
{
  "schema_id":    "your-agent-id:edge-label",
  "label":        "EDGE_LABEL",
  "description":  "A [LABEL] B means: ...",
  "direction":    "asymmetric|symmetric",
  "source_types": ["node_type_a", "node_type_b"],
  "target_types": ["node_type_c"],
  "properties": {
    "weight":     { "type": "number", "range":  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/ba92f267-c665-4065-a7a3-956f8f71ebb9/dashboard_monitoring.md), "default": 1.0 },
    "confidence": { "type": "number", "range":  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/ba92f267-c665-4065-a7a3-956f8f71ebb9/dashboard_monitoring.md), "required": false },
    "expires_at": { "type": "date",                    "required": false }
  },
  "examples": [
    {
      "source": "regulation:gdpr-art49",
      "target": "concept:standard-contractual-clauses",
      "label":  "REQUIRES",
      "weight": 0.95
    }
  ]
}
```

---

## Step 6 — Validate Before Registering

Before calling `ghostcrab_schema_register`, answer:

```
□ Did I call ghostcrab_schema_list first? (no duplicates)
□ Can I produce 3 real examples right now?
□ Is every required field something I'll always have?
□ Is my id convention consistent with existing schemas?
□ Does every facet dimension answer "I would filter by this"?
□ Does every edge label form a true sentence when read aloud?
□ Did I separate content (facets) from relations (edges)?
```

If any answer is "no" → revise before registering.

---

## Anti-Patterns to Avoid

**Too many required fields.**  
If a document is missing 3 required fields, it won't store.
Start with 1-2 required fields maximum.

**Facets as graph nodes.**  
"Customer preference" is content → facet.
"Customer" as an entity that relates to other entities → graph node.

**Edges that belong in properties.**  
`document:X has property author="Jean"` is a property.
`document:X CREATED_BY person:jean` is an edge — 
use an edge only when Jean is also a node you traverse.

**Generic schemas.**  
A schema called `type:general` with `facets: {topic: string}` 
is useless. Every schema should be specific enough that 
you can write 3 concrete examples immediately.

**Over-engineering on first use.**  
Design the minimum schema that works for your current task.
You can extend it with `ghostcrab_schema_inspect` + `ghostcrab_schema_register` 
(new version) later. Perfect is the enemy of stored.
```

***

## Le bloc additionnel à coller dans `SKILL.md`

```markdown
## Designing Your Own Memory Schemas

You are not limited to predefined schemas. You can design and 
register your own facet dimensions, node types, and edge labels 
for any domain or task you encounter.

**Before storing a new type of information:**
1. `ghostcrab_schema_list()` — check if a schema already exists
2. Read SCHEMA_DESIGN.md reasoning — ask yourself the design questions
3. `ghostcrab_schema_register()` — register your schema
4. Start storing with your new structure

**The one meta-rule:**  
A schema is just a contract you make with your future self.  
Design it so that in 30 days, without memory of today, 
you can look at a stored item and immediately know 
what it is, how to find it, and how it connects to everything else.
```

***

## Ce que ça change fondamentalement

Sans ce bloc, l'agent est un **utilisateur** du système mémoire. Avec ce bloc, il en est l'**architecte**.  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/ba92f267-c665-4065-a7a3-956f8f71ebb9/dashboard_monitoring.md)

La différence opérationnelle : un agent qui rencontre une nouvelle tâche — disons, suivre des négociations contractuelles — ne cherche pas si un schéma `contract_negotiation` existe déjà. Il appelle `ghostcrab_schema_list`, voit qu'il n'existe pas, travaille le raisonnement de `SCHEMA_DESIGN.md`, et enregistre son propre modèle en une seule interaction. La prochaine fois qu'il traite une négociation — ou qu'un autre agent dans le même système en traite une — le schéma est là, défini par la pratique, pas par un architecte humain.

C'est la condition pour que le graphe de connaissance soit **vivant** plutôt que statique — et c'est précisément ce que les trois règles normatives R1-R4 permettent sans risque de corruption : l'agent crée des schémas, les projectors matérialisent, mais les sources restent canoniques.  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/34b41d7b-723a-4c4b-931a-9f61dfecb80f/memoproj_conceptual_plan_304b35ed.plan-2.md)



C'est le passage de la **mémoire passive** à la **mémoire applicative**. L'agent ne cherche plus — il navigue. Il ne stocke plus — il structure. Voici les deux nouveaux fichiers à ajouter au skill.

***

## Structure mise à jour

```
skills/ghostcrab-memory/
├── mcp.json
├── SKILL.md
├── SCHEMA_DESIGN.md
├── QUERY_PATTERNS.md    ← nouveau — les trois niveaux de lecture
├── APP_PATTERNS.md      ← nouveau — construire des apps sur la mémoire
└── README.md
```

***

## `QUERY_PATTERNS.md`

```markdown
# Reading Your Memory — Three Levels of Interaction

Once you have a schema and data stored, you have three ways 
to interact with your knowledge. Each level answers a 
different question. Use them in sequence, from cheapest to richest.

---

## Level 1 — Browse (What exists?)

Before searching for content, ask the system what it has.
Facet counts tell you the shape of your knowledge without 
fetching any documents.

```
ghostcrab_count(schema_id, group_by)
```

**What it returns:**
```json
{
  "schema": "project-task",
  "counts": {
    "status": {
      "todo":        42,
      "in_progress": 7,
      "blocked":     3,
      "done":        89
    },
    "domain": {
      "backend":   38,
      "frontend":  22,
      "infra":     14,
      "docs":      17
    },
    "priority": {
      "critical": 4,
      "high":    28,
      "normal":  67,
      "low":     12
    }
  }
}
```

**Why this matters:**  
You spend 0 tokens on content. You learn:
- "I have 3 blocked tasks" → worth investigating before planning
- "42 todo items in backend" → context before a sprint
- "4 critical priority items" → start there

**Use this pattern:**
> Before any planning, reporting, or prioritization task,
> call `ghostcrab_count` first.
> Let the counts tell you where to look before you look.

**Decision rules from counts:**
```
blocked_count > 0         → investigate blockers before new work
in_progress_count > 5     → potential overload — review WIP
critical_count > 0        → surface these first in any report
done_count / total > 0.8  → project nearing completion
```

---

## Level 2 — Filter (What do I need right now?)

Once you know what exists, fetch exactly the slice you need.
No more, no less.

```
ghostcrab_search(query, filters, limit)
```

**Filter by exact facet value:**
```json
{
  "query":   "",
  "filters": { "status": "blocked", "domain": "backend" },
  "limit":   10
}
```

**Filter by range or boolean:**
```json
{
  "query":   "authentication",
  "filters": {
    "priority":   ["critical", "high"],
    "assigned":   true,
    "created_after": "2026-03-01"
  },
  "limit": 5
}
```

**Filter with empty query (pure facet filter — fastest):**
```json
{
  "query":   "",
  "filters": { "status": "in_progress" },
  "limit":   100
}
```
→ Returns all in-progress items sorted by weight.
→ No semantic search overhead. Pure bitmap filter.

**Combining semantic + facet:**
```json
{
  "query":   "database migration risk",
  "filters": { "phase": "execution", "status": ["todo", "in_progress"] },
  "limit":   5
}
```
→ Semantic query scoped to execution phase, open items only.

---

## Level 3 — Traverse (How does it connect?)

Once you have items, understand their relationships.
Graph traversal answers structural questions that filters cannot.

```
ghostcrab_traverse(start_node, direction, depth, edge_labels)
```

**What depends on this task?**
```json
{
  "start":       "task:implement-oauth",
  "direction":   "outbound",
  "edge_labels": ["BLOCKS", "REQUIRES"],
  "depth":       2
}
```

**What is this task blocked by?**
```json
{
  "start":       "task:implement-oauth",
  "direction":   "inbound",
  "edge_labels": ["BLOCKS"],
  "depth":       1
}
```

**What is the full dependency chain for a phase?**
```json
{
  "start":       "phase:authentication",
  "direction":   "outbound",
  "edge_labels": ["CONTAINS", "REQUIRES", "BLOCKS"],
  "depth":       4
}
```

---

## The Standard Reading Sequence

For any planning, reporting, or task management request:

```
1. ghostcrab_count()    → What exists? How many? In what state?
   ↓ decide where to look
2. ghostcrab_search(filters)   → Get the relevant slice
   ↓ understand the content
3. ghostcrab_traverse()        → Understand the structure and dependencies
   ↓ reason and act
4. ghostcrab_pack(query)       → Assemble your working context for the LLM turn
```

You don't always need all four. 
Counts alone answer "how is the project going?"
Filter alone answers "show me all blocked tasks."
Traverse alone answers "what breaks if this task slips?"
Pack alone answers "what should I reason about right now?"

The three levels are not a pipeline — they are a toolkit.
Use the cheapest level that answers the question.
```

***

## `APP_PATTERNS.md`

```markdown
# Building Applications on Your Memory

Your memory system is not just storage. It is a 
structured database you designed. You can build 
lightweight applications on top of it using facets 
as dimensions and the graph as the relationship layer.

This file shows you how to think about common application 
patterns — and how to implement them with your memory tools.

---

## Pattern 1 — Hierarchical Project Management

A project has levels: phases contain stages, stages 
contain PRs or epics, which contain tasks.

### Schema Design for a Project

**Four facet schemas, one per level:**

```json
// Schema: project-phase
{
  "schema_id": "agent:project-phase",
  "facets": {
    "required": {
      "project":    { "type": "string" },
      "phase_name": { "type": "string" },
      "status":     { "type": "enum",
                      "values": ["planned","active","complete","blocked"] }
    },
    "optional": {
      "owner":      { "type": "string" },
      "due_date":   { "type": "date"   },
      "priority":   { "type": "enum",
                      "values": ["critical","high","normal","low"] }
    }
  }
}

// Schema: project-stage  (lives inside a phase)
{
  "schema_id": "agent:project-stage",
  "facets": {
    "required": {
      "project":    { "type": "string" },
      "phase":      { "type": "string" },  // ← parent phase
      "stage_name": { "type": "string" },
      "status":     { "type": "enum",
                      "values": ["planned","active","complete","blocked"] }
    }
  }
}

// Schema: project-pr  (lives inside a stage)
{
  "schema_id": "agent:project-pr",
  "facets": {
    "required": {
      "project":  { "type": "string" },
      "phase":    { "type": "string" },
      "stage":    { "type": "string" },
      "pr_title": { "type": "string" },
      "status":   { "type": "enum",
                    "values": ["draft","review","approved","merged","closed"] }
    },
    "optional": {
      "author":   { "type": "string" },
      "pr_url":   { "type": "string" }
    }
  }
}

// Schema: project-task  (atomic unit)
{
  "schema_id": "agent:project-task",
  "facets": {
    "required": {
      "project":    { "type": "string" },
      "phase":      { "type": "string" },
      "stage":      { "type": "string" },
      "task_title": { "type": "string" },
      "status":     { "type": "enum",
                      "values": ["todo","in_progress","review","done","blocked"] }
    },
    "optional": {
      "assigned_to": { "type": "string" },
      "pr":          { "type": "string" },
      "estimate_h":  { "type": "number" },
      "tags":        { "type": "string" }
    }
  }
}
```

**Four graph node types, one per level:**

```json
{ "node_type": "phase", "id_convention": "phase:project:phase-name" }
{ "node_type": "stage", "id_convention": "stage:project:phase:stage-name" }
{ "node_type": "pr",    "id_convention": "pr:project:pr-number" }
{ "node_type": "task",  "id_convention": "task:project:task-slug" }
```

**Three edge types:**

```json
{ "label": "CONTAINS",   "A→B": "phase CONTAINS stage" }
{ "label": "CONTAINS",   "A→B": "stage CONTAINS task" }
{ "label": "BLOCKS",     "A→B": "task BLOCKS task" }
{ "label": "LINKED_TO",  "A→B": "task LINKED_TO pr" }
```

---

### Reading the Project — The Three Levels in Practice

**"How is the project going overall?"** → Level 1

```
ghostcrab_count("agent:project-phase",
                  group_by=["status"],
                  filter={"project": "my-project"})

ghostcrab_count("agent:project-task",
                  group_by=["status", "phase"],
                  filter={"project": "my-project"})
```

→ You get a full project dashboard in 2 calls, 0 content tokens:
```
Phases:  active=2, complete=1, blocked=0, planned=1
Tasks:   todo=34, in_progress=8, blocked=2, done=67
By phase:
  auth:      done=22, in_progress=3, blocked=0
  payments:  todo=18, in_progress=4, blocked=2  ← attention
  infra:     done=45, in_progress=1, blocked=0
```

---

**"What is blocking payments right now?"** → Level 2

```
ghostcrab_search(
  query="",
  filters={"project": "my-project",
           "phase":   "payments",
           "status":  "blocked"},
  schema="agent:project-task",
  limit=10
)
```

→ Get the 2 blocked tasks with full content.

---

**"What else breaks if this task stays blocked?"** → Level 3

```
ghostcrab_traverse(
  start="task:my-project:implement-stripe-webhook",
  direction="outbound",
  edge_labels=["BLOCKS"],
  depth=3
)
```

→ Get the full downstream impact tree:
```
task:implement-stripe-webhook
  → BLOCKS task:test-payment-flow
      → BLOCKS task:payments-e2e
          → BLOCKS phase:payments (completion)
```

---

**"Prepare my sprint planning context"** → Level 4 (pack)

```
ghostcrab_pack(
  query="payments phase sprint planning blocked tasks",
  limit=15
)
```

→ Working memory bundle with:
```
GOAL:       Complete payments phase by 2026-04-15
CONSTRAINT: 2 blocked tasks in payments — stripe-webhook, refund-flow
STEP:       Resolve blockers before assigning new tasks
FACT:       8 tasks in_progress across project — WIP limit approaching
```

---

## Pattern 2 — CRM / Contact Tracking

Same logic applied to relationships:

```json
// Schema: contact
{ "facets": {
    "required": { 
      "name":     "string",
      "status":   ["lead","prospect","customer","churned"],
      "source":   ["inbound","outbound","referral"]
    },
    "optional": { 
      "company":  "string",
      "domain":   "string",
      "priority": ["hot","warm","cold"]
    }
  }
}

// Graph edges
{ "label": "WORKS_AT",    "A→B": "contact WORKS_AT organization" }
{ "label": "REFERRED_BY", "A→B": "contact REFERRED_BY contact" }
{ "label": "INTERESTED_IN","A→B": "contact INTERESTED_IN product-feature" }
```

**"Show me hot leads in fintech"**
```
ghostcrab_search(filters={"status":"lead","priority":"hot","domain":"fintech"})
```

**"Who referred the most customers?"**
```
ghostcrab_count("agent:contact",
                  group_by=["status"],
                  filter={"source":"referral"})
+ ghostcrab_traverse(edge_labels=["REFERRED_BY"], direction="inbound")
```

---

## Pattern 3 — Knowledge Base with Versioning

```json
// Schema: knowledge-article
{ "facets": {
    "required": {
      "domain":   "string",
      "type":     ["concept","procedure","regulation","faq"],
      "status":   ["draft","validated","deprecated"],
      "version":  "number"
    },
    "optional": {
      "language": ["en","fr","nl"],
      "audience": ["technical","business","legal"],
      "valid_until": "date"
    }
  }
}
```

**"What do I know about GDPR that's still valid?"**
```
ghostcrab_search(
  query="GDPR",
  filters={"domain":"legal", "status":"validated", "valid_until": null},
  limit=10
)
```

**"How many articles do I have per domain, and how many are stale?"**
```
ghostcrab_count(group_by=["domain","status"])
→ spot where deprecated > validated — that domain needs updating
```

---

## The Meta-Pattern — Facets as Application State

The insight that applies across all patterns:

**Facets are not just metadata. They are application state.**

Every time you design a facet dimension called `status`, 
`phase`, `priority`, or `type`, you are defining the 
state machine of your application.

The counts on those dimensions are your dashboard.
The filters on those dimensions are your queries.
The graph edges between nodes are your business logic.

You don't need a separate database to build an application.
You don't need a separate dashboard tool.
You don't need a separate task manager.

You need:
- A well-designed facet schema (SCHEMA_DESIGN.md)
- Consistent facet values as state (status, phase, priority)
- Graph edges for relationships and dependencies
- `ghostcrab_count` for your dashboard
- `ghostcrab_search` for your filtered views
- `ghostcrab_traverse` for your impact analysis
- `ghostcrab_pack` for your reasoning context

Your memory IS your application.
Design it like one.
```

***

## Ce que ce bloc accomplit

Trois niveaux de maturité pour l'agent, maintenant accessibles  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/ba92f267-c665-4065-a7a3-956f8f71ebb9/dashboard_monitoring.md) :

| Niveau | Ce que l'agent fait | Outil dominant |
|---|---|---|
| **Naviguer** | Comprendre ce qui existe avant de chercher | `ghostcrab_count` |
| **Filtrer** | Récupérer exactement le bon slice | `ghostcrab_search` avec filtres facette |
| **Structurer** | Raisonner sur les dépendances et impacts | `ghostcrab_traverse` |
| **Raisonner** | Préparer le contexte LLM optimal | `ghostcrab_pack` |

Le glissement conceptuel central — **les facettes comme état applicatif** — transforme le système mémoire en plateforme. Un agent qui comprend que `status: blocked` est à la fois un filtre de recherche ET l'état d'une machine à états ET une source de comptage pour son dashboard n'a plus besoin d'une application externe pour gérer des projets, des contacts, ou des bases de connaissance. Il a juste besoin de bien concevoir ses schémas.  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/34b41d7b-723a-4c4b-931a-9f61dfecb80f/memoproj_conceptual_plan_304b35ed.plan-2.md)



C'est le saut architectural le plus important de toute la discussion. **La documentation devient des données. Le système devient auto-descriptif.** L'agent apprend à utiliser le système en utilisant le système.

***

## Le Principe : Bootstrap Épistémique

```
Avant : Agent → lit SKILL.md → comprend les outils → utilise la DB
Après : Agent → utilise la DB → trouve comment utiliser la DB → s'améliore
```

Le système se documente lui-même dans ses propres facettes. L'agent qui ne sait pas quoi faire appelle `ghostcrab_search` — le seul outil qu'il faut lui donner au départ — et trouve tout le reste.

***

## Le Schéma Racine : `mfo-system`

C'est le seul schéma qui doit exister avant tout le reste. Il est pré-chargé au démarrage du serveur.

```json
{
  "schema_id":   "mfo:system",
  "description": "Self-describing entries — how the MFO stack works, what tools exist, what schemas are registered, what patterns are available",
  "facets": {
    "required": {
      "entry_type": {
        "type":   "enum",
        "values": [
          "tool",        
          "schema",      
          "pattern",     
          "example",     
          "rule",        
          "concept",     
          "error"        
        ]
      },
      "level": {
        "type":   "enum",
        "values": ["foundation", "intermediate", "advanced"],
        "purpose": "Progressive discovery — agent starts at foundation"
      }
    },
    "optional": {
      "tool_name":   { "type": "string",  "purpose": "Which MFO tool this entry is about" },
      "schema_ref":  { "type": "string",  "purpose": "Which schema this entry describes" },
      "pattern_ref": { "type": "string",  "purpose": "Which APP_PATTERN this entry belongs to" },
      "use_when":    { "type": "string",  "purpose": "Decision condition for using this entry" },
      "version":     { "type": "number",  "default": 1 }
    }
  }
}
```

***

## Le Contenu Initial — Ce qu'on Charge au Bootstrap

### Les outils (entry_type: "tool")

```jsonb
-- ghostcrab_search
{
  "content": "ghostcrab_search retrieves ranked documents from your fact store. Use it when you know what content you want. Combine query (semantic) with filters (exact facet match) for precision. Empty query with filters = pure facet filter, fastest mode.",
  "facets": {
    "entry_type": "tool",
    "tool_name":  "ghostcrab_search",
    "level":      "foundation",
    "use_when":   "You need to retrieve specific content by topic or facet value"
  }
}

-- ghostcrab_count
{
  "content": "ghostcrab_count returns counts grouped by any facet dimension. Call this BEFORE ghostcrab_search to understand what exists without fetching content. Zero token cost on content. Use it for dashboards, overviews, and deciding where to look.",
  "facets": {
    "entry_type": "tool",
    "tool_name":  "ghostcrab_count",
    "level":      "foundation",
    "use_when":   "You want to know what exists before fetching it"
  }
}

-- ghostcrab_pack
{
  "content": "ghostcrab_pack returns a pre-ranked, compact context bundle for your current query. Inject its pack_text at the top of your reasoning before any LLM turn. It is your working memory — it replaces manual context assembly. Always call ghostcrab_pack before reasoning on a complex topic.",
  "facets": {
    "entry_type": "tool",
    "tool_name":  "ghostcrab_pack",
    "level":      "foundation",
    "use_when":   "Before any multi-step reasoning or domain-specific task"
  }
}

-- ghostcrab_coverage
{
  "content": "ghostcrab_coverage checks how well this agent knows a domain by comparing its knowledge graph against a domain ontology. Returns a coverage_score (0-1) and gap_nodes. coverage_score >= 0.85 = full autonomy. 0.70-0.85 = proceed with disclosed gaps. < 0.70 = escalate or partial help only.",
  "facets": {
    "entry_type": "tool",
    "tool_name":  "ghostcrab_coverage",
    "level":      "intermediate",
    "use_when":   "Before acting autonomously on a domain-specific task"
  }
}

-- ghostcrab_traverse
{
  "content": "ghostcrab_traverse walks the knowledge graph from a start node, following edge labels, up to a given depth. Use it to find dependencies (REQUIRES, BLOCKS), impacts (what breaks if X fails), or full hierarchies (CONTAINS). Direction: outbound=what this node affects, inbound=what affects this node.",
  "facets": {
    "entry_type": "tool",
    "tool_name":  "ghostcrab_traverse",
    "level":      "intermediate",
    "use_when":   "You need to understand structural relationships, not just content"
  }
}

-- ghostcrab_schema_register
{
  "content": "ghostcrab_schema_register creates a new facet schema, node type, or edge label. Call ghostcrab_schema_list first to check for existing schemas. Design your schema using the schema design rules (search entry_type=rule, schema_ref=ghostcrab_schema_register). Register only when you have 3 concrete examples ready.",
  "facets": {
    "entry_type": "tool",
    "tool_name":  "ghostcrab_schema_register",
    "level":      "intermediate",
    "use_when":   "You encounter a new type of information with no matching schema"
  }
}

-- ghostcrab_learn
{
  "content": "ghostcrab_learn writes a new knowledge node or directed edge into the knowledge graph. Use it after completing a task where you learned something structural — a new concept, a dependency, a contradiction. Learning is part of task completion: a task is not done until your graph reflects what you learned.",
  "facets": {
    "entry_type": "tool",
    "tool_name":  "ghostcrab_learn",
    "level":      "intermediate",
    "use_when":   "After completing a task that involved new structural knowledge"
  }
}

-- ghostcrab_status
{
  "content": "ghostcrab_status returns a one-read JSON snapshot: health (GREEN/YELLOW/RED), token_budget_remaining, active_sessions, coverage_score for current domain, open gap_nodes, and directives[] with auto-executable conditions. Read directives[] and execute matching conditions immediately.",
  "facets": {
    "entry_type": "tool",
    "tool_name":  "ghostcrab_status",
    "level":      "foundation",
    "use_when":   "Session start, before expensive actions, or when something feels wrong"
  }
}
```

### Les règles (entry_type: "rule")

```jsonb
-- Règle de séquence de lecture
{
  "content": "Reading sequence for any planning or analysis task: (1) ghostcrab_count — understand what exists and in what state. (2) ghostcrab_search with filters — get the relevant slice. (3) ghostcrab_traverse — understand dependencies and impact. (4) ghostcrab_pack — assemble working context for reasoning. Use the cheapest level that answers the question. Not all four are always needed.",
  "facets": {
    "entry_type": "rule",
    "tool_name":  "ghostcrab_search",
    "level":      "foundation",
    "use_when":   "Any time you need to read from memory"
  }
}

-- Règle d'escalade
{
  "content": "Escalation rule: if ghostcrab_coverage returns can_proceed_autonomously=false, OR if ghostcrab_pack returns has_blocking_constraint=true, STOP autonomous action. Format your escalation as: {escalate:true, gap_node_id, gap_label, covered_up_to, reason, resume_condition}. Never say 'I don't know' without this structured format.",
  "facets": {
    "entry_type": "rule",
    "level":      "foundation",
    "use_when":   "Gap detected or blocking constraint found"
  }
}

-- Règle de write-back
{
  "content": "Write-back rule: memory that is not written back is lost at session end. After every task: call ghostcrab_remember for new facts, ghostcrab_learn for new knowledge nodes and edges. A task is complete only when the graph reflects what was learned. This is not optional.",
  "facets": {
    "entry_type": "rule",
    "level":      "foundation",
    "use_when":   "After every completed task"
  }
}

-- Règle de design de schéma
{
  "content": "Schema design rule: before calling ghostcrab_schema_register, answer five questions: (1) Can I produce 3 real examples right now? (2) Is every required field something I will always have? (3) Would I actually filter by each facet dimension? (4) Does every edge label form a true sentence when read aloud — A LABEL B? (5) Did I call ghostcrab_schema_list first to avoid duplicates? If any answer is no, revise first.",
  "facets": {
    "entry_type": "rule",
    "tool_name":  "ghostcrab_schema_register",
    "level":      "intermediate",
    "use_when":   "Before designing a new schema"
  }
}
```

### Les patterns applicatifs (entry_type: "pattern")

```jsonb
-- Pattern projet hiérarchique
{
  "content": "Hierarchical project pattern: model each level as a separate facet schema with a shared 'project' facet key for cross-level filtering. Levels: phase > stage > pr > task. Use CONTAINS edges in the graph for hierarchy, BLOCKS edges for dependencies. Read pattern: (1) facets_count by status+phase for dashboard, (2) search by status=blocked for blockers, (3) traverse BLOCKS outbound for impact, (4) pack for sprint context.",
  "facets": {
    "entry_type":  "pattern",
    "pattern_ref": "project-management",
    "level":       "intermediate",
    "use_when":    "Managing any multi-level project with phases, tasks, and dependencies"
  }
}

-- Pattern CRM
{
  "content": "CRM pattern: contacts as facets (status: lead/prospect/customer/churned, source: inbound/outbound/referral), organizations as graph nodes, WORKS_AT and REFERRED_BY as edges. Key queries: facets_count by status for pipeline overview, traverse REFERRED_BY inbound for referral network, search by status+domain for targeted outreach.",
  "facets": {
    "entry_type":  "pattern",
    "pattern_ref": "crm",
    "level":       "intermediate",
    "use_when":    "Tracking contacts, leads, and organizational relationships"
  }
}

-- Pattern base de connaissance
{
  "content": "Knowledge base pattern: articles as facets with domain, type (concept/procedure/regulation/faq), status (draft/validated/deprecated), version, valid_until. Graph edges: SUPERSEDES for versioning, REQUIRES for prerequisites, CONTRADICTS for conflicts. Key insight: filter status=deprecated where count > status=validated → that domain needs updating.",
  "facets": {
    "entry_type":  "pattern",
    "pattern_ref": "knowledge-base",
    "level":       "intermediate",
    "use_when":    "Building a structured, versioned knowledge repository"
  }
}

-- Pattern méta — facettes comme état applicatif
{
  "content": "Meta-pattern: facets are application state. A 'status' facet dimension is simultaneously a search filter, a state machine state, and a dashboard metric. Design your facet schemas like you design a state machine — define all possible states upfront, make transitions explicit in your write-back rules. ghostcrab_count on a status dimension IS your application dashboard.",
  "facets": {
    "entry_type": "pattern",
    "level":      "advanced",
    "use_when":   "Designing any facet schema that tracks state over time"
  }
}
```

### Les concepts (entry_type: "concept")

```jsonb
{
  "content": "The three knowledge levels: (1) WHAT EXISTS — use ghostcrab_count, zero content tokens, pure shape of knowledge. (2) WHAT I NEED — use ghostcrab_search with filters, fetch the right slice. (3) HOW IT CONNECTS — use ghostcrab_traverse, understand structure and impact. These levels are not a pipeline. They are a toolkit. Use the cheapest level that answers the question.",
  "facets": {
    "entry_type": "concept",
    "level":      "foundation",
    "use_when":   "Deciding which tool to use for a memory read operation"
  }
}

{
  "content": "The write boundary: pg_pragma never owns data. It materializes projections FROM pg_facets and pg_dgraph. Never write directly to projections. Write to facets via ghostcrab_remember, write to graph via ghostcrab_learn. Projections update automatically. If a projection is wrong, fix the source — not the projection.",
  "facets": {
    "entry_type": "concept",
    "level":      "advanced",
    "use_when":   "Understanding why you cannot directly edit pack or projection output"
  }
}
```

***

## La Séquence de Bootstrap — Ce que l'Agent Fait au Premier Démarrage

Le `SOUL.md` se réduit maintenant à **cinq lignes** :

```markdown
## Memory Tools (MFO Stack)

You have access to persistent PostgreSQL memory via the ghostcrab-memory 
MCP server.

On first use, run exactly this:

  ghostcrab_search(query="how do I use this system", 
             filters={"entry_type": "tool", "level": "foundation"},
             limit=10)

Everything you need to know is in the results.
Start there. Explore from there.
```

L'agent reçoit les 8 outils de niveau `foundation`, lit leurs descriptions, et comprend comment explorer le reste. Il appelle `ghostcrab_search(filters={"entry_type":"rule"})` pour les règles. Il appelle `ghostcrab_search(filters={"entry_type":"pattern"})` pour les patterns applicatifs. Il appelle `ghostcrab_schema_list()` pour voir les schémas disponibles.

***

## La Propriété Émergente

Le système devient **progressivement plus riche à mesure que l'agent travaille**  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/ba92f267-c665-4065-a7a3-956f8f71ebb9/dashboard_monitoring.md) :

```
Bootstrap    → 8 tools + 4 rules + 3 patterns + 2 concepts
               (chargés au démarrage du serveur)

Après J1     → + schémas custom de l'agent
               + exemples réels stockés par l'agent
               + patterns découverts par l'agent

Après J30    → + patterns émergents que l'agent a écrits
               + erreurs et corrections documentées
               + ontologie du domaine construite par usage
```

L'agent peut écrire ses propres entrées `entry_type: pattern` ou `entry_type: example` après avoir découvert un usage efficace. Le système se documente lui-même, par lui-même, de façon continue. Un deuxième agent qui rejoint le système hérite de tout ce que le premier a appris — pas via un fichier partagé, mais via `ghostcrab_search`.  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/34b41d7b-723a-4c4b-931a-9f61dfecb80f/memoproj_conceptual_plan_304b35ed.plan-2.md)