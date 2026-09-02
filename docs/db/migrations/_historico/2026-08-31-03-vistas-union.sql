-- =============================================================================
-- Vistas de convivencia z_* + reg_*  (PM verificado; AM/cosecha/riego pendientes)
-- 2026-08-31
--
-- EN DUDA (2026-08-31): si la web usa un SELECTOR v3/v4 por período, estas
-- vistas NO hacen falta — cada pantalla lee una fuente u otra y nadie mezcla.
-- Se dejan porque están probadas y sirven si algún reporte necesita cruzar el
-- corte. Ver MOBIL/04-mapa-bd.md.
--
-- NO CORRER TODAVIA: depende de que la ventana de agosto ya esté migrada a
-- reg_pm y de que la fecha de corte esté fijada. Cambiar @CORTE si cambia.
--
-- Verificado el 2026-08-31 contra una copia real de `lfp_prodapp`
-- (MariaDB 10.11, 108.149 filas en z_tabla_pm, 495 migradas a reg_pm):
--   * la vista devuelve las dos mitades sin error de colación
--   * `vw_reporte_pm` repuntada a la vista compat devuelve v3 y v4 juntas
--   * COUNT(*) del reporte: 1.418 ms sobre la tabla → 1.734 ms sobre la unión
--   * consulta filtrada por mes: 74-212 ms, sin degradación
--
-- Tres cosas que fallan si se hacen de la forma obvia:
--
-- 1. `z.columna COLLATE utf8mb4_spanish_ci` sobre una columna utf8mb3 da
--    ERROR 1253. Hay que CONVERT(... USING utf8mb4) primero.
--    (El UNION por sí solo NO da "Illegal mix of collations": MariaDB resuelve
--     la colación del resultado. El problema aparece al forzar el COLLATE y al
--     unir después esa columna con otra de distinta colación.)
-- 2. Sin el `WHERE z.fecha < @CORTE`, agosto se cuenta DOS veces: está en
--    z_tabla_pm y en reg_pm a la vez.
-- 3. Toda vista con UNION es de SOLO LECTURA (ERROR 1288 al hacer UPDATE).
--    Grocery CRUD puede LISTAR desde aquí; insertar, editar y borrar siguen
--    siendo contra la tabla base.
-- =============================================================================

-- Fecha de corte. Todo lo anterior vive en z_*; desde aquí, en reg_*.
SET @CORTE = '2026-08-01';

-- -----------------------------------------------------------------------------
-- vw_pm_compat — MISMOS nombres de columna que z_tabla_pm, más `fuente`.
-- Adaptar un reporte existente = cambiar `z_tabla_pm` por `vw_pm_compat`.
-- Una palabra. Nada más en la consulta cambia.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_pm_compat AS
SELECT z.id, z.numero_registro, z.fecha, z.pm_year, z.pm_week, z.finca, z.responsable,
       z.trabajador, z.cantidad, z.comentario, z.cultivo, z.hora_cierre, z.hora_inicio,
       z.lote, z.modulo, z.subtarea, z.fecha_registro,
       'v3' AS fuente
FROM z_tabla_pm z
WHERE z.fecha < '2026-08-01'          -- <<< la fecha de corte, literal (una vista no acepta variables)
UNION ALL
SELECT r.id + 1000000,                -- offset: los id viejos llegan a ~121.000
       CONCAT('V4-', r.id),
       DATE_FORMAT(r.fecha_proceso, '%Y-%m-%d'),
       r.pm_year, r.pm_week, r.finca_id, r.responsable_id, r.trabajador_id,
       r.cantidad, r.comentario, r.cultivo_id,
       DATE_FORMAT(r.hora_cierre, '%H:%i'),
       DATE_FORMAT(r.hora_inicio, '%H:%i'),
       r.lote_id,
       (SELECT GROUP_CONCAT(m.modulo_id ORDER BY m.modulo_id)
          FROM reg_pm_modulo m WHERE m.pm_id = r.id),   -- CSV, igual que el viejo
       r.subtarea_id, r.received_at_server,
       'v4'
FROM reg_pm r;

-- -----------------------------------------------------------------------------
-- Ejemplo verificado: vw_reporte_pm sobre las dos fuentes.
-- Es la definición original de vw_reporte_pm con UNA palabra cambiada
-- (z_tabla_pm -> vw_pm_compat) más la columna `fuente` al final.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_reporte_pm_u AS
SELECT DISTINCT
  zpe.nombre AS nombre_trabajador, ztp.finca AS id_finca, zfi.nombre AS nombre_finca,
  zpe.cedula AS cedula, zpe2.descripcion_estado AS descripcion_estado,
  zpe1.nombre AS nombre_supervisor, zta.nombre AS grupo_labor,
  zsu.codigo_subtarea AS codigo_labor, zsu.nombre_subtarea AS nombre_labor,
  ztp.lote AS lote, ztp.modulo AS modulo, ztp.cantidad AS cantidad,
  zul.ulabor_nombre AS unidad_labor, zsu.tarifa AS tarifa,
  FORMAT(ztp.cantidad * zsu.tarifa, 3) AS total,
  zcu.nombre AS cultivo, ztp.comentario AS comentario, ztp.fecha AS fecha,
  ztp.fuente AS fuente
FROM vw_pm_compat ztp
  JOIN z_personal        zpe  ON ztp.trabajador = zpe.id
  JOIN z_personal        zpe1 ON ztp.responsable = zpe1.id
  JOIN z_subtarea        zsu  ON ztp.subtarea = zsu.id
  JOIN z_personal_estado zpe2 ON zpe.estado = zpe2.id
  JOIN z_cultivo         zcu  ON ztp.cultivo = zcu.id
  JOIN z_ulabor          zul  ON zsu.unidad_labor_id = zul.id
  LEFT JOIN z_tarea      zta  ON zta.id = zsu.tarea_id
  JOIN z_finca           zfi  ON zfi.id = ztp.finca
ORDER BY ztp.fecha_registro, zpe.nombre;

-- -----------------------------------------------------------------------------
-- Las otras 19 vistas que dependen de las tablas transaccionales z_*
-- (medido sobre el esquema real, 2026-08-31). Cada una necesita el mismo
-- tratamiento cuando su tabla entre en la ventana migrada:
--
--   PM  (8): vw_reporte_pm, vw_reporte_pago, vw_reporte_pago2, vwpmdetail,
--            vw_pm_payment_adjustment_list, vw_opr_pm_payments_daily_adjustments,
--            vwpm_paymentadjustment_fullreport, vw_temporaryworkers_pivot
--   AM  (2): vw_reporte_am, vw_reporte_am_base
--   COS (2): vw_cosecha_cacao_resumen, vw_harvest_pending_lots
--   PC  (7): vw_postharvest_rpt_001, vw_postharvest_maxlot,
--            vw_postharvest_dryingquality_sundriying,
--            vw_postharvest_dryingquality_machinedriying,
--            vw_postharvest_photos_fermentation,
--            vw_postharvest_photos_sundrying,
--            vw_postharvest_photos_machinedrying
--
-- Además: tbl_pm_payment_daily_adjustment.pm_id tiene FK a z_tabla_pm(id).
-- Un ajuste de pago NO puede apuntar a una fila de reg_pm. Hoy la tabla está
-- VACÍA (0 filas), así que no bloquea el corte, pero si ese módulo se activa
-- hay que repuntar esa FK antes.
-- =============================================================================
