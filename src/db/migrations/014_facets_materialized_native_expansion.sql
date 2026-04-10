ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_tier text
  GENERATED ALWAYS AS (facets->>'tier') STORED;

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_app_segment text
  GENERATED ALWAYS AS (facets->>'app_segment') STORED;

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_churn_risk text
  GENERATED ALWAYS AS (facets->>'churn_risk') STORED;

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_nationality text
  GENERATED ALWAYS AS (facets->>'nationality') STORED;

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_game_type text
  GENERATED ALWAYS AS (facets->>'game_type') STORED;

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_is_vip boolean
  GENERATED ALWAYS AS (
    CASE
      WHEN jsonb_typeof(facets->'is_vip') = 'boolean' THEN (facets->>'is_vip')::boolean
      ELSE NULL
    END
  ) STORED;

ALTER TABLE mfo_facets ADD COLUMN IF NOT EXISTS facet_marketing_consent boolean
  GENERATED ALWAYS AS (
    CASE
      WHEN jsonb_typeof(facets->'marketing_consent') = 'boolean' THEN (facets->>'marketing_consent')::boolean
      ELSE NULL
    END
  ) STORED;
