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

**[DECIDIR]** — tres opciones, en orden de esfuerzo:

1. **Nada.** Las tablas nuevas arrancan vacías; el histórico vive en `z_*` y se
   consulta ahí. Los reportes que cruzan períodos usan `UNION`.
2. **Sólo el año en curso.** Suficiente para los reportes de pago y de
   temporada. El resto queda archivado en `z_*`.
3. **Todo el histórico.** Más caro, más riesgo, y el histórico anterior a 2025
   está sucio de una forma que ya no se puede auditar (AM sin timestamp).

Recomendado **(2)**. El corte por fecha hace el script revisable, y el histórico
profundo rara vez se consulta desde la app.

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
