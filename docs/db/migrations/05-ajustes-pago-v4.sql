-- ---------------------------------------------------------------------------
-- Migracion 05 — Ajustes de pago sobre V4
--
-- Kevin, 2026-09-16: la web deja de leer z_tabla_pm y los ajustes de pago pasan
-- a V4. Se reusan las tres tablas tbl_pm_payment_* (hoy vacias) en lugar de
-- crear otras: lo unico que cambia es a que apunta un ajuste diario. Antes
-- pm_id era z_tabla_pm.id; desde aqui es lfp_am.id, una persona en una tarea
-- cerrada, que es exactamente lo que era una fila de z_tabla_pm.
--
-- Correr despues de 04. Idempotente: solo SET + PREPARE, que entienden MariaDB
-- y MySQL Workbench por igual (sin DELIMITER ni BEGIN ... END).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- GUARDIAN: un ajuste cargado contra z_tabla_pm no se puede reinterpretar.
-- Su pm_id es un id de z_tabla_pm y su semana es la de v3 ('Y'.'W', no ISO).
-- Si hay filas y la FK todavia apunta a z_tabla_pm, el archivo muere aqui con
-- ERROR 1146 y el nombre de la tabla inexistente es el mensaje. Hay que
-- traducir esos ajustes a mano antes de seguir; no se arregla borrando esto.
-- ---------------------------------------------------------------------------
SET @guardia_ajustes := (
  SELECT IF(
    (SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND TABLE_NAME = 'tbl_pm_payment_daily_adjustment'
        AND REFERENCED_TABLE_NAME = 'z_tabla_pm') > 0
    AND (SELECT COUNT(*) FROM tbl_pm_payment_daily_adjustment)
      + (SELECT COUNT(*) FROM tbl_pm_payment_weekly_deductions)
      + (SELECT COUNT(*) FROM tbl_pm_payment_paymenthistory) > 0,
    'SELECT * FROM ABORTADO_hay_ajustes_de_pago_contra_z_tabla_pm_ver_05',
    'SELECT 1')
);
PREPARE guardia_ajustes FROM @guardia_ajustes;
DEALLOCATE PREPARE guardia_ajustes;

-- ---------------------------------------------------------------------------
-- 1. El ajuste diario deja de apuntar a z_tabla_pm y apunta a lfp_am.
-- ---------------------------------------------------------------------------
SET @paso := (
  SELECT IF(COUNT(*) > 0,
    'ALTER TABLE tbl_pm_payment_daily_adjustment DROP FOREIGN KEY tbl_pm_payment_daily_adjustment_ibfk_1',
    'SELECT 1')
    FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'tbl_pm_payment_daily_adjustment'
     AND CONSTRAINT_NAME = 'tbl_pm_payment_daily_adjustment_ibfk_1'
);
PREPARE paso FROM @paso; EXECUTE paso; DEALLOCATE PREPARE paso;

-- UNIQUE porque Payment_model::saveBonusDiscount() hace REPLACE por pm_id: sin
-- un indice unico, REPLACE inserta una fila nueva cada vez y el mismo trabajo
-- termina con dos ajustes que se suman.
SET @paso := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE tbl_pm_payment_daily_adjustment ADD UNIQUE KEY uq_ajuste_pm_id (pm_id)',
    'SELECT 1')
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'tbl_pm_payment_daily_adjustment'
     AND INDEX_NAME = 'uq_ajuste_pm_id'
);
PREPARE paso FROM @paso; EXECUTE paso; DEALLOCATE PREPARE paso;

SET @paso := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE tbl_pm_payment_daily_adjustment ADD CONSTRAINT fk_ajuste_lfp_am FOREIGN KEY (pm_id) REFERENCES lfp_am (id)',
    'SELECT 1')
    FROM information_schema.REFERENTIAL_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE()
     AND TABLE_NAME = 'tbl_pm_payment_daily_adjustment'
     AND CONSTRAINT_NAME = 'fk_ajuste_lfp_am'
);
PREPARE paso FROM @paso; EXECUTE paso; DEALLOCATE PREPARE paso;

-- ---------------------------------------------------------------------------
-- 2. Una deduccion por persona, finca y semana.
--
-- Payment_model::updateDeductions() usa ON DUPLICATE KEY UPDATE, pero la tabla
-- solo tenia un indice NO unico sobre esas columnas: la "actualizacion" nunca
-- ocurria e insertaba otra fila, y la vista promedia deducciones duplicadas.
-- ---------------------------------------------------------------------------
SET @paso := (
  SELECT IF(COUNT(*) = 0,
    'ALTER TABLE tbl_pm_payment_weekly_deductions ADD UNIQUE KEY uq_deduccion_semana (operator_id, pm_year, pm_week, farm_id)',
    'SELECT 1')
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE()
     AND TABLE_NAME = 'tbl_pm_payment_weekly_deductions'
     AND INDEX_NAME = 'uq_deduccion_semana'
);
PREPARE paso FROM @paso; EXECUTE paso; DEALLOCATE PREPARE paso;

-- ---------------------------------------------------------------------------
-- 3. Detalle de pago con sus ajustes. Equivale a vwpm_paymentadjustment_fullreport
-- (Payment_model.php): mismas columnas, mismo orden, para que el modelo solo
-- cambie el nombre de la vista.
--
-- Diferencias con v3, las dos a proposito y las mismas que vw_lfp_reporte_pago:
--   * pm_year y pm_week son ISO (YEARWEEK/WEEK modo 3). v3 guardaba 'Y'.'W' y
--     del 29 al 31 de diciembre caia en (anio, semana 1). Las deducciones se
--     guardan con esta semana, asi que el cruce es consistente.
--   * supervisor es quien CERRO, con COALESCE a quien programo.
-- Solo filas cerradas: una programacion sin avance no se paga.
--
-- pm_fecha_proceso va al final y no existe en v3: es la columna con indice por
-- la que el modelo acota la semana antes de filtrar por WEEK().
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_lfp_ajuste_pago AS
SELECT am.id                                                     AS id,
       am.finca_id                                               AS farm_id,
       fin.nombre                                                AS farm_name,
       CAST(LEFT(YEARWEEK(am.fecha_proceso, 3), 4) AS UNSIGNED)  AS pm_year,
       WEEK(am.fecha_proceso, 3)                                 AS pm_week,
       DATE(am.fecha_proceso)                                    AS pm_date,
       res.id                                                    AS supervisor_id,
       res.nombre                                                AS supervisor_name,
       tra.id                                                    AS operator_id,
       tra.nombre                                                AS operator_name,
       tra.estado                                                AS operator_status,
       tra.cedula                                                AS operator_docid,
       am.subtarea_id                                            AS subtask_id,
       sub.codigo_subtarea                                       AS subtask_code,
       sub.nombre_subtarea                                       AS subtask_name,
       cg.cost_group_name                                        AS cost_group_name,
       lot.lote                                                  AS lot,
       (SELECT GROUP_CONCAT(zm.modulo SEPARATOR ', ')
          FROM z_modulo zm WHERE FIND_IN_SET(zm.id, am.modulos)) AS modules,
       am.cantidad                                               AS pm_quantity,
       sub.tarifa                                                AS pm_rate,
       am.cantidad * sub.tarifa                                  AS pm_total,
       COALESCE(adj.bonus_discount, 0)                           AS bonus_discount,
       adj.observations                                          AS observations,
       COALESCE(ded.deduction, 0)                                AS deduction,
       ded.observation                                           AS observation,
       am.fecha_proceso                                          AS pm_fecha_proceso
  FROM lfp_am am
  LEFT JOIN tbl_pm_payment_daily_adjustment adj ON adj.pm_id = am.id
  LEFT JOIN tbl_pm_payment_weekly_deductions ded
         ON ded.operator_id = am.personal_id
        AND ded.pm_year     = CAST(LEFT(YEARWEEK(am.fecha_proceso, 3), 4) AS UNSIGNED)
        AND ded.pm_week     = WEEK(am.fecha_proceso, 3)
        AND ded.farm_id     = am.finca_id
  JOIN z_personal         res ON res.id = COALESCE(am.responsable_cierre_id, am.responsable_id)
  JOIN z_personal         tra ON tra.id = am.personal_id
  JOIN z_subtarea         sub ON sub.id = am.subtarea_id
  JOIN tbl_pm_cost_groups cg  ON cg.id  = sub.cost_group_id
  JOIN z_finca            fin ON fin.id = am.finca_id
  JOIN z_lote             lot ON lot.id = am.lote_id
 WHERE am.cierre_guid IS NOT NULL;
