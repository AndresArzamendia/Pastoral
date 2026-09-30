-- ============================================================================
-- Cloudflare D1 · pastores stats (binding STATS_DB)
-- Lecturas del Centro de Avisos (/api/notifications).
--
-- Una fila por (visitante, aviso): qué aviso leyó cada persona y en qué momento.
-- Gracias a esto el estado "leído" viaja con la persona a cualquier dispositivo:
-- no depende del localStorage del navegador.
--
-- Aplicar (después de `wrangler login`):
--   wrangler d1 migrations apply pastoral-stats --remote
-- ============================================================================

-- `visitor_key` lo manda el navegador: "u:<id de Supabase>" si la persona tiene
-- sesión abierta (mismo estado en todos sus dispositivos) o "d:<uuid del equipo>"
-- si todavía no se identificó en ningún dispositivo.
CREATE TABLE IF NOT EXISTS notification_reads (
  visitor_key     TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  read_at         TEXT NOT NULL,
  PRIMARY KEY (visitor_key, notification_id)
);

-- El centro de avisos siempre lee los avisos de una sola persona, ordenados por
-- fecha de lectura: índice por (visitor_key, read_at).
CREATE INDEX IF NOT EXISTS idx_notification_reads_visitor
  ON notification_reads (visitor_key, read_at DESC);