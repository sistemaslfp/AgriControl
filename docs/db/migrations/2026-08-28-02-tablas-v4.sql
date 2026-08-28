-- ---------------------------------------------------------------------------
-- Migración 2026-08-28-02 — Tablas nuevas de la API V4
-- Referencia: MOBIL/02-bd-y-api.md §3. Paso 2 del orden de MOBIL/00-plan.md.
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
--     < docs/db/migrations/2026-08-28-02-tablas-v4.sql
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

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================================
-- AM — cabecera + detalle. Un AM = un guid = una cabecera.
-- Resuelve solo el problema de "guid por fila" que tenía z_tabla_am.
-- =========================================================================

CREATE TABLE IF NOT EXISTS reg_am (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  guid                CHAR(36)     NOT NULL,
  fecha_proceso       DATETIME     NOT NULL,
  finca_id            INT          NOT NULL,
  responsable_id      INT          NOT NULL,
  cultivo_id          INT          NOT NULL,
  lote_id             INT          NOT NULL,
  subtarea_id         INT          NOT NULL,
  -- z_tabla_am no guardaba comentario aunque la pantalla ya lo captura.
  comentario          VARCHAR(255) NULL,
  device_alias        VARCHAR(50)  NULL,
  created_at_device   DATETIME     NULL,
  received_at_server  DATETIME     NOT NULL,
  device_clock_offset INT          NULL,
  origen              VARCHAR(10)  NOT NULL DEFAULT 'app',   -- app | web | migracion
  UNIQUE KEY uq_am_guid (guid),
  -- No único a propósito: la clave natural es índice de DETECCIÓN de posibles
  -- duplicados, no una restricción. El histórico repite la misma combinación
  -- hasta 37 veces.
  KEY idx_am_natural (finca_id, fecha_proceso, subtarea_id),
  CONSTRAINT fk_am_finca       FOREIGN KEY (finca_id)       REFERENCES z_finca(id),
  CONSTRAINT fk_am_lote        FOREIGN KEY (lote_id)        REFERENCES z_lote(id),
  CONSTRAINT fk_am_cultivo     FOREIGN KEY (cultivo_id)     REFERENCES z_cultivo(id),
  CONSTRAINT fk_am_subtarea    FOREIGN KEY (subtarea_id)    REFERENCES z_subtarea(id),
  CONSTRAINT fk_am_responsable FOREIGN KEY (responsable_id) REFERENCES z_personal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

CREATE TABLE IF NOT EXISTS reg_am_personal (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  am_id       INT NOT NULL,
  personal_id INT NOT NULL,
  UNIQUE KEY uq_am_persona (am_id, personal_id),
  CONSTRAINT fk_amp_am       FOREIGN KEY (am_id)       REFERENCES reg_am(id) ON DELETE CASCADE,
  CONSTRAINT fk_amp_personal FOREIGN KEY (personal_id) REFERENCES z_personal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Reemplaza el CSV "2,3" de z_tabla_am.modulos VARCHAR(50).
CREATE TABLE IF NOT EXISTS reg_am_modulo (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  am_id     INT NOT NULL,
  modulo_id INT NOT NULL,
  UNIQUE KEY uq_am_modulo (am_id, modulo_id),
  CONSTRAINT fk_amm_am     FOREIGN KEY (am_id)     REFERENCES reg_am(id) ON DELETE CASCADE,
  CONSTRAINT fk_amm_modulo FOREIGN KEY (modulo_id) REFERENCES z_modulo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- =========================================================================
-- PM
-- =========================================================================

CREATE TABLE IF NOT EXISTS reg_pm (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  guid                CHAR(36)     NOT NULL,
  fecha_proceso       DATE         NOT NULL,
  hora_inicio         DATETIME     NOT NULL,
  hora_cierre         DATETIME     NOT NULL,
  pm_year             SMALLINT     NOT NULL,   -- lo calcula el servidor
  pm_week             TINYINT      NOT NULL,   -- lo calcula el servidor
  finca_id            INT          NOT NULL,
  responsable_id      INT          NOT NULL,
  trabajador_id       INT          NOT NULL,
  cultivo_id          INT          NOT NULL,
  lote_id             INT          NOT NULL,
  subtarea_id         INT          NOT NULL,
  cantidad            DECIMAL(9,3) NOT NULL DEFAULT 0,
  comentario          VARCHAR(255) NULL,
  device_alias        VARCHAR(50)  NULL,
  created_at_device   DATETIME     NULL,
  received_at_server  DATETIME     NOT NULL,
  device_clock_offset INT          NULL,
  origen              VARCHAR(10)  NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_pm_guid (guid),
  KEY idx_pm_natural (finca_id, fecha_proceso, subtarea_id, trabajador_id),
  -- Replica idx_pm_composite, que los reportes de pago sí usan.
  KEY idx_pm_semana  (trabajador_id, pm_year, pm_week, finca_id),
  CONSTRAINT fk_pm_finca       FOREIGN KEY (finca_id)       REFERENCES z_finca(id),
  CONSTRAINT fk_pm_lote        FOREIGN KEY (lote_id)        REFERENCES z_lote(id),
  CONSTRAINT fk_pm_cultivo     FOREIGN KEY (cultivo_id)     REFERENCES z_cultivo(id),
  CONSTRAINT fk_pm_subtarea    FOREIGN KEY (subtarea_id)    REFERENCES z_subtarea(id),
  CONSTRAINT fk_pm_responsable FOREIGN KEY (responsable_id) REFERENCES z_personal(id),
  CONSTRAINT fk_pm_trabajador  FOREIGN KEY (trabajador_id)  REFERENCES z_personal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

CREATE TABLE IF NOT EXISTS reg_pm_modulo (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  pm_id     INT NOT NULL,
  modulo_id INT NOT NULL,
  UNIQUE KEY uq_pm_modulo (pm_id, modulo_id),
  CONSTRAINT fk_pmm_pm     FOREIGN KEY (pm_id)     REFERENCES reg_pm(id) ON DELETE CASCADE,
  CONSTRAINT fk_pmm_modulo FOREIGN KEY (modulo_id) REFERENCES z_modulo(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- =========================================================================
-- COSECHA — se acabó el techo de 15 sacos de z_cosecha_cacao.saco1..saco15
-- =========================================================================

CREATE TABLE IF NOT EXISTS reg_cosecha (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  guid                CHAR(36)      NOT NULL,
  fecha_proceso       DATETIME      NOT NULL,
  finca_id            INT           NOT NULL,
  supervisor_id       INT           NOT NULL,
  subtarea_id         INT           NOT NULL,
  trabajador_id       INT           NOT NULL,
  lote_id             INT           NOT NULL,
  modulo_id           INT           NULL,
  jornales            DECIMAL(5,2)  NOT NULL DEFAULT 0,
  -- Derivados: el servidor los recalcula desde reg_cosecha_saco. Si no cuadran
  -- con lo que mandó el teléfono, gana el servidor y deja flag total_descuadrado.
  total_sacos         SMALLINT      NOT NULL DEFAULT 0,
  total_peso          DECIMAL(11,2) NOT NULL DEFAULT 0,
  observaciones       VARCHAR(500)  NULL,
  device_alias        VARCHAR(50)   NULL,
  created_at_device   DATETIME      NULL,
  received_at_server  DATETIME      NOT NULL,
  device_clock_offset INT           NULL,
  origen              VARCHAR(10)   NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_cosecha_guid (guid),
  KEY idx_cosecha_natural (finca_id, fecha_proceso, trabajador_id),
  CONSTRAINT fk_cos_finca      FOREIGN KEY (finca_id)      REFERENCES z_finca(id),
  CONSTRAINT fk_cos_lote       FOREIGN KEY (lote_id)       REFERENCES z_lote(id),
  CONSTRAINT fk_cos_modulo     FOREIGN KEY (modulo_id)     REFERENCES z_modulo(id),
  CONSTRAINT fk_cos_subtarea   FOREIGN KEY (subtarea_id)   REFERENCES z_subtarea(id),
  CONSTRAINT fk_cos_supervisor FOREIGN KEY (supervisor_id) REFERENCES z_personal(id),
  CONSTRAINT fk_cos_trabajador FOREIGN KEY (trabajador_id) REFERENCES z_personal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

CREATE TABLE IF NOT EXISTS reg_cosecha_saco (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  cosecha_id INT          NOT NULL,
  numero     SMALLINT     NOT NULL,
  libras     DECIMAL(9,2) NOT NULL,
  UNIQUE KEY uq_saco (cosecha_id, numero),
  CONSTRAINT fk_saco_cosecha FOREIGN KEY (cosecha_id) REFERENCES reg_cosecha(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- =========================================================================
-- RIEGO
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
-- POSTCOSECHA — una pc_etapa en lugar de cinco tablas casi idénticas
-- =========================================================================

CREATE TABLE IF NOT EXISTS pc_lote (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  guid                CHAR(36)     NOT NULL,
  lot_code            CHAR(7)      NOT NULL,   -- dddnnaa, lo asigna el servidor
  fecha_cosecha       DATE         NOT NULL,   -- de acá salen ddd y aa
  fecha_inicio        DATETIME     NOT NULL,
  supervisor_id       INT          NOT NULL,
  peso_lote           DECIMAL(9,3) NOT NULL,
  peso_mallas         DECIMAL(9,3) NOT NULL,
  peso_baba           DECIMAL(9,3) AS (peso_lote - peso_mallas) STORED,
  peso_final          DECIMAL(9,3) NULL,
  comentario          VARCHAR(255) NULL,
  device_alias        VARCHAR(50)  NULL,
  created_at_device   DATETIME     NULL,
  received_at_server  DATETIME     NOT NULL,
  device_clock_offset INT          NULL,
  origen              VARCHAR(10)  NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_pc_guid (guid),
  UNIQUE KEY uq_pc_code (lot_code),
  CONSTRAINT fk_pc_supervisor FOREIGN KEY (supervisor_id) REFERENCES z_personal(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Qué cosechas entraron en el lote (hoy la pantalla es una multiselección).
CREATE TABLE IF NOT EXISTS pc_lote_cosecha (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  pc_lote_id INT NOT NULL,
  cosecha_id INT NOT NULL,
  UNIQUE KEY uq_pc_cosecha (pc_lote_id, cosecha_id),
  CONSTRAINT fk_pcc_lote    FOREIGN KEY (pc_lote_id) REFERENCES pc_lote(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcc_cosecha FOREIGN KEY (cosecha_id) REFERENCES reg_cosecha(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Una fila por etapa. Agregar una etapa deja de ser un CREATE TABLE.
CREATE TABLE IF NOT EXISTS pc_etapa (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  guid               CHAR(36)     NOT NULL,
  pc_lote_id         INT          NOT NULL,
  etapa              VARCHAR(20)  NOT NULL,  -- presecado|fermentado|secado_sol|secado_maq|resultado
  orden              TINYINT      NOT NULL,
  inicio             DATETIME     NOT NULL,
  fin                DATETIME     NULL,
  comentario         VARCHAR(255) NULL,
  received_at_server DATETIME     NOT NULL,
  UNIQUE KEY uq_etapa_guid (guid),
  UNIQUE KEY uq_etapa (pc_lote_id, etapa),
  CONSTRAINT fk_etapa_lote FOREIGN KEY (pc_lote_id) REFERENCES pc_lote(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Los porcentajes de fermentación NO se guardan: se calculan desde buena/ligera/violeta.
CREATE TABLE IF NOT EXISTS pc_calidad (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  guid               CHAR(36)    NOT NULL,
  pc_lote_id         INT         NOT NULL,
  etapa              VARCHAR(20) NOT NULL,   -- fermentado | secado_sol
  buena              SMALLINT    NOT NULL DEFAULT 0,
  ligera             SMALLINT    NOT NULL DEFAULT 0,
  violeta            SMALLINT    NOT NULL DEFAULT 0,
  received_at_server DATETIME    NOT NULL,
  UNIQUE KEY uq_cal_guid (guid),
  UNIQUE KEY uq_calidad (pc_lote_id, etapa),
  CONSTRAINT fk_cal_lote FOREIGN KEY (pc_lote_id) REFERENCES pc_lote(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

CREATE TABLE IF NOT EXISTS pc_foto (
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  guid               CHAR(36)     NOT NULL,
  pc_lote_id         INT          NOT NULL,
  etapa              VARCHAR(20)  NOT NULL,
  archivo            VARCHAR(150) NOT NULL,
  orden              TINYINT      NOT NULL,
  received_at_server DATETIME     NOT NULL,
  UNIQUE KEY uq_foto_guid (guid),
  KEY idx_foto_lote (pc_lote_id, etapa, orden),
  CONSTRAINT fk_foto_lote FOREIGN KEY (pc_lote_id) REFERENCES pc_lote(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- Secuencia del lot_code dddnnaa. Dos límites aceptados: 99 lotes por fecha de
-- cosecha (el 100 falla con error claro, nunca envuelve a 00) y el código no
-- lleva finca (pendiente #4 de 00-plan.md, sin confirmar).
CREATE TABLE IF NOT EXISTS pc_lote_seq (
  julian_day SMALLINT NOT NULL,
  year_2d    TINYINT  NOT NULL,
  last_seq   TINYINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (julian_day, year_2d)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- =========================================================================
-- FLAGS DE INTEGRIDAD
-- Los escribe el SERVIDOR recalculando contra received_at_server. Los que
-- manda el cliente se descartan. Viven acá y no en columnas sueltas de cada
-- tabla. Polimórfica a propósito (tabla + registro_id): sin FK.
-- =========================================================================

CREATE TABLE IF NOT EXISTS reg_flag (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  tabla        VARCHAR(40)  NOT NULL,
  registro_id  INT          NOT NULL,
  guid         CHAR(36)     NOT NULL,
  -- posible_duplicado | fuera_de_ventana_horaria | retroactivo_excedido |
  -- reloj_adelantado | fecha_futura_local | sin_offset_reloj | total_descuadrado
  codigo       VARCHAR(30)  NOT NULL,
  detalle      VARCHAR(255) NULL,
  estado       VARCHAR(1)   NOT NULL DEFAULT '0',   -- '0' abierto, '1' revisado
  revisado_por INT          NULL,
  revisado_at  DATETIME     NULL,
  created_at   DATETIME     NOT NULL,
  KEY idx_flag_guid   (guid),
  KEY idx_flag_estado (estado, codigo),
  KEY idx_flag_reg    (tabla, registro_id)
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
