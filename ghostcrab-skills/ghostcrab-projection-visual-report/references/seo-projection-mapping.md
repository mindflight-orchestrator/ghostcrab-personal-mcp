# SEO Projection Mapping

Map a `projection_id` to a visual pattern. If a projection is unknown, use the generic timeline + evidence table pattern.

## `proj_content_authority_gap`

Meaning: pages with weak content authority, usually thin content plus missing schema or poor on-page signals.

Best visuals:

- KPI cards: affected pages, resolved pages, residual pages.
- Timeline: A0/A1/A2.
- Heatmap table by page:
  - page
  - health
  - word count
  - content density
  - schema coverage
  - title status
  - H1 status
  - risk
- Action cards:
  - enrich content
  - add H1
  - add expected schema
  - validate exit from projection

## `proj_hreflang_crawl_integrity`

Meaning: integrity of locale alternates, reciprocal links, and crawlable alternate URLs.

Best visuals:

- KPI cards: broken/missing alternates, residual alternates, fixed alternates.
- Timeline: A0 absent strategy, A1 partial matrix, A2 valid matrix.
- Locale matrix:
  - source locale
  - alternate locale
  - status
  - reciprocal
  - HTTP/crawl status
- Evidence table:
  - path
  - hreflang status
  - HTTP status
  - crawl status
  - health
- Action cards:
  - complete locale matrix
  - fix broken alternate URLs
  - add reciprocal declarations
  - verify x-default

## `proj_gsc_quick_wins`

Meaning: queries in positions 4-10 with meaningful impressions.

Best visuals:

- KPI cards: quick-win queries, impressions, clicks, average position.
- Bubble/table:
  - query
  - URL
  - impressions
  - clicks
  - CTR
  - position
  - device
- Opportunity ladder:
  - position 10 -> 7 -> 4 -> top3
- Action cards:
  - improve title/meta
  - strengthen content
  - check search intent
  - internal linking boost

## `proj_schema_traffic_opportunity`

Meaning: pages with traffic or business value missing expected structured data.

Best visuals:

- Coverage gauge by phase.
- Page-type matrix:
  - page
  - content type
  - expected schema
  - current schema
  - priority
- Action cards:
  - Organization
  - BreadcrumbList
  - Article/BlogPosting
  - FAQPage

## `proj_geo_blind_spots`

Meaning: SEO demand exists but AI/search crawlers or `llms.txt` readiness is missing.

Best visuals:

- Bot access matrix:
  - GPTBot
  - ClaudeBot
  - PerplexityBot
  - Googlebot
- GEO readiness timeline.
- Action cards:
  - unblock target bots
  - structure llms.txt
  - verify server-level access

## `proj_performance_conversion_leak`

Meaning: poor Core Web Vitals correlate with poor engagement.

Best visuals:

- Split KPI: CWV status vs engagement status.
- Page leak table:
  - page
  - LCP
  - INP
  - CLS
  - mobile bounce/engagement
  - priority

## `proj_keyword_cannibalism_confirmed`

Meaning: intended ranking page differs from actual Google ranking page.

Best visuals:

- Cannibalism pair table:
  - keyword
  - targeted page
  - actual ranking page
  - position
  - recommended canonical target
- Before/after resolution timeline.

