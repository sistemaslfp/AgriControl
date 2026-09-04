-- ---------------------------------------------------------------------------
-- Migración 2026-08-28-01 — Catálogos para API V4 (MOBIL/02-bd-y-api.md §1)
--
-- Tres cambios ADITIVOS e inocuos para la web V3. Nada más.
--   1. z_finca.estado          — '1' activo / '0' inactivo (DEFAULT '1':
--                                 comportamiento actual intacto)
--   2. z_ulabor.estado         — ídem
--   3. z_lote.tiene_modulos    — 1 si el lote tiene módulos activos
--
-- Idempotente: MariaDB 10.4 soporta ADD COLUMN IF NOT EXISTS, y el UPDATE
-- recalcula el valor completo (CASE), así que se puede correr N veces.
-- z_lote YA tiene columna estado en el esquema actual: no se toca.
--
-- Aplicar en desarrollo:
--   docker compose exec -T mysql_dev_container mysql -uroot -p lfp_prodapp \
--     < docs/db/migrations/2026-08-28-01-catalogos-v4.sql
-- ---------------------------------------------------------------------------

ALTER TABLE lfp_prodapp.z_finca
  ADD COLUMN IF NOT EXISTS estado VARCHAR(1) NOT NULL DEFAULT '1';

ALTER TABLE lfp_prodapp.z_ulabor
  ADD COLUMN IF NOT EXISTS estado VARCHAR(1) NOT NULL DEFAULT '1';

ALTER TABLE lfp_prodapp.z_lote
  ADD COLUMN IF NOT EXISTS tiene_modulos TINYINT(1) NOT NULL DEFAULT 0 AFTER finca_id;

-- Recalcula tiene_modulos para TODOS los lotes (1 y 0), no sólo los que
-- tienen módulos: así una re-ejecución tras desactivar módulos también
-- deja el valor correcto.
UPDATE lfp_prodapp.z_lote l
   SET l.tiene_modulos = CASE
         WHEN EXISTS (SELECT 1 FROM lfp_prodapp.z_modulo m
                       WHERE m.lote_id = l.id AND m.estado = '1')
         THEN 1 ELSE 0 END
   where l.id>0;