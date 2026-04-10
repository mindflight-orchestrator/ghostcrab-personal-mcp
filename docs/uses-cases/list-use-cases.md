Excellent — j'ai la liste complète des 177 templates et 24 catégories.  [github](https://github.com/mergisi/awesome-openclaw-agents) Voici l'analyse structurée.

***

## Principe de Classification

Trois niveaux d'intégration MFO selon la nature du use case :

| Niveau | Caractéristique | Extensions dominantes |
|---|---|---|
| **Facettes pures** | L'agent stocke et retrouve du contenu structuré | pg_facets seul |
| **Facettes + Graphe** | Le contenu a des relations structurelles importantes | pg_facets + pg_dgraph |
| **Stack complète** | Contexte borné, raisonnement multi-turn, auto-régulation | pg_facets + pg_dgraph + pg_pragma |

***

## Les Use Cases par Catégorie

### 📋 Productivity — Stack complète

**Orion (Task coordination)** et **Minutes (Meeting notes)** sont les cas les plus riches.  [github](https://github.com/mergisi/awesome-openclaw-agents)

```
pg_facets  → tâches, décisions, action items
             facets: {status, owner, priority, due_date, project, source_meeting}

pg_dgraph  → BLOCKS edges entre tâches
             ASSIGNED_TO entre tâches et personnes
             PRODUCED_BY entre décisions et meetings

pg_pragma → pack de contexte pour le standup du lendemain
             GOAL: lignes pour les échéances critiques
             CONSTRAINT: tâches bloquées en tête de pack
```

**Standup** est le cas le plus direct pour `ghostcrab_count` : compter par `status` par `owner` avant de produire le résumé — zéro token de contenu pour le dashboard.

***

### 💻 Development — Graphe central

**Lens (PR review)**, **Trace (Debug)**, **Migration Helper**, **Dependency Scanner**  [github](https://github.com/mergisi/awesome-openclaw-agents) — tous partagent la même structure de graphe de dépendances.

```
pg_facets  → PRs, bugs, erreurs, migrations
             facets: {type, severity, status, service, author, created_at}

pg_dgraph  → DEPENDS_ON entre services et librairies
             INTRODUCED_BY entre bug et commit
             BLOCKS entre PR et déploiement
             HAS_CVE entre dépendance et vulnérabilité

pg_pragma → CONSTRAINT: CVEs critiques en tête
             FACT: services affectés par cette migration
             STEP: ordre de migration safe selon le graphe de dépendances
```

**Migration Helper** est le cas le plus fort : le graphe de dépendances entre tables/services **est** la donnée principale — pas un enrichissement.

***

### 📣 Marketing & Content — Facettes pures à enrichies

**Echo (Blog/Social)**, **Scout (Competitor monitoring)**, **Brand Monitor**  [github](https://github.com/mergisi/awesome-openclaw-agents)

```
pg_facets  → articles, posts, mentions, campagnes
             facets: {channel, status, topic, brand, sentiment,
                      publish_date, performance_score}

ghostcrab_count → dashboard éditorial instantané
  group_by: [status, channel]
  → draft=12, scheduled=5, published=34, channel=linkedin:8, twitter:15

pg_dgraph  → INSPIRED_BY entre contenus (éviter les doublons)
             TARGETS entre contenu et persona
             COMPETES_WITH entre marques (Scout)

pg_pragma → pack pour la rédaction : FACT: top performing topics,
             CONSTRAINT: brand voice rules, GOAL: this week's content targets
```

**News Curator** (50+ sources) est le cas idéal pour les facettes multi-dimensionnelles : `source`, `topic`, `relevance_score`, `published_at`, `already_sent` — un filtre `already_sent=false` + `relevance_score>0.8` produit la sélection du jour sans aucune requête sémantique.

***

### ⚖️ Legal & Compliance — Stack complète, use case phare

**Contract Reviewer**, **Compliance Checker**, **GDPR Auditor**, **SOC2 Preparer**  [github](https://github.com/mergisi/awesome-openclaw-agents) — ce sont les use cases qui justifient le mieux pg_dgraph.

```
pg_facets  → articles de loi, clauses contractuelles, obligations,
             preuves de conformité, deadlines réglementaires
             facets: {regulation, article, jurisdiction, status,
                      criticality, valid_until, obligation_type}

pg_dgraph  → REQUIRES entre obligations
             VALIDATES entre preuve et obligation
             SUPERSEDES entre versions de règlements
             CONTRADICTS entre clauses contractuelles

pg_pragma → CONSTRAINT: obligations non couvertes bloquantes
             STEP: ordre d'audit selon dépendances
             FACT: articles pertinents pour ce contrat
             GOAL: deadline de conformité
```

`ghostcrab_count(group_by=["status","criticality"])` → dashboard compliance en une requête :
```
obligations: covered=47, gap=8, expired=3
criticality: critical_gap=2 ← alerte immédiate
```

***

### 👥 HR — Graphe de compétences naturel

**Recruiter**, **Resume Screener**, **Onboarding**, **Compensation Benchmarker**  [github](https://github.com/mergisi/awesome-openclaw-agents)

```
pg_facets  → CVs, offres, politiques RH, feedbacks entretiens
             facets: {role, seniority, status, skills_tags,
                      location, salary_range, source}

pg_dgraph  → REQUIRES entre rôles et compétences
             HAS_SKILL entre candidats et compétences
             REPORTS_TO entre rôles (org chart)
             COVERED_BY entre politique RH et cas d'usage

pg_pragma → pack pour un entretien : FACT: profil candidat résumé,
             CONSTRAINT: compétences requises manquantes,
             STEP: questions à poser sur les gaps identifiés
```

Le graphe `rôle → REQUIRES → compétences` + `candidat → HAS_SKILL → compétences` est exactement un coverage score appliqué au recrutement — même mécanique que pg_dgraph pour les agents, appliquée aux humains.

***

### 🚀 DevOps — Dashboard pattern naturel

**Incident Responder**, **Infra Monitor**, **SLA Monitor**, **Log Analyzer**  [github](https://github.com/mergisi/awesome-openclaw-agents)

```
pg_facets  → alertes, incidents, logs anomalies, métriques SLA
             facets: {service, severity, status, environment,
                      assigned_to, resolved_at, sla_type}

pg_dgraph  → DEPENDS_ON entre services (topology)
             TRIGGERED_BY entre incident et cause racine
             IMPACTS entre service et autre service
             OWNED_BY entre service et équipe

pg_pragma → snapshot opérationnel (dashboard pattern)
             ghostcrab_status → {health, open_incidents, sla_at_risk}
             CONSTRAINT: services dépendants d'un service DOWN
             FACT: runbook steps pour ce type d'incident
```

C'est le **dashboard monitoring pattern** de `dashboard_monitoring.md`  [ppl-ai-file-upload.s3.amazonaws](https://ppl-ai-file-upload.s3.amazonaws.com/web/direct-files/attachments/24846682/ba92f267-c665-4065-a7a3-956f8f71ebb9/dashboard_monitoring.md) appliqué exactement à ce contexte : métriques comme facettes O(1), graphe de dépendances services, projection JSON de santé en 80 bytes.

***

### 💰 Finance — Facettes + anomalie detection

**Fraud Detector**, **Expense Tracker**, **Revenue Analyst**  [github](https://github.com/mergisi/awesome-openclaw-agents)

```
pg_facets  → transactions, factures, dépenses, revenues
             facets: {type, category, status, amount_range,
                      merchant, risk_score, period, currency}

pg_dgraph  → LINKED_TO entre transactions suspectes (pattern fraud)
             PAID_BY entre facture et transaction
             BELONGS_TO entre dépense et projet/budget

pg_pragma → CONSTRAINT: transactions anomalies au-dessus du seuil,
             FACT: tendances revenue ce mois vs mois précédent
             GOAL: budget target restant
```

`ghostcrab_count(group_by=["risk_score","status"])` → dashboard fraud en une requête :
```
risk_score: high=3, medium=12, low=847
status:     flagged=3, reviewed=8, cleared=844
```

***

### 🏡 Real Estate — Graphe de marché

**Listing Scout**, **Market Analyzer**, **Lead Qualifier**  [github](https://github.com/mergisi/awesome-openclaw-agents) — use case familier.

```
pg_facets  → biens immobiliers, leads, transactions, comparables
             facets: {type, status, city, price_range, surface_m2,
                      yield_pct, days_on_market, source}

pg_dgraph  → COMPARABLE_TO entre biens (market comps)
             INTERESTED_IN entre lead et bien
             LOCATED_IN entre bien et quartier/zone
             SIMILAR_TO entre profils de leads

pg_pragma → pack pour un rendez-vous client :
             FACT: comparables récents dans ce segment,
             GOAL: critères de recherche du lead,
             CONSTRAINT: budget max atteint dans ce quartier
```

***

### 🎓 Education — Graphe de prérequis

**Tutor**, **Study Planner**, **Curriculum Designer**, **Flashcard Generator**  [github](https://github.com/mergisi/awesome-openclaw-agents)

```
pg_facets  → cours, exercices, flashcards, résultats d'évaluation
             facets: {subject, level, status, score,
                      student_id, mastered, last_reviewed}

pg_dgraph  → REQUIRES entre concepts (prerequisites)
             MASTERED_BY entre concept et étudiant
             PART_OF entre leçon et cours
             NEXT entre concepts (learning path)

pg_pragma → pack pour une session d'apprentissage :
             GOAL: objectif de la session,
             STEP: prochain concept selon le graphe de prérequis,
             CONSTRAINT: concepts bloquants non maîtrisés
```

C'est exactement le **learning graph** de pg_dgraph appliqué à un étudiant humain — chemin d'acquisition minimal calculé par traversal.

***

### 🛒 E-Commerce — Facettes d'état produit

**Inventory Tracker**, **Pricing Optimizer**, **Abandoned Cart**  [github](https://github.com/mergisi/awesome-openclaw-agents)

```
pg_facets  → produits, commandes, carts, prix concurrents
             facets: {sku, status, stock_level, price,
                      category, margin_pct, days_since_updated}

pg_dgraph  → SUBSTITUTE_FOR entre produits (si rupture stock)
             BOUGHT_WITH entre produits (cross-sell)
             COMPETES_WITH entre SKU et produit concurrent

pg_pragma → CONSTRAINT: SKUs en rupture imminente (stock < reorder_point)
             FACT: prix concurrent le plus bas ce matin
             GOAL: margin target ce mois
```

***

## Synthèse — Matrice de Priorisation

Les use cases les plus pertinents pour une **démonstration immédiate** du skill MFO, classés par richesse d'intégration et taille d'audience :

| Use Case | Audience | pg_facets | pg_dgraph | pg_pragma | Valeur démo |
|---|---|---|---|---|---|
| **Compliance Checker** | Enterprise | ✅ core | ✅ REQUIRES/VALIDATES | ✅ CONSTRAINT pack | ⭐⭐⭐⭐⭐ |
| **Project Management (Orion)** | Universel | ✅ core | ✅ BLOCKS/CONTAINS | ✅ GOAL/STEP pack | ⭐⭐⭐⭐⭐ |
| **Incident Responder** | DevOps | ✅ alertes | ✅ DEPENDS_ON/IMPACTS | ✅ dashboard pattern | ⭐⭐⭐⭐⭐ |
| **Contract Reviewer** | Legal | ✅ clauses | ✅ CONTRADICTS/REQUIRES | ✅ CONSTRAINT | ⭐⭐⭐⭐ |
| **Personal CRM** | Universel | ✅ contacts | ✅ WORKS_AT/REFERRED_BY | ✅ pack entretien | ⭐⭐⭐⭐ |
| **Recruiter** | HR | ✅ CVs | ✅ coverage score RH | ✅ gap entretien | ⭐⭐⭐⭐ |
| **Dependency Scanner** | Dev | ✅ CVEs | ✅ DEPENDS_ON/HAS_CVE | ✅ CONSTRAINT | ⭐⭐⭐⭐ |
| **News Curator** | Universel | ✅ multi-source | ❌ optionnel | ✅ pack digest | ⭐⭐⭐ |
| **Inventory Tracker** | E-Commerce | ✅ core | ✅ SUBSTITUTE_FOR | ✅ CONSTRAINT stock | ⭐⭐⭐ |
| **Study Planner** | Education | ✅ cours | ✅ learning path | ✅ session pack | ⭐⭐⭐ |

**Les trois use cases à développer en priorité comme démos du skill :** Compliance Checker, Project Management, et Incident Responder — ils couvrent les trois architectures distinctes (ontologie réglementaire, hiérarchie avec dépendances, topology de services) et touchent les audiences les plus larges de l'écosystème OpenClaw.  [github](https://github.com/mergisi/awesome-openclaw-agents)