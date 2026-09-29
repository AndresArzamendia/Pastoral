-- ============================================================================
-- Cloudflare D1 · pastores stats (binding STATS_DB)
-- Tablas del contador de visitas usado por /api/track.
--
-- Aplicar (después de `wrangler login`):
--   wrangler d1 migrations apply pastoral-stats --remote
-- ============================================================================

-- Contador diario por sección: una fila por (día, sección).
-- La clave única (day, section) es lo que hace funcionar el
-- INSERT ... ON CONFLICT(day, section) DO UPDATE de /api/track.
CREATE TABLE IF NOT EXISTS daily_views (
  day           TEXT    NOT NULL,
  section       TEXT    NOT NULL DEFAULT '/',
  views         INTEGER NOT NULL DEFAULT 0,
  interactions  INTEGER NOT NULL DEFAULT 0,
  desktop       INTEGER NOT NULL DEFAULT 0,
  tablet        INTEGER NOT NULL DEFAULT 0,
  mobile        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, section)
);

-- Registro por día y dispositivo: quién entró, desde dónde y a qué sección.
-- Las visitas solo suman la primera vez del día (UNIQUE day+device_id).
CREATE TABLE IF NOT EXISTS daily_devices (
  day          TEXT    NOT NULL,
  device_id    TEXT    NOT NULL,
  section      TEXT    NOT NULL DEFAULT '/',
  browser      TEXT    NOT NULL DEFAULT '',
  os           TEXT    NOT NULL DEFAULT '',
  device_type  TEXT    NOT NULL DEFAULT '',
  country      TEXT    NOT NULL DEFAULT '',
  visits       INTEGER NOT NULL DEFAULT 1,
  last_seen    TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (day, device_id)
);

-- Las consultas filtran por rango de días: conviene un índice por `day`.
CREATE INDEX IF NOT EXISTS idx_daily_views_day ON daily_views (day);
CREATE INDEX IF NOT EXISTS idx_daily_devices_day ON daily_devices (day);
CREATE INDEX IF NOT EXISTS idx_daily_devices_country ON daily_devices (day, country);