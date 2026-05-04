# Project Schema Design

Use this checklist when introducing domain-specific memory to a project.

## Project Questions

1. What should persist beyond a single terminal session?
2. What needs faceted retrieval?
3. What needs graph traversal?
4. What needs compressed operational context?
5. What should be seeded for onboarding or demos?
6. Which existing GhostCrab activity family or modeling recipe is closest?
7. What can stay provisional until retrieval use is proven?

## Deliverables

- one schema file per domain
- one migration file per intentional change
- one type file per schema family
- optional seed profile additions only when they improve onboarding or demos
- optional provisional projection or KPI plan when the domain implies heartbeat, board, release, or dashboard views

## Anti-Patterns

- schema sprawl without retrieval use cases
- graph edges that never change a decision
- giant demo datasets that obscure the product
- client-specific data models mixed into shared domain models
- freezing public schema names before the provisional model has been exercised
- designing facets without a concrete `search`, `count`, or `pack` job to justify them
