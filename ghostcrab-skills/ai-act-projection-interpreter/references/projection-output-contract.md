# AI Act Projection Output Contract

MindCLI template rows should expose these stable fields:

```text
answer_item
legal_basis
source_article
source_ref
confidence
facet_path
```

Optional fields used by renderers:

```text
risk_level
stakeholder_role
applicable_roles
obligation_type
legal_effect
conditionality_type
operator_compliance_scope
deadline
article_number
article_title
penalty_tier
max_amount_eur
max_percent_turnover
sector
```

## Quality Rules

- A human-facing answer must not rely only on `facet_path`.
- Any row without `source_ref` or `legal_basis` is incomplete.
- `obligation_cascade` rows should be `legal_effect=obligation`.
- `exemption_surface` rows should be `legal_effect=exemption` or `legal_effect=derogation`.
- `penalty_path` rows must include either `max_amount_eur`, `max_percent_turnover`, or a clear market-measure label.
- `sector_risk_profile` rows must include `risk_level`.

## Display Defaults

- Show `answer_item` as the human-facing obligation/action.
- Show `legal_basis` as the citation line.
- Show `confidence` only when it is below `1.0` or when the user asks for audit detail.
- Hide JSON fields unless the user asks for trace/debug output.
