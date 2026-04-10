# Pre-Test Adaptations For Claude Code And OpenClaw

This note captures what can already be adapted before running the next comparative test pass.

The goal is not to pre-optimize them into passing.

The goal is to identify low-risk changes that align their rails with the GhostCrab product contract already validated on Codex.

## Shared Observation

Both host surfaces already contain the right core ideas:

- fuzzy onboarding should clarify before building
- provisional modeling should come before schema freeze
- compact views exist
- current-state-first recovery exists

What is still likely missing or too weak across both hosts:

- stronger coupling between intent analysis and family-specific questions
- explicit compact-view recommendation during onboarding
- explicit offer to help write the next structured GhostCrab prompt

## Claude Code

Primary files reviewed:

- [/Users/francois/Documents/mars2026/ghostcrab-skills/claude-code/self-memory/CLAUDE.md](/Users/francois/Documents/mars2026/ghostcrab-skills/claude-code/self-memory/CLAUDE.md)
- [/Users/francois/Documents/mars2026/ghostcrab-skills/claude-code/data-architect/CLAUDE.md](/Users/francois/Documents/mars2026/ghostcrab-skills/claude-code/data-architect/CLAUDE.md)

### What Already Looks Good

- `self-memory` already says:
  - no `ghostcrab_schema_register` on first-turn fuzzy onboarding
  - 2 to 4 clarification questions
  - prompt offer before implementation
- `self-memory` already contains:
  - current-state-first tracker contract
  - current-state-first recovery order
  - new primitives for integrations
- `data-architect` already starts with activity family identification and provisional design

### Likely Gaps Before Testing

- `self-memory` does not explicitly require a visible intent hypothesis before the questions
- it does not require family-specific question shaping
- it does not require compact-view recommendation during onboarding
- it says `prompt offer`, but not clearly `I can write your next structured GhostCrab prompt`
- `data-architect` is still more design-oriented than onboarding-oriented, which could make Claude jump into model definition too early on fuzzy asks

### Low-Risk Adaptations

For `self-memory`:

- require one short intent hypothesis before the question list
- require that at least half of onboarding questions be specific to the detected activity family
- discourage cadence questions unless cadence changes setup or recovery view
- require one likely compact-view recommendation when the family is visible
- require one explicit prompt-help line in user language

For `data-architect`:

- add an onboarding branch for fuzzy requests before the default design flow
- require family detection plus uncertainty framing before model outputs
- make it explicit that first-turn fuzzy asks should not jump straight to `domain.schema.json` or migration drafts

### Likely Claude Risk

Without these changes, Claude Code will probably:

- detect the right family often enough
- but move faster than Codex toward design language
- and may still over-interpret a fuzzy onboarding ask as permission to start shaping the model

## OpenClaw

Primary files reviewed:

- [/Users/francois/Documents/mars2026/ghostcrab-skills/openclaw/ghostcrab-memory/SKILL.md](/Users/francois/Documents/mars2026/ghostcrab-skills/openclaw/ghostcrab-memory/SKILL.md)
- [/Users/francois/Documents/mars2026/ghostcrab-skills/openclaw/ghostcrab-memory/README.md](/Users/francois/Documents/mars2026/ghostcrab-skills/openclaw/ghostcrab-memory/README.md)
- [/Users/francois/Documents/mars2026/ghostcrab-skills/openclaw/ghostcrab-epistemic-agent/SOUL.md](/Users/francois/Documents/mars2026/ghostcrab-skills/openclaw/ghostcrab-epistemic-agent/SOUL.md)
- [/Users/francois/Documents/mars2026/ghostcrab-skills/openclaw/scenarios/environment-delivery.md](/Users/francois/Documents/mars2026/ghostcrab-skills/openclaw/scenarios/environment-delivery.md)

### What Already Looks Good

- `ghostcrab-memory` already contains a strong fuzzy-onboarding rule
- it already says:
  - no schema freeze too early
  - 2 to 4 clarification questions
  - prompt coaching before implementation
- it already has strong current-state and recovery guidance
- the epistemic agent already emphasizes route-first behavior and low-reasoning discipline

### Likely Gaps Before Testing

- OpenClaw still looks more vulnerable to over-eager default tool order such as `ghostcrab_status` too early
- family detection is present, but the question-shaping consequences are still too implicit
- compact-view recommendation is not clearly required during onboarding
- prompt coaching is mentioned, but not framed as a concrete “I can write the next prompt for you”
- some scenario files are still semi-guided and tool-forward, which may hide natural weaknesses

### Low-Risk Adaptations

For `ghostcrab-memory`:

- add an explicit rule that once a likely family is visible, the response should say so briefly before asking questions
- require that at least half of the onboarding questions be family-specific
- require one likely compact-view recommendation when the family is clear
- require one explicit prompt-help offer in plain user language
- add a warning not to default to `ghostcrab_status` on fuzzy onboarding unless runtime health actually matters

For `ghostcrab-epistemic-agent`:

- tighten the `New Domain Behavior` section so it asks for intent hypothesis first, not just recipe reads
- add a sentence that route-first behavior must change the question set, not only the read sequence

For scenario assets:

- create a natural-first scenario set without tool names
- keep the guided and semi-autonomous scenarios, but do not let them be the only benchmark

### Likely OpenClaw Risk

Without these changes, OpenClaw will probably:

- need more scaffolding than Codex to stay in intake mode
- drift into tool-first behavior on fuzzy asks
- and sound more procedural than product-helpful during onboarding

## Suggested Order Before Comparative Pass 2

1. patch Claude `self-memory`
2. patch OpenClaw `ghostcrab-memory`
3. patch Claude `data-architect` only where it affects fuzzy onboarding
4. add natural-first scenarios for OpenClaw
5. then run the same natural scenario battery across hosts

## Short Conclusion

The good news is that neither Claude Code nor OpenClaw looks fundamentally off-track.

Most of the likely gains come from the same family of changes:

- stronger visible intent hypothesis
- stronger family-shaped questions
- explicit compact-view recommendation
- explicit prompt-help offer

So the pre-test adaptation work can stay narrow and product-driven instead of becoming a full rewrite of their rails.
