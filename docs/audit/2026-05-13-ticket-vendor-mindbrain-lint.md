# Vendor MindBrain lint ticket

Date: 2026-05-13

Status: upstream fix required in `../mindbrain`; do not patch in this repo.

## Trigger

During the post-refactor correction pass, `npm run lint` in `ghostcrab-personal-mcp` traversed `vendor/mindbrain` and reported browser-global lint errors in the vendored JavaScript example:

```text
vendor/mindbrain/examples/javascript/graph/app.js
  document is not defined
  window is not defined
  EventSource is not defined
```

## Boundary

Per repository policy for this pass, `vendor/mindbrain` must remain untouched here. Any source fix belongs in the upstream sibling repo and can be vendored back afterward.

## Recommended upstream fix

- In `../mindbrain`, either add the correct browser globals or a scoped ESLint override for `examples/javascript/graph/app.js`.
- After the upstream fix lands, update the submodule pointer in this repo through the normal vendor sync path.

## Local note

This lint failure is separate from the SQLite-only GhostCrab runtime corrections. It is a lint traversal/configuration issue in the vendored example surface, not evidence that GhostCrab should reintroduce PostgreSQL code.
