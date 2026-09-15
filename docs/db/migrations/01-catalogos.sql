-- ---------------------------------------------------------------------------
-- Migración 01 — Catálogos para la API V4 (MOBIL/02-bd-y-api.md §1)
--
-- Tres cambios ADITIVOS e inocuos para la web V3. Nada más.
--   1. z_finca.estado          — '1' activo / '0' inactivo (DEFAULT '1':
--                                 comportamiento actual intacto)
--   2. z_ulabor.estado         — ídem
--   3. z_lote.tiene_modulos    — 1 si el lote tiene módulos activos
--
-- Idempotente: MariaDB soporta ADD COLUMN IF NOT EXISTS, y el UPDATE recalcula
-- el valor completo (CASE), así que se puede correr N veces.
-- z_lote YA tiene columna estado en el esquema actual: no se toca.
--
-- OJO con `estado` en z_personal: NO es una bandera de baja, es el tipo de
-- contratación (FK a z_personal_estado: 1 Afiliado, 2 No afiliado, 3 Eventual,
-- 4 Contratista, 6 Período de prueba). La vigencia de una persona la dice
-- `eregistro` ('A' activo / 'I' inactivo). Esta migración no toca z_personal;
-- la advertencia está aquí porque es donde se viene a mirar qué significa
-- `estado`. Detalle en docs/context/99-riesgos.md.
--
-- Aplicar en desarrollo:
--   docker compose exec -T mysql_dev_container mysql -uroot -p lfp_prodapp \
--     < docs/db/migrations/01-catalogos.sql
-- ---------------------------------------------------------------------------

ALTER TABLE lfp_prodapp.z_finca
  ADD COLUMN IF NOT EXISTS estado VARCHAR(1) NOT NULL DEFAULT '1';

ALTER TABLE lfp_prodapp.z_ulabor
  ADD COLUMN IF NOT EXISTS estado VARCHAR(1) NOT NULL DEFAULT '1';

ALTER TABLE lfp_prodapp.z_lote
  ADD COLUMN IF NOT EXISTS tiene_modulos TINYINT(1) NOT NULL DEFAULT 0 AFTER finca_id;

-- Recalcula tiene_modulos para TODOS los lotes (1 y 0), no sólo los que tienen
-- módulos: así una re-ejecución tras desactivar módulos también deja el valor
-- correcto.
--
-- El `WHERE l.id > 0` no filtra nada: está para que la sentencia pase con
-- SQL_SAFE_UPDATES = 1, que es como MySQL Workbench abre cada sesión. Sin un
-- WHERE sobre una columna clave, Workbench devuelve ERROR 1175 y la migración
-- no corre. Por consola de MariaDB el modo viene apagado (@@sql_safe_updates
-- = 0) y el WHERE sobra, pero no molesta.
UPDATE lfp_prodapp.z_lote l
   SET l.tiene_modulos = CASE
         WHEN EXISTS (SELECT 1 FROM lfp_prodapp.z_modulo m
                       WHERE m.lote_id = l.id AND m.estado = '1')
         THEN 1 ELSE 0 END
 WHERE l.id > 0;
