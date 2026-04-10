# MCP inputSchema drift audit

## What goes wrong

Agents may send JSON that looks reasonable but fails `Zod.parse` in the tool handler because the **MCP `inputSchema`** (what the model sees) does not match the **real Zod contract**. Example: putting facet selectors on `match` instead of `match.facets` for `ghostcrab_upsert`.

## Manual checklist (per tool)

For each tool under `src/tools/`:

1. **Nested objects** — List every nested object in the Zod schema (not only top-level fields).
2. **MCP `properties`** — For each nested object, ensure `inputSchema` has explicit `properties` (or a clear `oneOf` / documented pattern). A bare `type: "object"` with only a short description is **high risk**.
3. **Zod refinements** — `.refine()` / `.superRefine()` rules (e.g. “at least one of node or edge”) usually **do not** appear in JSON Schema; document them in `description` or examples on the tool.
4. **Naming** — Handlers use `snake_case` (`schema_id`, `node_type`). Prefer `additionalProperties: false` on tight objects when Zod rejects unknown keys, so models do not invent parallel camelCase trees.

## Automation

- **Regression tests**: `tests/tools/mcp-schema-contract.test.ts` asserts nested shapes and golden `safeParse` outcomes for **all 13** public `ghostcrab_*` tools (filters/facets objects, required fields, enums, and known foot-guns such as `match.facets` vs root keys on `ghostcrab_upsert`).
- **Future**: If the stack moves to a Zod version with reliable JSON Schema export, you can diff generated schema vs `definition.inputSchema` in the same test file.

## Runtime follow-up

Log or classify `tool_execution_error` messages that mention Zod paths (`facets`, `refine`, etc.), then add golden cases to the contract test when a new confusion appears.

## Rule of thumb

**Any nested object enforced by Zod should have explicit `properties` (and `required` where applicable) in the MCP `inputSchema`,** not only a generic `object` type.
