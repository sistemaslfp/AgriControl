-- ============================================================================
-- Migración de la ventana de arranque V4 — desde 2026-08-01, ambas fincas.
-- Idempotente: se puede correr N veces. La segunda vez no inserta nada.
-- Auditoría de todo lo descartado en mig_descarte (fila completa en payload).
-- No modifica NI UNA fila de las tablas z_*.
-- ============================================================================

USE lfp_prodapp;
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE';

-- ---------------------------------------------------------------------------
-- 1. PM
-- ---------------------------------------------------------------------------
-- Descartes: misma fila natural, mismos valores, creada dentro de 60 s de otra
-- anterior. Nunca se colapsan filas que difieren en cantidad u horas.
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

INSERT INTO reg_pm (guid, fecha_proceso, hora_inicio, hora_cierre, pm_year, pm_week,
                    finca_id, responsable_id, trabajador_id, cultivo_id, lote_id, subtarea_id,
                    cantidad, comentario, created_at_device, received_at_server, origen)
SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('z_tabla_pm:',t.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_pm:',t.id)),9,4),
              '-5',SUBSTR(MD5(CONCAT('z_tabla_pm:',t.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_pm:',t.id)),18,3),
              '-',SUBSTR(MD5(CONCAT('z_tabla_pm:',t.id)),21,12))),
       t.fecha,
       STR_TO_DATE(CONCAT(t.fecha,' ',t.hora_inicio),'%Y-%m-%d %H:%i'),
       STR_TO_DATE(CONCAT(t.fecha,' ',t.hora_cierre),'%Y-%m-%d %H:%i'),
       t.pm_year, t.pm_week, t.finca, t.responsable, t.trabajador, t.cultivo, t.lote, t.subtarea,
       t.cantidad, NULLIF(t.comentario,''), t.fecha_registro, NOW(), 'migracion'
FROM z_tabla_pm t
WHERE t.fecha >= '2026-08-01'
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm' AND d.id_origen=t.id)
  AND NOT EXISTS (SELECT 1 FROM reg_pm r WHERE r.guid = LOWER(CONCAT(
        SUBSTR(MD5(CONCAT('z_tabla_pm:',t.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_pm:',t.id)),9,4),
        '-5',SUBSTR(MD5(CONCAT('z_tabla_pm:',t.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_pm:',t.id)),18,3),
        '-',SUBSTR(MD5(CONCAT('z_tabla_pm:',t.id)),21,12))));

INSERT IGNORE INTO reg_pm_modulo (pm_id, modulo_id)
WITH RECURSIVE s AS (
  SELECT t.id AS zid, t.modulo AS resto, SUBSTRING_INDEX(t.modulo,',',1) AS parte
    FROM z_tabla_pm t WHERE t.fecha >= '2026-08-01'
  UNION ALL
  SELECT zid, SUBSTRING(resto,CHAR_LENGTH(parte)+2), SUBSTRING_INDEX(SUBSTRING(resto,CHAR_LENGTH(parte)+2),',',1)
    FROM s WHERE CHAR_LENGTH(resto) > CHAR_LENGTH(parte)
)
SELECT r.id, CAST(TRIM(s.parte) AS UNSIGNED)
FROM s
JOIN reg_pm r ON r.guid = LOWER(CONCAT(
       SUBSTR(MD5(CONCAT('z_tabla_pm:',s.zid)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_pm:',s.zid)),9,4),
       '-5',SUBSTR(MD5(CONCAT('z_tabla_pm:',s.zid)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_pm:',s.zid)),18,3),
       '-',SUBSTR(MD5(CONCAT('z_tabla_pm:',s.zid)),21,12)))
WHERE TRIM(s.parte) <> '' AND TRIM(s.parte) <> '0';

-- ---------------------------------------------------------------------------
-- 2. AM  (cabecera + personas + módulos)
-- ---------------------------------------------------------------------------
-- Una cabecera = (fecha, hora, finca, responsable, cultivo, lote, modulos, subtarea).
-- Las personas de esa cabecera se vuelven filas de reg_am_personal; la persona
-- repetida dentro de la misma cabecera desaparece sola por el UNIQUE.
-- `hora` viene inconsistente ('7:31' y '15:26:02'): se normaliza aquí.
INSERT INTO reg_am (guid, fecha_proceso, finca_id, responsable_id, cultivo_id, lote_id,
                    subtarea_id, comentario, created_at_device, received_at_server, origen)
SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),9,4),
              '-5',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),18,3),
              '-',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),21,12))),
       g.fecha_proceso, g.finca, g.responsable_id, g.cultivo_id, g.lote_id, g.subtarea_id,
       NULL, NULL, NOW(), 'migracion'
FROM (
  SELECT MIN(a.id) AS zid,
         STR_TO_DATE(CONCAT(a.fecha,' ',
           CASE WHEN a.hora REGEXP '^[0-9]{1,2}:[0-9]{2}$' THEN CONCAT(LPAD(a.hora,5,'0'),':00')
                ELSE LPAD(a.hora,8,'0') END), '%Y-%m-%d %H:%i:%s') AS fecha_proceso,
         a.finca, a.responsable_id, a.cultivo_id, a.lote_id, a.subtarea_id
  FROM z_tabla_am a
  WHERE a.fecha >= '2026-08-01'
    AND a.finca IS NOT NULL AND a.responsable_id IS NOT NULL AND a.cultivo_id IS NOT NULL
    AND a.lote_id IS NOT NULL AND a.subtarea_id IS NOT NULL
  GROUP BY a.fecha, a.hora, a.finca, a.responsable_id, a.cultivo_id, a.lote_id, a.modulos, a.subtarea_id
) g
WHERE NOT EXISTS (SELECT 1 FROM reg_am r WHERE r.guid = LOWER(CONCAT(
        SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),9,4),
        '-5',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),18,3),
        '-',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),21,12))));

-- Auditoría AM: la misma persona repetida dentro de la misma cabecera es una
-- programación duplicada. El UNIQUE la colapsa sola, pero queda constancia.
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

-- personas de cada cabecera
INSERT IGNORE INTO reg_am_personal (am_id, personal_id)
SELECT r.id, a.personal_id
FROM z_tabla_am a
JOIN (SELECT MIN(id) zid, fecha, hora, finca, responsable_id, cultivo_id, lote_id, modulos, subtarea_id
      FROM z_tabla_am WHERE fecha >= '2026-08-01' GROUP BY 2,3,4,5,6,7,8,9) g
  ON g.fecha=a.fecha AND g.hora=a.hora AND g.finca=a.finca AND g.responsable_id=a.responsable_id
 AND g.cultivo_id=a.cultivo_id AND g.lote_id=a.lote_id AND g.modulos<=>a.modulos AND g.subtarea_id=a.subtarea_id
JOIN reg_am r ON r.guid = LOWER(CONCAT(
       SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),9,4),
       '-5',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),18,3),
       '-',SUBSTR(MD5(CONCAT('z_tabla_am:',g.zid)),21,12)))
WHERE a.fecha >= '2026-08-01' AND a.personal_id IS NOT NULL;

-- módulos de cada cabecera (CSV -> filas)
INSERT IGNORE INTO reg_am_modulo (am_id, modulo_id)
WITH RECURSIVE g AS (
  SELECT MIN(id) zid, modulos FROM z_tabla_am WHERE fecha >= '2026-08-01'
  GROUP BY fecha, hora, finca, responsable_id, cultivo_id, lote_id, modulos, subtarea_id
), s AS (
  SELECT zid, modulos AS resto, SUBSTRING_INDEX(modulos,',',1) AS parte FROM g WHERE modulos IS NOT NULL
  UNION ALL
  SELECT zid, SUBSTRING(resto,CHAR_LENGTH(parte)+2), SUBSTRING_INDEX(SUBSTRING(resto,CHAR_LENGTH(parte)+2),',',1)
    FROM s WHERE CHAR_LENGTH(resto) > CHAR_LENGTH(parte)
)
SELECT r.id, CAST(TRIM(s.parte) AS UNSIGNED)
FROM s JOIN reg_am r ON r.guid = LOWER(CONCAT(
       SUBSTR(MD5(CONCAT('z_tabla_am:',s.zid)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_am:',s.zid)),9,4),
       '-5',SUBSTR(MD5(CONCAT('z_tabla_am:',s.zid)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_am:',s.zid)),18,3),
       '-',SUBSTR(MD5(CONCAT('z_tabla_am:',s.zid)),21,12)))
WHERE TRIM(s.parte) <> '' AND TRIM(s.parte) <> '0';

-- ---------------------------------------------------------------------------
-- 3. Cosecha (+ sacos)
-- ---------------------------------------------------------------------------
-- Auditoría: 14 filas de agosto traen finca = 0 (la columna tiene DEFAULT 0 y la
-- app vieja no siempre la manda). Se deriva del lote, que sí la tiene, y se deja
-- constancia. No se inventa nada: z_lote.finca_id es dato, no suposición.
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_cosecha_cacao', c.id, 'finca_derivada_del_lote', c.id,
       JSON_OBJECT('id',c.id,'fecha',c.fecha,'finca_original',c.finca,'lote',c.lote,
                   'finca_derivada',l.finca_id,'total_peso',c.total_peso), NOW()
FROM z_cosecha_cacao c JOIN z_lote l ON l.id=c.lote
WHERE c.fecha >= '2026-08-01' AND c.finca = 0
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo='finca_derivada_del_lote');

INSERT INTO reg_cosecha (guid, fecha_proceso, finca_id, supervisor_id, subtarea_id, trabajador_id,
                         lote_id, modulo_id, jornales, total_sacos, total_peso, observaciones,
                         created_at_device, received_at_server, origen)
SELECT LOWER(CONCAT(SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),9,4),
              '-5',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),18,3),
              '-',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),21,12))),
       STR_TO_DATE(CONCAT(c.fecha,' ',LPAD(c.hora,5,'0'),':00'),'%Y-%m-%d %H:%i:%s'),
       COALESCE(NULLIF(c.finca,0), l.finca_id), c.supervisor, c.subtarea, c.trabajador, c.lote,
       NULLIF(c.modulo,0), c.jornales, c.total_sacos, c.total_peso,
       NULLIF(LEFT(c.observaciones,500),''), c.created_at, NOW(), 'migracion'
FROM z_cosecha_cacao c
JOIN z_lote l ON l.id = c.lote
WHERE c.fecha >= '2026-08-01'
  AND NOT EXISTS (SELECT 1 FROM reg_cosecha r WHERE r.guid = LOWER(CONCAT(
        SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),9,4),
        '-5',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),18,3),
        '-',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),21,12))));

INSERT IGNORE INTO reg_cosecha_saco (cosecha_id, numero, libras)
SELECT r.id, n.numero,
       CASE n.numero
        WHEN 1 THEN c.saco1 WHEN 2 THEN c.saco2 WHEN 3 THEN c.saco3 WHEN 4 THEN c.saco4 WHEN 5 THEN c.saco5
        WHEN 6 THEN c.saco6 WHEN 7 THEN c.saco7 WHEN 8 THEN c.saco8 WHEN 9 THEN c.saco9 WHEN 10 THEN c.saco10
        WHEN 11 THEN c.saco11 WHEN 12 THEN c.saco12 WHEN 13 THEN c.saco13 WHEN 14 THEN c.saco14
        WHEN 15 THEN c.saco15 END
FROM z_cosecha_cacao c
JOIN reg_cosecha r ON r.guid = LOWER(CONCAT(
       SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),9,4),
       '-5',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),18,3),
       '-',SUBSTR(MD5(CONCAT('z_cosecha_cacao:',c.id)),21,12)))
JOIN (SELECT 1 numero UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
      UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
      UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15) n
WHERE c.fecha >= '2026-08-01'
  AND CASE n.numero
        WHEN 1 THEN c.saco1 WHEN 2 THEN c.saco2 WHEN 3 THEN c.saco3 WHEN 4 THEN c.saco4 WHEN 5 THEN c.saco5
        WHEN 6 THEN c.saco6 WHEN 7 THEN c.saco7 WHEN 8 THEN c.saco8 WHEN 9 THEN c.saco9 WHEN 10 THEN c.saco10
        WHEN 11 THEN c.saco11 WHEN 12 THEN c.saco12 WHEN 13 THEN c.saco13 WHEN 14 THEN c.saco14
        WHEN 15 THEN c.saco15 END > 0;

-- ---------------------------------------------------------------------------
-- 4. Riego
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
-- 5. Postcosecha
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
JOIN reg_cosecha rc ON DATE(rc.fecha_proceso) = h.lot_date
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
-- VERIFICADO el 2026-08-31 sobre una copia real de `lfp_prodapp`
-- (MariaDB 10.11, importada desde docs/db/init/01-schema.sql).
--
-- Corrido tres veces seguidas: la 2a y la 3a no insertan ni una fila. Idempotente.
-- Cero rechazos de FK. Cero filas modificadas en cualquier tabla z_*.
--
--   ORIGEN (>= 2026-08-01)        ->  DESTINO
--   z_tabla_am        590 filas   ->  reg_am 367 cabeceras, 529 personas,
--                                     505 módulos, 61 descartes  (529+61 = 590)
--   z_tabla_pm        598 filas   ->  reg_pm 495, 629 módulos,
--                                     103 descartes              (495+103 = 598)
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
