# 02 — Modelo de datos V4 y API

> Reescrito 2026-08-28 tras la decisión de **migrar con data limpia sobre tablas
> nuevas**. Reemplaza el enfoque anterior de `ALTER TABLE` sobre las tablas
> existentes.
> Esquema actual de referencia: `docs/db/init/01-schema.sql` (MariaDB 10.4.18).

---

## 1. Regla de oro: no se renombra nada todavía

Renombrar `z_tabla_am` → `z_tabla_am_v3` **hoy** rompe la web entera: Grocery
CRUD, los reportes, `Payment_model`, `PM.php`, `AM.php`. Y la web con V3 es
justamente lo que se quiere mantener corriendo para validar contra V4.

Por eso:

- Las tablas actuales **conservan su nombre y su contenido**, intactas.
- Las tablas nuevas nacen **con nombres nuevos** — cero colisión, cero rename.
- El sufijo `_v3` se aplica **una sola vez, en el corte final** (§6), cuando ya
  no haya nadie escribiendo en ellas.

Prefijos nuevos: `reg_` para registros de campo, `pc_` para postcosecha.
El prefijo `z_` queda como marca de "legado".

**Los catálogos NO se duplican.** `z_finca`, `z_lote`, `z_modulo`, `z_cultivo`,
`z_tarea`, `z_subtarea`, `z_personal`, `z_ulabor` siguen siendo la única fuente
de verdad; los administra la web y los leen las dos APIs. Duplicarlos sería
garantizar que se desincronicen.

Sobre esos catálogos sólo se aplican tres cambios aditivos, inocuos para V3:

```sql
ALTER TABLE z_finca  ADD COLUMN estado VARCHAR(1) NOT NULL DEFAULT '1';
ALTER TABLE z_ulabor ADD COLUMN estado VARCHAR(1) NOT NULL DEFAULT '1';
ALTER TABLE z_lote   ADD COLUMN tiene_modulos TINYINT(1) NOT NULL DEFAULT 0 AFTER finca_id;

UPDATE z_lote l SET tiene_modulos = 1
 WHERE EXISTS (SELECT 1 FROM z_modulo m WHERE m.lote_id = l.id AND m.estado = '1');
```

`'1'` = activo, `'0'` = inactivo, igual que en el resto del esquema. El
`DEFAULT '1'` deja el comportamiento actual sin cambios.

---

## 2. Qué se arregla al construir de cero

Estas cinco cosas eran "cambio mayor" mientras había que respetar las tablas
viejas. Con tablas nuevas son gratis, y no arreglarlas ahora significa
arrastrarlas otros diez años.

| Defecto actual | Corrección en V4 |
|---|---|
| `fecha VARCHAR(10)` + `hora VARCHAR(5)` | Un `DATETIME`. Se acabaron las comparaciones de fecha como texto. |
| `z_cosecha_cacao.saco1 … saco15` | Tabla hija `reg_cosecha_saco`. Se acabó el techo de 15. |
| `modulos VARCHAR(50)` con CSV `"2,3"` | Tabla hija `reg_am_modulo` / `reg_pm_modulo`. |
| Un AM = N filas idénticas, una por persona | Cabecera `reg_am` + detalle `reg_am_personal`. **Esto resuelve solo el problema del `guid` por fila.** |
| Cinco tablas de etapa casi idénticas (`_predrying`, `_fermentation`, `_sundrying`, `_machinedrying`, `_result`) | Una `pc_etapa` con `UNIQUE (lote_id, etapa)`. Agregar una etapa deja de ser un `CREATE TABLE`. |

Dos más, silenciosas pero caras:

- **Colaciones mezcladas.** El esquema actual convive con
  `utf8_spanish2_ci` (tablas viejas) y `utf8mb4_spanish_ci` (postcosecha).
  Cualquier `JOIN` entre las dos familias tira *Illegal mix of collations*.
  Todo lo nuevo va en **`utf8mb4_spanish_ci`**, sin excepción.
- **Cero claves foráneas reales.** `z_tabla_pm` tiene
  `KEY FK_TRABAJADOR (id)` — un índice sobre `id`, no sobre `trabajador`.
  El nombre miente y el índice no sirve para nada. En V4 las FK se declaran.

---

## 3. Tablas nuevas

Bloque común de sincronización, presente en toda tabla de cabecera:

```sql
  guid                CHAR(36)    NOT NULL,
  device_alias        VARCHAR(50) NULL,
  created_at_device   DATETIME    NULL,
  received_at_server  DATETIME    NOT NULL,
  device_clock_offset INT         NULL,
  origen              VARCHAR(10) NOT NULL DEFAULT 'app',   -- 'app' | 'web' | 'migracion'
  UNIQUE KEY uq_<t>_guid (guid)
```

### AM

```sql
CREATE TABLE reg_am (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  guid           CHAR(36)     NOT NULL,
  fecha_proceso  DATETIME     NOT NULL,
  finca_id       INT          NOT NULL,
  responsable_id INT          NOT NULL,
  cultivo_id     INT          NOT NULL,
  lote_id        INT          NOT NULL,
  subtarea_id    INT          NOT NULL,
  comentario     VARCHAR(255) NULL,          -- la pantalla ya lo captura; z_tabla_am no lo guardaba
  device_alias        VARCHAR(50) NULL,
  created_at_device   DATETIME    NULL,
  received_at_server  DATETIME    NOT NULL,
  device_clock_offset INT         NULL,
  origen         VARCHAR(10)  NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_am_guid (guid),
  KEY idx_am_natural (finca_id, fecha_proceso, subtarea_id),
  CONSTRAINT fk_am_finca    FOREIGN KEY (finca_id)    REFERENCES z_finca(id),
  CONSTRAINT fk_am_lote     FOREIGN KEY (lote_id)     REFERENCES z_lote(id),
  CONSTRAINT fk_am_subtarea FOREIGN KEY (subtarea_id) REFERENCES z_subtarea(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

CREATE TABLE reg_am_personal (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  am_id       INT NOT NULL,
  personal_id INT NOT NULL,
  UNIQUE KEY uq_am_persona (am_id, personal_id),
  CONSTRAINT fk_amp_am FOREIGN KEY (am_id) REFERENCES reg_am(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

CREATE TABLE reg_am_modulo (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  am_id     INT NOT NULL,
  modulo_id INT NOT NULL,
  UNIQUE KEY uq_am_modulo (am_id, modulo_id),
  CONSTRAINT fk_amm_am FOREIGN KEY (am_id) REFERENCES reg_am(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;
```

Un AM = un `guid` = una cabecera. **La decisión pendiente de "guid por fila vs.
por cabecera" desaparece.**

### PM

```sql
CREATE TABLE reg_pm (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  guid           CHAR(36)     NOT NULL,
  fecha_proceso  DATE         NOT NULL,
  hora_inicio    DATETIME     NOT NULL,
  hora_cierre    DATETIME     NOT NULL,
  pm_year        SMALLINT     NOT NULL,      -- calculado por el servidor
  pm_week        TINYINT      NOT NULL,      -- calculado por el servidor
  finca_id       INT          NOT NULL,
  responsable_id INT          NOT NULL,
  trabajador_id  INT          NOT NULL,
  cultivo_id     INT          NOT NULL,
  lote_id        INT          NOT NULL,
  subtarea_id    INT          NOT NULL,
  cantidad       DECIMAL(9,3) NOT NULL DEFAULT 0,
  comentario     VARCHAR(255) NULL,
  device_alias        VARCHAR(50) NULL,
  created_at_device   DATETIME    NULL,
  received_at_server  DATETIME    NOT NULL,
  device_clock_offset INT         NULL,
  origen         VARCHAR(10)  NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_pm_guid (guid),
  KEY idx_pm_natural (finca_id, fecha_proceso, subtarea_id, trabajador_id),
  KEY idx_pm_semana  (trabajador_id, pm_year, pm_week, finca_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;
-- + reg_pm_modulo, igual que reg_am_modulo
```

`idx_pm_natural` es **no único**, por lo verificado en §5. `idx_pm_semana`
replica el `idx_pm_composite` actual, que los reportes de pago sí usan.

`numero_registro` no se replica: era `"PM-" . timestamp`, colisiona entre
registros del mismo segundo y no identifica nada. El `guid` lo sustituye.

### Cosecha

```sql
CREATE TABLE reg_cosecha (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  guid          CHAR(36)      NOT NULL,
  fecha_proceso DATETIME      NOT NULL,
  finca_id      INT           NOT NULL,
  supervisor_id INT           NOT NULL,
  subtarea_id   INT           NOT NULL,
  trabajador_id INT           NOT NULL,
  lote_id       INT           NOT NULL,
  modulo_id     INT           NULL,
  jornales      DECIMAL(5,2)  NOT NULL DEFAULT 0,
  total_sacos   SMALLINT      NOT NULL DEFAULT 0,   -- derivado, se recalcula en el servidor
  total_peso    DECIMAL(11,2) NOT NULL DEFAULT 0,   -- derivado, se recalcula en el servidor
  observaciones VARCHAR(500)  NULL,
  device_alias        VARCHAR(50) NULL,
  created_at_device   DATETIME    NULL,
  received_at_server  DATETIME    NOT NULL,
  device_clock_offset INT         NULL,
  origen        VARCHAR(10)   NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_cosecha_guid (guid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

CREATE TABLE reg_cosecha_saco (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  cosecha_id INT          NOT NULL,
  numero     SMALLINT     NOT NULL,
  libras     DECIMAL(9,2) NOT NULL,
  UNIQUE KEY uq_saco (cosecha_id, numero),
  CONSTRAINT fk_saco_cosecha FOREIGN KEY (cosecha_id) REFERENCES reg_cosecha(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;
```

`total_sacos` y `total_peso` los **recalcula el servidor** desde el detalle. El
teléfono los manda para mostrarlos; si no cuadran, el servidor usa los suyos y
deja el flag `total_descuadrado`.

### Riego

Mismo patrón, con `tiempo_riego` y `volumen_riego`. Se define al final, con las
capturas de pantalla (ver `00-plan.md`).

### Postcosecha

```sql
CREATE TABLE pc_lote (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  guid          CHAR(36)     NOT NULL,
  lot_code      CHAR(7)      NOT NULL,       -- dddnnaa
  fecha_cosecha DATE         NOT NULL,       -- de donde salen ddd y aa
  fecha_inicio  DATETIME     NOT NULL,
  supervisor_id INT          NOT NULL,
  peso_lote     DECIMAL(9,3) NOT NULL,
  peso_mallas   DECIMAL(9,3) NOT NULL,
  peso_baba     DECIMAL(9,3) AS (peso_lote - peso_mallas) STORED,
  peso_final    DECIMAL(9,3) NULL,
  comentario    VARCHAR(255) NULL,
  device_alias        VARCHAR(50) NULL,
  created_at_device   DATETIME    NULL,
  received_at_server  DATETIME    NOT NULL,
  device_clock_offset INT         NULL,
  origen        VARCHAR(10)  NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_pc_guid (guid),
  UNIQUE KEY uq_pc_code (lot_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- qué cosechas entraron en el lote (hoy es una multiselección de fechas)
CREATE TABLE pc_lote_cosecha (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  pc_lote_id INT NOT NULL,
  cosecha_id INT NOT NULL,
  UNIQUE KEY uq_pc_cosecha (pc_lote_id, cosecha_id),
  CONSTRAINT fk_pcc_lote FOREIGN KEY (pc_lote_id) REFERENCES pc_lote(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

-- una fila por etapa, en vez de cinco tablas
CREATE TABLE pc_etapa (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  guid       CHAR(36)    NOT NULL,
  pc_lote_id INT         NOT NULL,
  etapa      VARCHAR(20) NOT NULL,   -- presecado|fermentado|secado_sol|secado_maq|resultado
  orden      TINYINT     NOT NULL,
  inicio     DATETIME    NOT NULL,
  fin        DATETIME    NULL,
  comentario VARCHAR(255) NULL,
  received_at_server DATETIME NOT NULL,
  UNIQUE KEY uq_etapa_guid (guid),
  UNIQUE KEY uq_etapa (pc_lote_id, etapa),
  CONSTRAINT fk_etapa_lote FOREIGN KEY (pc_lote_id) REFERENCES pc_lote(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

CREATE TABLE pc_calidad (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  guid       CHAR(36)    NOT NULL,
  pc_lote_id INT         NOT NULL,
  etapa      VARCHAR(20) NOT NULL,   -- fermentado | secado_sol
  buena      SMALLINT    NOT NULL DEFAULT 0,
  ligera     SMALLINT    NOT NULL DEFAULT 0,
  violeta    SMALLINT    NOT NULL DEFAULT 0,
  received_at_server DATETIME NOT NULL,
  UNIQUE KEY uq_cal_guid (guid),
  UNIQUE KEY uq_calidad (pc_lote_id, etapa),
  CONSTRAINT fk_cal_lote FOREIGN KEY (pc_lote_id) REFERENCES pc_lote(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;

CREATE TABLE pc_foto (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  guid       CHAR(36)     NOT NULL,
  pc_lote_id INT          NOT NULL,
  etapa      VARCHAR(20)  NOT NULL,
  archivo    VARCHAR(150) NOT NULL,
  orden      TINYINT      NOT NULL,
  received_at_server DATETIME NOT NULL,
  UNIQUE KEY uq_foto_guid (guid),
  CONSTRAINT fk_foto_lote FOREIGN KEY (pc_lote_id) REFERENCES pc_lote(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;
```

Los porcentajes de fermentación **no se guardan**: se calculan desde
`buena/ligera/violeta`. Guardar un porcentaje derivado es guardarse una
inconsistencia futura.

### Flags de integridad

```sql
CREATE TABLE reg_flag (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  tabla        VARCHAR(40)  NOT NULL,
  registro_id  INT          NOT NULL,
  guid         CHAR(36)     NOT NULL,
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
```

| Código | Origen |
|---|---|
| `posible_duplicado` | Choque con el índice natural |
| `fuera_de_ventana_horaria` | `hora_proceso` fuera de la ventana AM/PM |
| `retroactivo_excedido` | `created_at_device − fecha_proceso` > ventana del módulo |
| `reloj_adelantado` | `created_at_device > received_at_server + 5min` |
| `fecha_futura_local` | `fecha_proceso > created_at_device + 2h` |
| `sin_offset_reloj` | El dispositivo nunca sincronizó hora |
| `total_descuadrado` | Totales del teléfono ≠ totales recalculados |

Los escribe **el servidor**, recalculando contra `received_at_server`. Los que
manda el cliente se ignoran.

### Secuencia del `lot_code`

```sql
CREATE TABLE pc_lote_seq (
  julian_day SMALLINT NOT NULL,
  year_2d    TINYINT  NOT NULL,
  last_seq   TINYINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (julian_day, year_2d)
) ENGINE=InnoDB;
```

```sql
INSERT INTO pc_lote_seq (julian_day, year_2d, last_seq)
VALUES (:ddd, :aa, LAST_INSERT_ID(1))
ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1);
-- SELECT LAST_INSERT_ID();  -> el 'nn'
```

`lot_code = LPAD(ddd,3,'0') || LPAD(nn,2,'0') || LPAD(aa,2,'0')`.
Cosecha del 2026-08-27 (día 239), tercer lote → `2390326`.

Dos límites aceptados: **99 lotes por fecha de cosecha** (el lote 100 falla con
error claro, nunca envuelve a `00`) y el código **no lleva finca**, así que dos
fincas que cosechan el mismo día comparten secuencia. **[CONFIRMAR]** el segundo.

---

## 4. Convivencia: V3 escribe en `z_*`, V4 escribe en `reg_*`/`pc_*`

Durante todo el desarrollo hay **dos flujos de escritura en paralelo sobre la
misma base**, sin tocarse:

| | Escribe en | Lo usa |
|---|---|---|
| Web + `V1`/`V2`/`V3` | `z_tabla_am`, `z_tabla_pm`, `z_cosecha_cacao`, `z_riego`, `z_postharvest_*` | Operación real, APK v2.0.5 instalado |
| `V4` | `reg_*`, `pc_*` | App nueva, piloto |

Ninguna línea de la web cambia. Los reportes siguen leyendo lo de siempre. Se
puede validar V4 contra datos reales sin arriesgar la operación, que es
exactamente lo que se pidió.

El costo a aceptar: durante el piloto, **el histórico está partido en dos**. Un
reporte que cruce ambos períodos necesita `UNION`. Por eso el piloto debe ser
corto y acotado a un teléfono.

Ya no hace falta el parche de `guid` a V3: la data vieja se limpia en la
migración (§5), no en caliente.

---

## 5. Migración con data limpia

No es un `INSERT ... SELECT`. Es un script idempotente, ejecutable por rangos de
fecha, que deja auditoría de todo lo que descarta.

### El problema medido

```
z_tabla_am — (finca, fecha, subtarea_id, personal_id)
  '1','2025-01-31','29','328',  37
  '1','2025-01-31','87','728',  36
  '1','2025-09-30','87','328',  31   ...

z_tabla_pm — (finca, fecha, subtarea, trabajador)
  '1','2025-04-07','63','28',   23
  '1','2025-05-16','87','614',  22   ...
```

37 registros del mismo trabajador, en la misma subtarea, el mismo día, no
existen en el campo. Son duplicados. Y las fechas — `2025-01-31`, `2025-09-30`,
`2025-05-16` — son cierres de mes, lo que apunta a carga masiva o a un cierre
manual repetido, más que a reintentos de red.

### Reglas de deduplicación

**AM** — `z_tabla_am` no tiene ninguna columna de tiempo de creación, así que no
hay forma de distinguir un reintento de una captura legítima. Regla:

> Conservar **una** fila por
> `(finca, fecha, subtarea_id, lote_id, modulos, responsable_id, personal_id)`.
> El resto se descarta y se cuenta.

Es defendible porque el AM es una programación: la misma persona programada dos
veces para la misma subtarea el mismo día es la misma programación.

**PM** — aquí sí hay `fecha_registro`, y hay `cantidad`, que es dinero. Regla en
dos pasos:

> 1. Filas del mismo grupo natural con **la misma `cantidad`, `hora_inicio` y
>    `hora_cierre`** creadas dentro de una ventana de **60 segundos** →
>    duplicado. Conservar la primera.
> 2. Filas del mismo grupo natural con valores **distintos** → tramos
>    legítimos. **Conservar todas.**

Nunca se suman cantidades ni se colapsan filas que difieren. Perder un tramo de
avance es perder un pago.

Antes de migrar, correr esto para dimensionar cuál de los dos casos domina:

```sql
SELECT finca, fecha, subtarea, trabajador,
       COUNT(*) AS repeticiones,
       COUNT(DISTINCT cantidad, hora_inicio, hora_cierre) AS variantes,
       TIMESTAMPDIFF(SECOND, MIN(fecha_registro), MAX(fecha_registro)) AS rango_seg
FROM z_tabla_pm
GROUP BY 1,2,3,4 HAVING repeticiones > 1
ORDER BY repeticiones DESC LIMIT 100;
```

`variantes = 1` y `rango_seg` chico → duplicación pura.
`variantes > 1` → tramos reales, y confirma que el `UNIQUE` habría borrado datos.

**Cosecha / Riego / Postcosecha** — tienen `created_at`. Misma lógica de ventana
de 60 s sobre el grupo natural.

### Auditoría de la migración

```sql
CREATE TABLE mig_descarte (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  tabla_origen VARCHAR(40) NOT NULL,
  id_origen   INT         NOT NULL,
  motivo      VARCHAR(60) NOT NULL,
  id_conservado INT       NULL,
  payload     JSON        NULL,      -- la fila completa, tal cual estaba
  created_at  DATETIME    NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_spanish_ci;
```

Nada se pierde: la fila descartada queda entera en `payload`, y las tablas `z_*`
originales tampoco se tocan. Si una regla resultó equivocada, se revierte.

Los registros migrados entran con `origen = 'migracion'` y un `guid` generado en
la migración (determinístico: `UUIDv5(namespace, tabla || id_origen)`, para que
volver a correr el script no duplique nada).

### Qué se migra

**DECIDIDO (2026-08-28, Kevin).** Ninguna de las tres opciones originales: se
migra **una ventana de antecedente de un mes — desde `2026-08-01`**. No es una
migración del histórico, es el colchón mínimo para que el reporte de pago y las
consultas del arranque tengan con qué comparar. Todo lo anterior al 2026-08-01
se queda en `z_*` y se consulta ahí.

**La fusión o migración completa de `z_*` → `reg_*`/`pc_*` queda diferida** sin
fecha. No se vuelve a tocar hasta que Kevin la mencione de nuevo.

Reglas de la ventana:

- **AM / PM / Cosecha / Riego:** todo lo de `fecha >= '2026-08-01'`, con las
  reglas de deduplicación de arriba y auditoría en `mig_descarte`.
- **Postcosecha: sólo partidas CERRADAS.** Ninguna partida en proceso se migra.
  La app nueva arranca sin partidas abiertas.
- **Excepción de fecha en postcosecha:** una partida cerrada de agosto puede
  estar enlazada a cosechas de julio. Esas cosechas **se migran igual**, fuera
  de la ventana — sin ellas `pc_proceso_cosecha` no tiene a qué apuntar y
  `peso_lote` no cuadra. Entran marcadas `origen = 'migracion'`.
- `pc_lot_code_seq` **se siembra** con el mayor consecutivo ya usado en 2026,
  no arranca en 1.

Consecuencia asumida: durante el arranque conviven dos fuentes de verdad y los
reportes que cruzan el 2026-08-01 necesitan `UNION` (§5 bis).

### La ventana de agosto, medida (2026-08-31)

Corrido sobre una copia real de la base, no sobre el papel:

| tabla | filas desde 2026-08-01 |
|---|---|
| `z_tabla_am` | 590 |
| `z_tabla_pm` | 598 |
| `z_cosecha_cacao` | 60 |
| `z_riego` | 279 |

**La ventana está limpia de huérfanos: CERO.** Ni un `trabajador`,
`responsable`, `lote`, `subtarea` ni `cultivo` de agosto que no exista en su
catálogo, ni en AM ni en PM. Los ~9.000 rotos son todos de 2021–2024. Las 26 FK
no van a rechazar nada.

**Pero los duplicados siguen vivos en 2026.** Migrando PM de agosto con la regla
de los 60 s: **598 filas → 495 conservadas, 103 descartadas (17 %)**. El caso
peor son 14 filas idénticas del mismo trabajador y subtarea creadas en 4
segundos. Ningún grupo con `cantidad`/horas distintas fue colapsado (verificado:
0 grupos con variantes > 1 tocados) — no se pierde ningún tramo. Pero la suma de
`cantidad` baja de **87.772,2 a 79.298,4**.

**Resuelto con datos, sin necesidad de decidir:** `vw_reporte_pago` — la vista
que alimenta el pago — es un `SELECT DISTINCT`, así que las 103 filas
duplicadas **nunca llegaron a la nómina**. La vista devuelve 495 filas y
79.298,40, idéntico a la base migrada. Deduplicar no cambia ni un centavo de lo
ya pagado. Es la confirmación más fuerte de que la regla de los 60 s coincide
con lo que el negocio ya trataba como una sola fila.

**Dos trampas de formato descubiertas al migrar:**

- `z_tabla_am.hora` es inconsistente: **340 de 590 filas de agosto** vienen como
  `7:31` (sin cero a la izquierda, sin segundos) y el resto como `15:26:02`. El
  migrador tiene que normalizar antes de armar el `DATETIME` de
  `reg_am.fecha_proceso`.
- `z_tabla_am.modulos` y `z_tabla_pm.modulo` **sí son CSV** — 85 y 60 filas de
  agosto con coma, hasta 4 módulos por fila. (Lo que no es CSV es
  `z_riego.modulo`: cero comas en 9.778 filas. Son casos distintos, no
  confundirlos.) Las 736 partes de PM y las 777 de AM **resuelven todas** contra
  `z_modulo.id` — que va de 1 a 85 con huecos, 43 módulos.

### Postcosecha al corte: se migran las 4, abiertas incluidas

Medido: 98 partidas abiertas históricamente, 89 cerradas. Quedan **22 sin
cerrar — pero 20 llevan entre 324 y 744 días abiertas**: están abandonadas, no
en proceso. Realmente en curso al 2026-08-27 hay **dos**: los lotes 466 y 462.

Duración real de una partida cerrada: **8,2 días de promedio**, máximo 48.

**Decidido (2026-08-31).** La v2.0.5 no va a convivir con la app nueva, y la web
**sólo permite VER postcosecha, no registrar**. Una partida que quedara en `z_*`
no la podría cerrar nadie. Así que se migran **las 4 partidas de la ventana,
cerradas y en curso** — no "sólo las cerradas". Son 4 filas.

Bonus: `vw_harvest_pending_lots` y cualquier pantalla de "en proceso" están
mostrando hoy 22 partidas fantasma. Vale la pena cerrarlas o marcarlas antes del
corte, decida lo que decida el pendiente #10.

### El migrador — escrito y verificado

`docs/db/migrations/2026-08-31-05-migracion-agosto.sql`. Corrido tres veces
seguidas sobre la copia real: la segunda y la tercera no insertan nada.
Cero rechazos de FK, cero filas tocadas en las `z_*`.

| origen (>= 2026-08-01) | destino |
|---|---|
| `z_tabla_am` 590 | `reg_am` 367 cabeceras, 529 personas, 505 módulos, 61 descartes |
| `z_tabla_pm` 598 | `reg_pm` 495, 629 módulos, 103 descartes |
| `z_cosecha_cacao` 60 | `reg_cosecha` 60, 292 sacos |
| `z_riego` 279 | `reg_riego` 279 |
| `z_postharvest_*` 4 partidas | `pc_proceso` 4, 25 enlaces, 13 etapas, 2 calidades, 4 fotos |

529 + 61 = 590 y 495 + 103 = 598: todo lo que entró está o migrado o auditado.
La suma de `total_peso` de cosecha da 20.526,60 en los dos lados, y el
`peso_lote` de las 4 partidas es la suma exacta de su cosecha enlazada.

Tres cosas que salieron al escribirlo y no estaban en ningún documento:

1. **`z_riego.hora` vale `'0'` en las 9.778 filas.** Columna muerta, como
   `codigo_tarea` y `codigo_subtarea`. No hay hora del día en el origen: se usa
   la de `created_at` cuando cae el mismo día (35 de 279) y 00:00 en el resto.
2. **14 de las 60 filas de cosecha de agosto traen `finca = 0`.** La columna
   tiene `DEFAULT 0` y la app vieja no siempre la manda. Se deriva de
   `z_lote.finca_id`, que sí la tiene, y queda constancia en `mig_descarte`.
3. **MariaDB no soporta `LATERAL`.** El despivote de `saco1..saco15` va con una
   tabla de números y `CASE`, no con un derivado lateral.

### Bis — vistas UNION para los reportes de la web — VERIFICADO

Kevin confirmó que las pantallas de la web siguen en uso, y decidió (2026-08-31)
**convivencia con diferenciador**: las dos mitades se leen unidas, cada fila
marcada con su origen, hasta una fusión futura sin fecha.

Probado el 2026-08-31 sobre una **copia real de la base** (MariaDB 10.11,
108.149 filas en `z_tabla_pm`, la ventana de agosto migrada a `reg_pm`).
SQL listo en `docs/db/migrations/2026-08-31-03-vistas-union.sql`.

**Funciona.** `vw_reporte_pm` repuntada a la vista de unión devuelve v3 y v4
juntas, con nombres, tarifas y totales resueltos. Costo: `COUNT(*)` del reporte
completo pasa de **1.418 ms a 1.734 ms** (+22 %); las consultas filtradas por
mes no se degradan (74–212 ms). El sobrecosto lo paga la pantalla que lista
todo sin filtro, que ya tardaba 1,4 s por el `DISTINCT` sobre ocho joins.

**El diseño que hace barato el cambio:** la vista expone **los mismos nombres de
columna que `z_tabla_pm`**, más `fuente`. Adaptar un reporte existente es
cambiar `z_tabla_pm` por `vw_pm_compat` — una palabra, el resto de la consulta
intacta.

Tres cosas que fallan si se hacen de la forma obvia:

1. **La colación.** Corrección de lo que decía este documento: un `UNION` por sí
   solo **no** lanza *Illegal mix of collations* — MariaDB resuelve la colación
   del resultado. Lo que sí falla es escribir `z.columna COLLATE
   utf8mb4_spanish_ci` sobre una columna `utf8mb3`: **ERROR 1253**. Hay que
   `CONVERT(z.columna USING utf8mb4)` primero. Y ojo: sin `CONVERT`, las
   columnas de texto de la vista **heredan la colación vieja**
   (`utf8mb3_spanish2_ci`), que es lo que después rompe un `JOIN`.
2. **El doble conteo.** Sin `WHERE z.fecha < <corte>` en el lado viejo, agosto
   sale **dos veces**: está migrado en `reg_pm` y sigue en `z_tabla_pm`.
   Son 598 filas de nómina contadas doble.
3. **Sólo lectura.** Toda vista con `UNION` es no actualizable: `UPDATE` da
   **ERROR 1288** y `information_schema.views.is_updatable = NO`. Grocery CRUD
   puede **listar** desde la vista; insertar, editar y borrar siguen contra la
   tabla base. No hace falta clave sintética de texto: basta con desplazar los
   `id` nuevos (`r.id + 1000000`; los viejos llegan a ~121.000), y así la PK
   sigue siendo entera.

### El trabajo real: 20 vistas, no una

Medido sobre el esquema: **20 vistas existentes dependen de las tablas
transaccionales `z_*`** — 8 de PM, 2 de AM, 2 de cosecha y 7 de postcosecha.
La lista completa está en el `.sql`. Cada una necesita el mismo cambio de una
palabra el día que su tabla entre en la ventana migrada.

Además, `tbl_pm_payment_daily_adjustment.pm_id` tiene **FK a `z_tabla_pm(id)`**:
un ajuste de pago no puede apuntar a una fila de `reg_pm`. Hoy esa tabla está
**vacía**, así que no bloquea el corte — pero si el módulo de ajustes se activa,
esa FK hay que repuntarla antes.

---

## 6. Corte final (cuando V4 esté validado y los teléfonos migrados)

Recién en este punto aparece el sufijo:

```sql
RENAME TABLE z_tabla_am TO z_tabla_am_v3;
RENAME TABLE z_tabla_pm TO z_tabla_pm_v3;
-- etc.
```

Y para que los reportes legacy no se caigan el mismo día, una **vista** con el
nombre viejo sobre las tablas nuevas:

```sql
CREATE VIEW z_tabla_am AS
SELECT a.id, DATE_FORMAT(a.fecha_proceso,'%Y-%m-%d') AS fecha,
       DATE_FORMAT(a.fecha_proceso,'%H:%i')          AS hora,
       a.finca_id AS finca, a.responsable_id, a.cultivo_id, a.lote_id,
       (SELECT GROUP_CONCAT(m.modulo_id) FROM reg_am_modulo m WHERE m.am_id = a.id) AS modulos,
       p.personal_id, a.subtarea_id, '0' AS tiene_pm
FROM reg_am a
JOIN reg_am_personal p ON p.am_id = a.id;
```

**Advertencia honesta:** una vista con `JOIN` y subconsulta **no es
actualizable**. Sirve para lectura y reportes, no para las pantallas de Grocery
CRUD que editan. Esas hay que migrarlas a las tablas nuevas — es trabajo real,
no un truco. La vista compra tiempo para hacerlo ordenado, no lo elimina.

---

## 7. API V4

Controlador nuevo: `application/controllers/V4.php`.
`V1`, `V2`, `V3` y `API/V3` quedan congelados, sin parches.

| Método | Ruta | Qué hace |
|---|---|---|
| GET  | `/v4/hora` | Hora del servidor ISO-8601 con offset. |
| GET  | `/v4/bootstrap` | Ventanas AM/PM, ventanas de retroactividad, subtareas de cosecha, versión de catálogos. |
| GET  | `/v4/catalogos` | Maestros activos en una respuesta. |
| GET  | `/v4/am_abiertos` | Asignaciones AM de una fecha que todavía no cerró ningún PM. |
| POST | `/v4/sync` | Lote de registros. Idempotente por `guid`. |
| POST | `/v4/fotos` | Multipart. `guid` del padre + etapa + orden. |
| GET  | `/v4/postcosecha/lotes-pendientes` | Cosechas sin proceso de postcosecha. |
| GET  | `/v4/postcosecha/lote/{lot_code}` | Estado y etapas de un lote. |

### `GET /v4/catalogos`

```json
{
  "version": "2026-08-28T09:15:00-05:00",
  "fincas":    [{ "id": 1, "nombre": "Bellita", "ha": 120 }],
  "lotes":     [{ "id": 1, "lote": "1", "finca_id": 1, "ha": 12.5, "tiene_modulos": true }],
  "modulos":   [{ "id": 2, "modulo": "02", "lote_id": 1, "ha": 3.2 }],
  "cultivos":  [{ "id": 1, "nombre": "CACAO" }],
  "tareas":    [{ "id": 3, "nombre": "COSECHA", "cultivos_id": 1 }],
  "subtareas": [{ "id": 88, "codigo": "C-01", "nombre": "COSECHA CACAO TEMP. BAJA",
                  "tarea_id": 3, "unidad_labor_id": 4, "tipo_pago_id": 1 }],
  "ulabores":  [{ "id": 4, "nombre": "QUINTAL" }],
  "personal":  [{ "id": 214, "nombre": "ALAVA TOMALA ERICKA PATRICIA",
                  "id_finca": 1, "rol": 2, "rol_app": "1" }]
}
```

Todo con `estado = '1'`. `unidad_labor_id` viaja en la subtarea: la app deriva la
unidad de labor en vez de pedirla.

### `POST /v4/sync`

```json
{
  "device_alias": "TABLET-BELLITA-02",
  "device_clock_offset": -3,
  "records": [
    {
      "guid": "ad31cfcb-4823-4e9b-bcfb-26445358372f",
      "tipo": "am",
      "created_at_device": "2026-08-27T11:50:37-05:00",
      "payload": {
        "fecha_proceso": "2026-08-27T07:30:00-05:00",
        "finca_id": 1, "responsable_id": 214, "cultivo_id": 1,
        "lote_id": 1, "subtarea_id": 88,
        "modulo_ids": [2],
        "personal_ids": [214, 215, 301],
        "comentario": ""
      }
    }
  ]
}
```

Respuesta (ver `01-sincronizacion.md` para la definición del ACK):

```json
{
  "server_time": "2026-08-28T14:03:11-05:00",
  "results": [
    { "guid": "ad31cfcb-...", "status": "created", "id": 42,
      "flags": ["fuera_de_ventana_horaria"] }
  ]
}
```

`tipo` ∈ `am | pm | cosecha | riego | pc_lote | pc_etapa | pc_calidad`.

### Estado: `am` y `pm` IMPLEMENTADOS y probados (2026-08-31)

`V4::sync_post()` ya no devuelve 501. Probado con `curl` contra CodeIgniter
levantado sobre la copia real de la base (receta en la memoria del proyecto).

**La regla que hace todo lo demás simple: un guid que NO aparece en `results`
se queda PENDIENTE en el teléfono y se reintenta.** Eso se usa a propósito en
tres casos:

1. **Tipos todavía no implementados** (`cosecha`, `riego`, `pc_*`): se omiten en
   silencio. El día que existan, la cola los reenvía sola. Nadie tiene que
   tocar el teléfono.
2. **Errores de base.** Un fallo al guardar NUNCA es `rejected`: reenviar sí lo
   arregla.
3. **`guid` ilegible**: sin guid no hay a qué acusar recibo.

`rejected` queda reservado a lo que reenviar no arregla, y por eso no se
reintenta nunca: payload inválido, catálogo inexistente o inactivo, e I1.

Validaciones que la FK sola no puede hacer y el endpoint sí:

- El **lote tiene que pertenecer a la finca** declarada.
- El **módulo tiene que pertenecer al lote** declarado.
- El personal se valida por `eregistro = 'A'`, los catálogos por
  `estado IN ('1','A')` — los mismos filtros que `/v4/catalogos`.
- Un AM sin `personal_ids` se rechaza: una programación sin gente no es un
  registro. **CONFIRMADO (Kevin, 2026-08-31)**: nunca es legítimo, y la app
  además bloquea el guardado antes de llegar al servidor.

Tope de lote: 200 registros (413 si se pasa). Body ilegible: 400. Todo lo demás
responde 200 con su `results`.

### Un registro = una PERSONA en una tarea (2026-09-03)

Dos decisiones de Kevin, en el mismo día:

1. **"PM se vuelve redundante si lo manejamos como un update para AM."**
2. **"Cada fila de AM va por persona; la acumulación `Personal(2,5,54)` es del
   front, no de la base."**

Las dos eran correctas. La objeción que yo había puesto a la primera —que la
cola es solo-inserción y un UPDATE necesita su propia historia de
idempotencia— **tiene respuesta y es simple**: el guid del cierre se guarda
**en la fila que cierra** (`reg_am.cierre_guid`).

- mismo guid → `duplicate`
- otro guid sobre una fila ya cerrada → `rejected`
- la programación todavía no llegó → se omite de `results`, queda PENDIENTE y
  se reintenta

Las mismas garantías que tenía el INSERT. Y el `UPDATE` lleva
`AND cierre_guid IS NULL` en el `WHERE`: dos equipos cerrando la misma tarea a
la vez no necesitan transacción — uno actualiza una fila y el otro cero.

Mi objeción a la segunda apuntaba a otra cosa: a meter a las personas en una
**columna con comas**. Ahí sí se pierden cierres, porque cerrar a una persona
obliga a reescribir la cadena entera. **Una fila por persona es lo contrario**
y no tiene ese problema.

| antes | ahora |
|---|---|
| `reg_am` — `reg_am_personal` — `reg_pm` (+ `reg_am_modulo`, `reg_pm_modulo`) | `reg_am`, y nada más |

Es la forma de `z_tabla_am`, que también lleva un `personal_id` por fila. La
cabecera se repite por persona — 49 copias en la tarea más grande del
histórico — y está bien: `z_tabla_am` hace exactamente eso con 113.410 filas y
ocupa 8,7 MB.

`reg_am` gana `personal_id`, `modulos` (lista con comas), las diez columnas del
cierre, y **`captura_guid`**: el guid del formulario, que comparten las N
personas capturadas juntas. Sin él no hay forma de saber qué filas salieron de
la misma captura, que es lo que "Registros Enviados" necesita para mostrar una
tarjeta y no cinco.

Migración: `docs/db/migrations/2026-09-03-01-fusion-pm-en-am.sql`. Reemplaza a
`2026-09-01-01-pm-cierra-am.sql` y a la mitad de
`2026-09-02-01-modulos-clave-natural.sql`; **las dos ya estaban aplicadas en
producción, así que parte de ese estado. No se borran del repositorio**: una
migración aplicada que se borra deja un esquema que ya nadie puede reproducir
desde cero.

Corrida contra la copia real, partiendo del mismo estado que producción:

| | |
|---|---|
| filas de `reg_am` | 367 AM + 529 asignaciones → **550** |
| cerradas / abiertas | **495 / 55** |
| capturas distintas | **367** |
| programaciones deducidas (`origen='mig-pm'`) | **21** |
| `vw_reg_reporte_pago` de agosto | **495 filas, 79.298,40 en cantidad, 15.091,66 en total** |

Ese último renglón es idéntico a lo que devuelve `vw_reporte_pago` desde
`z_tabla_pm`. **La nómina de agosto no se movió ni un centavo.**

**Los 21 avances sin programación**: se les creó la fila completa, con
`origen = 'mig-pm'` y un comentario que lo dice. En V3 el PM era prácticamente
una copia del AM con más datos, así que la mañana se reconstruye del propio
avance. El modelo queda simétrico desde el 1 de agosto, sin excepciones.

**La primera persona de cada tarea conserva el guid original**; solo las demás
reciben uno nuevo. Si un teléfono alguna vez reenvía ese guid, sigue siendo
idempotente contra la fila que le corresponde.

Contrato de `POST /v4/sync`, ahora:

```json
{ "tipo": "am",
  "payload": { "captura_guid": "…", "fecha_proceso": "…", "finca_id": 1,
               "responsable_id": 26, "cultivo_id": 1, "lote_id": 2,
               "subtarea_id": 65, "modulo_ids": [3,8,25],
               "personal_id": 4, "comentario": "" } }

{ "tipo": "pm",
  "payload": { "am_guid": "…", "trabajador_id": 4, "responsable_id": 26,
               "cantidad": 2.5, "hora_cierre": "…", "comentario": "" } }
```

`trabajador_id` en el cierre es redundante —la fila ya sabe de quién es— pero
si viene tiene que coincidir: es la red que atrapa un `am_guid` mal copiado
antes de escribir el avance en la persona equivocada.

Probado con `curl` contra la base real, partiendo del estado de producción:

| caso | resultado |
|---|---|
| captura de 2 personas | 2 `created`, mismo `captura_guid`, `modulos` = `3,8,25` |
| AM sin `personal_id` | `rejected` |
| AM con un módulo de otro lote | `rejected` |
| cierre válido | `created` |
| el mismo guid otra vez | `duplicate` |
| otro guid sobre la misma tarea | `rejected` |
| `trabajador_id` que no es el de la fila | `rejected` |
| `am_guid` que el servidor no conoce | **omitido** → sigue PENDIENTE |
| cierre de la segunda persona de la misma captura | `created`, **no pisa a la primera** |

Cero filas fantasma tras los rechazos, y el cuadre de agosto intacto.

### Los módulos pasan a ser una columna (2026-09-03)

`reg_am_modulo` desaparece; `reg_am.modulos` es una lista separada por comas,
ordenada y sin repetidos (`3,8,25`), igual que `z_tabla_am.modulos`.

El argumento con el que yo defendía la tabla era real: **3.119 filas de
`z_tabla_am` (2,75 %) apuntan a módulos que ya no existen** en `z_modulo` con
ningún estado, y 16 apuntan a un módulo de otro lote. Pero el diagnóstico
estaba incompleto: eso no lo causa el `VARCHAR`, lo causa que **se podían
borrar módulos**. `application/controllers/Modulo.php` dejaba borrar al grupo
admin, aunque la tabla ya tiene `estado` Activo/Inactivo. **Se quitó el borrado
para todos** — la baja se hace desactivando.

Con eso, y con `sync_am` validando en la escritura que cada módulo pertenezca
al lote declarado (que cubre las otras 16), la columna queda tan sana como la
tabla para datos nuevos.

Lo que se resigna, dicho sin adornos: un `DELETE` por SQL directo sigue
pudiendo dejar ids colgando, y una FK lo habría impedido. En este servidor eso
no es teórico — había un Adminer expuesto por HTTP hasta el 28 de agosto.

**Corrección de una cifra que di mal:** dije que 57 filas declaraban 8 o 9
módulos "cuando ningún lote tiene más de 7", como si fuera un tercer problema.
No lo es. Los valores son `40,3,8,12,17,21,25,28` (lote 2) y
`41,51,4,9,13,18,22,26,29` (lote 3): los 7 módulos reales del lote **más los
ids borrados**. Es el mismo caso de los 3.119, contado dos veces.

### `GET /v4/catalogos`: las subtareas viajan con `id_finca`### `GET /v4/catalogos`: las subtareas viajan con `id_finca`### `GET /v4/catalogos`: las subtareas viajan con `id_finca`

`z_subtarea.id_finca` existía y no se estaba usando. Cada finca tiene su propio
juego: **78 subtareas activas en Bellita y 21 en Pacaritambo**. La app filtra
por finca — y también las tareas, mostrando solo las que tienen al menos una
subtarea de esa finca, para que nadie elija una tarea y se encuentre la lista
de subtareas vacía.

`z_tarea` **no** tiene finca; el corte por finca solo se puede hacer desde la
subtarea hacia arriba.

### `POST /v4/sync` con `tipo: pm` — el PM CIERRA un AM (2026-09-01)

Decisión de Kevin: **"NO se pueden crear PM, un PM solo es el reflejo de un
AM".** El payload del PM se redujo a lo único que el PM aporta:

```json
{
  "am_guid": "ad31cfcb-4823-4e9b-bcfb-26445358372f",
  "trabajador_id": 301,
  "responsable_id": 26,
  "cantidad": 3.5,
  "hora_cierre": "2026-08-13T16:00:00-05:00",
  "comentario": ""
}
```

Finca, cultivo, lote, subtarea, módulos, fecha de proceso y hora de inicio los
**deriva el servidor del AM**. El teléfono ya no puede contradecir la
programación de la mañana, que era el agujero real: antes se podía mandar un
PM con un lote distinto al del AM y nadie se enteraba.

`responsable_id` es **quien zanja** la tarea, y no tiene por qué ser el que la
programó. Si falta, se hereda del AM.

**La regla que hace que esto funcione offline: si el AM todavía no llegó al
servidor, el guid del PM se OMITE de `results`.** (Desde el 2026-09-03 el PM
no inserta nada: actualiza la fila de `reg_asignacion`. El contrato del payload
no cambió.) El teléfono lo deja
PENDIENTE y lo reintenta solo. Es el mismo mecanismo del guid omitido, sin
nada nuevo, y pasa siempre que el AM y su PM viajan en lotes distintos.

Por qué una columna (`reg_pm.am_personal_id`) y no fundir el PM dentro de
`reg_am_personal`, que fue la otra opción sobre la mesa: **la cola del teléfono
es solo-inserción, idempotente por guid.** "El PM rellena los campos que le
faltan al AM" es un UPDATE de una fila que puede no existir todavía en el
servidor, y eso exige ordenar el update después del insert y darle su propia
historia de idempotencia. Con la columna, el PM sigue siendo un INSERT. Además
no toca la migración de agosto, ni `vw_reporte_pago`, ni `pm_year`/`pm_week`,
ni el índice `idx_pm_semana`.

DDL: `docs/db/migrations/2026-09-01-01-pm-cierra-am.sql`. `UNIQUE KEY` sobre
`am_personal_id` (nullable: las filas migradas de agosto no tienen vínculo),
que es lo que hace cumplir **una asignación se cierra una sola vez**.

Probado con `curl` contra la copia real de la base, sobre los datos ya
migrados:

| caso | resultado |
|---|---|
| PM válido que cierra una asignación | `created`, `am_personal_id` seteado |
| El mismo guid otra vez | `duplicate`, no inserta |
| Otro guid cerrando la MISMA asignación | `rejected` |
| `am_guid` que el servidor no conoce | **omitido** → sigue PENDIENTE |
| Trabajador que no está en esa tarea AM | `rejected` |
| Sin `am_guid` | `rejected` — no existe el PM libre |
| `cantidad` negativa | `rejected` |
| `hora_cierre` anterior a la hora del AM | `rejected` |

Verificado además en la base: `hora_inicio` heredada del AM (06:57:50) contra
`hora_cierre` real (16:00) — se acabaron los "0 días, 0 horas, 0 minutos" de la
app vieja; `pm_week` = 33, igual que `WEEK('2026-08-13', 3)`; módulos
heredados del AM; y **cero filas fantasma** tras los seis rechazos.

### `GET /v4/am_abiertos?fecha=YYYY-MM-DD[&finca_id=N]`

Una fila por (tarea AM, persona) de esa fecha que todavía no tiene PM. Es lo
que lista la pantalla PM.

```json
{
  "server_time": "2026-09-01T12:50:07-05:00",
  "fecha": "2026-08-13",
  "asignaciones": [
    { "am_personal_id": 246, "am_guid": "f6661d7e-…", "am_id": 186,
      "fecha_proceso": "2026-08-13 06:57:50", "finca_id": 1,
      "responsable_id": 26, "cultivo_id": 1, "lote_id": 2, "subtarea_id": 65,
      "personal_id": 4, "trabajador": "ALVEAR MORALES VÍCTOR",
      "lote": "2", "cultivo": "Cacao",
      "subtarea": "Operador de canguro entrenamiento",
      "modulos": "3, 4",
      "unidad_labor_id": 2, "unidad_labor": "Jornal" }
  ]
}
```

`modulos` sale de `reg_am_modulo` con un `GROUP_CONCAT`, y va porque la
pantalla PM lo muestra: sin el módulo, dos asignaciones del mismo lote y la
misma subtarea se ven idénticas en la lista.

`fecha` es obligatoria (400 sin ella): sin acotar, la consulta barre la tabla.
**Sin guion en la ruta**: CodeIgniter mapea el segmento de URI al nombre del
método y `am-abiertos` no es un identificador PHP válido.

Dos cosas que sólo salieron al correrlo contra la base real, y que `php -l` no
habría visto nunca:

1. **Los nombres de columna están mezclados en los catálogos.** `z_subtarea`
   guarda el nombre en `nombre_subtarea` y `z_ulabor` en `ulabor_nombre`;
   `z_cultivo` sí usa `nombre`. La primera versión de la consulta murió con
   *Unknown column 'st.nombre'*.
2. **La consulta necesita `try/catch` y apagar `db_debug`.** Sin eso, desde
   PHP 8.1 el `mysqli_sql_exception` sube hasta `RestController` y el endpoint
   responde una traza HTML de CI3 **con HTTP 200**, que la app no puede
   distinguir de una respuesta buena.

### Hueco abierto: la justificación del registro retroactivo

`01-sincronizacion.md` exige una **justificación escrita** cuando la fecha
supera la ventana de retroactividad del módulo, y la pantalla la pide y bloquea
el guardado sin ella. Pero **el payload de `/v4/sync` no tiene un campo para
guardarla**: hoy viaja dentro de `comentario`, con el prefijo `[RETROACTIVO]`
y recortada a 255 caracteres junto con el comentario del usuario.

Funciona, pero es una limitación del contrato, no una decisión de diseño: el
motivo queda mezclado con texto libre y no se puede consultar aparte. Lo
correcto es un campo propio (`justificacion_retroactiva`) en `reg_am`/`reg_pm`
y en el payload. **[PENDIENTE]**, para cuando se vuelva a tocar el servidor —
va junto con `reg_pm.am_id` del cierre AM→PM.

### Dos cosas que sólo aparecieron al correrlo

**1. `pm_year` se calcula con `'o'` (año ISO), no con `'Y'` (año calendario).**
V3, V2 y `PM.php` usan `$date->format('Y')` junto a `format('W')`, y esa pareja
es incorrecta en el cambio de año. Ya pasó: **181 filas del 29, 30 y 31 de
diciembre de 2025 quedaron guardadas como `(2025, semana 1)`**, mezcladas en el
reporte de pago con la primera semana de enero de 2025 — 116 filas de enero por
86,00 conviviendo con 181 de diciembre por 7.757,15. Con `'o'` esas filas caen
en `(2026, 1)`, que es lo correcto. Vuelve a pasar en **diciembre de 2029**.
V4 no copia el bug; V3 lo sigue teniendo.

**2. Desde PHP 8.1 mysqli LANZA excepciones en vez de devolver `FALSE`,** y
CI3 no lo sabe: su chequeo de `db_debug` nunca llega a correr, la excepción
sube hasta `RestController` y la respuesta se convierte en una página de error
que se lleva el lote entero. El Docker de desarrollo es **PHP 7.4** (devuelve
`FALSE`), así que el problema es invisible ahí y aparece en cuanto producción
sea 8.1+. `sync_post` sostiene los dos caminos: chequea `=== FALSE` **y**
captura `Throwable`. Verificado en el contenedor con PHP 8.4 — el registro
fallido se omite de `results` y el resto del lote se guarda igual.

Relacionado: `db_debug` viene `TRUE` fuera de producción, así que una violación
de FK imprime una página de error y mata el request. `sync_post` lo apaga
mientras dura el lote y lo restaura al terminar.

### Lo que se probó, contra la base real

| caso | resultado |
|---|---|
| AM válido con 3 personas y 2 módulos | `created` + hijos escritos |
| El mismo guid otra vez | `duplicate`, no inserta nada |
| PM válido | `created`, `pm_week` calculada por el servidor |
| Lote que no es de la finca declarada | `rejected` |
| Módulo que no es del lote declarado | `rejected` |
| Personal con `eregistro = 'I'` | `rejected` |
| `fecha_proceso` en el futuro (I1) | `rejected` |
| `hora_cierre` < `hora_inicio` | `rejected` |
| AM sin personas | `rejected` |
| `tipo: cosecha` y guid ilegible | omitidos → siguen PENDIENTES |
| Lote mixto: uno malo y uno bueno | el bueno entra |
| Registro de hace 20 días | `created` + flag `retroactivo_excedido` |
| AM a las 22:00 | `created` + flag `fuera_de_ventana_horaria` |
| `created_at_device` adelantado | `created` + flag `reloj_adelantado` |
| Fallo del INSERT hijo | rollback: la cabecera NO queda, y el guid se puede reenviar |
| Body ilegible / lote de 201 | 400 / 413 |

Tras los rechazos: **cero cabeceras fantasma y cero hijos huérfanos**.

Reglas del servidor, sin excepción:

- `pm_year` / `pm_week` se calculan desde `fecha_proceso`. Nunca los manda el cliente.
- `total_sacos` / `total_peso` se recalculan desde el detalle.
- `lot_code` lo asigna el servidor.
- Los porcentajes de fermentación se calculan, no se guardan.
- Los flags los escribe el servidor; los del cliente se descartan.
- **Transacción por registro**: un registro malo del lote no arrastra a los buenos.

---

## 8. Seguridad

Hecho el 2026-08-28: movidos a `_to_delete/public-2026-08-28/` los cuatro
archivos sueltos de `public/`:

| Archivo | Qué era |
|---|---|
| `colmillo.php` | **Adminer 4.8.1** (309 KB), consola de administración de la base servida por HTTP, renombrada para ocultarla |
| `info.php` | `phpinfo()` — versión de PHP, rutas absolutas, variables de entorno |
| `dole.php` | Script suelto de calendario fiscal, código muerto ejecutable |
| `error_log` | 13 KB de log de PHP, descargable por HTTP |

Renombrar Adminer no lo protegía: la URL queda en el historial del navegador, en
los logs de Apache y en cualquier proxy. La administración de la base va con el
cliente de BD contra el puerto de MySQL, nunca por HTTP público.

**`public/php.ini` NO se movió, a propósito.** Contiene
`upload_max_filesize = 256M` y `post_max_size = 256M`. El `Dockerfile` ya define
esos valores en `/usr/local/etc/php/conf.d/zz-lagricontrol.ini`, así que en
desarrollo es redundante — pero si producción corre en hosting con PHP-CGI, ese
archivo puede ser lo único que permite subir fotos, y borrarlo devolvería el
límite a 2 MB. **[CONFIRMAR]** cómo corre producción antes de sacarlo.

Pendiente en `.htaccess`: negar acceso a todo lo que no sea `index.php` y
`assets/`.

### API y secretos

1. `application/config/rest.php`: `rest_auth = false`, `rest_enable_keys = false`,
   `rest_ip_whitelist_enabled = false`, credenciales de ejemplo `admin/1234`.
   La API está abierta a cualquiera que alcance el host.
2. `rest_enable_keys = true` con **una API key por dispositivo**, revocable desde
   la web. En el teléfono va en Secure Storage, nunca en `localStorage`.
3. **TLS obligatorio.** No compromete el offline: la app captura y encola sin
   red; el certificado sólo hace falta al enviar. La app nueva sale **sin
   excepciones de cleartext**, salvo un flavor de desarrollo separado.
4. Rate limit por key en `/v4/sync`.
5. **`.env` está versionado en git** (`git ls-files` lo confirma). Agregarlo a
   `.gitignore` no basta: un archivo ya trackeado sigue trackeado. Hace falta
   `git rm --cached .env` y un commit. El repositorio tiene **un solo commit y
   ningún remoto configurado**, así que `git commit --amend` lo elimina del
   historial completo y **no hace falta rotar credenciales**: nunca salieron de
   este disco. Si en algún momento se publica el repo, revisar esto de nuevo.

### Buenas prácticas que aplican aquí

- Validación en los dos lados. La del cliente es experiencia; la del servidor es
  la que cuenta. El servidor no confía en ningún total, hora ni flag del teléfono.
- Consultas parametrizadas en todo V4 (`$this->db->insert()` / bindings de CI3).
- Whitelist de campos al armar cada `$data`. Nunca `$this->input->post()` completo.
- Logs sin datos sensibles y fuera del docroot.
