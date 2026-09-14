-- ---------------------------------------------------------------------------
-- Migración 04 — Vistas de V4
--
-- Vistas NUEVAS y con nombres nuevos. Las 20 vistas viejas (8 de PM, 2 de AM,
-- 2 de cosecha, 7 de postcosecha) NO se tocan: siguen leyendo las tablas z_* y
-- siguen sirviendo a los endpoints V3 y a la web histórica hasta julio de 2026.
-- V4 cubre desde agosto.
--
-- NO HAY VISTAS UNION, y la decisión está cerrada: la web resuelve v3/v4 con un
-- selector por período (hasta 2026-07-31 sólo v3; agosto los dos, duplicado a
-- propósito como colchón de comparación; desde 2026-09-01 sólo v4). Con el
-- selector cada pantalla lee una fuente y nadie mezcla. Además una UNION sobre
-- agosto contaría el mismo dato dos veces si alguien olvida el corte, y toda
-- vista con UNION es de sólo lectura (ERROR 1288 al hacer UPDATE), así que
-- tampoco sirve para los formularios de la web. El intento anterior está en
-- _historico/ con su medición.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Reporte de pago de V4. Equivalente de vw_reporte_pago, que sigue existiendo
-- y sigue leyendo z_tabla_pm.
--
-- El año y la semana se DERIVAN con YEARWEEK/WEEK(...,3), que es el ISO, en vez
-- de guardarse. V3 los guardaba calculados con 'Y'.'W' y por eso 181 filas del
-- 29 al 31 de diciembre de 2025 quedaron como (2025, semana 1) — el bug sigue
-- vivo en V3 y vuelve a morder en diciembre de 2029. Un valor derivado no puede
-- quedar mal guardado.
--
-- Sin DISTINCT a propósito: vw_reporte_pago lo necesita porque la app vieja
-- generaba filas repetidas; acá el guid es único y un DISTINCT taparía un
-- duplicado real si algún día aparece.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_reg_reporte_pago AS
SELECT am.fecha_proceso                                          AS fecha,
       CAST(LEFT(YEARWEEK(am.fecha_proceso, 3), 4) AS UNSIGNED)  AS anio,
       WEEK(am.fecha_proceso, 3)                                 AS semana,
       f.nombre                                                  AS finca,
       tra.nombre                                                AS nombre,
       tra.cedula                                                AS cedula,
       res.nombre                                                AS nombre1,
       sub.nombre_subtarea                                       AS nombre_subtarea,
       lot.lote                                                  AS lote,
       (SELECT GROUP_CONCAT(zm.modulo ORDER BY zm.modulo)
          FROM z_modulo zm WHERE FIND_IN_SET(zm.id, am.modulos)) AS modulo,
       am.cantidad                                               AS cantidad,
       sub.tarifa                                                AS tarifa,
       am.cantidad * sub.tarifa                                  AS total
  FROM reg_am am
  JOIN z_personal tra ON tra.id = am.personal_id
  -- Quien cerró manda sobre quien programó: si el avance lo cargó otro
  -- responsable, el pago lo firma él. COALESCE porque las filas abiertas no
  -- tienen responsable de cierre (y quedan fuera igual por el WHERE).
  JOIN z_personal res ON res.id = COALESCE(am.responsable_cierre_id, am.responsable_id)
  JOIN z_subtarea sub ON sub.id = am.subtarea_id
  JOIN z_finca    f   ON f.id   = am.finca_id
  JOIN z_lote     lot ON lot.id = am.lote_id
 -- Sólo lo cerrado: una programación sin avance no se paga.
 WHERE am.cierre_guid IS NOT NULL;

-- ---------------------------------------------------------------------------
-- La bitacora de reg_flag, legible. LEFT JOIN a reg_am porque un rechazo no
-- tiene fila: la fila nunca llego a existir y el rastro es el payload.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS vw_reg_flag_resumen;
DROP VIEW IF EXISTS vw_reg_flag_detalle;

CREATE OR REPLACE VIEW vw_reg_flag AS
SELECT f.id,
       f.created_at                                              AS marcado_at,
       f.origen,
       f.codigo,
       f.detalle,
       f.guid,
       f.device_alias                                            AS dispositivo,
       f.registro_id                                             AS reg_am_id,
       am.fecha_proceso,
       fin.nombre                                                AS finca,
       lot.lote                                                  AS lote,
       (SELECT GROUP_CONCAT(zm.modulo ORDER BY zm.modulo)
          FROM z_modulo zm WHERE FIND_IN_SET(zm.id, am.modulos)) AS modulo,
       tar.nombre                                                AS tarea,
       sub.nombre_subtarea                                       AS subtarea,
       tra.nombre                                                AS trabajador,
       COALESCE(rc.nombre, res.nombre)                           AS responsable,
       am.cantidad,
       f.payload
  FROM reg_flag f
  LEFT JOIN reg_am     am  ON am.id  = f.registro_id
  LEFT JOIN z_finca    fin ON fin.id = am.finca_id
  LEFT JOIN z_lote     lot ON lot.id = am.lote_id
  LEFT JOIN z_subtarea sub ON sub.id = am.subtarea_id
  LEFT JOIN z_tarea    tar ON tar.id = sub.tarea_id
  LEFT JOIN z_personal tra ON tra.id = am.personal_id
  LEFT JOIN z_personal res ON res.id = am.responsable_id
  LEFT JOIN z_personal rc  ON rc.id  = am.responsable_cierre_id;

-- ---------------------------------------------------------------------------
-- Cosecha, plana. Equivalente V4 de lo que en v3 se leia de z_cosecha_cacao,
-- que traia finca/lote/subtarea/trabajador repetidos en la propia fila.
--
-- Aca NO se repiten: `reg_cosecha` solo guarda los sacos y cuelga del AM
-- (decision cerrada, 02-bd-y-api.md). Esta vista es la que paga ese join una
-- sola vez para que ningun reporte web lo vuelva a escribir a mano — que es
-- exactamente lo que 00-plan.md dejo anotado.
--
-- Grano: UNA FILA POR CIERRE DE COSECHA = una persona en una tarea AM.
-- `uq_cosecha_am` garantiza que no hay dos por AM. El resumen del CRUD viejo
-- (vw_cosecha_cacao_resumen, agrupado por fecha/supervisor/lote/subtarea) sale
-- de un GROUP BY sobre esta vista; no se replica aca para no fijar un
-- agrupamiento que cada reporte quiere distinto.
--
-- Se exponen los ids ADEMAS de los nombres, a diferencia de
-- vw_reg_reporte_pago: Grocery CRUD filtra por id (`$crud->where('finca', ...)`
-- en Cosechacacao.php) y con solo el nombre habria que filtrar por texto.
--
-- `id` es reg_cosecha.id y es unico: sirve de PK para Grocery CRUD
-- (`$crud->set_primary_key('id')`).
--
-- El pago se calcula con `am.cantidad`, NO con total_peso. Hoy son el mismo
-- numero —sync_cosecha escribe cantidad = total_peso— pero el que manda es el
-- AM: si un ajuste corrige la cantidad, el pago tiene que seguir al ajuste.
-- Por eso tambien va `unidad_labor`: una subtarea de cosecha que no se pague
-- por peso haria que total_peso y cantidad dejaran de coincidir.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_reg_cosecha AS
SELECT c.id                                                      AS id,
       c.guid                                                    AS guid,
       am.id                                                     AS reg_am_id,
       am.guid                                                   AS am_guid,
       am.fecha_proceso                                          AS fecha,
       CAST(LEFT(YEARWEEK(am.fecha_proceso, 3), 4) AS UNSIGNED)  AS anio,
       WEEK(am.fecha_proceso, 3)                                 AS semana,
       am.finca_id                                               AS finca_id,
       f.nombre                                                  AS finca,
       am.cultivo_id                                             AS cultivo_id,
       cul.nombre                                                AS cultivo,
       am.lote_id                                                AS lote_id,
       lot.lote                                                  AS lote,
       (SELECT GROUP_CONCAT(zm.modulo ORDER BY zm.modulo)
          FROM z_modulo zm WHERE FIND_IN_SET(zm.id, am.modulos)) AS modulo,
       sub.tarea_id                                              AS tarea_id,
       tar.nombre                                                AS tarea,
       am.subtarea_id                                            AS subtarea_id,
       sub.nombre_subtarea                                       AS nombre_subtarea,
       sub.unidad_labor_id                                       AS unidad_labor_id,
       u.ulabor_nombre                                           AS unidad_labor,
       am.personal_id                                            AS trabajador_id,
       tra.nombre                                                AS nombre,
       tra.cedula                                                AS cedula,
       -- Quien cerro manda sobre quien programo, igual que en la nomina.
       COALESCE(am.responsable_cierre_id, am.responsable_id)     AS responsable_id,
       res.nombre                                                AS nombre1,
       c.total_sacos                                             AS total_sacos,
       c.total_peso                                              AS total_peso,
       -- NULLIF: una cosecha sin sacos no deberia existir (sync_cosecha la
       -- rechaza), pero una division por cero en una vista rompe el reporte
       -- entero en vez de una fila.
       ROUND(c.total_peso / NULLIF(c.total_sacos, 0), 2)         AS peso_promedio_saco,
       am.cantidad                                               AS cantidad,
       sub.tarifa                                                AS tarifa,
       am.cantidad * sub.tarifa                                  AS total,
       am.hora_cierre                                            AS hora_cierre,
       c.observaciones                                           AS observaciones,
       c.origen                                                  AS origen,
       c.device_alias                                            AS dispositivo,
       c.created_at_device                                       AS creado_en_dispositivo,
       c.received_at_server                                      AS recibido_en_servidor
  FROM reg_cosecha c
  JOIN reg_am      am  ON am.id  = c.reg_am_id
  JOIN z_personal  tra ON tra.id = am.personal_id
  JOIN z_personal  res ON res.id = COALESCE(am.responsable_cierre_id, am.responsable_id)
  JOIN z_subtarea  sub ON sub.id = am.subtarea_id
  JOIN z_finca     f   ON f.id   = am.finca_id
  JOIN z_lote      lot ON lot.id = am.lote_id
  -- LEFT en los tres que la nomina no necesita: tarea y unidad son de catalogo
  -- (z_subtarea no tiene FK a ninguno de los dos) y cultivo_id puede apuntar a
  -- un catalogo depurado. Un JOIN duro aca esconderia filas de cosecha reales.
  LEFT JOIN z_tarea   tar ON tar.id = sub.tarea_id
  LEFT JOIN z_ulabor  u   ON u.id   = sub.unidad_labor_id
  LEFT JOIN z_cultivo cul ON cul.id = am.cultivo_id;

-- ---------------------------------------------------------------------------
-- El detalle saco por saco, para reemplazar las columnas saco1..saco15 de
-- z_cosecha_cacao. Una fila por saco; el techo de 15 ya no existe.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_reg_cosecha_saco AS
SELECT s.id            AS id,
       s.cosecha_id    AS cosecha_id,
       s.numero        AS numero,
       s.libras        AS libras,
       v.reg_am_id,
       v.fecha,
       v.finca,
       v.lote,
       v.nombre_subtarea,
       v.unidad_labor,
       v.nombre,
       v.cedula
  FROM reg_cosecha_saco s
  JOIN vw_reg_cosecha   v ON v.id = s.cosecha_id;

-- =========================================================================
-- LAS CINCO VISTAS QUE LA WEB SÍ USA (2026-09-14)
--
-- "Repuntar las 19 vistas" del plan resultó ser otra cosa al medirlo. De las
-- 22 vistas v3 de esta base:
--
--   * 10 NO tocan nada que V4 reemplace (las 3 de fotos, las 2 de
--     dryingquality, maxlot, paymenthistory y las 2 util_*). No hay nada que
--     repuntar en ellas.
--   * 5 están MUERTAS: vwpmdetail, vw_reporte_pago, vw_reporte_pago2,
--     vw_pm_payment_adjustment_list y vw_opr_pm_payments_daily_adjustments.
--     Ningún controlador ni modelo las nombra; sólo aparecen en
--     application/logs/log-2024-11-*.php. (vw_reporte_pago sigue siendo el
--     criterio de aceptación de la nómina, pero la web no la lee.)
--   * 3 NO SE PUEDEN repuntar hoy: vwpm_paymentadjustment_fullreport y
--     vw_temporaryworkers_pivot dependen de las tablas tbl_pm_payment_*, que
--     V4 no modela -- ver el guardián al final de este archivo--, y
--     vw_postharvest_rpt_001 depende de las vistas de fotos, que quedaron
--     fuera de V4 a propósito.
--   * Quedan ESTAS 5, que son las que la web abre de verdad.
--
-- REGLA: mismo contrato de columnas que su equivalente v3 -- mismos nombres,
-- mismo orden, mismo tipo-- para que cambiar una pantalla sea cambiar el
-- nombre de la tabla en el controlador y nada más. Donde eso no se pudo
-- respetar, está dicho en el comentario de la vista.
-- =========================================================================

-- ---------------------------------------------------------------------------
-- AM detallado, base del pivote de labores. Equivale a vw_reporte_am_base
-- (AM.php, Reporteam_model.php).
--
-- `fecha` y `hora` salen partidas de `fecha_proceso`, que en V4 es un DATETIME
-- solo: en v3 eran dos columnas sueltas (`fecha` DATE y `hora` VARCHAR(8)).
-- `hora` se corta a 'HH:mm' porque así la escribía la app vieja.
--
-- `modulos` se deja como la CSV de ids CRUDA, igual que `z_tabla_am.modulos`.
-- No se resuelve a nombres a propósito: la pantalla espera esa cadena.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_reg_reporte_am_base AS
SELECT DATE(am.fecha_proceso)                 AS fecha,
       TIME_FORMAT(am.fecha_proceso, '%H:%i') AS hora,
       am.finca_id                            AS id_finca,
       UCASE(fin.nombre)                      AS finca,
       UCASE(res.nombre)                      AS supervisor,
       UCASE(cul.nombre)                      AS cultivo,
       lot.lote                               AS lote,
       am.modulos                             AS modulos,
       UCASE(tra.nombre)                      AS operario,
       UCASE(sub.nombre_subtarea)             AS subtarea
  FROM reg_am am
  JOIN z_personal tra ON tra.id = am.personal_id
  -- El de la MAÑANA, no el del cierre: esta vista es la programación.
  JOIN z_personal res ON res.id = am.responsable_id
  JOIN z_finca    fin ON fin.id = am.finca_id
  JOIN z_cultivo  cul ON cul.id = am.cultivo_id
  JOIN z_lote     lot ON lot.id = am.lote_id
  JOIN z_subtarea sub ON sub.id = am.subtarea_id;

-- ---------------------------------------------------------------------------
-- AM con año y semana. Equivale a vw_reporte_am (AM.php, Reporteam_model.php).
--
-- DIFERENCIA DELIBERADA CON v3, Y ES LA ÚNICA: el año y la semana salen en
-- ISO (`YEARWEEK(...,3)` / `WEEK(...,3)`), no con `year()`/`week()` a secas.
-- v3 usa el modo 0, que es lo que puso 181 filas del 29 al 31 de diciembre de
-- 2025 en (2025, semana 1). Es el mismo criterio que ya usa
-- vw_reg_reporte_pago, y el motivo por el que V4 DERIVA el año y la semana en
-- vez de guardarlos. En la ventana de agosto las dos formas coinciden; en
-- diciembre no, y ahí v3 es el que está mal.
--
-- Sin GROUP BY: v3 lo necesitaba porque z_tabla_am repetía la misma
-- combinación hasta 37 veces. En reg_am una fila ES una persona en una tarea,
-- así que agrupar acá escondería filas legítimas.
--
-- CUADRE CONTRA v3, MEDIDO SOBRE AGOSTO (y hay que saberlo antes de comparar
-- pantallas): v3 da 529 filas y V4 da 550. **No falta ni sobra nada**: las 529
-- son exactamente las `reg_am` con `origen = 'migracion'`, y las 21 de más son
-- las de `origen = 'mig-pm'` -- tareas DEDUCIDAS de un cierre de z_tabla_pm que
-- no tenía su fila en z_tabla_am. O sea: el reporte AM de V4 muestra 21 trabajos
-- que de verdad pasaron y que el reporte AM de v3 no podía mostrar porque del
-- lado del AM no existían.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_reg_reporte_am AS
SELECT CAST(LEFT(YEARWEEK(am.fecha_proceso, 3), 4) AS UNSIGNED) AS anno,
       WEEK(am.fecha_proceso, 3)                                AS semana,
       DATE(am.fecha_proceso)                                   AS fecha,
       TIME_FORMAT(am.fecha_proceso, '%H:%i')                   AS hora,
       UCASE(fin.nombre)                                        AS finca,
       UCASE(res.nombre)                                        AS supervisor,
       UCASE(cul.nombre)                                        AS cultivo,
       lot.lote                                                 AS lote,
       UCASE(tra.nombre)                                        AS operario,
       UCASE(sub.nombre_subtarea)                               AS subtarea
  FROM reg_am am
  JOIN z_personal tra ON tra.id = am.personal_id
  JOIN z_personal res ON res.id = am.responsable_id
  JOIN z_finca    fin ON fin.id = am.finca_id
  JOIN z_cultivo  cul ON cul.id = am.cultivo_id
  JOIN z_lote     lot ON lot.id = am.lote_id
  JOIN z_subtarea sub ON sub.id = am.subtarea_id;

-- ---------------------------------------------------------------------------
-- PM detallado. Equivale a vw_reporte_pm (PM.php, Pm_model.php).
--
-- Sólo filas CERRADAS (`cierre_guid IS NOT NULL`): en v3 una fila de
-- z_tabla_pm sólo existía si alguien había cerrado. Una programación sin
-- avance no es un PM.
--
-- `nombre_supervisor` es QUIEN CERRÓ, con COALESCE al de la mañana, igual que
-- vw_reg_reporte_pago: si el avance lo cargó otro responsable, el reporte lo
-- firma él.
--
-- DOS VERRUGAS DE v3 QUE SE CONSERVAN, porque la pantalla las espera:
--   1. `total` sale de FORMAT(...,3), o sea TEXTO con separador de miles. Con
--      valores de cuatro cifras eso mete una coma y deja de ser numérico. No
--      se corrige acá: cambiarlo rompería el render de Grocery CRUD. El
--      número de verdad está en vw_reg_reporte_pago.
--   2. `lote` y `modulo` van como ID y como CSV de ids, no como nombres, que
--      es lo que traían z_tabla_pm.lote y z_tabla_pm.modulo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_reg_reporte_pm AS
SELECT tra.nombre                            AS nombre_trabajador,
       am.finca_id                           AS id_finca,
       fin.nombre                            AS nombre_finca,
       tra.cedula                            AS cedula,
       est.descripcion_estado                AS descripcion_estado,
       COALESCE(rci.nombre, res.nombre)      AS nombre_supervisor,
       tar.nombre                            AS grupo_labor,
       sub.codigo_subtarea                   AS codigo_labor,
       sub.nombre_subtarea                   AS nombre_labor,
       am.lote_id                            AS lote,
       am.modulos                            AS modulo,
       am.cantidad                           AS cantidad,
       ula.ulabor_nombre                     AS unidad_labor,
       sub.tarifa                            AS tarifa,
       FORMAT(am.cantidad * sub.tarifa, 3)   AS total,
       cul.nombre                            AS cultivo,
       am.comentario_cierre                  AS comentario,
       DATE(am.fecha_proceso)                AS fecha
  FROM reg_am am
  JOIN z_personal        tra ON tra.id = am.personal_id
  JOIN z_personal        res ON res.id = am.responsable_id
  LEFT JOIN z_personal   rci ON rci.id = am.responsable_cierre_id
  JOIN z_subtarea        sub ON sub.id = am.subtarea_id
  JOIN z_personal_estado est ON est.id = tra.estado
  JOIN z_cultivo         cul ON cul.id = am.cultivo_id
  JOIN z_ulabor          ula ON ula.id = sub.unidad_labor_id
  LEFT JOIN z_tarea      tar ON tar.id = sub.tarea_id
  JOIN z_finca           fin ON fin.id = am.finca_id
 WHERE am.cierre_guid IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Resumen de cosecha. Equivale a vw_cosecha_cacao_resumen (Cosechacacao.php).
--
-- DOS DIFERENCIAS CON v3, las dos a propósito:
--
--   1. `fecha` es un DATE de verdad. En v3 es un VARCHAR(10) CON DOS FORMATOS
--      MEZCLADOS: casi todo viene 'YYYY-MM-DD' pero quedan 2 filas de las
--      12.559 en 'MM/DD/YYYY', así que cualquier filtro por rango de fechas
--      sobre esa columna miente en silencio. La migración registra el error
--      pero NO lo propaga (00-plan.md: "los errores de v3 se migran igual,
--      pero el flujo nuevo no los repite"). Una vista NUEVA no tiene por qué
--      nacer rota.
--   2. `jornales` es COUNT(*) y no SUM(jornales), porque `reg_cosecha` no
--      tiene esa columna: en V4 una fila ES una persona en una tarea, así que
--      contarlas es el equivalente exacto. Y es más correcto: sobre las 12.559
--      filas de z_cosecha_cacao, `jornales` vale 1 en 12.432 y 0 en 127 --esas
--      127 son personas que trabajaron y contaban como cero jornal--.
--
-- `id` con ROW_NUMBER() como en v3: Grocery CRUD exige una PK y esta vista
-- agrupa, así que no hay un id natural.
--
-- CUADRE CONTRA v3, MEDIDO SOBRE AGOSTO: v3 tiene 60 filas en z_cosecha_cacao
-- y V4 tiene 41 en reg_cosecha. La resta cierra exacta: 22 filas de v3 están
-- marcadas en `mig_descarte` (9 `duplicado_exacto`, 10 `cosecha_sin_cierre_am`
-- y 3 `cosecha_total_no_cuadra`), quedan 38 -- y las 3 que faltan para 41
-- cuelgan de AM con `origen = 'mig-pm'`, el mismo caso que las 21 del reporte
-- AM. Peso y sacos de V4: 17.701,00 lb y 201 sacos, que es el cuadre que manda.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_reg_cosecha_resumen AS
SELECT ROW_NUMBER() OVER (ORDER BY DATE(am.fecha_proceso))     AS id,
       DATE(am.fecha_proceso)                                  AS fecha,
       COALESCE(am.responsable_cierre_id, am.responsable_id)   AS supervisor,
       am.finca_id                                             AS finca,
       am.lote_id                                              AS lote,
       (SELECT GROUP_CONCAT(zm.modulo ORDER BY zm.modulo)
          FROM z_modulo zm WHERE FIND_IN_SET(zm.id, am.modulos)) AS modulos,
       sub.tarea_id                                            AS tarea,
       am.subtarea_id                                          AS subtarea,
       SUM(c.total_peso)                                       AS total_peso,
       SUM(c.total_sacos)                                      AS total_sacos,
       COUNT(*)                                                AS jornales
  FROM reg_cosecha c
  JOIN reg_am     am ON am.id = c.reg_am_id
  JOIN z_subtarea sub ON sub.id = am.subtarea_id
 GROUP BY DATE(am.fecha_proceso),
          COALESCE(am.responsable_cierre_id, am.responsable_id),
          am.finca_id, am.lote_id, am.modulos, sub.tarea_id, am.subtarea_id;

-- ---------------------------------------------------------------------------
-- Días de cosecha con su peso y, si ya se consumieron, la partida que se los
-- llevó. Equivale a vw_harvest_pending_lots (Postharvest_model.php).
--
-- El LEFT JOIN cambia de tabla: en v3 era z_postharvest_lotsharvest por
-- `lot_date`; en V4 es pc_proceso_cosecha, que apunta al REGISTRO de cosecha y
-- no a la fecha. Esa es justamente la mejora del modelo (02-tablas-v4.sql):
-- una cosecha que llega tarde para una fecha ya consumida se DISTINGUE en vez
-- de confundirse con las que sí entraron. Por eso acá `id` puede venir NULL
-- para un día que ya tiene partida, si esa cosecha puntual no entró en ella --
-- que es la respuesta correcta, no un hueco.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_reg_harvest_pending_lots AS
SELECT DATE(am.fecha_proceso)  AS lot_date,
       SUM(c.total_peso)       AS lot_weight,
       pcc.pc_proceso_id       AS id
  FROM reg_cosecha c
  JOIN reg_am                 am  ON am.id = c.reg_am_id
  LEFT JOIN pc_proceso_cosecha pcc ON pcc.cosecha_id = c.id
 GROUP BY DATE(am.fecha_proceso), pcc.pc_proceso_id
 ORDER BY lot_date;

-- =========================================================================
-- GUARDIÁN: los ajustes de pago siguen sin modelarse en V4
--
-- vwpm_paymentadjustment_fullreport y vw_temporaryworkers_pivot (las dos en
-- Payment_model.php) leen tbl_pm_payment_daily_adjustment,
-- tbl_pm_payment_weekly_deductions y tbl_pm_payment_paymenthistory. V4 no
-- modela nada de eso: vw_reg_reporte_pago calcula `cantidad * tarifa` y se
-- acaba -- sin ajustes, sin deducciones, sin historial.
--
-- SE DECIDIÓ NO MODELARLOS (Kevin, 2026-09-14) porque las tres tablas están
-- VACÍAS: 0 filas cada una, medido sobre la copia de producción del
-- 2026-08-28. Es maquinaria construida y nunca usada.
--
-- Este guardián es el cable trampa de esa decisión: el día que alguien empiece
-- a cargar ajustes, este archivo deja de correr y el mensaje dice por qué.
-- Mejor eso que descubrirlo cuando la nómina V4 los ignore en silencio.
--
-- Si salta: hay que modelar los ajustes en V4 ANTES del corte, o dejar la
-- nómina en v3. No se arregla borrando estas líneas.
--
-- Mismo truco que el guardián de 02-tablas-v4.sql: sólo SET + PREPARE, que
-- entienden MariaDB y MySQL Workbench por igual.
-- =========================================================================
SET @guardia_ajustes := (
  SELECT IF((SELECT COUNT(*) FROM tbl_pm_payment_daily_adjustment)
          + (SELECT COUNT(*) FROM tbl_pm_payment_weekly_deductions)
          + (SELECT COUNT(*) FROM tbl_pm_payment_paymenthistory) > 0,
         'SELECT * FROM ABORTADO_hay_ajustes_de_pago_y_V4_no_los_modela_ver_04_vistas',
         'SELECT 1')
);
PREPARE guardia_ajustes FROM @guardia_ajustes;
DEALLOCATE PREPARE guardia_ajustes;
