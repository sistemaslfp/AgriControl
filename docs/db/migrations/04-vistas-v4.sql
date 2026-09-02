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
