-- ---------------------------------------------------------------------------
-- SOLO PARA DESARROLLO. Nunca correr en produccion.
--
-- Deja la base virgen de V4: borra las tablas lfp_*/pc_* en cualquiera de sus
-- formas, para poder aplicar las migraciones consolidadas (../01..04) desde
-- cero. Hace falta en dos casos:
--
--   1. La base ya paso por las migraciones consolidadas y hay que rehacerla
--      desde el dump.
--   2. La base paso por la cadena vieja de migraciones (los seis archivos de
--      esta carpeta), cuando las tablas se llamaban reg_*.
--
-- NO hace falta partiendo del dump de `docs/db/init/01-schema.sql` regenerado
-- el 2026-09-15: ese trae 41 tablas, todas de V3, y ninguna lfp_*/pc_*/mig_*.
-- El guardian de ../02-tablas-v4.sql no salta con ese dump.
--
-- BORRA DATOS de V4. Los datos de V3 (z_*) no se tocan: no aparecen aca.
-- ---------------------------------------------------------------------------

SET FOREIGN_KEY_CHECKS = 0;

-- Las vistas de ../04 son CREATE OR REPLACE, asi que borrarlas no es
-- obligatorio; se van igual para que no queden apuntando a tablas muertas.
DROP VIEW IF EXISTS
  vw_lfp_reporte_pago, vw_lfp_flag, vw_lfp_cosecha, vw_lfp_cosecha_saco,
  vw_lfp_reporte_am_base, vw_lfp_reporte_am, vw_lfp_reporte_pm,
  vw_lfp_cosecha_resumen, vw_lfp_harvest_pending_lots,
  vw_reg_reporte_pago, vw_pm_compat, vw_reporte_pm_u;

DROP TABLE IF EXISTS
  -- nombres vigentes
  lfp_cosecha_saco, lfp_cosecha, lfp_riego, lfp_flag, lfp_am,
  -- nombres anteriores al renombre reg_* -> lfp_* del 2026-09-15
  reg_am_modulo, reg_pm_modulo, reg_am_personal, reg_pm, reg_am,
  reg_cosecha_saco, reg_cosecha, reg_riego, reg_flag,
  -- postcosecha y auditoria
  pc_foto, pc_calidad_secado, pc_calidad_fermentacion, pc_etapa,
  pc_proceso_cosecha, pc_proceso, pc_lot_code_seq,
  mig_descarte, mig_pm_am;

SET FOREIGN_KEY_CHECKS = 1;

-- Los tres ALTER de catalogos de ../01-catalogos.sql NO se deshacen: son
-- aditivos, inocuos para V3, y volverlos a aplicar no hace nada.
