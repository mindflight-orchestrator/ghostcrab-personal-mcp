-- Casino Pilot workspace — Layer 1 DDL
-- Schema: casino (created by ghostcrab_workspace_create for workspace id "casino-pilot")
-- All tables use workspace schema prefix ws_casino_pilot in production.
-- For fixture purposes, we use the schema name "casino".

CREATE SCHEMA IF NOT EXISTS casino;

-- ──────────────────────────────────────────────────────────────────────────────
-- Reference tables (no FK dependencies) — insert first
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS casino.game_types (
  id          TEXT        PRIMARY KEY,
  name        TEXT        NOT NULL,
  category    TEXT        NOT NULL CHECK (category IN ('slots', 'table', 'live', 'poker', 'sports')),
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS casino.campaigns (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('welcome', 'reload', 'vip', 'retention', 'seasonal')),
  start_date  DATE        NOT NULL,
  end_date    DATE,
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'ended')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Actor table — insert before children
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS casino.players (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT        NOT NULL UNIQUE,
  display_name    TEXT        NOT NULL,
  tier            TEXT        NOT NULL DEFAULT 'bronze'
                              CHECK (tier IN ('bronze', 'silver', 'gold', 'vip', 'ultra_vip')),
  status          TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active', 'inactive', 'suspended', 'churned')),
  country_code    TEXT,
  language_code   TEXT        NOT NULL DEFAULT 'en',
  lifetime_value  NUMERIC(12,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Child tables with FK to players
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS casino.visits (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID        NOT NULL REFERENCES casino.players(id),
  channel     TEXT        NOT NULL CHECK (channel IN ('web', 'mobile_app', 'tablet', 'kiosk')),
  visit_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  duration_s  INTEGER,
  ip_country  TEXT
);

CREATE TABLE IF NOT EXISTS casino.hotel_stays (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID        NOT NULL REFERENCES casino.players(id),
  room_type       TEXT        NOT NULL CHECK (room_type IN ('standard', 'deluxe', 'suite', 'penthouse')),
  check_in_at     TIMESTAMPTZ NOT NULL,
  check_out_at    TIMESTAMPTZ,
  nights          INTEGER,
  status          TEXT        NOT NULL DEFAULT 'reserved'
                              CHECK (status IN ('reserved', 'checked_in', 'checked_out', 'cancelled')),
  total_amount    NUMERIC(10,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS casino.event_registrations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID        NOT NULL REFERENCES casino.players(id),
  event_name      TEXT        NOT NULL,
  event_type      TEXT        NOT NULL CHECK (event_type IN ('tournament', 'show', 'dinner', 'sports')),
  registered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT        NOT NULL DEFAULT 'confirmed'
                              CHECK (status IN ('confirmed', 'attended', 'no_show', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS casino.transactions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID        NOT NULL REFERENCES casino.players(id),
  type        TEXT        NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'bonus', 'refund')),
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency    TEXT        NOT NULL DEFAULT 'USD',
  status      TEXT        NOT NULL DEFAULT 'completed'
                          CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reference   TEXT
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Child tables with FK to visits
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS casino.game_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id      UUID        NOT NULL REFERENCES casino.visits(id),
  game_type_id  TEXT        NOT NULL REFERENCES casino.game_types(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  duration_s    INTEGER,
  bets_total    NUMERIC(10,2),
  wins_total    NUMERIC(10,2),
  result        TEXT        CHECK (result IN ('win', 'loss', 'push', 'abandoned'))
);

-- ──────────────────────────────────────────────────────────────────────────────
-- High-volume time-series
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS casino.app_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID        NOT NULL REFERENCES casino.players(id),
  event_type  TEXT        NOT NULL CHECK (event_type IN ('login', 'logout', 'bonus_claim', 'deposit_start', 'page_view', 'error')),
  event_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_id  TEXT,
  metadata    JSONB
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Indexes for FK columns (performance)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS casino_visits_player_id_idx        ON casino.visits (player_id);
CREATE INDEX IF NOT EXISTS casino_visits_visit_at_idx         ON casino.visits (visit_at);
CREATE INDEX IF NOT EXISTS casino_hotel_stays_player_id_idx   ON casino.hotel_stays (player_id);
CREATE INDEX IF NOT EXISTS casino_event_reg_player_id_idx     ON casino.event_registrations (player_id);
CREATE INDEX IF NOT EXISTS casino_transactions_player_id_idx  ON casino.transactions (player_id);
CREATE INDEX IF NOT EXISTS casino_transactions_occurred_idx   ON casino.transactions (occurred_at);
CREATE INDEX IF NOT EXISTS casino_game_sessions_visit_id_idx  ON casino.game_sessions (visit_id);
CREATE INDEX IF NOT EXISTS casino_app_events_player_id_idx    ON casino.app_events (player_id);
CREATE INDEX IF NOT EXISTS casino_app_events_event_at_idx     ON casino.app_events (event_at);
