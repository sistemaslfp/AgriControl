-- ============================================================================
-- Migración 03 — TODO EL HISTÓRICO, ambas fincas.
--
-- Hasta el 2026-09-14 este archivo se llamaba `03-migracion-agosto.sql` y
-- llevaba `>= '2026-08-01'` escrito en veinte lugares. **Kevin, 2026-09-14:
-- se migra todo.** La ventana no era un parámetro -- se evaluó parametrizarla
-- el 2026-09-05 y se descartó--, así que sacarla fue quitar esas veinte
-- condiciones, no cambiar un número.
--
-- Consolidada el 2026-09-02: carga reg_am DIRECTAMENTE en su forma final
-- (una fila = una persona, con el cierre adentro). Producción nunca tuvo
-- reg_am_personal ni reg_pm, así que no pasa por ellas.
-- Idempotente: se puede correr N veces. La segunda vez no inserta nada.
-- Auditoría de todo lo descartado en mig_descarte (fila completa en payload).
-- No modifica NI UNA fila de las tablas z_*.
--
-- ---------------------------------------------------------------------------
-- LO QUE CAMBIA AL ABRIR LA VENTANA, MEDIDO ANTES DE ESCRIBIRLO
--
-- 1. LAS REFERENCIAS ROTAS DEJAN DE SER TEÓRICAS. Las FK de reg_am se
--    declararon a propósito, y contra el histórico completo **14.012 filas de
--    z_tabla_am (12,4 %) y 11.465 de z_tabla_pm (10,6 %) apuntan a un catálogo
--    que ya no existe**. Por año:
--
--      año    AM      con ref. rota        PM total 108.149, 11.465 rotas
--      2021   11.725   3.863  (32,9 %)
--      2022   18.292   8.220  (44,9 %)     El 86 % del daño es 2021-2022.
--      2023   18.636   1.494  ( 8,0 %)     La causa está en 02-tablas-v4.sql:
--      2024   27.705     431  ( 1,6 %)     Modulo.php borraba catálogos en
--      2025   28.128       1  ( 0,0 %)     duro con unset_delete(). Desde 2023
--      2026    8.924       3  ( 0,0 %)     se dejó de hacer y el daño se corta.
--
--    **Van a mig_descarte con motivo `referencia_rota` y NO entran**
--    (Kevin, 2026-09-14). La fila queda entera en el payload y en z_* no se
--    toca nada: ese histórico roto sigue visible en v3, que es donde siempre
--    estuvo.
--
-- 2. LOS AM ABIERTOS SE MIGRAN ABIERTOS. Son **7.780 en el histórico** (6,9 %)
--    y **no bloquean nada**: los dos únicos lugares donde V4 mira un AM abierto
--    están acotados AL DÍA -- `am_abiertos_get()` exige el parámetro `fecha` y
--    responde 400 sin él, y `sync_am_abierto()` filtra entre `00:00:00` y
--    `23:59:59` de esa misma fecha--. Un abierto de 2022 no puede estorbar una
--    captura de 2026. Y de la nómina ya quedan fuera solos:
--    `vw_reg_reporte_pago` lleva `WHERE cierre_guid IS NOT NULL`.
--    Un AM abierto NO es basura: es la evidencia de que la tarea se asignó y
--    nadie la cerró. Borrarla sería tirar justo el dato que reg_am guarda.
--
-- 3. LOS DUPLICADOS SON MUCHÍSIMOS MÁS QUE EN AGOSTO. En la ventana de agosto
--    eran 61 filas de AM; en el histórico completo son **15.924 filas
--    sobrantes en 6.822 grupos** (el 14 % de z_tabla_am). El mecanismo no
--    cambia -- 1.1a y 1.1b--, sólo deja de estar acotado.
--
-- 4. TRES FILAS CON LA FECHA EN OTRO FORMATO. `z_tabla_pm.fecha` tiene 1 fila
--    en 'DD-MM-YYYY' y `z_cosecha_cacao.fecha` 2 en 'MM/DD/YYYY', sobre
--    columnas VARCHAR. Las agarra la sección 0.0: sin eso, `STR_TO_DATE`
--    devuelve NULL y la fila entra con `fecha_proceso` inválida o revienta el
--    `STRICT_ALL_TABLES`.
-- ============================================================================

USE lfp_prodapp;
SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE';

-- ---------------------------------------------------------------------------
-- ÍNDICES DE APOYO, temporales. SE CREAN ACÁ Y SE BORRAN AL FINAL.
--
-- POR QUÉ: la deduplicación compara cada fila contra todas las demás de su
-- grupo con un `EXISTS` correlacionado. En la ventana de agosto eran 590 filas
-- y no se notaba; contra las 113.410 de `z_tabla_am` y las 108.149 de
-- `z_tabla_pm` **la migración no termina**: medido, 1.1b seguía corriendo a los
-- 19 minutos. Con estos índices el archivo entero corre en menos de un minuto.
--
-- Un índice NO modifica ni una fila, así que la promesa de arriba se mantiene;
-- igual se borran al final para que las tablas queden exactamente como estaban.
-- Si la migración se corta a la mitad, quedan colgados: son inofensivos y la
-- próxima corrida los reutiliza (`IF NOT EXISTS`).
--
-- OJO: hace falta el metadata lock de la tabla. Si una corrida anterior quedó
-- colgada, el CREATE INDEX espera para siempre sin decir por qué -- pasó, y se
-- ve con `SHOW PROCESSLIST`, no con un mensaje de error.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_mig_am_dup ON z_tabla_am
  (fecha, hora, finca, responsable_id, cultivo_id, lote_id, modulos, subtarea_id, personal_id, id);
CREATE INDEX IF NOT EXISTS ix_mig_pm_dup ON z_tabla_pm
  (finca, fecha, subtarea, trabajador, cantidad, hora_inicio, hora_cierre, id);
CREATE INDEX IF NOT EXISTS ix_mig_pm_match ON z_tabla_pm (trabajador, fecha, lote, subtarea);
-- Sobre reg_am, para el emparejamiento del cierre. Sin éste el optimizador
-- entra por `fk_am_lote` --sólo `lote_id`-- y el UPDATE de 1.3 no termina.

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

-- (El índice sobre reg_am se crea en 1.3, porque la tabla se llena recién ahí.)

-- ---------------------------------------------------------------------------
-- 0. Lo que NO puede entrar: fechas ilegibles y referencias rotas
--
-- Esta sección no existía cuando la migración era sólo agosto: en esa ventana
-- no había ni una fila con la fecha mal ni una referencia rota. Al abrir el
-- histórico aparecen 25.477 filas entre AM y PM, así que hay que marcarlas
-- ANTES de 1.1 para que todo lo que sigue las excluya sola.
--
-- Se marcan, no se borran. `mig_descarte` guarda la fila entera en `payload` y
-- las tablas z_* no se tocan.
-- ---------------------------------------------------------------------------

-- 0.0 — Fechas que STR_TO_DATE no puede leer.
-- `fecha` es VARCHAR en las cuatro tablas de origen y el formato NO es
-- uniforme: z_tabla_pm tiene 1 fila en 'DD-MM-YYYY' y z_cosecha_cacao 2 en
-- 'MM/DD/YYYY'. Son tres filas en todo el histórico, pero si no se sacan acá
-- `STR_TO_DATE` devuelve NULL y con STRICT_ALL_TABLES el INSERT muere sin
-- decir cuál fila fue.
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_tabla_am', a.id, 'fecha_ilegible', NULL,
       JSON_OBJECT('id',a.id,'fecha',a.fecha,'hora',a.hora), NOW()
FROM z_tabla_am a
WHERE a.fecha NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_am'
                    AND d.id_origen=a.id AND d.motivo='fecha_ilegible');

INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_tabla_pm', p.id, 'fecha_ilegible', NULL,
       JSON_OBJECT('id',p.id,'fecha',p.fecha,'hora_inicio',p.hora_inicio,'hora_cierre',p.hora_cierre), NOW()
FROM z_tabla_pm p
WHERE p.fecha NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm'
                    AND d.id_origen=p.id AND d.motivo='fecha_ilegible');

INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_cosecha_cacao', c.id, 'fecha_ilegible', NULL,
       JSON_OBJECT('id',c.id,'fecha',c.fecha), NOW()
FROM z_cosecha_cacao c
WHERE c.fecha NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo='fecha_ilegible');

INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_riego', r.id, 'fecha_ilegible', NULL,
       JSON_OBJECT('id',r.id,'fecha',r.fecha), NOW()
FROM z_riego r
WHERE r.fecha NOT REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_riego'
                    AND d.id_origen=r.id AND d.motivo='fecha_ilegible');

-- 0.1 — AM que apunta a un catálogo borrado. No hay forma de que entre: la FK
-- lo rechaza y no se puede inventar a quién se refería.
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
WHERE (   NOT EXISTS (SELECT 1 FROM z_personal x WHERE x.id = a.personal_id)
       OR NOT EXISTS (SELECT 1 FROM z_personal x WHERE x.id = a.responsable_id)
       OR NOT EXISTS (SELECT 1 FROM z_subtarea x WHERE x.id = a.subtarea_id)
       OR NOT EXISTS (SELECT 1 FROM z_lote     x WHERE x.id = a.lote_id)
       OR NOT EXISTS (SELECT 1 FROM z_cultivo  x WHERE x.id = a.cultivo_id)
       OR NOT EXISTS (SELECT 1 FROM z_finca    x WHERE x.id = a.finca))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_am'
                    AND d.id_origen=a.id AND d.motivo='referencia_rota');

-- 0.2 — PM que apunta a un catálogo borrado.
--
-- OJO CON EL RESPONSABLE, QUE ES LA EXCEPCIÓN: 2.165 filas de z_tabla_pm
-- tienen SÓLO `responsable` roto y todo lo demás bueno. Descartarlas de plano
-- sería tirar 2.165 cierres reales --trabajo hecho y pagado-- porque no
-- sabemos quién los firmó. Como `reg_am.responsable_cierre_id` admite NULL y
-- `vw_reg_reporte_pago` ya hace `COALESCE(responsable_cierre_id,
-- responsable_id)`, se marcan aparte con `responsable_cierre_desconocido`, que
-- NO es un descarte sino una anotación: 1.3 la tolera --el cierre entra con el
-- responsable en NULL-- y 1.4 la excluye, porque sin responsable no se puede
-- deducir un AM (`reg_am.responsable_id` es NOT NULL).
--
-- **CON ESTOS DATOS NO SALVA NINGUNO, Y ESO ESTÁ MEDIDO.** De las 2.165, a
-- **2.066 el AM también se les descartó** --es la misma persona borrada, que
-- rompía las dos filas-- y **99 no tienen AM en z_tabla_am**. Cero tienen un
-- AM migrable que cerrar. El mecanismo se deja igual porque la lógica es
-- correcta y cuesta nada: si mañana aparece un PM con sólo el responsable roto
-- y su AM sano, el cierre entra en vez de perderse. Lo que NO hay que hacer es
-- leer este bloque y creer que hoy rescata 2.165 filas.
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
WHERE (   NOT EXISTS (SELECT 1 FROM z_personal x WHERE x.id = p.trabajador)
       OR NOT EXISTS (SELECT 1 FROM z_subtarea x WHERE x.id = p.subtarea)
       OR NOT EXISTS (SELECT 1 FROM z_lote     x WHERE x.id = p.lote)
       OR NOT EXISTS (SELECT 1 FROM z_cultivo  x WHERE x.id = p.cultivo)
       OR NOT EXISTS (SELECT 1 FROM z_finca    x WHERE x.id = p.finca))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm'
                    AND d.id_origen=p.id AND d.motivo='referencia_rota');

-- 0.3 — Anotación, no descarte: el responsable del cierre ya no existe.
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_tabla_pm', p.id, 'responsable_cierre_desconocido', NULL,
       JSON_OBJECT('id',p.id,'fecha',p.fecha,'responsable',p.responsable,'trabajador',p.trabajador), NOW()
FROM z_tabla_pm p
WHERE NOT EXISTS (SELECT 1 FROM z_personal x WHERE x.id = p.responsable)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm'
                    AND d.id_origen=p.id AND d.motivo='referencia_rota')
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_pm'
                    AND d.id_origen=p.id AND d.motivo='responsable_cierre_desconocido');

-- 0.4 — Cosecha y riego que apuntan a un catálogo borrado.
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_riego', r.id, 'referencia_rota', NULL,
       JSON_OBJECT('id',r.id,'fecha',r.fecha,'finca',r.finca,'supervisor',r.supervisor,
                   'lote',r.lote,'modulo',r.modulo), NOW()
FROM z_riego r
WHERE (   NOT EXISTS (SELECT 1 FROM z_finca    x WHERE x.id = r.finca)
       OR NOT EXISTS (SELECT 1 FROM z_personal x WHERE x.id = r.supervisor)
       OR NOT EXISTS (SELECT 1 FROM z_lote     x WHERE x.id = r.lote)
       OR (r.modulo IS NOT NULL AND r.modulo <> 0
           AND NOT EXISTS (SELECT 1 FROM z_modulo x WHERE x.id = r.modulo)))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_riego'
                    AND d.id_origen=r.id AND d.motivo='referencia_rota');

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
WHERE 1 = 1
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
WHERE 1 = 1
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
        FROM z_tabla_am zz
       -- El MIN(id) del grupo es el que da el `captura_guid`. Si una fila
       -- descartada fuera la menor, TODAS las personas de esa captura
       -- quedarían agrupadas bajo el guid de una fila que no existe en reg_am.
       WHERE NOT EXISTS (SELECT 1 FROM mig_descarte d
                          WHERE d.tabla_origen='z_tabla_am' AND d.id_origen=zz.id
                            AND d.motivo IN ('referencia_rota','fecha_ilegible'))
       GROUP BY fecha, hora, finca, responsable_id, cultivo_id, lote_id, modulos, subtarea_id
    ) g
      ON  g.fecha = a.fecha AND g.hora = a.hora AND g.finca = a.finca
      AND g.responsable_id = a.responsable_id AND g.cultivo_id = a.cultivo_id
      AND g.lote_id = a.lote_id AND g.modulos <=> a.modulos AND g.subtarea_id = a.subtarea_id
   WHERE 1 = 1
     AND a.finca IS NOT NULL AND a.responsable_id IS NOT NULL AND a.cultivo_id IS NOT NULL
     AND a.lote_id IS NOT NULL AND a.subtarea_id IS NOT NULL AND a.personal_id IS NOT NULL
     -- fuera los duplicados auditados en 1.1b y lo marcado en la seccion 0
     AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_tabla_am'
                       AND d.id_origen=a.id
                       AND d.motivo IN ('duplicado_cabecera_persona','referencia_rota','fecha_ilegible'))
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
-- EL EMPAREJAMIENTO SE RESUELVE PRIMERO, EN UNA TABLA APARTE. En la ventana
-- de agosto el UPDATE directo alcanzaba; contra el histórico **revienta con
-- `Duplicate entry ... for key 'uq_am_cierre_guid'`**, y el motivo es de los
-- datos, no del SQL: la clave (trabajador, fecha, lote, subtarea) NO lleva la
-- hora --a propósito, porque z_tabla_pm.hora_inicio casi nunca coincide con
-- z_tabla_am.hora--, así que una persona con la misma tarea dos veces el mismo
-- día da varios candidatos para un mismo avance. Medido: **682 grupos / 1.381
-- filas de reg_am ambiguas, y 798 filas de z_tabla_pm que matchean más de un
-- AM**. Un UPDATE con JOIN escribiría el mismo `cierre_guid` en dos filas.
--
-- Se resuelve con dos restricciones de la tabla puente:
--   * PRIMARY KEY (pm_id)  -> un avance cierra UNA sola tarea
--   * UNIQUE     (am_id)   -> una tarea la cierra UN solo avance
-- y `INSERT IGNORE`, que con el ORDER BY hace la elección determinista: gana
-- el avance de id menor, y se queda con la tarea abierta de id menor.
--
-- El avance que pierde la pulseada NO se pierde: como no queda aplicado en
-- ningún lado, la sección 1.4 le arma su propia fila con origen 'mig-pm'.
CREATE INDEX IF NOT EXISTS ix_mig_regam_match ON reg_am (personal_id, lote_id, subtarea_id, fecha_proceso);

DROP TABLE IF EXISTS mig_pm_am;
CREATE TABLE mig_pm_am (
  pm_id INT NOT NULL PRIMARY KEY,
  am_id INT NOT NULL,
  UNIQUE KEY uq_mig_pm_am (am_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

INSERT IGNORE INTO mig_pm_am (pm_id, am_id)
SELECT p.id, MIN(n.id)
  FROM z_tabla_pm p
  JOIN reg_am n
    ON  n.personal_id = p.trabajador
    AND DATE(n.fecha_proceso) = p.fecha
    AND n.lote_id     = p.lote
    AND n.subtarea_id = p.subtarea
 WHERE n.cierre_guid IS NULL
   -- Sólo los motivos que DESCARTAN. `responsable_cierre_desconocido` es una
   -- anotación y no saca la fila: ver 0.3 y el COALESCE de más abajo.
   AND NOT EXISTS (SELECT 1 FROM mig_descarte d
                    WHERE d.tabla_origen='z_tabla_pm' AND d.id_origen=p.id
                      AND d.motivo IN ('duplicado_60s','referencia_rota','fecha_ilegible'))
   -- ESTO ES LO QUE HACE IDEMPOTENTE A 1.3, y no es obvio: en la segunda
   -- corrida la tarea que este avance cerró ya NO está abierta, así que el
   -- emparejamiento le buscaría OTRA candidata y trataría de escribirle el
   -- mismo `cierre_guid` -- `Duplicate entry ... for key 'uq_am_cierre_guid'`.
   -- Un avance ya aplicado no vuelve a emparejarse con nada.
   AND NOT EXISTS (
         SELECT 1 FROM reg_am r
          WHERE r.cierre_guid = LOWER(CONCAT(
                  SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),9,4),
                  '-5',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),18,3),
                  '-',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),21,12))))
 GROUP BY p.id
 ORDER BY p.id;

UPDATE reg_am n
  JOIN mig_pm_am   m ON m.am_id = n.id
  JOIN z_tabla_pm  p ON p.id    = m.pm_id
   SET n.cantidad                 = p.cantidad,
       n.hora_cierre              = STR_TO_DATE(CONCAT(p.fecha,' ',p.hora_cierre),'%Y-%m-%d %H:%i'),
       n.comentario_cierre        = NULLIF(p.comentario,''),
       -- NULL cuando el responsable ya no existe (2.165 filas del histórico):
       -- la FK lo rechazaría, y el cierre en sí es un dato real que no se
       -- tira por eso. `vw_reg_reporte_pago` cae al responsable de la mañana.
       n.responsable_cierre_id    = (SELECT x.id FROM z_personal x WHERE x.id = p.responsable),
       n.cierre_guid              = LOWER(CONCAT(SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),9,4),
                                      '-5',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),18,3),
                                      '-',SUBSTR(MD5(CONCAT('z_tabla_pm:',p.id)),21,12))),
       -- Dos filas del histórico traen '0000-00-00 00:00:00', que con
       -- NO_ZERO_DATE es un error y no un cero. La columna admite NULL.
       n.cierre_created_at_device = NULLIF(CAST(p.fecha_registro AS CHAR), '0000-00-00 00:00:00'),
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
         p.cantidad, NULLIF(p.comentario,'') AS comentario_cierre,
         NULLIF(CAST(p.fecha_registro AS CHAR), '0000-00-00 00:00:00') AS fecha_registro
    FROM z_tabla_pm p
   WHERE 1 = 1
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

-- 2.0 — Duplicados exactos de z_cosecha_cacao. Se marcan ANTES de cualquier
-- otra cosa de esta seccion: la cosecha se agrupa por AM y se SUMA, asi que un
-- reenvio duplicado no infla una lista, infla el peso. Y desde V4 el peso ES la
-- cantidad que se paga (sync_cosecha), o sea que un saco cargado dos veces
-- pagaria dos veces.
--
-- La clave es TODA la fila menos id y created_at, sacos individuales incluidos:
-- nunca se colapsan dos filas que difieran en un dato. En la ventana de agosto
-- son 9 pares byte a byte (4 del 08-03 que entran a reg_cosecha y 5 del 08-26),
-- y da lo mismo con o sin los 15 sacos en la clave. Ojo con el trabajador 738:
-- tiene DOS registros legitimos distintos ese dia (58,00 en el modulo 6 y 65,00
-- en el 1), cada uno con su duplicado -- por eso `modulo` va en la clave.
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
WHERE 1 = 1
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
                   'total_sacos',c.total_sacos,'total_peso',c.total_peso,'reg_am_id',a.id), NOW()
FROM z_cosecha_cacao c
JOIN reg_am a ON a.personal_id = c.trabajador AND a.subtarea_id = c.subtarea
             AND DATE(a.fecha_proceso) = CONVERT(c.fecha USING utf8mb4)
WHERE a.cierre_guid IS NULL
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'))
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
WHERE a.cierre_guid IS NOT NULL
  AND ABS(a.cantidad - c.total_peso) >= 0.01
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo='cosecha_total_no_cuadra');

-- El guid es el del cierre: una cosecha ES el cierre de esa tarea. Así el
-- invariante `reg_cosecha.guid = reg_am.cierre_guid` vale también para lo
-- migrado, y no hace falta inventar un guid nuevo.
--
-- Se AGRUPA por AM. Hasta el 2026-09-05 el comentario decía que las 8 tareas
-- con más de una fila eran «la misma persona pesando en dos tandas»: era falso,
-- las 8 eran reenvíos byte a byte y ya salen por 2.0. Deduplicado, NINGÚN AM
-- cerrado tiene dos filas. El GROUP BY se queda igual porque el caso legítimo
-- existe y está a la vista: el trabajador 738 el 26-08 pesó en el módulo 6
-- (58,00) y en el 1 (65,00) bajo el mismo AM — hoy no entra porque ese AM quedó
-- abierto, pero el día que entre hay que sumarlo, no elegir uno.
INSERT INTO reg_cosecha (guid, reg_am_id, total_sacos, total_peso, observaciones,
                         created_at_device, received_at_server, origen)
SELECT a.cierre_guid, a.id, SUM(c.total_sacos), SUM(c.total_peso),
       NULLIF(LEFT(GROUP_CONCAT(NULLIF(c.observaciones,'') SEPARATOR ' | '),500),''),
       MIN(c.created_at), NOW(), 'migracion'
FROM z_cosecha_cacao c
JOIN reg_am a ON a.personal_id = c.trabajador AND a.subtarea_id = c.subtarea
             AND DATE(a.fecha_proceso) = CONVERT(c.fecha USING utf8mb4)
WHERE a.cierre_guid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'))
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
WHERE 1 = 1
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_cosecha_cacao'
                    AND d.id_origen=c.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'))
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
--
-- 3.0 — Duplicados exactos. En la ventana de agosto son 173 de 279 filas, y
-- **todas del 2026-08-19**: ese dia tiene 200 filas para 27 combinaciones
-- distintas de (lote, modulo, tiempo), o sea la misma tanda reenviada once
-- veces. Los otros cuatro dias no tienen un solo duplicado (18, 22, 20 y 19
-- filas, todas unicas). Diecisiete horas de riego en un dia sobre el mismo
-- modulo no existen: es la cola de la app vieja reintentando sin idempotencia,
-- que es justo lo que el guid de V4 viene a resolver.
--
-- La clave es toda la fila menos id y created_at. `created_at` NO entra: vale
-- 05:00:00 clavadas, es el sello del import, y meterlo dejaba pasar 9 filas
-- repetidas que solo se diferenciaban en el dia del sello.
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
WHERE 1 = 1
  AND a.id > (SELECT MIN(b.id) FROM z_riego b
               WHERE b.supervisor=a.supervisor AND b.fecha=a.fecha AND b.hora=a.hora AND b.finca=a.finca
                 AND b.codigo_tarea=a.codigo_tarea AND b.codigo_subtarea=a.codigo_subtarea
                 AND b.lote=a.lote AND b.modulo=a.modulo AND b.tiempo_riego=a.tiempo_riego
                 AND b.volumen_riego=a.volumen_riego
                 AND COALESCE(b.observaciones,'') = COALESCE(a.observaciones,''))
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_riego'
                    AND d.id_origen=a.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'));

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
WHERE 1 = 1
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_riego'
                    AND d.id_origen=g.id AND d.motivo IN ('duplicado_exacto','fecha_ilegible','referencia_rota'))
  AND NOT EXISTS (SELECT 1 FROM reg_riego r WHERE r.guid = LOWER(CONCAT(
        SUBSTR(MD5(CONCAT('z_riego:',g.id)),1,8),'-',SUBSTR(MD5(CONCAT('z_riego:',g.id)),9,4),
        '-5',SUBSTR(MD5(CONCAT('z_riego:',g.id)),14,3),'-a',SUBSTR(MD5(CONCAT('z_riego:',g.id)),18,3),
        '-',SUBSTR(MD5(CONCAT('z_riego:',g.id)),21,12))));

-- ---------------------------------------------------------------------------
-- 4. Postcosecha
-- ---------------------------------------------------------------------------
-- SÓLO entran las partidas cuyo peso está RESPALDADO por las cosechas que se
-- les pueden enlazar (Kevin, 2026-09-05). `pc_proceso.peso_lote` es, por
-- diseño, la suma congelada de `pc_proceso_cosecha`; una partida sin enlaces
-- traería un peso que no sale de ningún lado y que nadie puede recalcular.
--
-- En la ventana son 2 de 4: las del 18-08 (10 cosechas, 4.829,60) y del 14-08
-- (1 cosecha, 420,00), las dos cerradas. Las otras dos —las que estaban en
-- curso el 27-08— se quedan afuera: sus cosechas del 26-08 cuelgan de AM que
-- V3 nunca cerró (migrarlas haría que V4 pague filas que V3 no paga) y las del
-- 27-08 no existen en la ventana. Se quedan enteras en z_* y la web las sigue
-- mostrando; nadie las va a cerrar desde la app nueva, y se aceptó.
--
-- El enlace partida <-> cosecha no existe como columna en el esquema viejo. Se
-- recupera por `created_at` idéntico al segundo entre z_postharvest_weight y
-- z_postharvest_lotsharvest, y se comprueba contra el peso: donde hay enlace,
-- el lot_weight coincide EXACTO con la suma de la cosecha de esa fecha.
--
-- Los hijos (etapas, calidades, fotos) entran por JOIN contra pc_proceso, así
-- que las partidas descartadas se llevan a los suyos sin regla aparte.

INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_postharvest_weight', w.id, 'sin_lote_de_cosecha_emparejable', NULL,
       JSON_OBJECT('lot_number',w.lot_number,'created_at',DATE_FORMAT(w.created_at,'%Y-%m-%d %H:%i:%s'),
                   'lot_weight',w.lot_weight), NOW()
FROM z_postharvest_weight w
WHERE 1 = 1
  AND NOT EXISTS (SELECT 1 FROM z_postharvest_lotsharvest h WHERE h.created_at = w.created_at)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_postharvest_weight'
                    AND d.id_origen=w.id AND d.motivo='sin_lote_de_cosecha_emparejable');

-- Partidas cuyo peso no se puede respaldar con cosechas migradas. Se anotan con
-- las dos cifras para que la revisión sea de un vistazo: lo que decía v3 y lo
-- que suman las cosechas que existen.
INSERT INTO mig_descarte (tabla_origen, id_origen, motivo, id_conservado, payload, created_at)
SELECT 'z_postharvest_weight', w.id, 'partida_sin_peso_respaldado', NULL,
       JSON_OBJECT('lot_number',w.lot_number,'lot_weight',w.lot_weight,
                   'cosechas_enlazables',(SELECT COUNT(*) FROM reg_cosecha rc JOIN reg_am ra ON ra.id = rc.reg_am_id
            WHERE DATE(ra.fecha_proceso) IN (SELECT h2.lot_date FROM z_postharvest_lotsharvest h2
                                              WHERE h2.created_at = w.created_at)),
                   'suma_cosechas',(SELECT COALESCE(SUM(rc.total_peso),0) FROM reg_cosecha rc JOIN reg_am ra ON ra.id = rc.reg_am_id
            WHERE DATE(ra.fecha_proceso) IN (SELECT h2.lot_date FROM z_postharvest_lotsharvest h2
                                              WHERE h2.created_at = w.created_at)),
                   'created_at',DATE_FORMAT(w.created_at,'%Y-%m-%d %H:%i:%s')), NOW()
FROM z_postharvest_weight w
WHERE 1 = 1
  AND EXISTS (SELECT 1 FROM z_postharvest_lotsharvest h WHERE h.created_at = w.created_at)
  AND ((SELECT COUNT(*) FROM reg_cosecha rc JOIN reg_am ra ON ra.id = rc.reg_am_id
            WHERE DATE(ra.fecha_proceso) IN (SELECT h2.lot_date FROM z_postharvest_lotsharvest h2
                                              WHERE h2.created_at = w.created_at)) = 0 OR ABS(w.lot_weight - (SELECT COALESCE(SUM(rc.total_peso),0) FROM reg_cosecha rc JOIN reg_am ra ON ra.id = rc.reg_am_id
            WHERE DATE(ra.fecha_proceso) IN (SELECT h2.lot_date FROM z_postharvest_lotsharvest h2
                                              WHERE h2.created_at = w.created_at))) >= 0.01)
  AND NOT EXISTS (SELECT 1 FROM mig_descarte d WHERE d.tabla_origen='z_postharvest_weight'
                    AND d.id_origen=w.id AND d.motivo='partida_sin_peso_respaldado');

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
  WHERE 1 = 1
  GROUP BY w.lot_number, w.supervisor_id, w.lot_weight, w.container_weight, w.comments, w.created_at, r.output_weight
  -- El peso tiene que salir de las cosechas, no de v3. Va en HAVING y no en
  -- WHERE a propósito: así el ROW_NUMBER del `seq` sólo numera las que entran.
  HAVING (SELECT COUNT(*) FROM reg_cosecha rc JOIN reg_am ra ON ra.id = rc.reg_am_id
            WHERE DATE(ra.fecha_proceso) IN (SELECT h2.lot_date FROM z_postharvest_lotsharvest h2
                                              WHERE h2.created_at = w.created_at)) > 0
     AND ABS(w.lot_weight - (SELECT COALESCE(SUM(rc.total_peso),0) FROM reg_cosecha rc JOIN reg_am ra ON ra.id = rc.reg_am_id
            WHERE DATE(ra.fecha_proceso) IN (SELECT h2.lot_date FROM z_postharvest_lotsharvest h2
                                              WHERE h2.created_at = w.created_at))) < 0.01
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
WHERE 1 = 1;

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
JOIN z_postharvest_weight w ON w.lot_number = e.lot_id
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
JOIN z_postharvest_weight w ON w.lot_number = q.lot_id
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
JOIN z_postharvest_weight w ON w.lot_number = q.lot_id
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
JOIN z_postharvest_weight w ON w.lot_number = f.lot_id
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
--   z_cosecha_cacao    60 filas   ->  reg_cosecha 41, 201 sacos, 17.701,00 lb
--                                     (9 duplicados exactos + 10 sin cierre AM)
--   z_riego           279 filas   ->  reg_riego 106 (173 duplicados exactos,
--                                     todos del 2026-08-19)
--   z_postharvest_*     4 partidas->  pc_proceso 4, 25 enlaces de cosecha,
--                                     13 etapas, 1 calidad ferm., 1 secado, 4 fotos
--
--   Suma de total_peso de cosecha: 20.526,60 en origen = 20.526,60 en destino.
--   peso_lote de las 4 partidas = suma EXACTA de la cosecha enlazada, las 4.
--   lot_code generados: 2380126, 2300126, 2260126, 2390126.
--
-- mig_descarte queda con 359 filas: 173 duplicado_exacto (riego),
-- 103 duplicado_60s (PM), 61 duplicado_cabecera_persona (AM),
-- 10 cosecha_sin_cierre_am, 9 duplicado_exacto (cosecha) y
-- 3 cosecha_total_no_cuadra. Ninguna se pierde: la fila entera está en el
-- payload JSON.
--
-- LO QUE ESTE SCRIPT NO HACE Y HAY QUE SABER:
--  * `z_riego.hora` vale '0' en las 9.778 filas: la hora del día no existe en el
--    origen. Se usa la de created_at cuando cae el mismo día (35 de 279); el
--    resto queda a las 00:00.
--  * Los duplicados exactos de cosecha y riego se MARCAN y no se migran, pero
--    siguen enteros en z_*: no se borra nada del origen.
--  * El enlace partida <-> cosecha se reconstruye por created_at idéntico al
--    segundo. En la ventana de agosto empareja 4 de 4 y el peso cuadra exacto.
--    En el histórico completo empareja 100 de 102 y el peso cuadra en 77 —
--    por eso este script sólo se aplica a la ventana, no al histórico.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Se van los índices de apoyo: las z_* quedan como estaban antes de correr
-- este archivo.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS mig_pm_am;
DROP INDEX IF EXISTS ix_mig_regam_match ON reg_am;
DROP INDEX IF EXISTS ix_mig_am_dup   ON z_tabla_am;
DROP INDEX IF EXISTS ix_mig_pm_dup   ON z_tabla_pm;
DROP INDEX IF EXISTS ix_mig_pm_match ON z_tabla_pm;
