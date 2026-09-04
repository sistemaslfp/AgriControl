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
