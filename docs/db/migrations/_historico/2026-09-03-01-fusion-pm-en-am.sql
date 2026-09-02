-- =========================================================================
-- Un registro = una PERSONA en una tarea, con su programacion y su cierre.
--
-- Decision de Kevin (2026-09-03), en dos pasos:
--   1. "PM se vuelve redundante si lo manejamos como un update para AM."
--   2. "Cada fila de AM va por persona; la acumulacion Personal(2,5,54) es
--      del front, no de la base."
--
-- Antes:  reg_am -- reg_am_personal (puente) -- reg_pm (+ reg_pm_modulo)
-- Ahora:  reg_am, y nada mas.
--
-- Es la forma de z_tabla_am, que tambien lleva un personal_id por fila. La
-- cabecera se repite por persona -- 49 copias en la tarea mas grande del
-- historico -- y eso esta bien: z_tabla_am hace exactamente eso con 113.410
-- filas y ocupa 8,7 MB.
--
-- Por que una FILA por persona y no una columna con comas, como si se hizo
-- con los modulos: los modulos son un conjunto sin atributos propios, y una
-- lista con comas guarda bien un conjunto. La persona, con el cierre adentro,
-- carga seis datos suyos -- avance, hora de cierre, comentario, quien cerro,
-- guid del cierre y fecha del cierre. En columnas con comas eso serian seis
-- listas alineadas por posicion: una coma dentro de un comentario desalinea
-- todo en silencio, y cerrar a UNA persona obliga a reescribir la cadena
-- entera, asi que dos equipos cerrando personas distintas de la misma tarea
-- se pisan y se pierde un avance. Con una fila por persona, nada de eso pasa:
-- son dos UPDATE a filas distintas.
--
-- La idempotencia del cierre vive EN LA FILA: `cierre_guid`. Mismo guid ->
-- duplicate; otro guid sobre una fila ya cerrada -> rejected; el AM todavia
-- no llego -> se omite de `results` y la cola reintenta. Las mismas garantias
-- que tenia el INSERT, que era mi objecion y quedo respondida.
--
-- Reemplaza a 2026-09-01-01-pm-cierra-am.sql y a la mitad de
-- 2026-09-02-01-modulos-clave-natural.sql. Las dos ya estaban aplicadas en
-- produccion: esta parte de ese estado. NO se borran del repositorio: una
-- migracion aplicada que se borra deja un esquema que nadie puede reproducir.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. La tabla nueva: una fila por persona, con programacion y cierre.
-- -------------------------------------------------------------------------
CREATE TABLE reg_am_nuevo (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  guid                CHAR(36)     NOT NULL,
  -- Comparten las N personas capturadas en la misma tarea. Sin esto no hay
  -- forma de saber que filas salieron del mismo formulario, que es lo que
  -- "Registros Enviados" necesita para mostrar una tarjeta y no cinco.
  captura_guid        CHAR(36)     NULL,

  -- --- la programacion de la manana (lo que era el AM) ---
  fecha_proceso       DATETIME     NOT NULL,
  finca_id            INT          NOT NULL,
  responsable_id      INT          NOT NULL,
  cultivo_id          INT          NOT NULL,
  lote_id             INT          NOT NULL,
  -- Lista de ids separada por comas, ordenada y sin repetidos. Es un conjunto
  -- sin atributos: una columna alcanza. Lo que sostiene su integridad es que
  -- ya no se pueden BORRAR modulos (Modulo.php) y que sync_am valida que cada
  -- uno pertenezca al lote declarado.
  modulos             VARCHAR(255) NULL,
  subtarea_id         INT          NOT NULL,
  personal_id         INT          NOT NULL,
  comentario          VARCHAR(255) NULL,
  device_alias        VARCHAR(50)  NULL,
  created_at_device   DATETIME     NULL,
  received_at_server  DATETIME     NOT NULL,
  device_clock_offset INT          NULL,
  origen              VARCHAR(10)  NOT NULL DEFAULT 'app',

  -- --- el cierre de la tarde (lo que era el PM) ---
  cantidad                 DECIMAL(9,3) NULL,
  hora_cierre              DATETIME     NULL,
  comentario_cierre        VARCHAR(255) NULL,
  responsable_cierre_id    INT          NULL,
  cierre_guid              CHAR(36)     NULL,
  cierre_device_alias      VARCHAR(50)  NULL,
  cierre_created_at_device DATETIME     NULL,
  cierre_received_at       DATETIME     NULL,
  cierre_offset            INT          NULL,
  cierre_origen            VARCHAR(10)  NULL,

  UNIQUE KEY uq_am_guid (guid),
  UNIQUE KEY uq_am_cierre_guid (cierre_guid),
  KEY idx_am_captura (captura_guid),
  -- "Que hay abierto hoy en esta finca": la consulta de la pantalla PM.
  KEY idx_am_abiertas (finca_id, fecha_proceso, cierre_guid),
  -- Reemplaza a idx_pm_semana, que los reportes de pago si usan.
  KEY idx_am_persona (personal_id, fecha_proceso, finca_id),
  KEY idx_am_natural (finca_id, fecha_proceso, subtarea_id),
  CONSTRAINT fk_amn_finca       FOREIGN KEY (finca_id)              REFERENCES z_finca(id),
  CONSTRAINT fk_amn_lote        FOREIGN KEY (lote_id)               REFERENCES z_lote(id),
  CONSTRAINT fk_amn_cultivo     FOREIGN KEY (cultivo_id)            REFERENCES z_cultivo(id),
  CONSTRAINT fk_amn_subtarea    FOREIGN KEY (subtarea_id)           REFERENCES z_subtarea(id),
  CONSTRAINT fk_amn_responsable FOREIGN KEY (responsable_id)        REFERENCES z_personal(id),
  CONSTRAINT fk_amn_personal    FOREIGN KEY (personal_id)           REFERENCES z_personal(id),
  CONSTRAINT fk_amn_resp_cierre FOREIGN KEY (responsable_cierre_id) REFERENCES z_personal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- -------------------------------------------------------------------------
-- 2. Aplanar: cada persona de cada AM pasa a ser su propia fila.
--
-- La primera persona de cada tarea CONSERVA el guid original. Solo las demas
-- reciben uno nuevo: si un telefono alguna vez reenvia ese guid, sigue siendo
-- idempotente contra la fila que le corresponde.
-- -------------------------------------------------------------------------
INSERT INTO reg_am_nuevo
  (guid, captura_guid, fecha_proceso, finca_id, responsable_id, cultivo_id,
   lote_id, modulos, subtarea_id, personal_id, comentario, device_alias,
   created_at_device, received_at_server, device_clock_offset, origen)
SELECT CASE WHEN ROW_NUMBER() OVER (PARTITION BY am.id ORDER BY ap.id) = 1
            THEN am.guid ELSE UUID() END,
       am.guid,
       am.fecha_proceso, am.finca_id, am.responsable_id, am.cultivo_id,
       am.lote_id,
       (SELECT GROUP_CONCAT(m.modulo_id ORDER BY m.modulo_id)
          FROM reg_am_modulo m WHERE m.am_id = am.id),
       am.subtarea_id, ap.personal_id, am.comentario, am.device_alias,
       am.created_at_device, am.received_at_server, am.device_clock_offset,
       am.origen
  FROM reg_am am
  JOIN reg_am_personal ap ON ap.am_id = am.id;

-- -------------------------------------------------------------------------
-- 3. Los cierres: de reg_pm a la fila de la persona.
-- -------------------------------------------------------------------------
UPDATE reg_am_nuevo n
  JOIN reg_pm p ON p.trabajador_id = n.personal_id
               AND p.fecha_proceso = DATE(n.fecha_proceso)
               AND p.lote_id       = n.lote_id
               AND p.subtarea_id   = n.subtarea_id
   SET n.cantidad                 = p.cantidad,
       n.hora_cierre              = p.hora_cierre,
       n.comentario_cierre        = p.comentario,
       n.responsable_cierre_id    = p.responsable_id,
       n.cierre_guid              = p.guid,
       n.cierre_device_alias      = p.device_alias,
       n.cierre_created_at_device = p.created_at_device,
       n.cierre_received_at       = p.received_at_server,
       n.cierre_offset            = p.device_clock_offset,
       n.cierre_origen            = p.origen;

-- -------------------------------------------------------------------------
-- 4. Los PM que no tienen programacion: se les crea la fila completa.
--
-- En V3 el PM era practicamente una copia del AM con mas datos, asi que la
-- programacion se reconstruye del propio avance. Quedan con origen 'mig-pm'
-- para que se sepa que la manana se dedujo, no se capturo.
-- -------------------------------------------------------------------------
INSERT INTO reg_am_nuevo
  (guid, captura_guid, fecha_proceso, finca_id, responsable_id, cultivo_id,
   lote_id, modulos, subtarea_id, personal_id, comentario,
   received_at_server, origen,
   cantidad, hora_cierre, comentario_cierre, responsable_cierre_id,
   cierre_guid, cierre_device_alias, cierre_created_at_device,
   cierre_received_at, cierre_offset, cierre_origen)
SELECT UUID(), NULL, p.hora_inicio, p.finca_id, p.responsable_id, p.cultivo_id,
       p.lote_id,
       (SELECT GROUP_CONCAT(m.modulo_id ORDER BY m.modulo_id)
          FROM reg_pm_modulo m WHERE m.pm_id = p.id),
       p.subtarea_id, p.trabajador_id,
       'Programacion deducida de un avance sin AM (migracion 2026-09-03)',
       p.received_at_server, 'mig-pm',
       p.cantidad, p.hora_cierre, p.comentario, p.responsable_id,
       p.guid, p.device_alias, p.created_at_device, p.received_at_server,
       p.device_clock_offset, p.origen
  FROM reg_pm p
 WHERE NOT EXISTS (SELECT 1 FROM reg_am_nuevo n WHERE n.cierre_guid = p.guid);

-- -------------------------------------------------------------------------
-- 5. Fuera lo viejo, entra lo nuevo.
-- -------------------------------------------------------------------------
DROP TABLE reg_pm_modulo;
DROP TABLE reg_pm;
DROP TABLE reg_am_modulo;
DROP TABLE reg_am_personal;
DROP TABLE reg_am;
RENAME TABLE reg_am_nuevo TO reg_am;

-- -------------------------------------------------------------------------
-- 6. Reporte de pago de v4.
--
-- Vista NUEVA y con nombre nuevo: vw_reporte_pago sigue existiendo y sigue
-- leyendo z_tabla_pm, porque los endpoints V3 y la web historica se quedan con
-- las tablas viejas hasta julio de 2026. Esta cubre desde agosto.
--
-- El ano y la semana salen con YEARWEEK/WEEK(...,3), que es el ISO. V3 los
-- guardaba calculados con 'Y'.'W' y por eso 181 filas del 29 al 31 de
-- diciembre de 2025 quedaron como (2025, semana 1). Aca no pueden quedar mal
-- guardados porque no se guardan: se derivan.
--
-- Sin DISTINCT a proposito: vw_reporte_pago lo necesita porque la app vieja
-- generaba filas repetidas; aca el guid es unico y un DISTINCT taparia un
-- duplicado real si algun dia aparece.
-- -------------------------------------------------------------------------
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
  JOIN z_personal res ON res.id = COALESCE(am.responsable_cierre_id, am.responsable_id)
  JOIN z_subtarea sub ON sub.id = am.subtarea_id
  JOIN z_finca    f   ON f.id   = am.finca_id
  JOIN z_lote     lot ON lot.id = am.lote_id
 -- Solo lo cerrado: una programacion sin avance no se paga.
 WHERE am.cierre_guid IS NOT NULL;
