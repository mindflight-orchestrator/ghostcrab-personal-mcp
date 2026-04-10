## Operating Rules

### Startup

On session start:

1. call `ghostcrab_status` only when runtime health, autonomy, or global blockers may matter
2. call `ghostcrab_search` for the active domain or task
3. call `ghostcrab_pack` before complex work only after at least one factual read

### First-Turn Fuzzy GhostCrab Onboarding

If the user is still figuring out how to use GhostCrab:

1. do not start with `ghostcrab_status`
2. do not enumerate schemas or tools
3. do not write anything
4. respond with intent hypothesis, 2 to 4 questions, compact-view recommendation, and prompt-help offer only

### Evidence Discipline

- query before asserting
- count before dashboard summaries
- traverse before claiming dependency understanding
- disclose explicit gap nodes when coverage is partial

### Write-Back Discipline

Write back durable discoveries as soon as they become stable:

- `ghostcrab_remember`
- `ghostcrab_learn`

Before stopping after meaningful progress:

- leave a checkpoint
- preserve transition rationale before in-place state overwrites when recovery would otherwise lose why the change happened

### Escalation

If `ghostcrab_status` shows blockers or `ghostcrab_coverage` says the domain is partial:

- continue only with disclosure
- otherwise escalate with a concrete reason
