-- ============================================================================
-- Migración 03 — ventana de arranque V4: desde 2026-08-01, ambas fincas.
--
-- Consolidada el 2026-09-02: carga reg_am DIRECTAMENTE en su forma final
-- (una fila = una persona, con el cierre adentro). Producción nunca tuvo
-- reg_am_personal ni reg_pm, así que no pasa por ellas.
-- Idempotente: se puede correr N veces. La segunda vez no inserta nada.
-- Auditoría de todo lo descartado en mig_descarte (fila completa en payload).
-- No modifica NI UNA fila de las tablas z_*.
-- ============================================================================

USE lfp_prodapp;
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE';

-- ---------------------------------------------------------------------------
-- 1. AM y PM — una sola tabla, una fila por PERSONA
-- ---------------------------------------------------------------------------
-- En V4 no hay tabla de PM: el avance de la tarde son diez columnas `cierre_*`
-- de la misma fila. Así que esta sección hace tres cosas, en este orden:
--
--   1.1  audita los duplicados que se van a descartar (AM y PM)
--   1.2  inserta una fila por cada (captura, persona) de z_tabla_am
--   1.3  cierra esas filas con el avance de z_tabla_pm que les corresponde
--   1.4  crea la fila completa de los avances que no tienen AM
--
-- LOS GUID SON DETERMINISTAS, derivados del id de origen. Eso hace la
-- migración re-ejecutable y, sobre todo, diffeable: dos corridas producen
-- exactamente la misma base, así que un cambio en este archivo se puede
-- comprobar comparando el antes y el después en vez de confiando en conteos.
--
--   guid          <- z_tabla_am:<id de la fila>     (o z_tabla_pm:<id>)
--   captura_guid  <- z_tabla_am:<id MENOR del grupo>
--   cierre_guid   <- z_tabla_pm:<id de la fila>
--
-- El captura_guid usa el id menor del grupo, así que las N personas de la
-- misma captura lo comparten. Un "grupo" es (fecha, hora, finca, responsable,
-- cultivo, lote, modulos, subtarea): exactamente lo que en la app es un
-- formulario.

-- 1.1a — Descartes de PM: misma fila natural, mismos valores, creada dentro de
-- 60 s de otra anterior. Nunca se colapsan filas que difieren en cantidad u
-- horas: eso serían tramos reales de trabajo, no reintentos de la app.
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_tabla_pm', a.id, 'duplicado_60s',
       (SELECT MIN(b.id) FROM z_tabla_pm b
         WHERE b.finca=a.finca AND b.fecha=a.fecha AND b.subtarea=a.subtarea AND b.trabajador=a.trabajador
           AND b.cantidad=a.cantidad AND b.hora_inicio=a.hora_inicio AND b.hora_cierre=a.hora_cierre
           AND b.id < a.id AND ABS(TIMESTAMPDIFF(SECOND,b.fecha_registro,a.fecha_registro)) <= 60),
       JSON_OBJECT('id',a.id,'fecha',a.fecha,'finca',a.finca,'responsable',a.responsable,
                   'trabajador',a.trabajador,'subtarea',a.subtarea,'cultivo',a.cultivo,'lote',a.lote,
                   'modulo',a.modulo,'cantidad',a.cantidad,'hora_inicio',a.hora_inicio,
                   'hora_cierre',a.hora_cierre,'comentario',a.comentario,
                   'fecha_registro',DATE_FORMAT(a.fecha_registro,'%Y-%m-%d %H:%i:%s')),
       NOW()
FROM z_tabla_pm a
WHERE a.fecha >= '2026-08-01'
  AND EXISTS (SELECT 1 FROM z_tabla_pm b
               WHERE b.finca=a.finca AND b.fecha=a.fecha AND b.subtarea=a.subtarea AND b.trabajador=a.trabajador
                 AND b.cantidad=a.cantidad AND b.hora_inicio=a.hora_inicio AND b.hora_cierre=a.hora_cierre
                 AND b.id < a.id AND ABS(TIMESTAMPDIFF(SECOND,b.fecha_registro,a.fecha_registro)) <= 60)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d
                   WHERE d.tabla_origen='z_tabla_pm' AND d.id_origen=a.id AND d.motivo='duplicado_60s');

-- 1.1b — Descartes de AM: la misma persona repetida dentro de la misma captura
-- es una programación duplicada. Antes la colapsaba solo el UNIQUE de la tabla
-- puente; ahora que la persona ES la fila hay que filtrarla explícitamente,
-- porque dos filas idénticas de z_tabla_am darían dos filas de reg_am.
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_tabla_am', a.id, 'duplicado_cabecera_persona',
       (SELECT MIN(b.id) FROM z_tabla_am b
         WHERE b.fecha=a.fecha AND b.hora=a.hora AND b.finca=a.finca AND b.responsable_id=a.responsable_id
           AND b.cultivo_id=a.cultivo_id AND b.lote_id=a.lote_id AND b.modulos<=>a.modulos
           AND b.subtarea_id=a.subtarea_id AND b.personal_id=a.personal_id),
       JSON_OBJECT('id',a.id,'fecha',a.fecha,'hora',a.hora,'finca',a.finca,'responsable_id',a.responsable_id,
                   'cultivo_id',a.cultivo_id,'lote_id',a.lote_id,'modulos',a.modulos,
                   'subtarea_id',a.subtarea_id,'personal_id',a.personal_id,'tiene_pm',a.tiene_pm), NOW()
FROM z_tabla_am a
WHERE a.fecha >= '2026-08-01'
  AND a.id > (SELECT MIN(b.id) FROM z_tabla_am b
               WHERE b.fecha=a.fecha AND b.hora=a.hora AND b.finca=a.finca AND b.responsable_id=a.responsable_id
                 AND b.cultivo_id=a.cultivo_id AND b.lote_id=a.lote_id AND b.modulos<=>a.modulos
                 AND b.subtarea_id=a.subtarea_id AND b.personal_id=a.personal_id)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_am'
                    AND d.id_origen=a.id AND d.motivo='duplicado_cabecera_persona');

-- 1.2 — Una fila por (captura, persona).
--
-- `hora` viene inconsistente en z_tabla_am ('7:31' y '15:26:02'): se normaliza
-- acá. Las filas con finca, responsable, cultivo, lote o subtarea en NULL se
-- omiten: no pasarían las FK.
--
-- `modulos` se copia tal cual de z_tabla_am salvo por la normalización: se
-- reordena por valor y se quitan repetidos, que es el contrato de la columna.
INSERT INTO reg_am
  (guid, captura_guid, fecha_proceso, finca_id, responsable_id, cultivo_id, lote_id,
   modulos, subtarea_id, personal_id, comentario, created_at_device,
   received_at_server, origen)
SELECT f.guid, f.captura_guid, f.fecha_proceso, f.finca_id, f.responsable_id,
       f.cultivo_id, f.lote_id, f.modulos, f.subtarea_id, f.personal_id,
       NULL, NULL, NOW(), 'migracion'
FROM (
  SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('z_tabla_am:',a.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_am:',a.id)),9,4),
                '-5',SUBSTR(MD5(CONCAT('z_tabla_am:',a.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_am:',a.id)),18,3),
                '-',SUBSTR(MD5(CONCAT('z_tabla_am:',a.id)),21,12)))    AS guid,
         LOWER(CONCAT(SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),9,4),
                '-5',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),18,3),
                '-',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),21,12)))   AS captura_guid,
         g.fecha_proceso,
         a.finca AS finca_id, a.responsable_id, a.cultivo_id, a.lote_id,
         (SELECT GROUP_CONCAT(DISTINCT zm.id ORDER BY zm.id)
            FROM z_modulo zm WHERE FIND_IN_SET(zm.id, a.modulos))      AS modulos,
         a.subtarea_id, a.personal_id
    FROM z_tabla_am a
    JOIN (
      SELECT MIN(id) AS zid, fecha, hora, finca, responsable_id, cultivo_id, lote_id, modulos, subtarea_id,
             STR_TO_DATE(CONCAT(fecha,' ',
               CASE WHEN hora REGEXP '^[0-9]{1,2}:[0-9]{2}$' THEN CONCAT(LPAD(hora,5,'0'),':00')
                    ELSE LPAD(hora,8,'0') END), '%Y-%m-%d %H:%i:%s') AS fecha_proceso
        FROM z_tabla_am
       WHERE fecha >= '2026-08-01'
       GROUP BY fecha, hora, finca, responsable_id, cultivo_id, lote_id, modulos, subtarea_id
    ) g
      ON  g.fecha = a.fecha AND g.hora = a.hora AND g.finca = a.finca
      AND g.responsable_id = a.responsable_id AND g.cultivo_id = a.cultivo_id
      AND g.lote_id = a.lote_id AND g.modulos <=> a.modulos AND g.subtarea_id = a.subtarea_id
   WHERE a.fecha >= '2026-08-01'
     AND a.finca IS NOT NULL AND a.responsable_id IS NOT NULL AND a.cultivo_id IS NOT NULL
     AND a.lote_id IS NOT NULL AND a.subtarea_id IS NOT NULL AND a.personal_id IS NOT NULL
     -- fuera los duplicados auditados en 1.1b
     AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_am'
                       AND d.id_origen=a.id AND d.motivo='duplicado_cabecera_persona')
) f
WHERE NOT EXISTS (SELECT 1 FROM reg_am r WHERE r.guid = f.guid);

-- 1.3 — El cierre: el avance de z_tabla_pm entra en la fila de esa persona.
--
-- La clave de emparejamiento es (trabajador, fecha, lote, subtarea). NO
-- incluye la hora: z_tabla_pm.hora_inicio y z_tabla_am.hora casi nunca
-- coinciden — medido, 592 de 598 filas de agosto difieren — porque el PM
-- guarda la hora que el supervisor tipeó a la tarde, no la del AM.
--
-- `cierre_guid IS NULL` en el WHERE evita que un segundo avance pise a uno ya
-- cargado: es la misma garantía que usa sync_pm en producción.
UPDATE reg_am n
  JOIN z_tabla_pm p
    ON  p.trabajador = n.personal_id
    AND p.fecha      = DATE(n.fecha_proceso)
    AND p.lote       = n.lote_id
    AND p.subtarea   = n.subtarea_id
   AND p.fecha >= '2026-08-01'
   AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm' AND d.id_origen=p.id)
   SET n.cantidad                 = p.cantidad,
       n.hora_cierre              = STR_TO_DATE(CONCAT(p.fecha,' ',p.hora_cierre),'%Y-%m-%d %H:%i'),
       n.comentario_cierre        = NULLIF(p.comentario,''),
       n.responsable_cierre_id    = p.responsable,
       n.cierre_guid              = LOWER(CONCAT(SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),9,4),
                                      '-5',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),18,3),
                                      '-',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),21,12))),
       n.cierre_created_at_device = p.fecha_registro,
       n.cierre_received_at       = NOW(),
       n.cierre_origen            = 'migracion'
 WHERE n.cierre_guid IS NULL;

-- 1.4 — Los avances que no tienen programación: se les crea la fila completa.
--
-- En V3 el PM era prácticamente una copia del AM con más datos, así que la
-- mañana se reconstruye del propio avance. Quedan con origen 'mig-pm' para que
-- se sepa que la programación se dedujo, no se capturó, y con captura_guid en
-- NULL porque no salieron de ningún formulario.
INSERT INTO reg_am
  (guid, captura_guid, fecha_proceso, finca_id, responsable_id, cultivo_id, lote_id,
   modulos, subtarea_id, personal_id, comentario, received_at_server, origen,
   cantidad, hora_cierre, comentario_cierre, responsable_cierre_id,
   cierre_guid, cierre_created_at_device, cierre_received_at, cierre_origen)
SELECT f.guid, NULL, f.hora_inicio, f.finca_id, f.responsable_id, f.cultivo_id, f.lote_id,
       f.modulos, f.subtarea_id, f.trabajador_id,
       'Programacion deducida de un avance sin AM (migracion)',
       NOW(), 'mig-pm',
       f.cantidad, f.hora_cierre, f.comentario_cierre, f.responsable_id,
       f.cierre_guid, f.fecha_registro, NOW(), 'migracion'
FROM (
  SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('am-de-pm:',p.id)),1,8),'-',SUBSTR(MD5(CONCAT('am-de-pm:',p.id)),9,4),
                '-5',SUBSTR(MD5(CONCAT('am-de-pm:',p.id)),14,3),'-a',SUBSTR(MD5(CONCAT('am-de-pm:',p.id)),18,3),
                '-',SUBSTR(MD5(CONCAT('am-de-pm:',p.id)),21,12)))  AS guid,
         LOWER(CONCAT(SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),9,4),
                '-5',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),18,3),
                '-',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),21,12))) AS cierre_guid,
         STR_TO_DATE(CONCAT(p.fecha,' ',p.hora_inicio),'%Y-%m-%d %H:%i') AS hora_inicio,
         STR_TO_DATE(CONCAT(p.fecha,' ',p.hora_cierre),'%Y-%m-%d %H:%i') AS hora_cierre,
         p.finca AS finca_id, p.responsable AS responsable_id, p.cultivo AS cultivo_id,
         p.lote AS lote_id, p.subtarea AS subtarea_id, p.trabajador AS trabajador_id,
         (SELECT GROUP_CONCAT(DISTINCT zm.id ORDER BY zm.id)
            FROM z_modulo zm WHERE FIND_IN_SET(zm.id, p.modulo))    AS modulos,
         p.cantidad, NULLIF(p.comentario,'') AS comentario_cierre, p.fecha_registro
    FROM z_tabla_pm p
   WHERE p.fecha >= '2026-08-01'
     AND p.finca IS NOT NULL AND p.responsable IS NOT NULL AND p.cultivo IS NOT NULL
     AND p.lote IS NOT NULL AND p.subtarea IS NOT NULL AND p.trabajador IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm' AND d.id_origen=p.id)
) f
WHERE NOT EXISTS (SELECT 1 FROM reg_am r WHERE r.cierre_guid = f.cierre_guid)
  AND NOT EXISTS (SELECT 1 FROM reg_am r WHERE r.guid       = f.guid);

-- ---------------------------------------------------------------------------
-- 2. Cosecha (+ sacos) — se CUELGA del AM, no es una fila suelta
-- ---------------------------------------------------------------------------
-- Desde el 2026-09-03 una cosecha es el CIERRE de una tarea AM: `reg_cosecha`
-- no repite finca, supervisor, subtarea, trabajador, lote ni fecha, y su guid
-- ES `reg_am.cierre_guid`.
--
-- Las 60 filas de agosto de z_cosecha_cacao emparejan con **exactamente un**
-- reg_am cada una por (trabajador, subtarea, día) — verificado: ninguna con 0
-- ni con 2.
--
-- **No se cierra ningún AM acá.** 15 de esas 60 cuelgan de un AM que quedó
-- abierto porque V3 tampoco tuvo PM para él; cerrarlos ahora haría que V4
-- pagara 15 filas que V3 no paga, y el criterio de aceptación es que la nómina
-- de agosto dé idéntica. Esas 15 quedan en `mig_descarte` con su payload y
-- siguen enteras en `z_cosecha_cacao`.

INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_cosecha_cacao', c.id, 'cosecha_sin_cierre_am', a.id,
       JSON_OBJECT('fecha',c.fecha,'trabajador',c.trabajador,'subtarea',c.subtarea,
                   'total_sacos',c.total_sacos,'total_peso',c.total_peso,'reg_am_id',a.id), NOW()
FROM z_cosecha_cacao c
JOIN reg_am a ON a.personal_id = c.trabajador AND a.subtarea_id = c.subtarea
             AND DATE(a.fecha_proceso) = CONVERT(c.fecha USING utf8mb4)
WHERE c.fecha >= '2026-08-01' AND a.cierre_guid IS NULL
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo='cosecha_sin_cierre_am');

-- El avance que cerró el PM contra la suma de los sacos. Cuadra en 41 de 45;
-- las 4 que no son ruido de V3 (dos avances cruzados entre dos personas y dos
-- AM deducidos de un PM con cantidad 1). No se corrige nada: se deja constancia.
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_cosecha_cacao', c.id, 'cosecha_total_no_cuadra', a.id,
       JSON_OBJECT('cantidad_am',a.cantidad,'total_peso',c.total_peso,'origen_am',a.origen), NOW()
FROM z_cosecha_cacao c
JOIN reg_am a ON a.personal_id = c.trabajador AND a.subtarea_id = c.subtarea
             AND DATE(a.fecha_proceso) = CONVERT(c.fecha USING utf8mb4)
WHERE c.fecha >= '2026-08-01' AND a.cierre_guid IS NOT NULL
  AND ABS(a.cantidad - c.total_peso) >= 0.01
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo='cosecha_total_no_cuadra');

-- El guid es el del cierre: una cosecha ES el cierre de esa tarea. Así el
-- invariante `reg_cosecha.guid = reg_am.cierre_guid` vale también para lo
-- migrado, y no hace falta inventar un guid nuevo.
--
-- Se AGRUPA por AM: 8 de las 50 tareas tienen más de una fila en
-- z_cosecha_cacao (7 con dos, 1 con cuatro) — la misma persona pesando en dos
-- tandas. Una tarea se cosecha una vez, así que las tandas se suman y los
-- sacos se renumeran corridos.
INSERT INTO reg_cosecha (guid, reg_am_id, total_sacos, total_peso, observaciones,
                         created_at_device, received_at_server, origen)
SELECT a.cierre_guid, a.id, SUM(c.total_sacos), SUM(c.total_peso),
       NULLIF(LEFT(GROUP_CONCAT(NULLIF(c.observaciones,'') SEPARATOR ' | '),500),''),
       MIN(c.created_at), NOW(), 'migracion'
FROM z_cosecha_cacao c
JOIN reg_am a ON a.personal_id = c.trabajador AND a.subtarea_id = c.subtarea
             AND DATE(a.fecha_proceso) = CONVERT(c.fecha USING utf8mb4)
WHERE c.fecha >= '2026-08-01' AND a.cierre_guid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM reg_cosecha r WHERE r.reg_am_id = a.id)
GROUP BY a.id, a.cierre_guid;

INSERT IGNORE INTO reg_cosecha_saco (cosecha_id, numero, libras)
SELECT r.id, ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY c.id, n.numero),
       CASE n.numero
        WHEN 1 THEN c.saco1 WHEN 2 THEN c.saco2 WHEN 3 THEN c.saco3 WHEN 4 THEN c.saco4 WHEN 5 THEN c.saco5
        WHEN 6 THEN c.saco6 WHEN 7 THEN c.saco7 WHEN 8 THEN c.saco8 WHEN 9 THEN c.saco9 WHEN 10 THEN c.saco10
        WHEN 11 THEN c.saco11 WHEN 12 THEN c.saco12 WHEN 13 THEN c.saco13 WHEN 14 THEN c.saco14
        WHEN 15 THEN c.saco15 END
FROM z_cosecha_cacao c
JOIN reg_am a ON a.personal_id = c.trabajador AND a.subtarea_id = c.subtarea
             AND DATE(a.fecha_proceso) = CONVERT(c.fecha USING utf8mb4)
JOIN reg_cosecha r ON r.reg_am_id = a.id
JOIN (SELECT 1 numero UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
      UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
      UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15) n
WHERE c.fecha >= '2026-08-01'
  AND CASE n.numero
        WHEN 1 THEN c.saco1 WHEN 2 THEN c.saco2 WHEN 3 THEN c.saco3 WHEN 4 THEN c.saco4 WHEN 5 THEN c.saco5
        WHEN 6 THEN c.saco6 WHEN 7 THEN c.saco7 WHEN 8 THEN c.saco8 WHEN 9 THEN c.saco9 WHEN 10 THEN c.saco10
        WHEN 11 THEN c.saco11 WHEN 12 THEN c.saco12 WHEN 13 THEN c.saco13 WHEN 14 THEN c.saco14
        WHEN 15 THEN c.saco15 END > 0;

-- Los totales se REDERIVAN de los sacos, la misma regla que aplica el servidor
-- en sync_cosecha: lo que manda es el detalle, no el número que traía la fila.
UPDATE reg_cosecha r
   SET r.total_sacos = (SELECT COUNT(*)               FROM reg_cosecha_saco s WHERE s.cosecha_id = r.id),
       r.total_peso  = (SELECT COALESCE(SUM(s.libras),0) FROM reg_cosecha_saco s WHERE s.cosecha_id = r.id)
 WHERE r.origen = 'migracion';

-- ---------------------------------------------------------------------------
-- 3. Riego
-- ---------------------------------------------------------------------------
-- `codigo_tarea`/`codigo_subtarea` valen '0' en las 9.778 filas: se descartan.
-- `tiempo_riego` 'HH:MM' es duración, no hora del día -> minutos.
INSERT INTO reg_riego (guid, fecha_proceso, finca_id, supervisor_id, lote_id, modulo_id, subtarea_id,
                       tiempo_riego_min, volumen_riego, observaciones,
                       created_at_device, received_at_server, origen)
SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('z_riego:',g.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_riego:',g.id)),9,4),
              '-5',SUBSTR(MD5(CONCAT('z_riego:',g.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_riego:',g.id)),18,3),
              '-',SUBSTR(MD5(CONCAT('z_riego:',g.id)),21,12))),
       -- `hora` vale '0' en las 9.778 filas de riego: columna muerta, no hay hora
       -- de origen. Se usa la del created_at cuando cae el mismo día; si no, 00:00.
       CASE WHEN DATE(g.created_at) = g.fecha
            THEN STR_TO_DATE(CONCAT(g.fecha,' ',TIME(g.created_at)),'%Y-%m-%d %H:%i:%s')
            ELSE STR_TO_DATE(CONCAT(g.fecha,' 00:00:00'),'%Y-%m-%d %H:%i:%s') END,
       g.finca, g.supervisor, g.lote, CAST(g.modulo AS UNSIGNED), NULL,
       CASE WHEN g.tiempo_riego REGEXP '^[0-9]{1,2}:[0-9]{2}$'
            THEN SUBSTRING_INDEX(g.tiempo_riego,':',1)*60 + SUBSTRING_INDEX(g.tiempo_riego,':',-1)
            ELSE NULL END,
       g.volumen_riego, NULLIF(LEFT(g.observaciones,500),''), g.created_at, NOW(), 'migracion'
FROM z_riego g
WHERE g.fecha >= '2026-08-01'
  AND NOT EXISTS (SELECT 1 FROM reg_riego r WHERE r.guid = LOWER(CONCAT(
        SUBSTR(MD5(CONCAT('z_riego:',g.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_riego:',g.id)),9,4),
        '-5',SUBSTR(MD5(CONCAT('z_riego:',g.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_riego:',g.id)),18,3),
        '-',SUBSTR(MD5(CONCAT('z_riego:',g.id)),21,12))));

-- ---------------------------------------------------------------------------
-- 4. Postcosecha
-- ---------------------------------------------------------------------------
-- Se migran TODAS las partidas de la ventana, cerradas y en curso: la app vieja
-- no va a convivir con la nueva y la web sólo permite VER postcosecha, así que
-- una partida que quede en z_* no la podría cerrar nadie.
--
-- El enlace partida <-> cosecha no existe como columna en el esquema viejo. Se
-- recupera por `created_at` idéntico al segundo entre z_postharvest_weight y
-- z_postharvest_lotsharvest, y se comprueba contra el peso: en la ventana de
-- agosto las 4 partidas emparejan y el lot_weight coincide EXACTO con la suma
-- de la cosecha de esa fecha. Si alguna no empareja, no se migra y queda en
-- mig_descarte para revisión manual.

INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_postharvest_weight', w.id, 'sin_lote_de_cosecha_emparejable', NULL,
       JSON_OBJECT('lot_number',w.lot_number,'created_at',DATE_FORMAT(w.created_at,'%Y-%m-%d %H:%i:%s'),
                   'lot_weight',w.lot_weight), NOW()
FROM z_postharvest_weight w
WHERE w.created_at >= '2026-08-01'
  AND NOT EXISTS (SELECT 1 FROM z_postharvest_lotsharvest h WHERE h.created_at = w.created_at)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_postharvest_weight'
                    AND d.id_origen=w.id AND d.motivo='sin_lote_de_cosecha_emparejable');

INSERT INTO pc_proceso (guid, lot_code, fecha_cosecha, fecha_inicio, supervisor_id,
                        peso_lote, peso_mallas, peso_final, comentario,
                        created_at_device, received_at_server, origen)
SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('z_postharvest_weight:',p.lot_number)),1,8),'-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',p.lot_number)),9,4),
              '-5',SUBSTR(MD5(CONCAT('z_postharvest_weight:',p.lot_number)),14,3),'-a',SUBSTR(MD5(CONCAT('z_postharvest_weight:',p.lot_number)),18,3),
              '-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',p.lot_number)),21,12))),
       CONCAT(LPAD(DAYOFYEAR(p.fecha_cosecha),3,'0'), LPAD(p.seq,2,'0'), DATE_FORMAT(p.fecha_cosecha,'%y')),
       p.fecha_cosecha, p.fecha_inicio, p.supervisor_id,
       p.lot_weight, p.container_weight, p.output_weight, NULLIF(p.comments,''),
       p.created_at, NOW(), 'migracion'
FROM (
  SELECT w.lot_number, w.supervisor_id, w.lot_weight, w.container_weight, w.comments, w.created_at,
         w.created_at AS fecha_inicio, MIN(h.lot_date) AS fecha_cosecha, r.output_weight,
         ROW_NUMBER() OVER (PARTITION BY DAYOFYEAR(MIN(h.lot_date)), YEAR(MIN(h.lot_date))
                            ORDER BY w.lot_number) AS seq
  FROM z_postharvest_weight w
  JOIN z_postharvest_lotsharvest h ON h.created_at = w.created_at
  LEFT JOIN z_postharvest_result r ON r.lot_id = w.lot_number
  WHERE w.created_at >= '2026-08-01'
  GROUP BY w.lot_number, w.supervisor_id, w.lot_weight, w.container_weight, w.comments, w.created_at, r.output_weight
) p
WHERE NOT EXISTS (SELECT 1 FROM pc_proceso x WHERE x.guid = LOWER(CONCAT(
        SUBSTR(MD5(CONCAT('z_postharvest_weight:',p.lot_number)),1,8),'-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',p.lot_number)),9,4),
        '-5',SUBSTR(MD5(CONCAT('z_postharvest_weight:',p.lot_number)),14,3),'-a',SUBSTR(MD5(CONCAT('z_postharvest_weight:',p.lot_number)),18,3),
        '-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',p.lot_number)),21,12))));

-- Enlace partida -> cosechas de esa(s) fecha(s)
INSERT IGNORE INTO pc_proceso_cosecha (pc_proceso_id, cosecha_id)
SELECT pp.id, rc.id
FROM z_postharvest_weight w
JOIN z_postharvest_lotsharvest h ON h.created_at = w.created_at
JOIN pc_proceso pp ON pp.guid = LOWER(CONCAT(
       SUBSTR(MD5(CONCAT('z_postharvest_weight:',w.lot_number)),1,8),'-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',w.lot_number)),9,4),
       '-5',SUBSTR(MD5(CONCAT('z_postharvest_weight:',w.lot_number)),14,3),'-a',SUBSTR(MD5(CONCAT('z_postharvest_weight:',w.lot_number)),18,3),
       '-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',w.lot_number)),21,12)))
-- reg_cosecha ya no tiene fecha propia: cuelga del AM, y la fecha del trabajo
-- es la de esa tarea.
JOIN reg_cosecha rc ON TRUE
JOIN reg_am ra ON ra.id = rc.reg_am_id AND DATE(ra.fecha_proceso) = h.lot_date
WHERE w.created_at >= '2026-08-01';

-- Etapas: cinco tablas casi idénticas -> una
INSERT INTO pc_etapa (guid, pc_proceso_id, etapa, orden, inicio, fin, comentario, received_at_server)
SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('etapa:',e.etapa,':',e.lot_id)),1,8),'-',SUBSTR(MD5(CONCAT('etapa:',e.etapa,':',e.lot_id)),9,4),
              '-5',SUBSTR(MD5(CONCAT('etapa:',e.etapa,':',e.lot_id)),14,3),'-a',SUBSTR(MD5(CONCAT('etapa:',e.etapa,':',e.lot_id)),18,3),
              '-',SUBSTR(MD5(CONCAT('etapa:',e.etapa,':',e.lot_id)),21,12))),
       pp.id, e.etapa, e.orden, e.inicio, e.fin, NULLIF(e.comentario,''), NOW()
FROM (
  SELECT lot_id,'presecado' etapa,1 orden,start_date inicio,end_date fin,comments comentario FROM z_postharvest_predrying
  UNION ALL SELECT lot_id,'fermentado',2,start_date,end_date,comments FROM z_postharvest_fermentation
  UNION ALL SELECT lot_id,'secado_sol',3,start_date,end_date,comments FROM z_postharvest_sundrying
  UNION ALL SELECT lot_id,'secado_maq',4,start_date,end_date,comments FROM z_postharvest_machinedrying
  UNION ALL SELECT lot_id,'resultado',5,weighing_date,weighing_date,comments FROM z_postharvest_result
) e
JOIN z_postharvest_weight w ON w.lot_number = e.lot_id AND w.created_at >= '2026-08-01'
JOIN pc_proceso pp ON pp.guid = LOWER(CONCAT(
       SUBSTR(MD5(CONCAT('z_postharvest_weight:',e.lot_id)),1,8),'-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',e.lot_id)),9,4),
       '-5',SUBSTR(MD5(CONCAT('z_postharvest_weight:',e.lot_id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_postharvest_weight:',e.lot_id)),18,3),
       '-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',e.lot_id)),21,12)))
WHERE NOT EXISTS (SELECT 1 FROM pc_etapa x WHERE x.pc_proceso_id = pp.id AND x.etapa = e.etapa);

-- Calidad de fermentación (corte de grano)
INSERT INTO pc_calidad_fermentacion (guid, pc_proceso_id, fecha_muestra, buena, ligera, violeta, received_at_server)
SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('calferm:',q.id)),1,8),'-',SUBSTR(MD5(CONCAT('calferm:',q.id)),9,4),
              '-5',SUBSTR(MD5(CONCAT('calferm:',q.id)),14,3),'-a',SUBSTR(MD5(CONCAT('calferm:',q.id)),18,3),
              '-',SUBSTR(MD5(CONCAT('calferm:',q.id)),21,12))),
       pp.id, q.sample_date, q.good, q.light, q.violet, NOW()
FROM z_postharvest_fermentationquality q
JOIN z_postharvest_weight w ON w.lot_number = q.lot_id AND w.created_at >= '2026-08-01'
JOIN pc_proceso pp ON pp.guid = LOWER(CONCAT(
       SUBSTR(MD5(CONCAT('z_postharvest_weight:',q.lot_id)),1,8),'-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',q.lot_id)),9,4),
       '-5',SUBSTR(MD5(CONCAT('z_postharvest_weight:',q.lot_id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_postharvest_weight:',q.lot_id)),18,3),
       '-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',q.lot_id)),21,12)))
WHERE NOT EXISTS (SELECT 1 FROM pc_calidad_fermentacion x WHERE x.pc_proceso_id = pp.id);

-- Calidad de secado (aplica a los DOS secados)
INSERT INTO pc_calidad_secado (guid, pc_proceso_id, etapa, fecha_muestra, humedad_1, humedad_2, humedad_3,
                               granos_muestra, indice_grano_g, granos_vacios_pct, received_at_server)
SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('calsec:',q.id)),1,8),'-',SUBSTR(MD5(CONCAT('calsec:',q.id)),9,4),
              '-5',SUBSTR(MD5(CONCAT('calsec:',q.id)),14,3),'-a',SUBSTR(MD5(CONCAT('calsec:',q.id)),18,3),
              '-',SUBSTR(MD5(CONCAT('calsec:',q.id)),21,12))),
       pp.id,
       CASE q.stage WHEN 'Secado Sol' THEN 'secado_sol' WHEN 'Secado Máquina' THEN 'secado_maq' END,
       STR_TO_DATE(CONCAT(q.sample_date,' 00:00:00'),'%Y-%m-%d %H:%i:%s'),
       q.bean_moisture_1, q.bean_moisture_2, q.bean_moisture_3,
       q.sample_bean_count, q.bean_index_grams, q.percent_empty_beans, NOW()
FROM z_postharvest_dryingquality q
JOIN z_postharvest_weight w ON w.lot_number = q.lot_id AND w.created_at >= '2026-08-01'
JOIN pc_proceso pp ON pp.guid = LOWER(CONCAT(
       SUBSTR(MD5(CONCAT('z_postharvest_weight:',q.lot_id)),1,8),'-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',q.lot_id)),9,4),
       '-5',SUBSTR(MD5(CONCAT('z_postharvest_weight:',q.lot_id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_postharvest_weight:',q.lot_id)),18,3),
       '-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',q.lot_id)),21,12)))
WHERE q.stage IN ('Secado Sol','Secado Máquina')
  AND NOT EXISTS (SELECT 1 FROM pc_calidad_secado x WHERE x.pc_proceso_id = pp.id
                    AND x.etapa = CASE q.stage WHEN 'Secado Sol' THEN 'secado_sol' ELSE 'secado_maq' END);

-- Fotos
INSERT INTO pc_foto (guid, pc_proceso_id, etapa, archivo, orden, received_at_server)
SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('foto:',f.id)),1,8),'-',SUBSTR(MD5(CONCAT('foto:',f.id)),9,4),
              '-5',SUBSTR(MD5(CONCAT('foto:',f.id)),14,3),'-a',SUBSTR(MD5(CONCAT('foto:',f.id)),18,3),
              '-',SUBSTR(MD5(CONCAT('foto:',f.id)),21,12))),
       pp.id,
       CASE f.stage WHEN 'Fermentado' THEN 'fermentado' WHEN 'Secado Sol' THEN 'secado_sol'
                    WHEN 'Secado Máquina' THEN 'secado_maq' ELSE LOWER(f.stage) END,
       f.picture_name, f.picture_order, NOW()
FROM z_postharvest_photos f
JOIN z_postharvest_weight w ON w.lot_number = f.lot_id AND w.created_at >= '2026-08-01'
JOIN pc_proceso pp ON pp.guid = LOWER(CONCAT(
       SUBSTR(MD5(CONCAT('z_postharvest_weight:',f.lot_id)),1,8),'-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',f.lot_id)),9,4),
       '-5',SUBSTR(MD5(CONCAT('z_postharvest_weight:',f.lot_id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_postharvest_weight:',f.lot_id)),18,3),
       '-',SUBSTR(MD5(CONCAT('z_postharvest_weight:',f.lot_id)),21,12)))
WHERE NOT EXISTS (SELECT 1 FROM pc_foto x WHERE x.guid = LOWER(CONCAT(
        SUBSTR(MD5(CONCAT('foto:',f.id)),1,8),'-',SUBSTR(MD5(CONCAT('foto:',f.id)),9,4),
        '-5',SUBSTR(MD5(CONCAT('foto:',f.id)),14,3),'-a',SUBSTR(MD5(CONCAT('foto:',f.id)),18,3),
        '-',SUBSTR(MD5(CONCAT('foto:',f.id)),21,12))));

-- Sembrar el consecutivo de lot_code para que la app no repita códigos.
INSERT INTO pc_lot_code_seq (julian_day, year_2d, last_seq)
SELECT DAYOFYEAR(fecha_cosecha), CAST(DATE_FORMAT(fecha_cosecha,'%y') AS UNSIGNED), COUNT(*)
FROM pc_proceso GROUP BY 1,2
ON DUPLICATE KEY UPDATE last_seq = GREATEST(last_seq, VALUES(last_seq));

-- ============================================================================
-- VERIFICADO el 2026-09-02 sobre una copia real de `lfp_prodapp`
-- (MariaDB 10.11, importada desde docs/db/init/01-schema.sql y dejada virgen
-- con _historico/00-limpiar-intermedias.sql).
--
-- Corrido dos veces seguidas: la 2a no inserta ni una fila y los 550 guid son
-- los mismos. Idempotente y REPRODUCIBLE, que la versión anterior no era: sus
-- guid salían de UUID() en 183 de las 550 filas, así que dos corridas daban
-- dos bases distintas y no se podían comparar.
-- Cero rechazos de FK. Cero filas modificadas en cualquier tabla z_*.
--
--   ORIGEN (>= 2026-08-01)        ->  DESTINO
--   z_tabla_am        590 filas   ->  reg_am 529 filas en 367 capturas,
--                                     61 descartes               (529+61 = 590)
--   z_tabla_pm        598 filas   ->  495 cierres sobre esas filas + 21 filas
--                                     nuevas con origen 'mig-pm' (avances sin
--                                     AM), 103 descartes         (495+103 = 598)
--
--   TOTAL reg_am: 550 filas — 495 cerradas, 55 abiertas, 21 deducidas.
--
--   EL CUADRE QUE VALE, y el criterio de aceptación de cualquier cambio acá:
--   `vw_reg_reporte_pago` de agosto da 495 filas, 79.298,40 de cantidad y
--   15.091,66 de total — idéntico a `vw_reporte_pago` desde z_tabla_pm. La
--   nómina no se movió un centavo.
--
--   Comparado además fila por fila y columna por columna contra el resultado
--   de la cadena vieja de seis migraciones: 550 de 550 emparejan y la única
--   diferencia es el texto del comentario de las 21 filas deducidas.
--   z_cosecha_cacao    60 filas   ->  reg_cosecha 60, 292 sacos
--   z_riego           279 filas   ->  reg_riego 279
--   z_postharvest_*     4 partidas->  pc_proceso 4, 25 enlaces de cosecha,
--                                     13 etapas, 1 calidad ferm., 1 secado, 4 fotos
--
--   Suma de total_peso de cosecha: 20.526,60 en origen = 20.526,60 en destino.
--   peso_lote de las 4 partidas = suma EXACTA de la cosecha enlazada, las 4.
--   lot_code generados: 2380126, 2300126, 2260126, 2390126.
--
-- mig_descarte queda con 178 filas: 103 duplicado_60s (PM),
-- 61 duplicado_cabecera_persona (AM), 14 finca_derivada_del_lote (cosecha).
-- Ninguna se pierde: la fila entera está en el payload JSON.
--
-- LO QUE ESTE SCRIPT NO HACE Y HAY QUE SABER:
--  * `z_riego.hora` vale '0' en las 9.778 filas: la hora del día no existe en el
--    origen. Se usa la de created_at cuando cae el mismo día (35 de 279); el
--    resto queda a las 00:00.
--  * 14 filas de cosecha de agosto traían finca = 0. Se derivó del lote.
--  * El enlace partida <-> cosecha se reconstruye por created_at idéntico al
--    segundo. En la ventana de agosto empareja 4 de 4 y el peso cuadra exacto.
--    En el histórico completo empareja 100 de 102 y el peso cuadra en 77 —
--    por eso este script sólo se aplica a la ventana, no al histórico.
-- ============================================================================
