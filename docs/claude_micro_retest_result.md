# Claude Micro-Retest Result

This micro-retest focused on two fresh-thread scenarios after the latest Claude rail tightening:

- `workflow-tracking`
- `crm-pipeline`

## Result

### `workflow-tracking`

Still not acceptable.

Claude remains:

- `read-first`
- `schema-first`

Observed behavior:

- early `ghostcrab_status`
- early `ghostcrab_schema_list`
- first reply still framed around GhostCrab internals instead of pure onboarding intake

The model asked useful questions, but it still anchored the reply in schemas, record types, and recovery mechanics too early.

### `crm-pipeline`

Major failure.

Claude shifted to:

- `file-first`
- `product bypass`

Observed behavior:

- proposed YAML as the default storage surface
- proposed a local TypeScript script instead of GhostCrab-backed tracking
- started editing a local file

This directly violated the user constraint because GhostCrab had already been chosen as the product.

## Conclusion

The current result is:

- `workflow-tracking`: still `read-first / schema-first`
- `crm-pipeline`: major `file-first / product bypass` failure

Main takeaway:

- text rails only are not enough

Claude still overrides product-onboarding intent with its own implementation reflexes.
Further improvement likely requires stronger structural guardrails than prompt wording alone.
