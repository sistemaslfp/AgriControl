-- ============================================================================
-- Mantenimiento: migrar z_* -> lfp_* por RANGO DE FECHAS y por FINCA.
--
-- Para capturas que siguen entrando en las z_* despues del corte a V4
-- (supervisores que no usan la app nueva). Misma logica que
-- migrations/03-migracion-historico.sql, acotada por los parametros de abajo.
--
--   1. Editar los cuatro SET de PARAMETROS.
--   2. Correr con @ejecutar = 0: no escribe nada, muestra que hay en origen y
--      cuanto ya esta migrado.
--   3. Cambiar @ejecutar a 1 y correr de nuevo. El reporte final lista lo que
--      entro y lo que se descarto en esa corrida.
--
-- - Idempotente: los guid son los mismos que usa 03, asi que repetir una
--   corrida, o correrla sobre dias que 03 ya migro, no inserta nada.
-- - No modifica ni borra filas de las z_*. Los descartes quedan en mig_descarte.
-- - Cubre AM, PM, cosecha y riego. NO cubre postcosecha: z_postharvest_* no
--   tiene finca ni se emparejan las partidas por fecha de forma fiable.
-- - Filas con la fecha mal formada no se pueden elegir por fecha y se ignoran.
-- - Guardas propias de este script (no existen en 03, porque alla no habia app
--   nueva escribiendo en lfp_*):
--     am_ya_existe_en_lfp   un AM de z_tabla_am cuya persona, lote, subtarea y
--                           dia ya tienen un AM creado desde app/web
--     pm_ya_cerrado_en_lfp  un PM de z_tabla_pm cuya tarea ya fue cerrada
--                           desde app/web
--   Ambos se anotan en mig_descarte y no se migran: de lo contrario se paga
--   dos veces el mismo trabajo.
-- ============================================================================

USE lfp_prodapp;
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE';
SET SQL_SAFE_UPDATES = 0;

-- ------------------------------ PARAMETROS ---------------------------------
SET @finca_id    = 2;             -- id de z_finca; NULL = todas las fincas
SET @fecha_desde = '2026-10-01';  -- AAAA-MM-DD, inclusive
SET @fecha_hasta = '2026-10-01';  -- AAAA-MM-DD, inclusive
SET @ejecutar    = 0;             -- 0 = solo vista previa, 1 = escribe
-- ---------------------------------------------------------------------------

-- Aborta con ERROR 1146 si los parametros no sirven; el nombre de la tabla
-- inexistente es el mensaje.
SET @guardian = IF(
      @ejecutar IN (0,1)
  AND @fecha_desde REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND @fecha_hasta REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND @fecha_desde <= @fecha_hasta
  AND (@finca_id IS NULL OR EXISTS (SELECT 1 FROM z_finca WHERE id = @finca_id)),
  'SELECT 1',
  'SELECT 1 FROM ABORTADO_parametros_invalidos_revisar_finca_fechas_y_ejecutar');
PREPARE g FROM @guardian; EXECUTE g; DEALLOCATE PREPARE g;

SET @inicio = NOW();

DROP FUNCTION IF EXISTS mig_guid;
CREATE FUNCTION mig_guid(p VARCHAR(100)) RETURNS CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_spanish_ci DETERMINISTIC
  RETURN LOWER(CONCAT(SUBSTR(MD5(p),1,8),'-',SUBSTR(MD5(p),9,4),'-5',SUBSTR(MD5(p),14,3),
                      '-a',SUBSTR(MD5(p),18,3),'-',SUBSTR(MD5(p),21,12)));

CREATE INDEX IF NOT EXISTS ix_mig_am_dup ON z_tabla_am
  (fecha, hora, finca, responsable_id, cultivo_id, lote_id, modulos, subtarea_id, personal_id, id);
CREATE INDEX IF NOT EXISTS ix_mig_pm_dup ON z_tabla_pm
  (finca, fecha, subtarea, trabajador, cantidad, hora_inicio, hora_cierre, id);
CREATE INDEX IF NOT EXISTS ix_mig_cos_dup ON z_cosecha_cacao
  (fecha, hora, finca, supervisor, tarea, subtarea, trabajador, lote, modulo, jornales, total_sacos, total_peso, id);
CREATE INDEX IF NOT EXISTS ix_mig_riego_dup ON z_riego
  (supervisor, fecha, hora, finca, codigo_tarea, codigo_subtarea, lote, modulo, tiempo_riego, volumen_riego, id);
CREATE INDEX IF NOT EXISTS idx_mig_origen ON mig_descarte (tabla_origen, id_origen, motivo);
ANALYZE TABLE z_tabla_am, z_tabla_pm, z_cosecha_cacao, z_riego, mig_descarte;

-- ---------------------------------------------------------------------------
-- VISTA PREVIA (siempre se muestra)
-- ---------------------------------------------------------------------------
SELECT 'z_tabla_am' AS origen, COUNT(*) AS filas_en_rango,
       COALESCE(SUM(EXISTS (SELECT 1 FROM lfp_am r WHERE r.guid = mig_guid(CONCAT('z_tabla_am:', a.id)))),0) AS ya_migradas
  FROM z_tabla_am a
 WHERE a.fecha BETWEEN @fecha_desde AND @fecha_hasta AND a.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND (@finca_id IS NULL OR a.finca = @finca_id)
UNION ALL
SELECT 'z_tabla_pm', COUNT(*),
       COALESCE(SUM(EXISTS (SELECT 1 FROM lfp_am r WHERE r.cierre_guid = mig_guid(CONCAT('z_tabla_pm:', p.id))
                                                      OR r.guid        = mig_guid(CONCAT('am-de-pm:', p.id)))),0)
  FROM z_tabla_pm p
 WHERE p.fecha BETWEEN @fecha_desde AND @fecha_hasta AND p.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND (@finca_id IS NULL OR p.finca = @finca_id)
UNION ALL
SELECT 'z_cosecha_cacao', COUNT(*), NULL
  FROM z_cosecha_cacao c
 WHERE c.fecha BETWEEN @fecha_desde AND @fecha_hasta AND c.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND (@finca_id IS NULL OR c.finca = @finca_id)
UNION ALL
SELECT 'z_riego', COUNT(*),
       COALESCE(SUM(EXISTS (SELECT 1 FROM lfp_riego r WHERE r.guid = mig_guid(CONCAT('z_riego:', g.id)))),0)
  FROM z_riego g
 WHERE g.fecha BETWEEN @fecha_desde AND @fecha_hasta AND g.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND (@finca_id IS NULL OR g.finca = @finca_id);

-- Lo que ya hay en lfp_am para el mismo rango, por origen.
SELECT origen, COUNT(*) AS filas, SUM(cierre_guid IS NOT NULL) AS cerradas
  FROM lfp_am
 WHERE fecha_proceso >= CONCAT(@fecha_desde,' 00:00:00') AND fecha_proceso < DATE_ADD(@fecha_hasta, INTERVAL 1 DAY)
   AND (@finca_id IS NULL OR finca_id = @finca_id)
 GROUP BY origen;

-- ---------------------------------------------------------------------------
-- 0. Referencias rotas (catalogos borrados): no entran, quedan en mig_descarte
-- ---------------------------------------------------------------------------
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_tabla_am', a.id, 'referencia_rota', NULL,
       JSON_OBJECT('id',a.id,'fecha',a.fecha,'hora',a.hora,'finca',a.finca,
                   'responsable_id',a.responsable_id,'cultivo_id',a.cultivo_id,
                   'lote_id',a.lote_id,'modulos',a.modulos,'subtarea_id',a.subtarea_id,
                   'personal_id',a.personal_id,
                   'rotas', CONCAT_WS(',',
                     IF(NOT EXISTS(SELECT 1 FROM z_personal x WHERE x.id=a.personal_id),'personal',NULL),
                     IF(NOT EXISTS(SELECT 1 FROM z_personal x WHERE x.id=a.responsable_id),'responsable',NULL),
                     IF(NOT EXISTS(SELECT 1 FROM z_subtarea x WHERE x.id=a.subtarea_id),'subtarea',NULL),
                     IF(NOT EXISTS(SELECT 1 FROM z_lote     x WHERE x.id=a.lote_id),'lote',NULL),
                     IF(NOT EXISTS(SELECT 1 FROM z_cultivo  x WHERE x.id=a.cultivo_id),'cultivo',NULL),
                     IF(NOT EXISTS(SELECT 1 FROM z_finca    x WHERE x.id=a.finca),'finca',NULL))), NOW()
FROM z_tabla_am a
WHERE @ejecutar = 1
  AND a.fecha BETWEEN @fecha_desde AND @fecha_hasta AND a.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR a.finca = @finca_id)
  AND (   NOT EXISTS (SELECT 1 FROM z_personal x WHERE x.id = a.personal_id)
       OR NOT EXISTS (SELECT 1 FROM z_personal x WHERE x.id = a.responsable_id)
       OR NOT EXISTS (SELECT 1 FROM z_subtarea x WHERE x.id = a.subtarea_id)
       OR NOT EXISTS (SELECT 1 FROM z_lote     x WHERE x.id = a.lote_id)
       OR NOT EXISTS (SELECT 1 FROM z_cultivo  x WHERE x.id = a.cultivo_id)
       OR NOT EXISTS (SELECT 1 FROM z_finca    x WHERE x.id = a.finca))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_am'
                    AND d.id_origen=a.id AND d.motivo='referencia_rota');

INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_tabla_pm', p.id, 'referencia_rota', NULL,
       JSON_OBJECT('id',p.id,'fecha',p.fecha,'finca',p.finca,'responsable',p.responsable,
                   'trabajador',p.trabajador,'subtarea',p.subtarea,'cultivo',p.cultivo,
                   'lote',p.lote,'modulo',p.modulo,'cantidad',p.cantidad,
                   'rotas', CONCAT_WS(',',
                     IF(NOT EXISTS(SELECT 1 FROM z_personal x WHERE x.id=p.trabajador),'trabajador',NULL),
                     IF(NOT EXISTS(SELECT 1 FROM z_subtarea x WHERE x.id=p.subtarea),'subtarea',NULL),
                     IF(NOT EXISTS(SELECT 1 FROM z_lote     x WHERE x.id=p.lote),'lote',NULL),
                     IF(NOT EXISTS(SELECT 1 FROM z_cultivo  x WHERE x.id=p.cultivo),'cultivo',NULL),
                     IF(NOT EXISTS(SELECT 1 FROM z_finca    x WHERE x.id=p.finca),'finca',NULL))), NOW()
FROM z_tabla_pm p
WHERE @ejecutar = 1
  AND p.fecha BETWEEN @fecha_desde AND @fecha_hasta AND p.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR p.finca = @finca_id)
  AND (   NOT EXISTS (SELECT 1 FROM z_personal x WHERE x.id = p.trabajador)
       OR NOT EXISTS (SELECT 1 FROM z_subtarea x WHERE x.id = p.subtarea)
       OR NOT EXISTS (SELECT 1 FROM z_lote     x WHERE x.id = p.lote)
       OR NOT EXISTS (SELECT 1 FROM z_cultivo  x WHERE x.id = p.cultivo)
       OR NOT EXISTS (SELECT 1 FROM z_finca    x WHERE x.id = p.finca))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm'
                    AND d.id_origen=p.id AND d.motivo='referencia_rota');

-- Anotacion, no descarte: el responsable del cierre ya no existe.
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_tabla_pm', p.id, 'responsable_cierre_desconocido', NULL,
       JSON_OBJECT('id',p.id,'fecha',p.fecha,'responsable',p.responsable,'trabajador',p.trabajador), NOW()
FROM z_tabla_pm p
WHERE @ejecutar = 1
  AND p.fecha BETWEEN @fecha_desde AND @fecha_hasta AND p.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR p.finca = @finca_id)
  AND NOT EXISTS (SELECT 1 FROM z_personal x WHERE x.id = p.responsable)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm'
                    AND d.id_origen=p.id AND d.motivo='referencia_rota')
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm'
                    AND d.id_origen=p.id AND d.motivo='responsable_cierre_desconocido');

INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_riego', r.id, 'referencia_rota', NULL,
       JSON_OBJECT('id',r.id,'fecha',r.fecha,'finca',r.finca,'supervisor',r.supervisor,
                   'lote',r.lote,'modulo',r.modulo), NOW()
FROM z_riego r
WHERE @ejecutar = 1
  AND r.fecha BETWEEN @fecha_desde AND @fecha_hasta AND r.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR r.finca = @finca_id)
  AND (   NOT EXISTS (SELECT 1 FROM z_finca    x WHERE x.id = r.finca)
       OR NOT EXISTS (SELECT 1 FROM z_personal x WHERE x.id = r.supervisor)
       OR NOT EXISTS (SELECT 1 FROM z_lote     x WHERE x.id = r.lote)
       OR (r.modulo IS NOT NULL AND r.modulo <> 0
           AND NOT EXISTS (SELECT 1 FROM z_modulo x WHERE x.id = r.modulo)))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_riego'
                    AND d.id_origen=r.id AND d.motivo='referencia_rota');

-- ---------------------------------------------------------------------------
-- 1. AM y PM -> lfp_am (una fila por persona, el cierre en la misma fila)
-- ---------------------------------------------------------------------------
-- 1.1a PM repetido dentro de 60 s (reintento de la app vieja).
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
WHERE @ejecutar = 1
  AND a.fecha BETWEEN @fecha_desde AND @fecha_hasta AND a.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR a.finca = @finca_id)
  AND EXISTS (SELECT 1 FROM z_tabla_pm b
               WHERE b.finca=a.finca AND b.fecha=a.fecha AND b.subtarea=a.subtarea AND b.trabajador=a.trabajador
                 AND b.cantidad=a.cantidad AND b.hora_inicio=a.hora_inicio AND b.hora_cierre=a.hora_cierre
                 AND b.id < a.id AND ABS(TIMESTAMPDIFF(SECOND,b.fecha_registro,a.fecha_registro)) <= 60)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d
                   WHERE d.tabla_origen='z_tabla_pm' AND d.id_origen=a.id AND d.motivo='duplicado_60s');

-- 1.1b AM: la misma persona repetida dentro de la misma captura.
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
WHERE @ejecutar = 1
  AND a.fecha BETWEEN @fecha_desde AND @fecha_hasta AND a.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR a.finca = @finca_id)
  AND a.id > (SELECT MIN(b.id) FROM z_tabla_am b
               WHERE b.fecha=a.fecha AND b.hora=a.hora AND b.finca=a.finca AND b.responsable_id=a.responsable_id
                 AND b.cultivo_id=a.cultivo_id AND b.lote_id=a.lote_id AND b.modulos<=>a.modulos
                 AND b.subtarea_id=a.subtarea_id AND b.personal_id=a.personal_id)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_am'
                    AND d.id_origen=a.id AND d.motivo='duplicado_cabecera_persona');

-- 1.1c Guarda: AM que la app/web ya creo en lfp_am (mismo dia, persona, lote, subtarea).
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_tabla_am', a.id, 'am_ya_existe_en_lfp',
       (SELECT MIN(r.id) FROM lfp_am r
         WHERE r.origen IN ('app','web') AND r.finca_id=a.finca AND r.personal_id=a.personal_id
           AND r.lote_id=a.lote_id AND r.subtarea_id=a.subtarea_id
           AND DATE(r.fecha_proceso) = CONVERT(a.fecha USING utf8mb4)),
       JSON_OBJECT('id',a.id,'fecha',a.fecha,'hora',a.hora,'finca',a.finca,'lote_id',a.lote_id,
                   'subtarea_id',a.subtarea_id,'personal_id',a.personal_id), NOW()
FROM z_tabla_am a
WHERE @ejecutar = 1
  AND a.fecha BETWEEN @fecha_desde AND @fecha_hasta AND a.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR a.finca = @finca_id)
  AND EXISTS (SELECT 1 FROM lfp_am r
               WHERE r.origen IN ('app','web') AND r.finca_id=a.finca AND r.personal_id=a.personal_id
                 AND r.lote_id=a.lote_id AND r.subtarea_id=a.subtarea_id
                 AND DATE(r.fecha_proceso) = CONVERT(a.fecha USING utf8mb4))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_am'
                    AND d.id_origen=a.id AND d.motivo='am_ya_existe_en_lfp');

-- 1.1d Guarda: PM cuya tarea ya fue cerrada desde app/web en lfp_am.
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_tabla_pm', p.id, 'pm_ya_cerrado_en_lfp',
       (SELECT MIN(r.id) FROM lfp_am r
         WHERE r.origen IN ('app','web') AND r.cierre_origen IN ('app','web') AND r.cierre_guid IS NOT NULL
           AND r.finca_id=p.finca AND r.personal_id=p.trabajador AND r.lote_id=p.lote
           AND r.subtarea_id=p.subtarea AND DATE(r.fecha_proceso) = CONVERT(p.fecha USING utf8mb4)),
       JSON_OBJECT('id',p.id,'fecha',p.fecha,'finca',p.finca,'trabajador',p.trabajador,
                   'lote',p.lote,'subtarea',p.subtarea,'cantidad',p.cantidad), NOW()
FROM z_tabla_pm p
WHERE @ejecutar = 1
  AND p.fecha BETWEEN @fecha_desde AND @fecha_hasta AND p.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR p.finca = @finca_id)
  AND EXISTS (SELECT 1 FROM lfp_am r
               WHERE r.origen IN ('app','web') AND r.cierre_origen IN ('app','web') AND r.cierre_guid IS NOT NULL
                 AND r.finca_id=p.finca AND r.personal_id=p.trabajador AND r.lote_id=p.lote
                 AND r.subtarea_id=p.subtarea AND DATE(r.fecha_proceso) = CONVERT(p.fecha USING utf8mb4))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm'
                    AND d.id_origen=p.id AND d.motivo='pm_ya_cerrado_en_lfp');

ANALYZE TABLE mig_descarte;

-- 1.2 Una fila de lfp_am por (captura, persona). El captura_guid sale del id
-- menor de la captura entre las filas que si entran. No se usa una subconsulta
-- agrupada con JOIN: en MariaDB 10.11, con las variables de arriba, ese JOIN
-- devuelve cero filas sin avisar.
INSERT INTO lfp_am
  (guid, captura_guid, fecha_proceso, finca_id, responsable_id, cultivo_id, lote_id,
   modulos, subtarea_id, personal_id, comentario, created_at_device,
   received_at_server, origen)
SELECT mig_guid(CONCAT('z_tabla_am:',a.id)),
       mig_guid(CONCAT('z_tabla_am:',
         (SELECT MIN(b.id) FROM z_tabla_am b
           WHERE b.fecha=a.fecha AND b.hora=a.hora AND b.finca=a.finca AND b.responsable_id=a.responsable_id
             AND b.cultivo_id=a.cultivo_id AND b.lote_id=a.lote_id AND b.modulos<=>a.modulos
             AND b.subtarea_id=a.subtarea_id
             AND NOT EXISTS (SELECT 1 FROM mig_descarte d
                              WHERE d.tabla_origen='z_tabla_am' AND d.id_origen=b.id
                                AND d.motivo IN ('referencia_rota','fecha_ilegible','am_ya_existe_en_lfp'))))),
       STR_TO_DATE(CONCAT(a.fecha,' ',
         CASE WHEN a.hora REGEXP '^[0-9]{1,2}:[0-9]{2}$' THEN CONCAT(LPAD(a.hora,5,'0'),':00')
              ELSE LPAD(a.hora,8,'0') END), '%Y-%m-%d %H:%i:%s'),
       a.finca, a.responsable_id, a.cultivo_id, a.lote_id,
       (SELECT GROUP_CONCAT(DISTINCT zm.id ORDER BY zm.id)
          FROM z_modulo zm WHERE FIND_IN_SET(zm.id, a.modulos)),
       a.subtarea_id, a.personal_id,
       NULL, NULL, NOW(), 'migracion'
FROM z_tabla_am a
WHERE @ejecutar = 1
  AND a.fecha BETWEEN @fecha_desde AND @fecha_hasta AND a.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR a.finca = @finca_id)
  AND a.finca IS NOT NULL AND a.responsable_id IS NOT NULL AND a.cultivo_id IS NOT NULL
  AND a.lote_id IS NOT NULL AND a.subtarea_id IS NOT NULL AND a.personal_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_am'
                    AND d.id_origen=a.id
                    AND d.motivo IN ('duplicado_cabecera_persona','referencia_rota','fecha_ilegible','am_ya_existe_en_lfp'))
  AND NOT EXISTS (SELECT 1 FROM lfp_am r WHERE r.guid = mig_guid(CONCAT('z_tabla_am:',a.id)));

-- 1.3 El cierre: el PM entra en la fila de esa persona. El emparejamiento se
-- resuelve antes en una tabla puente (un PM cierra una tarea, una tarea la
-- cierra un PM); sin ella el UPDATE directo revienta con Duplicate entry.
DROP TABLE IF EXISTS mig_pm_am;
CREATE TABLE mig_pm_am (
  pm_id INT NOT NULL PRIMARY KEY,
  am_id INT NOT NULL,
  UNIQUE KEY uq_mig_pm_am (am_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

INSERT IGNORE INTO mig_pm_am (pm_id, am_id)
SELECT p.id, MIN(n.id)
  FROM z_tabla_pm p
  JOIN lfp_am n
    ON  n.personal_id = p.trabajador
    AND DATE(n.fecha_proceso) = p.fecha
    AND n.lote_id     = p.lote
    AND n.subtarea_id = p.subtarea
 WHERE @ejecutar = 1
   AND p.fecha BETWEEN @fecha_desde AND @fecha_hasta AND p.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   AND (@finca_id IS NULL OR p.finca = @finca_id)
   AND n.cierre_guid IS NULL
   AND NOT EXISTS (SELECT 1 FROM mig_descarte d
                    WHERE d.tabla_origen='z_tabla_pm' AND d.id_origen=p.id
                      AND d.motivo IN ('duplicado_60s','referencia_rota','fecha_ilegible','pm_ya_cerrado_en_lfp'))
   AND NOT EXISTS (SELECT 1 FROM lfp_am r WHERE r.cierre_guid = mig_guid(CONCAT('z_tabla_pm:',p.id)))
 GROUP BY p.id
 ORDER BY p.id;

UPDATE lfp_am n
  JOIN mig_pm_am   m ON m.am_id = n.id
  JOIN z_tabla_pm  p ON p.id    = m.pm_id
   SET n.cantidad                 = p.cantidad,
       n.hora_cierre              = STR_TO_DATE(CONCAT(p.fecha,' ',p.hora_cierre),'%Y-%m-%d %H:%i'),
       n.comentario_cierre        = NULLIF(p.comentario,''),
       n.responsable_cierre_id    = (SELECT x.id FROM z_personal x WHERE x.id = p.responsable),
       n.cierre_guid              = mig_guid(CONCAT('z_tabla_pm:',p.id)),
       n.cierre_created_at_device = NULLIF(CAST(p.fecha_registro AS CHAR), '0000-00-00 00:00:00'),
       n.cierre_received_at       = NOW(),
       n.cierre_origen            = 'migracion'
 WHERE @ejecutar = 1
   AND n.cierre_guid IS NULL;

-- 1.4 PM sin AM: se crea la fila completa con origen 'mig-pm'.
INSERT INTO lfp_am
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
  SELECT mig_guid(CONCAT('am-de-pm:',p.id))   AS guid,
         mig_guid(CONCAT('z_tabla_pm:',p.id)) AS cierre_guid,
         STR_TO_DATE(CONCAT(p.fecha,' ',p.hora_inicio),'%Y-%m-%d %H:%i') AS hora_inicio,
         STR_TO_DATE(CONCAT(p.fecha,' ',p.hora_cierre),'%Y-%m-%d %H:%i') AS hora_cierre,
         p.finca AS finca_id, p.responsable AS responsable_id, p.cultivo AS cultivo_id,
         p.lote AS lote_id, p.subtarea AS subtarea_id, p.trabajador AS trabajador_id,
         (SELECT GROUP_CONCAT(DISTINCT zm.id ORDER BY zm.id)
            FROM z_modulo zm WHERE FIND_IN_SET(zm.id, p.modulo))    AS modulos,
         p.cantidad, NULLIF(p.comentario,'') AS comentario_cierre,
         NULLIF(CAST(p.fecha_registro AS CHAR), '0000-00-00 00:00:00') AS fecha_registro
    FROM z_tabla_pm p
   WHERE @ejecutar = 1
     AND p.fecha BETWEEN @fecha_desde AND @fecha_hasta AND p.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     AND (@finca_id IS NULL OR p.finca = @finca_id)
     AND p.finca IS NOT NULL AND p.responsable IS NOT NULL AND p.cultivo IS NOT NULL
     AND p.lote IS NOT NULL AND p.subtarea IS NOT NULL AND p.trabajador IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm' AND d.id_origen=p.id)
) f
WHERE NOT EXISTS (SELECT 1 FROM lfp_am r WHERE r.cierre_guid = f.cierre_guid)
  AND NOT EXISTS (SELECT 1 FROM lfp_am r WHERE r.guid       = f.guid);

-- ---------------------------------------------------------------------------
-- 2. Cosecha (+ sacos): CIERRA un AM, no crea tareas.
-- Una cosecha marcada solo en z_tabla_pm (peso final, sin sacos) ya cerro su AM
-- por cantidad en 1.3 y no genera lfp_cosecha: esa es la decision del corte.
-- ---------------------------------------------------------------------------
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_cosecha_cacao', a.id, 'duplicado_exacto',
       (SELECT MIN(b.id) FROM z_cosecha_cacao b WHERE b.fecha=a.fecha AND b.hora=a.hora AND b.finca=a.finca AND b.supervisor=a.supervisor
                 AND b.tarea=a.tarea AND b.subtarea=a.subtarea AND b.trabajador=a.trabajador
                 AND b.lote=a.lote AND b.modulo=a.modulo AND b.jornales=a.jornales
                 AND b.total_sacos=a.total_sacos AND b.total_peso=a.total_peso
                 AND COALESCE(b.observaciones,'') = COALESCE(a.observaciones,'')
                 AND CONCAT_WS(',',b.saco1,b.saco2,b.saco3,b.saco4,b.saco5,b.saco6,b.saco7,b.saco8,
                            b.saco9,b.saco10,b.saco11,b.saco12,b.saco13,b.saco14,b.saco15)
                   = CONCAT_WS(',',a.saco1,a.saco2,a.saco3,a.saco4,a.saco5,a.saco6,a.saco7,a.saco8,
                            a.saco9,a.saco10,a.saco11,a.saco12,a.saco13,a.saco14,a.saco15)),
       JSON_OBJECT('id',a.id,'fecha',a.fecha,'trabajador',a.trabajador,'hora',a.hora,
                   'subtarea',a.subtarea,'lote',a.lote,'modulo',a.modulo,
                   'total_sacos',a.total_sacos,'total_peso',a.total_peso,
                   'created_at',DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i:%s')), NOW()
FROM z_cosecha_cacao a
WHERE @ejecutar = 1
  AND a.fecha BETWEEN @fecha_desde AND @fecha_hasta AND a.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR a.finca = @finca_id)
  AND a.id > (SELECT MIN(b.id) FROM z_cosecha_cacao b WHERE b.fecha=a.fecha AND b.hora=a.hora AND b.finca=a.finca AND b.supervisor=a.supervisor
                 AND b.tarea=a.tarea AND b.subtarea=a.subtarea AND b.trabajador=a.trabajador
                 AND b.lote=a.lote AND b.modulo=a.modulo AND b.jornales=a.jornales
                 AND b.total_sacos=a.total_sacos AND b.total_peso=a.total_peso
                 AND COALESCE(b.observaciones,'') = COALESCE(a.observaciones,'')
                 AND CONCAT_WS(',',b.saco1,b.saco2,b.saco3,b.saco4,b.saco5,b.saco6,b.saco7,b.saco8,
                            b.saco9,b.saco10,b.saco11,b.saco12,b.saco13,b.saco14,b.saco15)
                   = CONCAT_WS(',',a.saco1,a.saco2,a.saco3,a.saco4,a.saco5,a.saco6,a.saco7,a.saco8,
                            a.saco9,a.saco10,a.saco11,a.saco12,a.saco13,a.saco14,a.saco15))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=a.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'));

INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_cosecha_cacao', c.id, 'cosecha_sin_cierre_am', a.id,
       JSON_OBJECT('fecha',c.fecha,'trabajador',c.trabajador,'subtarea',c.subtarea,
                   'total_sacos',c.total_sacos,'total_peso',c.total_peso,'lfp_am_id',a.id), NOW()
FROM z_cosecha_cacao c
JOIN lfp_am a ON a.personal_id = c.trabajador AND a.subtarea_id = c.subtarea
             AND DATE(a.fecha_proceso) = CONVERT(c.fecha USING utf8mb4)
WHERE @ejecutar = 1
  AND c.fecha BETWEEN @fecha_desde AND @fecha_hasta AND c.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR c.finca = @finca_id)
  AND a.cierre_guid IS NULL
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo='cosecha_sin_cierre_am');

INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_cosecha_cacao', c.id, 'cosecha_total_no_cuadra', a.id,
       JSON_OBJECT('cantidad_am',a.cantidad,'total_peso',c.total_peso,'origen_am',a.origen), NOW()
FROM z_cosecha_cacao c
JOIN lfp_am a ON a.personal_id = c.trabajador AND a.subtarea_id = c.subtarea
             AND DATE(a.fecha_proceso) = CONVERT(c.fecha USING utf8mb4)
WHERE @ejecutar = 1
  AND c.fecha BETWEEN @fecha_desde AND @fecha_hasta AND c.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR c.finca = @finca_id)
  AND a.cierre_guid IS NOT NULL
  AND ABS(a.cantidad - c.total_peso) >= 0.01
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo='cosecha_total_no_cuadra');

INSERT INTO lfp_cosecha (guid, lfp_am_id, total_sacos, total_peso, observaciones,
                         created_at_device, received_at_server, origen)
SELECT a.cierre_guid, a.id, SUM(c.total_sacos), SUM(c.total_peso),
       NULLIF(LEFT(GROUP_CONCAT(NULLIF(c.observaciones,'') SEPARATOR ' | '),500),''),
       MIN(c.created_at), NOW(), 'migracion'
FROM z_cosecha_cacao c
JOIN lfp_am a ON a.personal_id = c.trabajador AND a.subtarea_id = c.subtarea
             AND DATE(a.fecha_proceso) = CONVERT(c.fecha USING utf8mb4)
WHERE @ejecutar = 1
  AND c.fecha BETWEEN @fecha_desde AND @fecha_hasta AND c.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR c.finca = @finca_id)
  AND a.cierre_guid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'))
  AND NOT EXISTS (SELECT 1 FROM lfp_cosecha r WHERE r.lfp_am_id = a.id)
GROUP BY a.id, a.cierre_guid;

INSERT IGNORE INTO lfp_cosecha_saco (cosecha_id, numero, libras, modulo_id)
SELECT r.id, ROW_NUMBER() OVER (PARTITION BY r.id ORDER BY c.id, n.numero),
       CASE n.numero
        WHEN 1 THEN c.saco1 WHEN 2 THEN c.saco2 WHEN 3 THEN c.saco3 WHEN 4 THEN c.saco4 WHEN 5 THEN c.saco5
        WHEN 6 THEN c.saco6 WHEN 7 THEN c.saco7 WHEN 8 THEN c.saco8 WHEN 9 THEN c.saco9 WHEN 10 THEN c.saco10
        WHEN 11 THEN c.saco11 WHEN 12 THEN c.saco12 WHEN 13 THEN c.saco13 WHEN 14 THEN c.saco14
        WHEN 15 THEN c.saco15 END,
       (SELECT zm.id FROM z_modulo zm WHERE zm.id = c.modulo AND c.modulo > 0)
FROM z_cosecha_cacao c
JOIN lfp_am a ON a.personal_id = c.trabajador AND a.subtarea_id = c.subtarea
             AND DATE(a.fecha_proceso) = CONVERT(c.fecha USING utf8mb4)
JOIN lfp_cosecha r ON r.lfp_am_id = a.id AND r.origen = 'migracion'
JOIN (SELECT 1 numero UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5
      UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL SELECT 10
      UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13 UNION ALL SELECT 14 UNION ALL SELECT 15) n
WHERE @ejecutar = 1
  AND c.fecha BETWEEN @fecha_desde AND @fecha_hasta AND c.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR c.finca = @finca_id)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'))
  AND CASE n.numero
        WHEN 1 THEN c.saco1 WHEN 2 THEN c.saco2 WHEN 3 THEN c.saco3 WHEN 4 THEN c.saco4 WHEN 5 THEN c.saco5
        WHEN 6 THEN c.saco6 WHEN 7 THEN c.saco7 WHEN 8 THEN c.saco8 WHEN 9 THEN c.saco9 WHEN 10 THEN c.saco10
        WHEN 11 THEN c.saco11 WHEN 12 THEN c.saco12 WHEN 13 THEN c.saco13 WHEN 14 THEN c.saco14
        WHEN 15 THEN c.saco15 END > 0;

UPDATE lfp_cosecha r
  JOIN lfp_am a ON a.id = r.lfp_am_id
   SET r.total_sacos = (SELECT COUNT(*)                  FROM lfp_cosecha_saco s WHERE s.cosecha_id = r.id),
       r.total_peso  = (SELECT COALESCE(SUM(s.libras),0) FROM lfp_cosecha_saco s WHERE s.cosecha_id = r.id)
 WHERE @ejecutar = 1
   AND r.origen = 'migracion'
   AND a.fecha_proceso >= CONCAT(@fecha_desde,' 00:00:00')
   AND a.fecha_proceso <  DATE_ADD(@fecha_hasta, INTERVAL 1 DAY)
   AND (@finca_id IS NULL OR a.finca_id = @finca_id);

-- ---------------------------------------------------------------------------
-- 3. Riego
-- ---------------------------------------------------------------------------
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_riego', a.id, 'duplicado_exacto',
       (SELECT MIN(b.id) FROM z_riego b
         WHERE b.supervisor=a.supervisor AND b.fecha=a.fecha AND b.hora=a.hora AND b.finca=a.finca
           AND b.codigo_tarea=a.codigo_tarea AND b.codigo_subtarea=a.codigo_subtarea
           AND b.lote=a.lote AND b.modulo=a.modulo AND b.tiempo_riego=a.tiempo_riego
           AND b.volumen_riego=a.volumen_riego
           AND COALESCE(b.observaciones,'') = COALESCE(a.observaciones,'')),
       JSON_OBJECT('id',a.id,'fecha',a.fecha,'supervisor',a.supervisor,'finca',a.finca,
                   'lote',a.lote,'modulo',a.modulo,'tiempo_riego',a.tiempo_riego,
                   'volumen_riego',a.volumen_riego,
                   'created_at',DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i:%s')), NOW()
FROM z_riego a
WHERE @ejecutar = 1
  AND a.fecha BETWEEN @fecha_desde AND @fecha_hasta AND a.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR a.finca = @finca_id)
  AND a.id > (SELECT MIN(b.id) FROM z_riego b
               WHERE b.supervisor=a.supervisor AND b.fecha=a.fecha AND b.hora=a.hora AND b.finca=a.finca
                 AND b.codigo_tarea=a.codigo_tarea AND b.codigo_subtarea=a.codigo_subtarea
                 AND b.lote=a.lote AND b.modulo=a.modulo AND b.tiempo_riego=a.tiempo_riego
                 AND b.volumen_riego=a.volumen_riego
                 AND COALESCE(b.observaciones,'') = COALESCE(a.observaciones,''))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_riego'
                    AND d.id_origen=a.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'));

INSERT INTO lfp_riego (guid, fecha_proceso, finca_id, supervisor_id, lote_id, modulo_id, subtarea_id,
                       tiempo_riego_min, volumen_riego, observaciones,
                       created_at_device, received_at_server, origen)
SELECT mig_guid(CONCAT('z_riego:',g.id)),
       CASE WHEN DATE(g.created_at) = g.fecha
            THEN STR_TO_DATE(CONCAT(g.fecha,' ',TIME(g.created_at)),'%Y-%m-%d %H:%i:%s')
            ELSE STR_TO_DATE(CONCAT(g.fecha,' 00:00:00'),'%Y-%m-%d %H:%i:%s') END,
       g.finca, g.supervisor, g.lote, CAST(g.modulo AS UNSIGNED), NULL,
       CASE WHEN g.tiempo_riego REGEXP '^[0-9]{1,2}:[0-9]{2}$'
            THEN SUBSTRING_INDEX(g.tiempo_riego,':',1)*60 + SUBSTRING_INDEX(g.tiempo_riego,':',-1)
            ELSE NULL END,
       g.volumen_riego, NULLIF(LEFT(g.observaciones,500),''), g.created_at, NOW(), 'migracion'
FROM z_riego g
WHERE @ejecutar = 1
  AND g.fecha BETWEEN @fecha_desde AND @fecha_hasta AND g.fecha REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND (@finca_id IS NULL OR g.finca = @finca_id)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_riego'
                    AND d.id_origen=g.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'))
  AND NOT EXISTS (SELECT 1 FROM lfp_riego r WHERE r.guid = mig_guid(CONCAT('z_riego:',g.id)));

-- ---------------------------------------------------------------------------
-- REPORTE: lo que paso en ESTA corrida
-- ---------------------------------------------------------------------------
SELECT 'lfp_am nuevas (programacion)'      AS concepto, COUNT(*) AS filas FROM lfp_am
 WHERE received_at_server >= @inicio AND origen = 'migracion'
UNION ALL
SELECT 'lfp_am nuevas deducidas de un PM (mig-pm)', COUNT(*) FROM lfp_am
 WHERE received_at_server >= @inicio AND origen = 'mig-pm'
UNION ALL
SELECT 'lfp_am existentes cerradas por un PM', COUNT(*) FROM lfp_am
 WHERE cierre_received_at >= @inicio AND cierre_origen = 'migracion' AND origen <> 'mig-pm'
   AND received_at_server < @inicio
UNION ALL
SELECT 'lfp_cosecha nuevas', COUNT(*) FROM lfp_cosecha
 WHERE received_at_server >= @inicio AND origen = 'migracion'
UNION ALL
SELECT 'lfp_riego nuevas', COUNT(*) FROM lfp_riego
 WHERE received_at_server >= @inicio AND origen = 'migracion';

SELECT tabla_origen, motivo, COUNT(*) AS filas
  FROM mig_descarte
 WHERE created_at >= @inicio
 GROUP BY tabla_origen, motivo
 ORDER BY tabla_origen, motivo;

-- Se van los auxiliares: las z_* quedan como estaban.
DROP TABLE IF EXISTS mig_pm_am;
DROP INDEX IF EXISTS ix_mig_am_dup    ON z_tabla_am;
DROP INDEX IF EXISTS ix_mig_pm_dup    ON z_tabla_pm;
DROP INDEX IF EXISTS ix_mig_cos_dup   ON z_cosecha_cacao;
DROP INDEX IF EXISTS ix_mig_riego_dup ON z_riego;
DROP FUNCTION IF EXISTS mig_guid;
