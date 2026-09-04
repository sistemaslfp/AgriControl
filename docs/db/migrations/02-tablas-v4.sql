-- ---------------------------------------------------------------------------
-- Migración 02 — Tablas nuevas de la API V4
-- Referencia: MOBIL/02-bd-y-api.md §3. Paso 2 del orden de MOBIL/00-plan.md.
--
-- Consolidada el 2026-09-02: define reg_am DIRECTAMENTE en su forma final.
-- Producción nunca tuvo reg_am_personal, reg_pm, reg_am_modulo ni reg_pm_modulo,
-- así que no tiene por qué pasar por ellas. Los archivos que las creaban y las
-- deshacían están en _historico/ con su README.
--
-- ADITIVO Y AISLADO. No renombra, altera ni borra ninguna tabla z_*. La web y
-- V1/V2/V3 siguen leyendo y escribiendo exactamente lo mismo que antes.
--
-- Todo InnoDB + utf8mb4_spanish_ci. La razón no es estética: hoy conviven
-- utf8mb3_spanish2_ci y utf8mb3_general_ci en la misma base, y un JOIN entre
-- las dos familias YA FALLA. Comprobado el 2026-08-28 sobre datos reales:
--   SELECT ... FROM z_riego r JOIN z_subtarea s
--     ON s.codigo_subtarea = r.codigo_subtarea;
--   ERROR 1267: Illegal mix of collations
--     (utf8mb3_spanish2_ci,IMPLICIT) and (utf8mb3_general_ci,IMPLICIT)
--
-- Idempotente: CREATE TABLE IF NOT EXISTS. Correrlo dos veces no hace nada.
--
-- Aplicar en desarrollo:
--   docker compose exec -T mysql_dev_container mysql -uroot -proot_password lfp_prodapp \
--     < docs/db/migrations/02-tablas-v4.sql
--
-- ---------------------------------------------------------------------------
-- SOBRE LAS CLAVES FORÁNEAS HACIA LOS CATÁLOGOS
--
-- Se declaran a propósito (02-bd-y-api.md §2: "En V4 las FK se declaran").
-- Consecuencias medidas sobre los datos reales, para que nadie se sorprenda:
--
-- 1. HOY no cambian nada. Las tablas nacen vacías: ninguna fila de z_* queda
--    referenciada, así que la web puede seguir borrando catálogos como siempre.
--
-- 2. A FUTURO, cuando haya registros, la web no va a poder borrar en duro una
--    finca / lote / subtarea / persona que tenga registros V4 asociados.
--    Es el comportamiento buscado — protege el histórico — pero es un cambio
--    real y hay que saberlo antes de que aparezca como "error al eliminar".
--
-- 3. LA MIGRACIÓN DEL HISTÓRICO (paso 8) choca con estas FK. Conteo real de
--    referencias huérfanas al 2026-08-28:
--
--      año   AM: sin_personal  sin_subtarea  sin_lote | PM: sin_trab  sin_sub  sin_lote
--      2021          579           2564         418   |      531       2364      343
--      2022          743           3644        1164   |      585       3155      945
--      2023          475            759           0   |      301        706        0
--      2024          333             47           0   |      232         46        0
--      2025            1              0           0   |        0          0        0
--      2026            3              0           0   |        5          0        0
--
--    O sea: estas FK son compatibles con migrar "nada" o "el año en curso"
--    (pendiente #3 de 00-plan.md, opciones 1 y 2). Migrar TODO el histórico
--    exigiría resolver ~9.000 referencias rotas primero. El dato está acá para
--    que esa decisión se tome con el número a la vista, no de memoria.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- GUARDIÁN: aborta si la base ya tiene un reg_am de un esquema anterior.
--
-- Hace falta porque `docs/db/init/01-schema.sql` —el dump que se usa para
-- levantar una copia— NO está limpio: trae las 17 tablas v4 en su forma vieja,
-- vacías, porque se crearon a mano antes de esta consolidación. Y
-- `CREATE TABLE IF NOT EXISTS` las acepta EN SILENCIO: la migración parece
-- correr bien y deja un reg_am sin `personal_id`, sin `modulos` y sin los
-- `cierre_*`, que después falla en el INSERT de agosto con un mensaje que no
-- dice nada de esto.
--
-- Si aborta acá: la base viene de un dump viejo. Correr
-- `_historico/00-limpiar-intermedias.sql` para dejarla virgen, o pedir un dump
-- regenerado. En PRODUCCIÓN nunca puede saltar: no hay ninguna tabla reg_*.
--
-- Mira las tres tablas que el dump trae viejas (reg_am, reg_cosecha, reg_flag)
-- y las cuatro que ya no existen (reg_am_modulo, reg_am_personal, reg_pm,
-- reg_pm_modulo). Antes miraba solo reg_am, y por eso una reg_cosecha vieja
-- pasaba en silencio y recien explotaba al crear vw_reg_cosecha.
-- ---------------------------------------------------------------------------
-- Sin DELIMITER y sin BEGIN NOT ATOMIC: eso es sintaxis de MariaDB que
-- MySQL Workbench no parsea (error de sintaxis antes de mandar nada al
-- servidor). Esto usa solo SET + PREPARE, que entienden los dos.
--
-- El truco: si la base esta sucia, @guardian queda apuntando a una tabla que
-- no existe y el PREPARE muere con ERROR 1146 diciendo el nombre, que ES el
-- mensaje. Si esta limpia, prepara un 'SELECT 1' y sigue de largo.
SET @guardian := (
  SELECT IF(EXISTS (
           SELECT 1 FROM information_schema.tables t
            WHERE t.table_schema = DATABASE()
              AND ( (t.table_name = 'reg_am'      AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = DATABASE() AND c.table_name = 'reg_am'      AND c.column_name = 'cierre_guid'))
                 OR (t.table_name = 'reg_cosecha' AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = DATABASE() AND c.table_name = 'reg_cosecha' AND c.column_name = 'reg_am_id'))
                 OR (t.table_name = 'reg_flag'    AND NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema = DATABASE() AND c.table_name = 'reg_flag'    AND c.column_name = 'payload'))
                 OR  t.table_name IN ('reg_am_modulo','reg_am_personal','reg_pm','reg_pm_modulo') )),
         'SELECT * FROM ABORTADO_hay_tablas_v4_viejas_correr_historico_00_limpiar',
         'SELECT 1')
);
PREPARE guardian FROM @guardian;
DEALLOCATE PREPARE guardian;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================================
-- AM — la única tabla transaccional de campo diaria.
--
-- UNA FILA = UNA PERSONA EN UNA TAREA, con la programación de la mañana y el
-- cierre de la tarde juntos. Es la forma de z_tabla_am, que también lleva un
-- personal_id por fila.
--
-- No existe una tabla de PM: el cierre de la tarde es un UPDATE de esta misma
-- fila. Es idempotente porque el guid del cierre vive acá (`cierre_guid`), y
-- el UPDATE lleva `AND cierre_guid IS NULL`, así que es atómico sin
-- transacción. Mismo guid -> duplicate; otro guid sobre una fila ya cerrada
-- -> rejected; el AM todavía no llegó -> el guid se omite de `results` y la
-- cola del teléfono reintenta sola.
--
-- POR QUÉ LOS MÓDULOS SON UNA COLUMNA Y LAS PERSONAS SON FILAS. No es
-- inconsistencia: un módulo es un elemento de un conjunto sin atributos
-- propios, y una lista con comas guarda bien un conjunto. Una persona, con el
-- cierre adentro, carga seis datos suyos — avance, hora de cierre,
-- comentario, quién cerró, guid del cierre y fecha del cierre. En columnas
-- con comas eso serían seis listas alineadas por posición: una coma dentro de
-- un comentario desalinea todo en silencio, y cerrar a UNA persona obligaría
-- a reescribir la cadena entera, así que dos equipos cerrando personas
-- distintas de la misma tarea se pisan y se pierde un avance. Con una fila
-- por persona son dos UPDATE a filas distintas y no pasa nada.
--
-- El costo de repetir la cabecera está medido y es aceptable: el 27,5 % de
-- las capturas de agosto tienen más de una persona, con un máximo de 9;
-- z_tabla_am hace exactamente esto con 113.410 filas y ocupa 8,7 MB.
-- =========================================================================

CREATE TABLE IF NOT EXISTS reg_am (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  guid                CHAR(36)     NOT NULL,
  -- Lo comparten las N personas capturadas en el mismo formulario. Sin esto no
  -- hay forma de saber qué filas salieron de la misma captura, que es lo que
  -- la pantalla "Registros Enviados" necesita para mostrar una tarjeta y no
  -- cinco. NULL cuando la fila no vino de un formulario (ver origen).
  captura_guid        CHAR(36)     NULL,

  -- --- la programación de la mañana ---
  fecha_proceso       DATETIME     NOT NULL,
  finca_id            INT          NOT NULL,
  responsable_id      INT          NOT NULL,
  cultivo_id          INT          NOT NULL,
  lote_id             INT          NOT NULL,
  -- Lista de ids de z_modulo separada por comas, ordenada y sin repetidos
  -- ('3,8,25'). NULL si el lote no tiene módulos.
  --
  -- No hay FK que la cubra, y eso es deliberado. Lo que sostiene su integridad
  -- son dos cosas fuera de esta tabla:
  --   1. YA NO SE PUEDEN BORRAR MÓDULOS. Modulo.php llama unset_delete() sin
  --      condición de grupo; la baja se hace con `estado` = Inactivo. Ese
  --      borrado era la causa real de que 3.176 filas de z_tabla_am (2,80 %)
  --      apunten hoy a módulos inexistentes — un VARCHAR no pudo impedirlo,
  --      pero una tabla hija tampoco habría impedido el DELETE que las rompió.
  --   2. sync_am valida que cada módulo pertenezca al lote declarado
  --      (sync_modulo_de_lote), que es lo que cubre las otras 16 filas que
  --      apuntan a un módulo de otro lote.
  -- Queda resignado que un DELETE por SQL directo deje ids colgando. En este
  -- servidor eso no es teórico: hubo un Adminer expuesto por HTTP hasta el
  -- 2026-08-28.
  modulos             VARCHAR(255) NULL,
  subtarea_id         INT          NOT NULL,
  personal_id         INT          NOT NULL,
  comentario          VARCHAR(255) NULL,
  device_alias        VARCHAR(50)  NULL,
  created_at_device   DATETIME     NULL,
  received_at_server  DATETIME     NOT NULL,
  device_clock_offset INT          NULL,
  -- app | web | migracion | mig-pm
  origen              VARCHAR(10)  NOT NULL DEFAULT 'app',

  -- --- el cierre de la tarde (lo que en V3 era una fila de z_tabla_pm) ---
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
  -- UNIQUE, no KEY: una fila se cierra UNA sola vez, y el guid del cierre no
  -- se puede reutilizar en otra. InnoDB permite varios NULL en un índice
  -- único, así que las 55 filas abiertas de agosto no estorban.
  UNIQUE KEY uq_am_cierre_guid (cierre_guid),
  KEY idx_am_captura (captura_guid),
  -- "Qué hay abierto hoy en esta finca": la consulta de GET /v4/am_abiertos.
  KEY idx_am_abiertas (finca_id, fecha_proceso, cierre_guid),
  -- Reemplaza a idx_pm_semana, que los reportes de pago sí usan.
  KEY idx_am_persona (personal_id, fecha_proceso, finca_id),
  -- No único a propósito: la clave natural es índice de DETECCIÓN de posibles
  -- duplicados, no una restricción. El histórico repite la misma combinación
  -- hasta 37 veces.
  KEY idx_am_natural (finca_id, fecha_proceso, subtarea_id),
  CONSTRAINT fk_am_finca       FOREIGN KEY (finca_id)              REFERENCES z_finca(id),
  CONSTRAINT fk_am_lote        FOREIGN KEY (lote_id)               REFERENCES z_lote(id),
  CONSTRAINT fk_am_cultivo     FOREIGN KEY (cultivo_id)            REFERENCES z_cultivo(id),
  CONSTRAINT fk_am_subtarea    FOREIGN KEY (subtarea_id)           REFERENCES z_subtarea(id),
  CONSTRAINT fk_am_responsable FOREIGN KEY (responsable_id)        REFERENCES z_personal(id),
  CONSTRAINT fk_am_personal    FOREIGN KEY (personal_id)           REFERENCES z_personal(id),
  CONSTRAINT fk_am_resp_cierre FOREIGN KEY (responsable_cierre_id) REFERENCES z_personal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- RESTRICCIONES QUE ESTA TABLA NO PUEDE EXPRESAR, y que hoy tampoco valida el
-- servidor. Anotadas acá porque es donde se van a buscar (ver también
-- docs/context/99-riesgos.md):
--
--   * La finca de la PERSONA y la del RESPONSABLE no se comparan contra
--     finca_id. z_personal.id_finca existe. Hoy un responsable de Bellita
--     puede firmar un AM de Pacaritambo. En las 590 filas de agosto siempre
--     coincidió, pero eso es una medición, no una regla.
--   * La finca de la SUBTAREA tampoco. z_subtarea.id_finca existe y está
--     poblada (78 Bellita, 21 Pacaritambo); la app ya filtra por ella, el
--     servidor no.
-- Las dos son del mismo tipo que la validación módulo ∈ lote que sí existe:
-- la FK comprueba que el id exista, no que pertenezca a la finca correcta.

-- =========================================================================
-- COSECHA — el detalle de sacos de un AM ya programado
--
-- Cosecha NO crea tareas: CIERRA una tarea AM, igual que el PM. Todas las
-- tareas viven en reg_am; cosecha solo elige una de las que tienen tarea
-- "Cosecha" y le carga los sacos de cada persona. Por eso esta tabla no
-- repite finca, supervisor, subtarea, trabajador, lote, modulo ni fecha: todo
-- eso ES el AM, y el telefono no puede contradecirlo.
--
-- LA SUMA DE LAS LIBRAS ES EL AVANCE DE LA TAREA: sync_cosecha escribe
-- `reg_am.cantidad` con `total_peso`. Medido sobre el historico: de 14.466
-- pares (PM de cosecha, fila de z_cosecha_cacao) del mismo dia, trabajador y
-- subtarea, **13.835 tienen pm.cantidad = total_peso (95,6 %) y NINGUNO
-- coincide con el conteo de sacos**. La unidad de labor de esas subtareas es
-- Libra, no Saco.
-- =========================================================================

CREATE TABLE IF NOT EXISTS reg_cosecha (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  -- Es el mismo guid que queda en reg_am.cierre_guid: una cosecha ES el
  -- cierre de esa tarea, no un registro aparte que ademas la cierra.
  guid                CHAR(36)      NOT NULL,
  reg_am_id           INT           NOT NULL,
  -- Derivados de reg_cosecha_saco. El telefono los manda para comparar; si no
  -- cuadran gana el servidor y queda una marca `error` en reg_flag.
  total_sacos         SMALLINT      NOT NULL DEFAULT 0,
  total_peso          DECIMAL(11,2) NOT NULL DEFAULT 0,
  observaciones       VARCHAR(500)  NULL,
  device_alias        VARCHAR(50)   NULL,
  created_at_device   DATETIME      NULL,
  received_at_server  DATETIME      NOT NULL,
  device_clock_offset INT           NULL,
  origen              VARCHAR(10)   NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_cosecha_guid (guid),
  -- Una tarea AM se cosecha UNA vez. Es el mismo invariante que
  -- `cierre_guid IS NULL` sostiene del otro lado.
  UNIQUE KEY uq_cosecha_am (reg_am_id),
  CONSTRAINT fk_cosecha_am FOREIGN KEY (reg_am_id) REFERENCES reg_am(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Se acabo el techo de 15 sacos de z_cosecha_cacao.saco1..saco15.
CREATE TABLE IF NOT EXISTS reg_cosecha_saco (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  cosecha_id INT          NOT NULL,
  numero     SMALLINT     NOT NULL,
  libras     DECIMAL(9,2) NOT NULL,
  UNIQUE KEY uq_saco (cosecha_id, numero),
  CONSTRAINT fk_saco_cosecha FOREIGN KEY (cosecha_id) REFERENCES reg_cosecha(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- =========================================================================
-- RIEGO — bitacora propia, NO cuelga de una tarea AM
--
-- Decision de Kevin (2026-09-03): el supervisor entrega su parte de riego y se
-- registra tal cual. Por eso esta tabla conserva finca_id, supervisor_id,
-- lote_id y modulo_id PROPIOS: no es una copia del AM, es su unica fuente.
--
-- Las tareas de riego del AM si se cierran con PM, y no se contradice: el
-- AM/PM paga el JORNAL de la persona (las 7 subtareas de la tarea Riego son en
-- Jornal, 10.639 AM y 9.246 PM en el historico) y esta tabla registra el AGUA
-- (9.778 filas en z_riego). Riego no entra en tarea_cosecha_ids ni en
-- tarea_poscosecha_ids.
--
-- Los dos lados NO tienen enlace entre si. Es un hueco conocido y sin
-- dimensionar; se deja asi a proposito.
--
-- 02-bd-y-api.md la dejaba "para el final, con las capturas". Las capturas
-- definen la PANTALLA, no la tabla, así que la tabla se crea ahora y nace
-- vacía. Modelada sobre lo que z_riego tiene DE VERDAD (9.778 filas,
-- 2023-11-27 a 2026-08-20), no sobre lo que declara:
--
--   * `modulo VARCHAR(50)`: cero filas con coma. Nunca fue CSV, siempre un
--     módulo. Por eso acá es modulo_id y NO una tabla hija como en AM/PM.
--     Las 9.778 filas resuelven contra z_modulo.
--   * `codigo_tarea` y `codigo_subtarea`: valen '0' en las 9.778 filas. Están
--     muertos. subtarea_id queda NULLABLE por si la pantalla nueva los usa;
--     no se fuerza un dato que la operación nunca cargó.
--   * `tiempo_riego VARCHAR(5)` guarda duración "HH:MM" (01:00, 01:30, 00:45).
--     Pasa a minutos enteros: sumar y comparar duraciones como texto es el
--     mismo defecto que fecha VARCHAR(10).
-- =========================================================================

CREATE TABLE IF NOT EXISTS reg_riego (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  guid                CHAR(36)         NOT NULL,
  fecha_proceso       DATETIME         NOT NULL,
  finca_id            INT              NOT NULL,
  supervisor_id       INT              NOT NULL,
  lote_id             INT              NOT NULL,
  modulo_id           INT              NULL,
  subtarea_id         INT              NULL,
  tiempo_riego_min    SMALLINT UNSIGNED NULL,   -- duración en minutos
  volumen_riego       DECIMAL(9,3)     NOT NULL DEFAULT 0,
  observaciones       VARCHAR(500)     NULL,    -- el máximo real hoy es 140
  device_alias        VARCHAR(50)      NULL,
  created_at_device   DATETIME         NULL,
  received_at_server  DATETIME         NOT NULL,
  device_clock_offset INT              NULL,
  origen              VARCHAR(10)      NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_riego_guid (guid),
  KEY idx_riego_natural (finca_id, fecha_proceso, lote_id),
  CONSTRAINT fk_rie_finca      FOREIGN KEY (finca_id)      REFERENCES z_finca(id),
  CONSTRAINT fk_rie_lote       FOREIGN KEY (lote_id)       REFERENCES z_lote(id),
  CONSTRAINT fk_rie_modulo     FOREIGN KEY (modulo_id)     REFERENCES z_modulo(id),
  CONSTRAINT fk_rie_subtarea   FOREIGN KEY (subtarea_id)   REFERENCES z_subtarea(id),
  CONSTRAINT fk_rie_supervisor FOREIGN KEY (supervisor_id) REFERENCES z_personal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- =========================================================================
-- POSTCOSECHA
--
-- Nombres revisados el 2026-08-28 tras analizar el flujo real. "Lote" en este
-- sistema significa DOS cosas distintas: una parcela de terreno (z_lote,
-- maestra, 14 filas) y una partida de cacao en proceso. Se llamaba pc_lote y
-- se confundía con la primera. La partida es `pc_proceso`: una corrida del
-- proceso de postcosecha, con sus etapas. `lot_code` sigue siendo la etiqueta
-- que ve la gente.
--
-- FLUJO REAL, medido sobre z_postharvest_* el 2026-08-28:
--   1. La cosecha del día entra en N registros de cosecha.
--   2. Se agrupa POR FECHA y se suma el peso -> "lotes pendientes".
--   3. El supervisor elige 1..N fechas, pesa, y arranca una partida.
--      De 83 partidas históricas: 75 consumieron 1 fecha, 4 dos, 2 tres,
--      1 cuatro y 1 cinco. Las fechas NO son necesariamente consecutivas.
--   4. La partida pasa por 5 etapas y acumula calidad y fotos.
--
-- HUECO QUE ESTO CIERRA: hoy NADA registra qué cosechas entraron en qué
-- partida. z_postharvest_weight.lot_number (456..461) y
-- z_postharvest_lotsharvest.id (92..99) no se cruzan en una sola fila; el
-- vínculo sólo se puede inferir por cercanía de created_at. Eso es
-- pc_proceso_cosecha.
-- =========================================================================

CREATE TABLE IF NOT EXISTS pc_proceso (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  guid                CHAR(36)     NOT NULL,
  lot_code            CHAR(7)      NOT NULL,   -- dddnnaa, lo asigna el servidor
  -- La fecha que NOMBRA la partida: de acá salen ddd y aa del lot_code.
  -- La elige el servidor (la menor de las cosechas enlazadas), no el usuario.
  -- Con partidas multi-fecha hay que elegir una, y esa elección queda escrita.
  fecha_cosecha       DATE         NOT NULL,
  fecha_inicio        DATETIME     NOT NULL,   -- cuándo arrancó el proceso (el pesaje)
  supervisor_id       INT          NOT NULL,   -- el de postcosecha, distinto del de cosecha
  -- CALCULADO Y CONGELADO POR EL SERVIDOR: suma del peso de las cosechas
  -- enlazadas en pc_proceso_cosecha, al momento de crear la partida. El
  -- teléfono NO lo manda. Verificado: en el histórico, 76 de 94 partidas
  -- tienen un peso idéntico a la suma de la cosecha de su fecha.
  -- Se congela a propósito: una cosecha que llegue tarde para una fecha ya
  -- consumida no debe cambiar el peso de una partida cerrada.
  peso_lote           DECIMAL(9,3) NOT NULL,
  -- Medición propia, NO derivable: 0 de 94 coinciden con suma alguna de
  -- cosecha, y van de 10,65 a 283,29 lb.
  peso_mallas         DECIMAL(9,3) NOT NULL,
  peso_baba           DECIMAL(9,3) AS (peso_lote - peso_mallas) STORED,
  peso_final          DECIMAL(9,3) NULL,       -- resultado, al cerrar el proceso
  comentario          VARCHAR(255) NULL,
  device_alias        VARCHAR(50)  NULL,
  created_at_device   DATETIME     NULL,
  received_at_server  DATETIME     NOT NULL,
  device_clock_offset INT          NULL,
  origen              VARCHAR(10)  NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_pc_guid (guid),
  UNIQUE KEY uq_pc_code (lot_code),
  KEY idx_pc_fecha (fecha_cosecha),
  CONSTRAINT fk_pc_supervisor FOREIGN KEY (supervisor_id) REFERENCES z_personal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Qué cosechas entraron en la partida. Apunta al REGISTRO de cosecha, no a la
-- fecha: así una cosecha que llega tarde para una fecha ya consumida se
-- distingue en vez de confundirse con las que sí entraron.
CREATE TABLE IF NOT EXISTS pc_proceso_cosecha (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  pc_proceso_id INT NOT NULL,
  cosecha_id    INT NOT NULL,
  UNIQUE KEY uq_pc_cosecha (pc_proceso_id, cosecha_id),
  -- Una cosecha no puede entrar en dos partidas.
  UNIQUE KEY uq_cosecha_una_sola_vez (cosecha_id),
  CONSTRAINT fk_pcc_proceso FOREIGN KEY (pc_proceso_id) REFERENCES pc_proceso(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcc_cosecha FOREIGN KEY (cosecha_id)    REFERENCES reg_cosecha(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Una fila por etapa, en lugar de las cinco tablas casi idénticas de hoy
-- (_predrying, _fermentation, _sundrying, _machinedrying, _result). Agregar
-- una etapa deja de ser un CREATE TABLE.
CREATE TABLE IF NOT EXISTS pc_etapa (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  guid               CHAR(36)     NOT NULL,
  pc_proceso_id      INT          NOT NULL,
  etapa              VARCHAR(20)  NOT NULL,  -- presecado|fermentado|secado_sol|secado_maq|resultado
  orden              TINYINT      NOT NULL,
  inicio             DATETIME     NOT NULL,
  fin                DATETIME     NULL,
  comentario         VARCHAR(255) NULL,
  received_at_server DATETIME     NOT NULL,
  UNIQUE KEY uq_etapa_guid (guid),
  UNIQUE KEY uq_etapa (pc_proceso_id, etapa),
  CONSTRAINT fk_etapa_proceso FOREIGN KEY (pc_proceso_id) REFERENCES pc_proceso(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- =========================================================================
-- CALIDAD — DOS tablas, no una
--
-- 02-bd-y-api.md proponía una sola pc_calidad con buena/ligera/violeta para
-- "fermentado | secado_sol". Al mirar los datos, eso perdía información:
-- z_postharvest_fermentationquality y z_postharvest_dryingquality NO miden lo
-- mismo. La primera es el corte de grano (buena/ligera/violeta); la segunda es
-- humedad, índice de grano y granos vacíos, y aplica a los DOS secados
-- (49 filas de Secado Máquina, 17 de Secado Sol). Colapsarlas habría dejado
-- 66 mediciones reales sin dónde guardarse.
--
-- Colapsar las cinco tablas de ETAPA sí era correcto: eran casi idénticas.
-- Colapsar éstas no, porque son formas distintas.
-- =========================================================================

-- Corte de grano al final del fermentado. Los PORCENTAJES no se guardan: se
-- calculan desde los tres conteos. En el histórico los tres son siempre
-- enteros (0 no enteros en 57 filas) y no pasan de 12.
CREATE TABLE IF NOT EXISTS pc_calidad_fermentacion (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  guid               CHAR(36) NOT NULL,
  pc_proceso_id      INT      NOT NULL,
  fecha_muestra      DATETIME NOT NULL,
  buena              SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ligera             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  violeta            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  received_at_server DATETIME NOT NULL,
  UNIQUE KEY uq_calferm_guid (guid),
  UNIQUE KEY uq_calferm_proceso (pc_proceso_id),   -- una sola por partida
  CONSTRAINT fk_calferm_proceso FOREIGN KEY (pc_proceso_id) REFERENCES pc_proceso(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Humedad e índice de grano, una por cada secado. Rangos reales: humedad
-- 5,93–28,07 %; hasta 423 granos de muestra; índice hasta 130,5 g; vacíos
-- hasta 4,7 %. El promedio es exactamente el de las tres lecturas en las 66
-- filas del histórico, así que se calcula, no se guarda a mano.
CREATE TABLE IF NOT EXISTS pc_calidad_secado (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  guid               CHAR(36)     NOT NULL,
  pc_proceso_id      INT          NOT NULL,
  etapa              VARCHAR(20)  NOT NULL,   -- secado_sol | secado_maq
  fecha_muestra      DATETIME     NOT NULL,
  humedad_1          DECIMAL(6,3) NOT NULL,
  humedad_2          DECIMAL(6,3) NOT NULL,
  humedad_3          DECIMAL(6,3) NOT NULL,
  humedad_promedio   DECIMAL(6,3) AS ((humedad_1 + humedad_2 + humedad_3) / 3) STORED,
  granos_muestra     SMALLINT UNSIGNED NULL,
  indice_grano_g     DECIMAL(7,3) NULL,
  granos_vacios_pct  DECIMAL(6,3) NULL,
  received_at_server DATETIME     NOT NULL,
  UNIQUE KEY uq_calsec_guid (guid),
  UNIQUE KEY uq_calsec_etapa (pc_proceso_id, etapa),
  CONSTRAINT fk_calsec_proceso FOREIGN KEY (pc_proceso_id) REFERENCES pc_proceso(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Hoy hay fotos en tres etapas: Secado Máquina (144), Fermentado (52) y
-- Secado Sol (51). Acá la etapa va como slug, no como texto de pantalla.
CREATE TABLE IF NOT EXISTS pc_foto (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  guid               CHAR(36)     NOT NULL,
  pc_proceso_id      INT          NOT NULL,
  etapa              VARCHAR(20)  NOT NULL,
  archivo            VARCHAR(150) NOT NULL,
  orden              TINYINT      NOT NULL,
  received_at_server DATETIME     NOT NULL,
  UNIQUE KEY uq_foto_guid (guid),
  KEY idx_foto_proceso (pc_proceso_id, etapa, orden),
  CONSTRAINT fk_foto_proceso FOREIGN KEY (pc_proceso_id) REFERENCES pc_proceso(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Secuencia del lot_code dddnnaa. Dos límites aceptados: 99 partidas por fecha
-- de cosecha (la 100 falla con error claro, nunca envuelve a 00) y el código
-- no lleva finca (pendiente #4 de 00-plan.md, sin confirmar).
CREATE TABLE IF NOT EXISTS pc_lot_code_seq (
  julian_day SMALLINT NOT NULL,
  year_2d    TINYINT  NOT NULL,
  last_seq   TINYINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (julian_day, year_2d)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- =========================================================================
-- REVISIÓN DE REGISTROS
-- Lo que la API no pudo guardar bien: rechazos, duplicados y fallos de base.
-- La escribe V4.php al sincronizar; se lee desde la base por `vw_reg_flag`.
-- No pasa por el usuario y no hay pantalla.
-- =========================================================================

-- Se rehace en cada migración: es una bitácora, no un dato de negocio, y el
-- DROP limpia la forma vieja que trae el dump de docs/db/init/01-schema.sql.
DROP TABLE IF EXISTS reg_flag;

CREATE TABLE reg_flag (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  -- am | pm | cosecha | riego | postcosecha. AM y PM son la misma tabla; que
  -- venga de 'pm' quiere decir que lo que falló fue el UPDATE del cierre.
  origen       VARCHAR(15)  NOT NULL,
  -- rechazado | duplicado | error
  codigo       VARCHAR(15)  NOT NULL,
  guid         CHAR(36)     NOT NULL,
  -- NULL en un rechazo: esa fila nunca llegó a existir en reg_am. Por eso el
  -- payload no es opcional -- es el único rastro de lo que se intentó cargar.
  registro_id  INT          NULL,
  detalle      VARCHAR(255) NULL,
  payload      JSON         NULL,
  -- De qué equipo salió. No está en el payload: viaja en la cabecera del lote.
  device_alias VARCHAR(50)  NULL,
  created_at   DATETIME     NOT NULL,
  KEY idx_flag_codigo (codigo, created_at),
  KEY idx_flag_guid (guid),
  KEY idx_flag_registro (registro_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- =========================================================================
-- AUDITORÍA DE LA MIGRACIÓN (paso 8)
-- Nada se pierde: la fila descartada queda entera en payload, y las z_*
-- originales tampoco se tocan. Si una regla resultó equivocada, se revierte.
-- =========================================================================

CREATE TABLE IF NOT EXISTS mig_descarte (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  tabla_origen  VARCHAR(40) NOT NULL,
  id_origen     INT         NOT NULL,
  motivo        VARCHAR(60) NOT NULL,
  id_conservado INT         NULL,
  payload       JSON        NULL,      -- la fila completa, tal cual estaba
  created_at    DATETIME    NOT NULL,
  KEY idx_mig_origen (tabla_origen, id_origen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;
