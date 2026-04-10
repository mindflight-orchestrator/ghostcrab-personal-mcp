# Seeded Product Graph Conventions

This repository seeds a real but intentionally incomplete GhostCrab product graph during bootstrap. The source of truth lives in [src/bootstrap/seed.ts](/Users/francois/Documents/mars2026/ghostcrab/src/bootstrap/seed.ts).

## Goals

- make `ghostcrab_coverage(domain="ghostcrab-product")` meaningful on a fresh database
- make `ghostcrab_traverse(...)` return useful product paths without extra manual projection
- keep the bootstrap stable and idempotent while the broader GhostCrab model is still evolving

## Source Of Truth

The bootstrap module owns four canonical collections:

- `SYSTEM_ENTRIES`
- `SCHEMA_ENTRIES`
- `ONTOLOGY_ENTRIES`
- `PRODUCT_RECORD_ENTRIES`

The seeded graph extends that same contract with:

- `PRODUCT_GRAPH_NODES`
- `PRODUCT_GRAPH_EDGES`

Bootstrap writes them in one transaction and in a fixed order:

1. `mfo:system`
2. `mfo:schema`
3. `mfo:ontology`
4. product facet records
5. `mfo_nodes`
6. `mfo_edges`

## Node Conventions

- All product graph nodes use stable, human-readable ids such as `component:ghostcrab:mcp-server`.
- Nodes that represent product entities carry `properties.domain = "ghostcrab-product"`.
- Ontology concepts reused in the graph keep exactly the same ids as their `mfo:ontology` `node_id` values.
- Seeded ontology concepts in `mfo_nodes` use `node_type = "concept"`.
- `mastery = 1` means covered and operational.
- `mastery = 0` means known gap candidate and should surface in traversal results.

## Intentional Incompleteness

The graph is deliberately not complete yet.

- The ontology for `ghostcrab-product` contains 6 concepts.
- The seeded graph covers 5 of them for domain coverage.
- `concept:ghostcrab:native-compatibility` is present as a graph node for traversal, but is intentionally not tagged with `properties.domain = "ghostcrab-product"`.

This creates a stable product behavior:

- `coverage_score = 0.833`
- `covered_nodes = 5`
- `total_nodes = 6`
- `recommended_action = "proceed_with_disclosure"`

The point is to model an honest partial graph rather than a falsely complete one.

## Edge Conventions

Edge labels must read as short true sentences:

- `phase -> BELONGS_TO -> product`
- `task -> ENABLES -> component`
- `constraint -> BLOCKS -> component`
- `task -> HAS_GAP -> concept`

The bootstrap keeps edge idempotence at the logical level with the tuple `(source, target, label)`.

## Validation Contract

Two public MCP scenarios are expected to stay green on a fresh bootstrap:

- `npm run smoke:mcp`
  verifies the broad public surface, schema/record reads, and the seeded graph basics
- `npm run smoke:mcp:incomplete-graph`
  verifies the intentionally partial graph behavior and the explicit native compatibility gap
- `npm run smoke:mcp:memory-workflow`
  verifies that the seeded `agent:self` state, projections, and product facts produce useful `pack` and `status` behavior

The end-to-end entrypoint is:

```bash
npm run verify:e2e
```

It runs the static checks, starts Docker fallback PostgreSQL, applies migrations, executes both MCP smoke scenarios, and tears everything down.
