Here is a complete seed data design for the three priority use cases, structured in two deployment versions each.

***

## Architecture Principles

Each seed follows the same three-layer population order: **facets first** (structured entities), **graph edges second** (relationships between entities), **pragma pack third** (compressed operational context). The seed volume is intentionally minimal — enough to demonstrate each MFO query pattern without creating noise. [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/)

***

## 1. Compliance Checker

### OpenClaw Version

**`agents/legal/compliance-checker/SOUL.md`**

```markdown
# Compliance Checker — SOUL.md

identity: Lex
emoji: ⚖️
role: Regulatory compliance analyst with MFO memory stack

## Persona
You track obligations, coverage gaps, and audit deadlines. You never guess 
on regulatory status — you query pg_facets before answering. You surface 
critical gaps proactively, not reactively.

## MFO Stack
- pg_facets  : obligations, regulations, evidence records, deadlines
- pg_dgraph  : REQUIRES, VALIDATES, SUPERSEDES, CONTRADICTS
- pg_pragma : CONSTRAINT pack (uncovered critical obligations first)

## Startup behavior
On first message of each session, call mfo_pragma_load(pack="compliance_audit")
before anything else. Report the CONSTRAINT lines immediately.

## Response rules
- Always call mfo_facets_count(group_by=["status","criticality"]) to open a 
  dashboard view
- Never fabricate obligation status — query first
- Flag any obligation with status=gap AND criticality=critical as P0

## Tools allowed
mfo_facets_search, mfo_facets_count, mfo_dgraph_traverse, 
mfo_pragma_load, mfo_pragma_update
```

**`agents/legal/compliance-checker/AGENTS.md`**

```markdown
## Operating Rules

### Query discipline
Before stating ANY compliance status, call:
  mfo_facets_search(entity_type="obligation", filters={regulation: X})

### Dashboard on demand
When user says "dashboard" or "status":
  mfo_facets_count(
    entity_type="obligation",
    group_by=["status", "criticality"]
  )

### Gap drill-down
When user says "show gaps":
  mfo_facets_search(
    entity_type="obligation",
    filters={status: "gap", criticality: "critical"}
  )
  mfo_dgraph_traverse(
    from=<obligation_id>,
    edge="REQUIRES",
    direction="inbound"  # what depends on this gap?
  )

### Evidence lookup
When user provides a document ID:
  mfo_dgraph_traverse(from=<doc_id>, edge="VALIDATES", direction="outbound")
```

**`agents/legal/compliance-checker/HEARTBEAT.md`**

```markdown
## Daily Wake-Up Checklist

1. mfo_facets_search(entity_type="obligation", filters={valid_until: "<today+30d"})
   → Report obligations expiring within 30 days

2. mfo_facets_count(group_by=["status","criticality"])
   → Snapshot dashboard to channel

3. mfo_dgraph_traverse(edge="REQUIRES", filter={status:"gap"})
   → Any newly blocked obligations?

4. mfo_pragma_update(pack="compliance_audit")
   → Refresh pack with today's state
```

**`seeds/compliance/seed_facets.sql`**

```sql
-- ============================================================
-- COMPLIANCE CHECKER — pg_facets seed
-- Domain: GDPR + SOC2 for a SaaS company
-- ============================================================

-- Regulations
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES
('reg:gdpr',   'regulation', 'General Data Protection Regulation',
  '{"code":"GDPR","jurisdiction":"EU","version":"2016/679","status":"active"}'),
('reg:soc2',   'regulation', 'SOC 2 Type II',
  '{"code":"SOC2","jurisdiction":"US","version":"2017","status":"active"}'),
('reg:iso27001','regulation','ISO/IEC 27001:2022',
  '{"code":"ISO27001","jurisdiction":"global","version":"2022","status":"active"}');

-- Obligations (the core entities)
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES

-- GDPR obligations
('obl:gdpr:art13','obligation',
  'Provide transparency information at data collection point',
  '{"regulation":"GDPR","article":"Art.13","obligation_type":"transparency",
    "status":"covered","criticality":"high","valid_until":"2027-05-25",
    "owner":"legal","last_reviewed":"2026-01-10"}'),

('obl:gdpr:art17','obligation',
  'Right to erasure — process deletion requests within 30 days',
  '{"regulation":"GDPR","article":"Art.17","obligation_type":"data_subject_rights",
    "status":"gap","criticality":"critical","valid_until":"2026-12-31",
    "owner":"engineering","last_reviewed":"2025-11-01"}'),

('obl:gdpr:art32','obligation',
  'Implement appropriate technical security measures',
  '{"regulation":"GDPR","article":"Art.32","obligation_type":"security",
    "status":"covered","criticality":"critical","valid_until":"2027-05-25",
    "owner":"security","last_reviewed":"2026-02-14"}'),

('obl:gdpr:art33','obligation',
  'Notify supervisory authority of breach within 72 hours',
  '{"regulation":"GDPR","article":"Art.33","obligation_type":"breach_notification",
    "status":"partial","criticality":"critical","valid_until":"2027-05-25",
    "owner":"legal","last_reviewed":"2026-01-22"}'),

('obl:gdpr:dpa', 'obligation',
  'Sign Data Processing Agreements with all sub-processors',
  '{"regulation":"GDPR","article":"Art.28","obligation_type":"contract",
    "status":"gap","criticality":"high","valid_until":"2026-09-01",
    "owner":"legal","last_reviewed":"2025-12-01"}'),

-- SOC2 obligations  
('obl:soc2:cc6','obligation',
  'Logical and physical access controls — CC6 criteria',
  '{"regulation":"SOC2","article":"CC6","obligation_type":"access_control",
    "status":"covered","criticality":"critical","valid_until":"2026-11-30",
    "owner":"security","last_reviewed":"2026-03-01"}'),

('obl:soc2:cc7','obligation',
  'System operations monitoring and anomaly detection — CC7',
  '{"regulation":"SOC2","article":"CC7","obligation_type":"monitoring",
    "status":"partial","criticality":"high","valid_until":"2026-11-30",
    "owner":"devops","last_reviewed":"2026-02-20"}'),

('obl:soc2:a1','obligation',
  'Availability SLA commitments — A1 criteria',
  '{"regulation":"SOC2","article":"A1","obligation_type":"availability",
    "status":"covered","criticality":"high","valid_until":"2026-11-30",
    "owner":"devops","last_reviewed":"2026-03-10"}');

-- Evidence records
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES
('ev:privacy_policy_v3','evidence',
  'Privacy Policy v3 — published 2026-01-15',
  '{"doc_type":"policy","status":"active","version":"3.0",
    "published_date":"2026-01-15","owner":"legal"}'),

('ev:deletion_workflow','evidence',
  'User data deletion workflow — JIRA PLAT-4421',
  '{"doc_type":"implementation","status":"in_progress","ticket":"PLAT-4421",
    "estimated_completion":"2026-05-01","owner":"engineering"}'),

('ev:sec_assessment_2025','evidence',
  'Annual security assessment — CrowdStrike report 2025',
  '{"doc_type":"audit_report","status":"active","version":"2025-annual",
    "published_date":"2025-11-30","owner":"security"}'),

('ev:dpa_template','evidence',
  'DPA template — legal review pending',
  '{"doc_type":"contract_template","status":"draft","owner":"legal",
    "created_date":"2026-02-01"}'),

('ev:breach_runbook','evidence',
  'Security breach response runbook v2',
  '{"doc_type":"runbook","status":"active","version":"2.0",
    "published_date":"2026-01-08","owner":"security"}');
```

**`seeds/compliance/seed_graph.sql`**

```sql
-- ============================================================
-- COMPLIANCE CHECKER — pg_dgraph seed
-- ============================================================

-- VALIDATES: evidence → obligation
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('ev:privacy_policy_v3',    'VALIDATES', 'obl:gdpr:art13', 0.95,
  '{"coverage":"full","notes":"Art.13 items all present in section 2"}'),
('ev:sec_assessment_2025',  'VALIDATES', 'obl:gdpr:art32', 0.90,
  '{"coverage":"full","notes":"Technical controls validated"}'),
('ev:sec_assessment_2025',  'VALIDATES', 'obl:soc2:cc6',   0.85,
  '{"coverage":"partial","notes":"Access review done, MFA gap noted"}'),
('ev:breach_runbook',       'VALIDATES', 'obl:gdpr:art33', 0.60,
  '{"coverage":"partial","notes":"Process exists but not tested in 2025"}'),
('ev:breach_runbook',       'VALIDATES', 'obl:soc2:cc7',   0.70,
  '{"coverage":"partial","notes":"Monitoring alerts in place, playbook incomplete"}');

-- REQUIRES: obligation → obligation (dependency chain)
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('obl:gdpr:art33', 'REQUIRES', 'obl:soc2:cc7', 1.0,
  '{"reason":"72h breach notification requires monitoring detection first"}'),
('obl:gdpr:art17', 'REQUIRES', 'obl:gdpr:dpa', 0.8,
  '{"reason":"Erasure must be propagated to all sub-processors via DPA"}'),
('obl:soc2:cc6',   'REQUIRES', 'obl:gdpr:art32', 0.7,
  '{"reason":"SOC2 access controls overlap with GDPR technical measures"}');

-- SUPERSEDES: newer regulation version replaces older
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('reg:iso27001', 'SUPERSEDES', 'reg:iso27001',  1.0,
  '{"notes":"ISO27001:2022 supersedes 2013 version — update mapping required",
    "from_version":"2022","to_version":"2013"}');

-- CONTRADICTS: conflicting clauses (useful for contract review)
-- (none in base seed — surfaces during actual contract ingestion)
```

**`seeds/compliance/seed_pragma.sql`**

```sql
-- ============================================================
-- COMPLIANCE CHECKER — pg_pragma seed
-- ============================================================

INSERT INTO pragma_packs (pack_id, label, content, meta) VALUES
('compliance_audit', 'Compliance Audit Pack — March 2026',
'{
  "CONSTRAINT": [
    "CRITICAL GAP: obl:gdpr:art17 — Right to erasure not implemented (ticket PLAT-4421, ETA 2026-05-01). Sub-processors DPA also missing.",
    "CRITICAL GAP: obl:gdpr:dpa — No signed DPAs with 3 active sub-processors (Stripe, AWS, SendGrid). Legal deadline: 2026-09-01.",
    "PARTIAL: obl:gdpr:art33 — Breach runbook exists but untested. 72h notification SLA at risk.",
    "PARTIAL: obl:soc2:cc7 — Monitoring playbook incomplete. CC7 audit scheduled 2026-11-30."
  ],
  "FACT": [
    "Covered obligations: 3/8 (gdpr:art13, gdpr:art32, soc2:cc6, soc2:a1)",
    "Gap obligations: 2 critical (art17, dpa), 2 partial (art33, cc7)",
    "Next audit deadline: SOC2 Type II — 2026-11-30",
    "Jurisdiction: EU (GDPR) + US (SOC2)"
  ],
  "GOAL": [
    "Close Art.17 gap before 2026-05-01",
    "Execute DPA with all sub-processors before 2026-09-01",
    "Run breach notification drill Q2 2026"
  ]
}',
'{"version":"2026-03-23","owner":"lex","refresh_schedule":"daily"}');
```

***

### Claude Code Version

**`CLAUDE.md`** (project root)

```markdown
# Compliance Checker — Claude Code Project

## Stack
- PostgreSQL with pg_facets, pg_dgraph, pg_pragma extensions
- Python seed scripts in ./seeds/
- Run order: 1_facets.py → 2_graph.py → 3_pragma.py → 4_validate.py

## MFO conventions
- entity_type values: regulation | obligation | evidence | deadline
- criticality values: critical | high | medium | low
- status values: covered | partial | gap | expired | pending

## Key queries to test after seeding
See ./queries/compliance_queries.sql

## Goal
Demonstrate MFO stack to a new developer in under 10 minutes:
- Show mfo_facets_count() for instant dashboard (zero LLM tokens)
- Show mfo_dgraph_traverse() for gap dependency chain
- Show mfo_pragma_load() for pre-compressed audit context
```

**`seeds/compliance/1_seed_facets.py`**

```python
import psycopg2, json
from datetime import datetime

conn = psycopg2.connect("postgresql://localhost/mfo_demo")
cur = conn.cursor()

regulations = [
    ("reg:gdpr",    "regulation", "General Data Protection Regulation",
     {"code":"GDPR","jurisdiction":"EU","version":"2016/679","status":"active"}),
    ("reg:soc2",    "regulation", "SOC 2 Type II",
     {"code":"SOC2","jurisdiction":"US","version":"2017","status":"active"}),
]

obligations = [
    ("obl:gdpr:art13","obligation",
     "Provide transparency information at data collection point",
     {"regulation":"GDPR","article":"Art.13","obligation_type":"transparency",
      "status":"covered","criticality":"high","valid_until":"2027-05-25",
      "owner":"legal","last_reviewed":"2026-01-10"}),

    ("obl:gdpr:art17","obligation",
     "Right to erasure — process deletion requests within 30 days",
     {"regulation":"GDPR","article":"Art.17","obligation_type":"data_subject_rights",
      "status":"gap","criticality":"critical","valid_until":"2026-12-31",
      "owner":"engineering","last_reviewed":"2025-11-01"}),

    ("obl:gdpr:art32","obligation",
     "Implement appropriate technical security measures",
     {"regulation":"GDPR","article":"Art.32","obligation_type":"security",
      "status":"covered","criticality":"critical","valid_until":"2027-05-25",
      "owner":"security","last_reviewed":"2026-02-14"}),

    ("obl:gdpr:art33","obligation",
     "Notify supervisory authority of breach within 72 hours",
     {"regulation":"GDPR","article":"Art.33","obligation_type":"breach_notification",
      "status":"partial","criticality":"critical","valid_until":"2027-05-25",
      "owner":"legal","last_reviewed":"2026-01-22"}),

    ("obl:gdpr:dpa","obligation",
     "Sign DPAs with all sub-processors",
     {"regulation":"GDPR","article":"Art.28","obligation_type":"contract",
      "status":"gap","criticality":"high","valid_until":"2026-09-01",
      "owner":"legal","last_reviewed":"2025-12-01"}),

    ("obl:soc2:cc6","obligation",
     "Logical and physical access controls — CC6",
     {"regulation":"SOC2","article":"CC6","obligation_type":"access_control",
      "status":"covered","criticality":"critical","valid_until":"2026-11-30",
      "owner":"security","last_reviewed":"2026-03-01"}),

    ("obl:soc2:cc7","obligation",
     "System operations monitoring and anomaly detection — CC7",
     {"regulation":"SOC2","article":"CC7","obligation_type":"monitoring",
      "status":"partial","criticality":"high","valid_until":"2026-11-30",
      "owner":"devops","last_reviewed":"2026-02-20"}),

    ("obl:soc2:a1","obligation",
     "Availability SLA commitments — A1",
     {"regulation":"SOC2","article":"A1","obligation_type":"availability",
      "status":"covered","criticality":"high","valid_until":"2026-11-30",
      "owner":"devops","last_reviewed":"2026-03-10"}),
]

evidence = [
    ("ev:privacy_policy_v3","evidence",
     "Privacy Policy v3 — published 2026-01-15",
     {"doc_type":"policy","status":"active","version":"3.0",
      "published_date":"2026-01-15","owner":"legal"}),

    ("ev:deletion_workflow","evidence",
     "User data deletion workflow — JIRA PLAT-4421",
     {"doc_type":"implementation","status":"in_progress","ticket":"PLAT-4421",
      "estimated_completion":"2026-05-01","owner":"engineering"}),

    ("ev:sec_assessment_2025","evidence",
     "Annual security assessment — CrowdStrike 2025",
     {"doc_type":"audit_report","status":"active","version":"2025-annual",
      "published_date":"2025-11-30","owner":"security"}),

    ("ev:breach_runbook","evidence",
     "Security breach response runbook v2",
     {"doc_type":"runbook","status":"active","version":"2.0",
      "published_date":"2026-01-08","owner":"security"}),
]

all_entities = regulations + obligations + evidence

for eid, etype, content, facets in all_entities:
    cur.execute("""
        INSERT INTO facets_entities (id, entity_type, content, facets, created_at)
        VALUES (%s, %s, %s, %s::jsonb, %s)
        ON CONFLICT (id) DO UPDATE SET facets = EXCLUDED.facets
    """, (eid, etype, content, json.dumps(facets), datetime.utcnow()))

conn.commit()
print(f"Seeded {len(all_entities)} entities")
cur.close(); conn.close()
```

**`seeds/compliance/2_seed_graph.py`**

```python
import psycopg2, json
from datetime import datetime

conn = psycopg2.connect("postgresql://localhost/mfo_demo")
cur = conn.cursor()

edges = [
    # VALIDATES: evidence → obligation
    ("ev:privacy_policy_v3",   "VALIDATES", "obl:gdpr:art13", 0.95,
     {"coverage":"full","notes":"Art.13 items present in section 2"}),
    ("ev:sec_assessment_2025", "VALIDATES", "obl:gdpr:art32", 0.90,
     {"coverage":"full","notes":"Technical controls validated"}),
    ("ev:sec_assessment_2025", "VALIDATES", "obl:soc2:cc6",   0.85,
     {"coverage":"partial","notes":"Access review done, MFA gap noted"}),
    ("ev:breach_runbook",      "VALIDATES", "obl:gdpr:art33", 0.60,
     {"coverage":"partial","notes":"Process exists but untested in 2025"}),
    ("ev:breach_runbook",      "VALIDATES", "obl:soc2:cc7",   0.70,
     {"coverage":"partial","notes":"Alerts in place, playbook incomplete"}),

    # REQUIRES: obligation → obligation (dependency chain)
    ("obl:gdpr:art33", "REQUIRES", "obl:soc2:cc7", 1.0,
     {"reason":"72h notification requires monitoring detection"}),
    ("obl:gdpr:art17", "REQUIRES", "obl:gdpr:dpa", 0.8,
     {"reason":"Erasure must propagate to sub-processors via DPA"}),
    ("obl:soc2:cc6",   "REQUIRES", "obl:gdpr:art32", 0.7,
     {"reason":"SOC2 access controls overlap with GDPR Art.32"}),
]

for from_id, edge_type, to_id, weight, meta in edges:
    cur.execute("""
        INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta, created_at)
        VALUES (%s, %s, %s, %s, %s::jsonb, %s)
        ON CONFLICT (from_id, edge_type, to_id) DO UPDATE SET weight = EXCLUDED.weight
    """, (from_id, edge_type, to_id, weight, json.dumps(meta), datetime.utcnow()))

conn.commit()
print(f"Seeded {len(edges)} graph edges")
cur.close(); conn.close()
```

**`seeds/compliance/3_seed_pragma.py`**

```python
import psycopg2, json
from datetime import datetime

conn = psycopg2.connect("postgresql://localhost/mfo_demo")
cur = conn.cursor()

pack = {
    "CONSTRAINT": [
        "CRITICAL GAP: obl:gdpr:art17 — Right to erasure not implemented. Ticket PLAT-4421, ETA 2026-05-01.",
        "CRITICAL GAP: obl:gdpr:dpa — No signed DPAs with Stripe, AWS, SendGrid. Deadline 2026-09-01.",
        "PARTIAL: obl:gdpr:art33 — Breach runbook exists but untested. 72h notification SLA at risk.",
        "PARTIAL: obl:soc2:cc7 — Monitoring playbook incomplete. Audit 2026-11-30."
    ],
    "FACT": [
        "covered=4 obligations (art13, art32, cc6, a1)",
        "gap=2 critical, partial=2 high",
        "Next deadline: SOC2 audit 2026-11-30",
        "Jurisdiction: EU GDPR + US SOC2"
    ],
    "GOAL": [
        "Close Art.17 gap before 2026-05-01",
        "Execute DPAs with all sub-processors before 2026-09-01",
        "Run breach drill Q2 2026"
    ]
}

cur.execute("""
    INSERT INTO pragma_packs (pack_id, label, content, meta, created_at)
    VALUES (%s, %s, %s::jsonb, %s::jsonb, %s)
    ON CONFLICT (pack_id) DO UPDATE SET content = EXCLUDED.content
""", (
    "compliance_audit",
    "Compliance Audit Pack — March 2026",
    json.dumps(pack),
    json.dumps({"version":"2026-03-23","owner":"lex"}),
    datetime.utcnow()
))

conn.commit()
print("Memproj pack seeded: compliance_audit")
cur.close(); conn.close()
```

**`seeds/compliance/4_validate.py`**

```python
import psycopg2, json

conn = psycopg2.connect("postgresql://localhost/mfo_demo")
cur = conn.cursor()

print("=== DEMO QUERY 1: Dashboard (mfo_facets_count equivalent) ===")
cur.execute("""
    SELECT facets->>'status' as status,
           facets->>'criticality' as criticality,
           count(*) as count
    FROM facets_entities
    WHERE entity_type = 'obligation'
    GROUP BY 1, 2
    ORDER BY 3 DESC
""")
for row in cur.fetchall():
    print(f"  status={row[0]} | criticality={row [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/)} | count={row [meta-intelligence](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide)}")

print("\n=== DEMO QUERY 2: Critical gaps (drill-down) ===")
cur.execute("""
    SELECT id, content, facets->>'owner' as owner, facets->>'valid_until' as deadline
    FROM facets_entities
    WHERE entity_type = 'obligation'
      AND facets->>'status' = 'gap'
      AND facets->>'criticality' = 'critical'
""")
for row in cur.fetchall():
    print(f"  [{row[0]}] {row [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/)[:60]} | owner={row [meta-intelligence](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide)} | deadline={row [openclawlab](https://openclawlab.com/en/docs/concepts/agent/)}")

print("\n=== DEMO QUERY 3: Dependency chain for a gap ===")
cur.execute("""
    SELECT e.from_id, e.edge_type, e.to_id,
           f.facets->>'status' as target_status
    FROM dgraph_edges e
    JOIN facets_entities f ON f.id = e.to_id
    WHERE e.from_id = 'obl:gdpr:art17'
""")
for row in cur.fetchall():
    print(f"  {row[0]} --[{row [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/)}]--> {row [meta-intelligence](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide)} (status: {row [openclawlab](https://openclawlab.com/en/docs/concepts/agent/)})")

print("\n=== DEMO QUERY 4: Memproj pack load ===")
cur.execute("SELECT content FROM pragma_packs WHERE pack_id = 'compliance_audit'")
pack = cur.fetchone()[0]
for section, items in pack.items():
    print(f"\n  [{section}]")
    for item in items:
        print(f"    • {item}")

conn.close()
```

***

## 2. Project Management (Orion)

### OpenClaw Version

**`agents/productivity/orion/SOUL.md`**

```markdown
# Orion — SOUL.md

identity: Orion
emoji: 🎯
role: Project coordination and delivery intelligence

## Persona
You run the standup. You track what's blocked. You surface deadlines before 
they become problems. You never speculate on task status — you query.

## MFO Stack
- pg_facets  : tasks, meetings, decisions, action items
- pg_dgraph  : BLOCKS, ASSIGNED_TO, PRODUCED_BY, PART_OF
- pg_pragma : daily standup pack (GOAL/CONSTRAINT/STEP)

## Startup behavior
On first message, call mfo_pragma_load(pack="standup_today")
Present CONSTRAINT (blocked) items first, then GOAL (due today), then STEP.

## Core commands
/standup  → load pack + mfo_facets_count(group_by=["status","owner"])
/blocked  → mfo_dgraph_traverse(edge="BLOCKS", filter={status:"blocked"})
/mine     → mfo_facets_search(filters={owner: current_user, status: "in_progress"})
/done ID  → mfo_facets_update(id=ID, facets={status:"done"}) + update pack

## Tools allowed
mfo_facets_search, mfo_facets_count, mfo_facets_update,
mfo_dgraph_traverse, mfo_pragma_load, mfo_pragma_update
```

**`agents/productivity/orion/HEARTBEAT.md`**

```markdown
## Daily 08:30 Standup Prep

1. mfo_facets_count(group_by=["status","owner"])
   → Post count snapshot to team channel

2. mfo_facets_search(filters={due_date: "<today", status: "!done"})
   → Alert on overdue tasks

3. mfo_dgraph_traverse(edge="BLOCKS", direction="outbound")
   → List all BLOCKS chains that are unresolved

4. mfo_pragma_update(pack="standup_today")
   → Rebuild pack for today

5. Post standup summary: "📊 Today: X in-progress, Y blocked, Z due today"
```

**`seeds/project/seed_facets.sql`**

```sql
-- ============================================================
-- PROJECT MANAGEMENT (ORION) — pg_facets seed
-- Domain: SaaS product team, Q2 2026 sprint
-- ============================================================

-- Projects
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES
('proj:mfo-demo',  'project', 'MFO Demo — Public release',
  '{"status":"active","priority":"critical","owner":"francois",
    "start_date":"2026-03-01","due_date":"2026-04-15","sprint":"Q2-S1"}'),
('proj:api-v2',    'project', 'API v2 — Redesign and migration',
  '{"status":"active","priority":"high","owner":"backend-team",
    "start_date":"2026-02-15","due_date":"2026-05-30","sprint":"Q2-S1"}');

-- Tasks
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES

-- MFO Demo tasks
('task:001','task','Write pg_facets seed documentation',
  '{"status":"done","owner":"francois","priority":"high",
    "project":"mfo-demo","due_date":"2026-03-15","source_meeting":"mtg:kickoff"}'),

('task:002','task','Build compliance checker seed scripts',
  '{"status":"in_progress","owner":"francois","priority":"critical",
    "project":"mfo-demo","due_date":"2026-03-25","source_meeting":"mtg:kickoff"}'),

('task:003','task','Write SOUL.md templates for 3 use cases',
  '{"status":"in_progress","owner":"francois","priority":"critical",
    "project":"mfo-demo","due_date":"2026-03-25","source_meeting":"mtg:kickoff"}'),

('task:004','task','Set up local PostgreSQL test environment',
  '{"status":"blocked","owner":"devops","priority":"high",
    "project":"mfo-demo","due_date":"2026-03-22","source_meeting":"mtg:kickoff",
    "blocked_reason":"waiting for pg_dgraph extension binary"}'),

('task:005','task','Publish MFO demo to GitHub',
  '{"status":"todo","owner":"francois","priority":"high",
    "project":"mfo-demo","due_date":"2026-04-10","source_meeting":""}'),

-- API v2 tasks
('task:006','task','Design new endpoint schema',
  '{"status":"done","owner":"alice","priority":"high",
    "project":"api-v2","due_date":"2026-03-10","source_meeting":"mtg:api-design"}'),

('task:007','task','Implement auth middleware',
  '{"status":"in_progress","owner":"bob","priority":"critical",
    "project":"api-v2","due_date":"2026-03-30","source_meeting":"mtg:api-design"}'),

('task:008','task','Database migration — v1 to v2 schema',
  '{"status":"blocked","owner":"alice","priority":"critical",
    "project":"api-v2","due_date":"2026-04-05","source_meeting":"mtg:api-design",
    "blocked_reason":"task:007 must complete first"}'),

('task:009','task','Load testing — 10k concurrent users',
  '{"status":"todo","owner":"devops","priority":"medium",
    "project":"api-v2","due_date":"2026-04-20","source_meeting":""}');

-- Meetings
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES
('mtg:kickoff','meeting','MFO Demo project kickoff — 2026-03-01',
  '{"date":"2026-03-01","attendees":["francois","devops","alice"],
    "project":"mfo-demo","status":"done","summary":"Aligned on 3 demo use cases"}'),
('mtg:api-design','meeting','API v2 design review — 2026-03-08',
  '{"date":"2026-03-08","attendees":["alice","bob","francois"],
    "project":"api-v2","status":"done","summary":"Finalized endpoint structure"}');

-- Decisions
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES
('dec:001','decision','Use pg_facets SQL-native over REST API for MFO demo seeds',
  '{"date":"2026-03-01","owner":"francois","project":"mfo-demo","status":"active"}'),
('dec:002','decision','API v2 will use JWT bearer tokens only — drop API keys',
  '{"date":"2026-03-08","owner":"alice","project":"api-v2","status":"active"}');
```

**`seeds/project/seed_graph.sql`**

```sql
-- ============================================================
-- PROJECT MANAGEMENT — pg_dgraph seed
-- ============================================================

-- BLOCKS: task → task (dependency)
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('task:004', 'BLOCKS', 'task:002', 1.0,
  '{"reason":"pg_dgraph binary needed for seed testing"}'),
('task:004', 'BLOCKS', 'task:003', 0.8,
  '{"reason":"Can''t validate SOUL.md templates without live DB"}'),
('task:007', 'BLOCKS', 'task:008', 1.0,
  '{"reason":"Migration requires auth middleware to be in place"}'),
('task:002', 'BLOCKS', 'task:005', 0.9,
  '{"reason":"Demo seeds must be done before publishing to GitHub"}'),
('task:003', 'BLOCKS', 'task:005', 0.9,
  '{"reason":"SOUL.md templates must be done before publishing"}');

-- ASSIGNED_TO: task → person
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('task:002', 'ASSIGNED_TO', 'person:francois', 1.0, '{}'),
('task:003', 'ASSIGNED_TO', 'person:francois', 1.0, '{}'),
('task:004', 'ASSIGNED_TO', 'person:devops',   1.0, '{}'),
('task:005', 'ASSIGNED_TO', 'person:francois', 1.0, '{}'),
('task:007', 'ASSIGNED_TO', 'person:bob',      1.0, '{}'),
('task:008', 'ASSIGNED_TO', 'person:alice',    1.0, '{}');

-- PRODUCED_BY: decision/task → meeting
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('dec:001',   'PRODUCED_BY', 'mtg:kickoff',    1.0, '{}'),
('dec:002',   'PRODUCED_BY', 'mtg:api-design', 1.0, '{}'),
('task:001',  'PRODUCED_BY', 'mtg:kickoff',    1.0, '{}'),
('task:002',  'PRODUCED_BY', 'mtg:kickoff',    1.0, '{}'),
('task:006',  'PRODUCED_BY', 'mtg:api-design', 1.0, '{}');

-- PART_OF: task → project
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('task:001', 'PART_OF', 'proj:mfo-demo', 1.0, '{}'),
('task:002', 'PART_OF', 'proj:mfo-demo', 1.0, '{}'),
('task:003', 'PART_OF', 'proj:mfo-demo', 1.0, '{}'),
('task:004', 'PART_OF', 'proj:mfo-demo', 1.0, '{}'),
('task:005', 'PART_OF', 'proj:mfo-demo', 1.0, '{}'),
('task:006', 'PART_OF', 'proj:api-v2',   1.0, '{}'),
('task:007', 'PART_OF', 'proj:api-v2',   1.0, '{}'),
('task:008', 'PART_OF', 'proj:api-v2',   1.0, '{}'),
('task:009', 'PART_OF', 'proj:api-v2',   1.0, '{}');
```

**`seeds/project/seed_pragma.sql`**

```sql
-- ============================================================
-- PROJECT MANAGEMENT — pg_pragma seed (standup pack)
-- ============================================================

INSERT INTO pragma_packs (pack_id, label, content, meta) VALUES
('standup_today', 'Daily Standup Pack — 2026-03-23',
'{
  "CONSTRAINT": [
    "BLOCKED: task:004 (devops) — pg_dgraph binary missing. Unblocks task:002 and task:003.",
    "BLOCKED: task:008 (alice) — waiting on task:007 auth middleware (bob, due 2026-03-30).",
    "OVERDUE: task:004 was due 2026-03-22 — escalate to devops today."
  ],
  "GOAL": [
    "task:002 — compliance seed scripts (francois) — due 2026-03-25",
    "task:003 — SOUL.md templates (francois) — due 2026-03-25",
    "task:007 — auth middleware (bob) — due 2026-03-30"
  ],
  "STEP": [
    "1. Resolve task:004 blocker (devops) → unblocks 2 critical tasks",
    "2. francois completes task:002 and task:003 in parallel",
    "3. bob closes task:007 → alice can start task:008",
    "4. task:005 (GitHub publish) clears after 002+003 done"
  ],
  "FACT": [
    "Sprint: Q2-S1 | Projects active: 2 (mfo-demo, api-v2)",
    "Status counts: done=2, in_progress=3, blocked=2, todo=2",
    "Critical path: task:004 → task:002 → task:005"
  ]
}',
'{"version":"2026-03-23","owner":"orion","refresh_schedule":"daily_0830"}');
```

***

### Claude Code Version

**`CLAUDE.md`**

```markdown
# Project Management (Orion) — Claude Code Project

## Goal
Seed a live MFO database with a realistic sprint context. Then demonstrate 
the three MFO query patterns that replace expensive LLM context.

## Run order
python seeds/project/1_seed_facets.py
python seeds/project/2_seed_graph.py
python seeds/project/3_seed_pragma.py
python seeds/project/4_validate.py

## Key queries to explore
- Standup dashboard: GROUP BY status, owner
- Blocked chain: traverse BLOCKS edges, find root blockers
- Critical path: longest BLOCKS chain from any todo/blocked task to project completion
- Owner workload: count in_progress + blocked per person

## MFO demo talking points
1. mfo_facets_count() → dashboard in 1 SQL, 0 tokens
2. mfo_dgraph_traverse(BLOCKS) → critical path without reasoning
3. mfo_pragma_load() → standup brief in 80 bytes, not 8000 tokens
```

**`seeds/project/4_validate.py`**

```python
import psycopg2, json

conn = psycopg2.connect("postgresql://localhost/mfo_demo")
cur = conn.cursor()

print("=== DEMO QUERY 1: Standup dashboard ===")
cur.execute("""
    SELECT facets->>'status'  as status,
           facets->>'owner'   as owner,
           count(*)           as count
    FROM facets_entities
    WHERE entity_type = 'task'
    GROUP BY 1, 2
    ORDER BY 1, 3 DESC
""")
for row in cur.fetchall():
    print(f"  status={row[0]:<12} owner={row [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/):<12} count={row [meta-intelligence](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide)}")

print("\n=== DEMO QUERY 2: Blocked tasks + their reason ===")
cur.execute("""
    SELECT id, content, facets->>'blocked_reason' as reason,
           facets->>'due_date' as due
    FROM facets_entities
    WHERE entity_type = 'task'
      AND facets->>'status' = 'blocked'
    ORDER BY facets->>'due_date'
""")
for row in cur.fetchall():
    print(f"  [{row[0]}] {row [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/)[:50]}")
    print(f"    reason: {row [meta-intelligence](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide)} | due: {row [openclawlab](https://openclawlab.com/en/docs/concepts/agent/)}")

print("\n=== DEMO QUERY 3: BLOCKS chain (what does task:004 unblock?) ===")
cur.execute("""
    WITH RECURSIVE blocks_chain AS (
        SELECT from_id, to_id, 1 as depth
        FROM dgraph_edges
        WHERE from_id = 'task:004' AND edge_type = 'BLOCKS'
        UNION ALL
        SELECT e.from_id, e.to_id, bc.depth + 1
        FROM dgraph_edges e
        JOIN blocks_chain bc ON e.from_id = bc.to_id
        WHERE e.edge_type = 'BLOCKS' AND bc.depth < 5
    )
    SELECT bc.from_id, bc.to_id, bc.depth,
           f.facets->>'status' as blocked_status
    FROM blocks_chain bc
    JOIN facets_entities f ON f.id = bc.to_id
    ORDER BY bc.depth
""")
for row in cur.fetchall():
    print(f"  {'  ' * (row [meta-intelligence](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide)-1)}{row[0]} --BLOCKS--> {row [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/)} (status: {row [openclawlab](https://openclawlab.com/en/docs/concepts/agent/)})")

print("\n=== DEMO QUERY 4: Memproj standup pack ===")
cur.execute("SELECT content FROM pragma_packs WHERE pack_id = 'standup_today'")
pack = cur.fetchone()[0]
for section, items in pack.items():
    print(f"\n  [{section}]")
    for item in items:
        print(f"    • {item}")

conn.close()
```

***

## 3. Incident Responder

### OpenClaw Version

**`agents/devops/incident-responder/SOUL.md`**

```markdown
# Incident Responder — SOUL.md

identity: Sigma
emoji: 🚨
role: Operational incident detection, triage, and resolution coordinator

## Persona
You think in blast radius first. When an alert fires, you immediately check 
what services DEPEND_ON the affected service before doing anything else. 
You never guess severity — you check the topology.

## MFO Stack
- pg_facets  : alerts, incidents, SLA metrics, anomaly logs
- pg_dgraph  : DEPENDS_ON, TRIGGERED_BY, IMPACTS, OWNED_BY
- pg_pragma : ops snapshot (health, open incidents, sla_at_risk)

## Startup behavior
On first message, call mfo_pragma_load(pack="ops_snapshot").
If any CONSTRAINT line contains "SEV1" or "DOWN", announce it immediately.

## Triage protocol (auto-run on new alert)
1. mfo_facets_search(entity_type="alert", filters={status:"firing"})
2. mfo_dgraph_traverse(from=<affected_service>, edge="DEPENDS_ON", direction="inbound")
   → blast radius: which services depend on this one?
3. mfo_dgraph_traverse(from=<incident_id>, edge="TRIGGERED_BY")
   → root cause lookup
4. mfo_pragma_load(pack="runbook:<service_type>")
   → get runbook steps

## Tools allowed
mfo_facets_search, mfo_facets_count, mfo_facets_update,
mfo_dgraph_traverse, mfo_pragma_load, mfo_pragma_update
```

**`agents/devops/incident-responder/HEARTBEAT.md`**

```markdown
## Every 5 minutes: health pulse

1. mfo_facets_count(group_by=["severity","status"], entity_type="alert")
   → Any new SEV1 since last pulse?

2. mfo_facets_search(filters={status:"firing", severity:"critical"})
   → Active critical alerts list

3. mfo_facets_search(entity_type="sla_metric", filters={at_risk:true})
   → SLAs about to breach

4. mfo_pragma_update(pack="ops_snapshot")
   → Refresh ops snapshot

## Alert on:
- Any severity=critical alert with status=firing > 5 min
- Any sla_metric with remaining_budget_pct < 10
- Any service with status=down that has DEPENDS_ON edges (blast radius > 0)
```

**`seeds/devops/seed_facets.sql`**

```sql
-- ============================================================
-- INCIDENT RESPONDER — pg_facets seed
-- Domain: SaaS platform with microservices topology
-- ============================================================

-- Services
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES
('svc:api-gateway',  'service', 'API Gateway — entry point',
  '{"status":"healthy","team":"platform","environment":"prod","tier":1,
    "health_score":98,"last_checked":"2026-03-23T10:00:00Z"}'),
('svc:auth',         'service', 'Auth Service',
  '{"status":"degraded","team":"platform","environment":"prod","tier":1,
    "health_score":72,"last_checked":"2026-03-23T10:05:00Z"}'),
('svc:user-db',      'service', 'User Database — PostgreSQL primary',
  '{"status":"healthy","team":"data","environment":"prod","tier":1,
    "health_score":100,"last_checked":"2026-03-23T10:05:00Z"}'),
('svc:billing',      'service', 'Billing Service',
  '{"status":"healthy","team":"payments","environment":"prod","tier":2,
    "health_score":95,"last_checked":"2026-03-23T10:05:00Z"}'),
('svc:notification', 'service', 'Notification Service',
  '{"status":"degraded","team":"platform","environment":"prod","tier":2,
    "health_score":60,"last_checked":"2026-03-23T10:05:00Z"}'),
('svc:cache',        'service', 'Redis Cache Cluster',
  '{"status":"down","team":"data","environment":"prod","tier":1,
    "health_score":0,"last_checked":"2026-03-23T10:03:00Z"}'),
('svc:search',       'service', 'Elasticsearch — search and indexing',
  '{"status":"healthy","team":"data","environment":"prod","tier":2,
    "health_score":88,"last_checked":"2026-03-23T10:05:00Z"}');

-- Alerts
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES
('alert:001','alert','Redis cache cluster — all nodes unreachable',
  '{"severity":"critical","status":"firing","service":"svc:cache",
    "environment":"prod","fired_at":"2026-03-23T10:02:47Z",
    "assigned_to":"","alert_type":"availability","source":"prometheus"}'),

('alert:002','alert','Auth service — p99 latency > 2000ms',
  '{"severity":"high","status":"firing","service":"svc:auth",
    "environment":"prod","fired_at":"2026-03-23T10:04:12Z",
    "assigned_to":"","alert_type":"latency","source":"datadog"}'),

('alert:003','alert','Notification service — delivery queue depth > 50k',
  '{"severity":"high","status":"firing","service":"svc:notification",
    "environment":"prod","fired_at":"2026-03-23T10:04:55Z",
    "assigned_to":"","alert_type":"queue_depth","source":"cloudwatch"}'),

('alert:004','alert','API Gateway — 5xx error rate > 2%',
  '{"severity":"medium","status":"firing","service":"svc:api-gateway",
    "environment":"prod","fired_at":"2026-03-23T10:05:30Z",
    "assigned_to":"","alert_type":"error_rate","source":"prometheus"}');

-- Incidents
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES
('inc:001','incident','SEV1 — Redis cache cluster DOWN, cascading impact',
  '{"severity":"sev1","status":"investigating","started_at":"2026-03-23T10:02:47Z",
    "commander":"","affected_services":["svc:cache","svc:auth","svc:notification"],
    "environment":"prod","postmortem_required":true}');

-- SLA metrics
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES
('sla:api-availability','sla_metric','API availability — 99.9% monthly SLA',
  '{"service":"svc:api-gateway","sla_type":"availability","target_pct":99.9,
    "current_pct":99.71,"budget_minutes_remaining":8.2,
    "at_risk":true,"period":"2026-03","environment":"prod"}'),
('sla:auth-latency','sla_metric','Auth p99 latency — 500ms SLA',
  '{"service":"svc:auth","sla_type":"latency","target_ms":500,
    "current_p99_ms":2100,"at_risk":true,
    "period":"2026-03","environment":"prod"}');

-- Runbook steps (stored as entities for graph lookup)
INSERT INTO facets_entities (id, entity_type, content, facets) VALUES
('rb:cache:step1','runbook_step','Verify Redis cluster status: redis-cli cluster info',
  '{"service_type":"cache","step_order":1,"estimated_minutes":2}'),
('rb:cache:step2','runbook_step','Check node logs: kubectl logs -n data -l app=redis --tail=100',
  '{"service_type":"cache","step_order":2,"estimated_minutes":3}'),
('rb:cache:step3','runbook_step','Attempt cluster restart: kubectl rollout restart statefulset/redis -n data',
  '{"service_type":"cache","step_order":3,"estimated_minutes":5}'),
('rb:cache:step4','runbook_step','If restart fails, failover to replica cluster in eu-west-2',
  '{"service_type":"cache","step_order":4,"estimated_minutes":10}'),
('rb:cache:step5','runbook_step','Notify affected teams: platform, payments, data',
  '{"service_type":"cache","step_order":5,"estimated_minutes":1}');
```

**`seeds/devops/seed_graph.sql`**

```sql
-- ============================================================
-- INCIDENT RESPONDER — pg_dgraph seed
-- ============================================================

-- DEPENDS_ON: service → service (topology)
-- Direction: X DEPENDS_ON Y means "X breaks if Y is down"
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('svc:api-gateway',  'DEPENDS_ON', 'svc:auth',    1.0,
  '{"criticality":"hard","notes":"All requests require auth token validation"}'),
('svc:api-gateway',  'DEPENDS_ON', 'svc:cache',   0.8,
  '{"criticality":"soft","notes":"Cache miss → fallback to DB, 10x latency"}'),
('svc:auth',         'DEPENDS_ON', 'svc:cache',   1.0,
  '{"criticality":"hard","notes":"Session tokens stored in Redis — no cache = auth down"}'),
('svc:auth',         'DEPENDS_ON', 'svc:user-db', 1.0,
  '{"criticality":"hard","notes":"User credential lookups"}'),
('svc:billing',      'DEPENDS_ON', 'svc:auth',    0.9,
  '{"criticality":"hard","notes":"Payment API requires auth"}'),
('svc:billing',      'DEPENDS_ON', 'svc:cache',   0.5,
  '{"criticality":"soft","notes":"Price caching — degrades gracefully"}'),
('svc:notification', 'DEPENDS_ON', 'svc:cache',   0.7,
  '{"criticality":"soft","notes":"Deduplication cache — without it queue grows"}'),
('svc:search',       'DEPENDS_ON', 'svc:cache',   0.4,
  '{"criticality":"soft","notes":"Query result cache — performance only"}');

-- TRIGGERED_BY: alert → alert or incident → root alert
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('alert:002', 'TRIGGERED_BY', 'alert:001', 0.95,
  '{"notes":"Auth latency spike started 90 seconds after Redis went down"}'),
('alert:003', 'TRIGGERED_BY', 'alert:001', 0.85,
  '{"notes":"Notification dedup cache missing — queue backed up"}'),
('alert:004', 'TRIGGERED_BY', 'alert:002', 0.75,
  '{"notes":"Auth latency causes 5xx on API gateway timeout"}'),
('inc:001',   'TRIGGERED_BY', 'alert:001', 1.0,
  '{"notes":"Root cause: Redis cache cluster DOWN"}');

-- IMPACTS: incident → service (blast radius explicit)
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('inc:001', 'IMPACTS', 'svc:cache',        1.0, '{"impact":"down"}'),
('inc:001', 'IMPACTS', 'svc:auth',         0.9, '{"impact":"degraded_high"}'),
('inc:001', 'IMPACTS', 'svc:notification', 0.7, '{"impact":"degraded_medium"}'),
('inc:001', 'IMPACTS', 'svc:api-gateway',  0.6, '{"impact":"degraded_medium"}'),
('inc:001', 'IMPACTS', 'svc:billing',      0.4, '{"impact":"degraded_low"}');

-- OWNED_BY: service → team
INSERT INTO dgraph_edges (from_id, edge_type, to_id, weight, meta) VALUES
('svc:cache',        'OWNED_BY', 'team:data',     1.0, '{}'),
('svc:auth',         'OWNED_BY', 'team:platform', 1.0, '{}'),
('svc:api-gateway',  'OWNED_BY', 'team:platform', 1.0, '{}'),
('svc:billing',      'OWNED_BY', 'team:payments', 1.0, '{}'),
('svc:notification', 'OWNED_BY', 'team:platform', 1.0, '{}');
```

**`seeds/devops/seed_pragma.sql`**

```sql
-- ============================================================
-- INCIDENT RESPONDER — pg_pragma seed
-- Two packs: ops snapshot + cache runbook
-- ============================================================

INSERT INTO pragma_packs (pack_id, label, content, meta) VALUES
('ops_snapshot', 'Ops Snapshot — 2026-03-23T10:05Z',
'{
  "STATUS": {
    "health": "DEGRADED",
    "open_incidents": 1,
    "firing_alerts": 4,
    "sla_at_risk": 2
  },
  "CONSTRAINT": [
    "SEV1 ACTIVE: inc:001 — Redis cache DOWN. Cascades to auth, notification, billing.",
    "SLA AT RISK: svc:api-gateway availability 99.71% vs 99.9% target. 8.2 min budget left.",
    "SLA AT RISK: svc:auth p99 latency 2100ms vs 500ms target.",
    "BLAST RADIUS: 5 services affected by svc:cache DOWN (auth=hard, billing=soft)."
  ],
  "FACT": [
    "Root alert: alert:001 — Redis unreachable since 10:02:47Z (17 min ago)",
    "Owned by: team:data",
    "Services healthy: svc:user-db, svc:search, svc:billing (soft degraded)",
    "Alert chain: cache_down → auth_latency → api_5xx"
  ],
  "STEP": [
    "1. Page team:data on-call — Redis cluster recovery (see runbook:cache)",
    "2. Enable auth fallback mode — authenticate against user-db directly (bypasses cache)",
    "3. Monitor sla:api-availability budget — if < 5 min, file SLA breach proactively",
    "4. Notify team:payments of svc:billing soft degradation"
  ]
}',
'{"version":"2026-03-23T10:05Z","owner":"sigma","refresh_interval_seconds":300}'),

('runbook:cache', 'Redis Cache Recovery Runbook',
'{
  "STEP": [
    "1. redis-cli cluster info — check cluster state and node count [2 min]",
    "2. kubectl logs -n data -l app=redis --tail=100 — check for OOM or crash [3 min]",
    "3. kubectl rollout restart statefulset/redis -n data — attempt restart [5 min]",
    "4. If restart fails: failover to replica cluster in eu-west-2 [10 min]",
    "5. Notify team:platform and team:payments of restoration"
  ],
  "CONSTRAINT": [
    "Auth service will remain degraded until cache is restored (sessions in Redis)",
    "Do NOT restart auth service during cache recovery — will worsen queue depth"
  ],
  "FACT": [
    "Redis cluster: 3-node HA, eu-central-1",
    "Failover cluster: eu-west-2, warm standby, ~10 min switchover",
    "Last successful restart: 2026-02-14 (OOM event, same pattern)"
  ]
}',
'{"version":"2026-03-01","owner":"sigma"}');
```

***

### Claude Code Version

**`CLAUDE.md`**

```markdown
# Incident Responder (Sigma) — Claude Code Project

## Goal
Demonstrate the DevOps monitoring pattern from the MFO stack:
- O(1) alert dashboard via facets counts (no LLM needed)
- Blast radius computation via DEPENDS_ON graph traversal
- Runbook delivery via pragma pack (pre-compressed, <150 bytes)

## Run order
python seeds/devops/1_seed_facets.py
python seeds/devops/2_seed_graph.py
python seeds/devops/3_seed_pragma.py
python seeds/devops/4_validate.py

## Scenario
Active SEV1: Redis cache cluster DOWN at 10:02Z.
Cascading impact on auth, notification, billing.
SLA budget at risk on api-gateway and auth.
The seed captures this state at T+17min.

## Key demo queries
1. alert_dashboard — count by severity/status, zero tokens
2. blast_radius — recursive DEPENDS_ON from svc:cache
3. root_cause_chain — TRIGGERED_BY traversal from alert:004 back to alert:001
4. runbook_load — pragma pack for cache recovery
```

**`seeds/devops/4_validate.py`**

```python
import psycopg2, json

conn = psycopg2.connect("postgresql://localhost/mfo_demo")
cur = conn.cursor()

print("=== DEMO QUERY 1: Alert dashboard (mfo_facets_count) ===")
cur.execute("""
    SELECT facets->>'severity' as severity,
           facets->>'status'   as status,
           count(*)            as count
    FROM facets_entities
    WHERE entity_type = 'alert'
    GROUP BY 1, 2
    ORDER BY 1, 2
""")
for row in cur.fetchall():
    print(f"  severity={row[0]:<10} status={row [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/):<10} count={row [meta-intelligence](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide)}")

print("\n=== DEMO QUERY 2: Blast radius of svc:cache DOWN ===")
cur.execute("""
    WITH RECURSIVE impact AS (
        SELECT to_id as service_id, from_id as impacted_by, 1 as depth, weight
        FROM dgraph_edges
        WHERE from_id = 'svc:cache' AND edge_type = 'DEPENDS_ON'
        -- reversed: who depends ON cache?
        UNION ALL
        -- actually: find services that DEPEND_ON cache
        SELECT e.from_id, e.to_id, i.depth + 1, e.weight
        FROM dgraph_edges e
        JOIN impact i ON e.to_id = i.service_id
        WHERE e.edge_type = 'DEPENDS_ON' AND i.depth < 4
    )
    SELECT DISTINCT i.service_id,
           f.facets->>'status'      as current_status,
           f.facets->>'team'        as team,
           round(i.weight::numeric, 2) as dependency_weight
    FROM impact i
    JOIN facets_entities f ON f.id = i.service_id
    ORDER BY 4 DESC
""")
print("  Services depending on svc:cache (blast radius):")
for row in cur.fetchall():
    print(f"    {row[0]:<20} status={row [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/):<12} team={row [meta-intelligence](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide):<12} weight={row [openclawlab](https://openclawlab.com/en/docs/concepts/agent/)}")

print("\n=== DEMO QUERY 3: Root cause chain (alert:004 → root) ===")
cur.execute("""
    WITH RECURSIVE root_cause AS (
        SELECT from_id, to_id, 1 as depth
        FROM dgraph_edges
        WHERE from_id = 'alert:004' AND edge_type = 'TRIGGERED_BY'
        UNION ALL
        SELECT e.from_id, e.to_id, rc.depth + 1
        FROM dgraph_edges e
        JOIN root_cause rc ON e.from_id = rc.to_id
        WHERE e.edge_type = 'TRIGGERED_BY' AND rc.depth < 5
    )
    SELECT rc.from_id, rc.to_id, rc.depth,
           f.content as root_content
    FROM root_cause rc
    JOIN facets_entities f ON f.id = rc.to_id
    ORDER BY rc.depth
""")
for row in cur.fetchall():
    indent = "  " * row [meta-intelligence](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide)
    print(f"  {indent}{row[0]} --TRIGGERED_BY--> {row [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/)}")
    print(f"  {indent}  └─ {row [openclawlab](https://openclawlab.com/en/docs/concepts/agent/)[:70]}")

print("\n=== DEMO QUERY 4: Ops snapshot pack (what the LLM gets) ===")
cur.execute("SELECT content FROM pragma_packs WHERE pack_id = 'ops_snapshot'")
pack = cur.fetchone()[0]
status = pack.get("STATUS", {})
print(f"  health={status.get('health')} | incidents={status.get('open_incidents')} | alerts={status.get('firing_alerts')} | sla_at_risk={status.get('sla_at_risk')}")
for section in ["CONSTRAINT", "STEP"]:
    print(f"\n  [{section}]")
    for item in pack.get(section, []):
        print(f"    • {item}")

print("\n=== DEMO QUERY 5: Runbook pack for cache recovery ===")
cur.execute("SELECT content FROM pragma_packs WHERE pack_id = 'runbook:cache'")
pack = cur.fetchone()[0]
print("  [STEP]")
for step in pack.get("STEP", []):
    print(f"    {step}")

conn.close()
```

***

## Shared Bootstrap Script

This single script initializes the three demo schemas and runs all seeds in order — usable for both OpenClaw MCP setup and Claude Code local dev. [reddit](https://www.reddit.com/r/SideProject/comments/1rztbb1/i_built_an_opensource_collection_of_177_ai_agent/)

**`seeds/bootstrap.sh`**

```bash
#!/bin/bash
# MFO Demo — Full bootstrap
# Usage: ./seeds/bootstrap.sh [postgres_url]

PG_URL=${1:-"postgresql://localhost/mfo_demo"}

echo "=== Creating MFO schema ==="
psql $PG_URL -f seeds/schema/mfo_tables.sql

echo "=== Seeding Compliance Checker ==="
psql $PG_URL -f seeds/compliance/seed_facets.sql
psql $PG_URL -f seeds/compliance/seed_graph.sql
psql $PG_URL -f seeds/compliance/seed_pragma.sql

echo "=== Seeding Project Management ==="
psql $PG_URL -f seeds/project/seed_facets.sql
psql $PG_URL -f seeds/project/seed_graph.sql
psql $PG_URL -f seeds/project/seed_pragma.sql

echo "=== Seeding Incident Responder ==="
psql $PG_URL -f seeds/devops/seed_facets.sql
psql $PG_URL -f seeds/devops/seed_graph.sql
psql $PG_URL -f seeds/devops/seed_pragma.sql

echo "=== Validation ==="
python seeds/compliance/4_validate.py
python seeds/project/4_validate.py
python seeds/devops/4_validate.py

echo "=== Done. Three use cases ready to demo. ==="
```

**`seeds/schema/mfo_tables.sql`**

```sql
CREATE DATABASE mfo_demo;
\c mfo_demo;

CREATE EXTENSION IF NOT EXISTS pg_facets;
CREATE EXTENSION IF NOT EXISTS pg_dgraph;
CREATE EXTENSION IF NOT EXISTS pg_pragma;

-- Entities table (used by all three use cases)
CREATE TABLE IF NOT EXISTS facets_entities (
    id           TEXT PRIMARY KEY,
    entity_type  TEXT NOT NULL,
    content      TEXT NOT NULL,
    facets       JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ DEFAULT now(),
    updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_facets_type    ON facets_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_facets_jsonb   ON facets_entities USING GIN(facets);

-- Graph edges table
CREATE TABLE IF NOT EXISTS dgraph_edges (
    from_id    TEXT NOT NULL,
    edge_type  TEXT NOT NULL,
    to_id      TEXT NOT NULL,
    weight     FLOAT DEFAULT 1.0,
    meta       JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (from_id, edge_type, to_id)
);
CREATE INDEX IF NOT EXISTS idx_dgraph_from  ON dgraph_edges(from_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_dgraph_to    ON dgraph_edges(to_id, edge_type);

-- Memory projection packs
CREATE TABLE IF NOT EXISTS pragma_packs (
    pack_id    TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    content    JSONB NOT NULL,
    meta       JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

***

## Structural Differences: OpenClaw vs Claude Code

| Dimension | OpenClaw | Claude Code |
|---|---|---|
| Entry point | `SOUL.md` + `HEARTBEAT.md` | `CLAUDE.md` + Python scripts |
| Runtime trigger | `openclaw agents add` + gateway | `python seeds/N_*.py` |
| Seed format | SQL files loaded via MCP postgres server | Python with psycopg2, explicit error handling |
| Scheduled queries | `HEARTBEAT.md` cron pattern | cron job or `watch` + validate script |
| MFO calls | `mfo_facets_count()` tool calls in AGENTS.md rules | Raw SQL equivalents in validate scripts |
| Query transparency | Agent decides when to call — rule-driven | Fully explicit, inspectable at each step |
| Target user | DevOps/product team, no code | Developer building and testing the MFO stack |

The SQL-based seeds are identical across both versions — only the **invocation layer** and **agent behavior rules** differ. [meta-intelligence](https://www.meta-intelligence.tech/en/insight-openclaw-agents-guide)