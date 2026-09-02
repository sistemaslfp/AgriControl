-- ---------------------------------------------------------------------------
-- SOLO PARA DESARROLLO. Nunca correr en producción.
--
-- Deja la base virgen de V4: borra las tablas reg_*/pc_* en cualquiera de sus
-- formas, para poder aplicar las migraciones consolidadas (../01..04) desde
-- cero. Hace falta en dos casos:
--
--   1. La base se levantó desde `docs/db/init/01-schema.sql`, que trae las 17
--      tablas v4 en su forma vieja, vacías (se crearon a mano en agosto de
--      2026, antes de la consolidación).
--   2. La base pasó por la cadena vieja de migraciones (los seis archivos de
--      esta carpeta) y hay que rehacerla.
--
-- BORRA DATOS de V4. Los datos de V3 (z_*) no se tocan: no aparecen acá.
-- ---------------------------------------------------------------------------

SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW  IF EXISTS vw_reg_reporte_pago, vw_pm_compat, vw_reporte_pm_u;

DROP TABLE IF EXISTS
  reg_am_modulo, reg_pm_modulo, reg_am_personal, reg_pm, reg_am,
  reg_cosecha_saco, reg_cosecha, reg_riego, reg_flag,
  pc_foto, pc_calidad_secado, pc_calidad_fermentacion, pc_etapa,
  pc_proceso_cosecha, pc_proceso, pc_lot_code_seq,
  mig_descarte;

SET FOREIGN_KEY_CHECKS = 1;

-- Los tres ALTER de catálogos de ../01-catalogos.sql NO se deshacen: son
-- aditivos, inocuos para V3, y volverlos a aplicar no hace nada.
