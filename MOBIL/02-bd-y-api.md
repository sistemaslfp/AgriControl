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
| `modulos VARCHAR(50)` con CSV `"2,3"` | Sigue siendo una columna con comas, pero ordenada, sin repetidos y **validada en la escritura** (módulo ∈ lote), y ya no se pueden borrar módulos. Ver §3. |
| Un AM = N filas idénticas, una por persona, sin nada que las relacione | Se conservan las N filas —cada persona carga su propio cierre— pero comparten `captura_guid`, que dice qué salió del mismo formulario. |
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

### AM — la única tabla del trabajo diario

**Una fila = una persona en una tarea**, con la programación de la mañana y el
cierre de la tarde juntos. Es la forma de `z_tabla_am`, que también lleva un
`personal_id` por fila. El DDL completo, con sus comentarios, está en
`docs/db/migrations/02-tablas-v4.sql`; acá va la forma y el porqué.

```sql
CREATE TABLE reg_am (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  guid                CHAR(36)     NOT NULL,
  captura_guid        CHAR(36)     NULL,   -- lo comparten las N personas del mismo formulario

  -- la programación de la mañana
  fecha_proceso       DATETIME     NOT NULL,
  finca_id            INT          NOT NULL,
  responsable_id      INT          NOT NULL,
  cultivo_id          INT          NOT NULL,
  lote_id             INT          NOT NULL,
  modulos             VARCHAR(255) NULL,   -- ids con comas, ordenados y sin repetidos
  subtarea_id         INT          NOT NULL,
  personal_id         INT          NOT NULL,
  comentario          VARCHAR(255) NULL,
  <bloque común de sincronización>
  origen              VARCHAR(10)  NOT NULL DEFAULT 'app',  -- app|web|migracion|mig-pm

  -- el cierre de la tarde: diez columnas, no una tabla
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
  UNIQUE KEY uq_am_cierre_guid (cierre_guid),   -- una fila se cierra UNA vez
  KEY idx_am_captura   (captura_guid),
  KEY idx_am_abiertas  (finca_id, fecha_proceso, cierre_guid),
  KEY idx_am_persona   (personal_id, fecha_proceso, finca_id),
  KEY idx_am_natural   (finca_id, fecha_proceso, subtarea_id)
  -- + 7 FK a los catálogos
);
```

**No hay tabla de PM.** El avance de la tarde es un UPDATE de esta misma fila.
Es idempotente porque el guid del cierre vive acá (`cierre_guid`) y el UPDATE
lleva `AND cierre_guid IS NULL`, así que es atómico sin transacción. La mecánica
completa —qué responde en cada caso, y qué pasa cuando el cierre llega antes que
su AM— está en `01-sincronizacion.md` §El cierre es un UPDATE.

`idx_am_natural` es **no único** por lo verificado en §5: la clave natural es
índice de detección, no restricción. `idx_am_persona` reemplaza a
`idx_pm_composite`, que los reportes de pago sí usan. `numero_registro` de
`z_tabla_pm` no se replica: era `"PM-" . timestamp`, colisiona entre registros
del mismo segundo y no identifica nada; el `guid` lo sustituye.

#### Por qué los módulos son columna y las personas son filas

No es inconsistencia, y las dos mitades se discutieron por separado.

**Módulos: columna.** Un módulo es un elemento de un conjunto sin atributos
propios, y una lista con comas guarda bien un conjunto. El argumento con el que
se defendía la tabla hija era real —**3.176 filas de `z_tabla_am` (2,80 %)
apuntan a módulos que ya no existen** en `z_modulo` con ningún estado, y 16
apuntan a un módulo de otro lote— pero el diagnóstico estaba incompleto: **eso
no lo causa el VARCHAR, lo causa que se podían borrar módulos**. `Modulo.php`
dejaba borrar al grupo admin aunque la tabla ya tiene `estado` Activo/Inactivo.
**Se quitó el borrado para todos**; la baja se hace desactivando. Con eso, más
`sync_am` validando en la escritura que cada módulo pertenezca al lote declarado
—lo que cubre las otras 16—, la columna queda tan sana como la tabla para datos
nuevos. Lo que se resigna, sin adornos: un `DELETE` por SQL directo sigue
pudiendo dejar ids colgando, y una FK lo habría impedido. En este servidor eso
no es teórico: hubo un Adminer expuesto por HTTP hasta el 2026-08-28.

*(Las 57 filas que declaran 8 o 9 módulos "cuando ningún lote tiene más de 7"
—valores como `40,3,8,12,17,21,25,28`— no son un problema aparte: son los 7
módulos reales del lote más los ids borrados, y están dentro de las 3.176.)*

**Personas: filas.** Una persona, con el cierre adentro, carga seis datos suyos:
avance, hora de cierre, comentario, quién cerró, guid del cierre y fecha del
cierre. En columnas con comas serían seis listas alineadas por posición: una
coma dentro de un comentario desalinea todo en silencio, y cerrar a UNA persona
obligaría a reescribir la cadena entera, así que dos equipos cerrando personas
distintas de la misma tarea se pisarían y se perdería un avance. **Una fila por
persona es lo contrario de eso**: son dos UPDATE a filas distintas.

El costo de repetir la cabecera está medido: **el 27,5 % de las capturas de
agosto tienen más de una persona, con un máximo de 9** (sobre las 367 capturas
migradas, 2026-09-02). `z_tabla_am` hace exactamente esto con 113.410 filas y
ocupa 8,7 MB.

**`captura_guid`** conserva qué filas salieron del mismo formulario. Sin él no
hay forma de saber qué filas fueron una sola captura, que es lo que "Registros
Enviados" necesita para mostrar una tarjeta y no cinco.

> **Corregido el 2026-09-02.** Hasta esa fecha el campo significaba dos cosas:
> la app lo generaba **por envío del formulario** (`am.page.ts` lo creaba antes
> del bucle de tareas, así que un AM con dos tareas mandaba las dos con el mismo
> guid) y la migración de agosto lo asignó **por tarea**. Ahora la app lo genera
> dentro del bucle: **un `captura_guid` por tarea**, igual que la migración.
>
> **Ninguna pantalla agrupa por este campo.** Se probó y salía mal: dos personas
> puestas en la misma subtarea del mismo lote, pero cargadas como dos tareas del
> formulario, daban dos tarjetas idénticas e indistinguibles. Las pantallas PM y
> Registros agrupan por la **identidad del trabajo** (lote, subtarea, módulos, y
> además fecha y finca donde la lista las cruza). Sobre los datos de agosto las
> dos claves dan el mismo resultado —367 tarjetas, 29 abiertas—, porque la
> migración construyó el guid a partir de esa misma identidad.
>
> Para qué sirve entonces: para **rastrear** qué filas salieron del mismo
> formulario. Viaja en el payload de `sync_am`, se guarda en `reg_am` y lo
> devuelve `GET /v4/am_abiertos`.


### Cosecha

**Cosecha CIERRA una tarea AM, igual que el PM** (Kevin, 2026-09-03). Todas las
tareas viven en `reg_am`; esta tabla solo agrega el detalle de sacos y **no
repite** finca, supervisor, subtarea, trabajador, lote, módulo ni fecha: todo
eso ES el AM.

```sql
CREATE TABLE reg_cosecha (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  guid          CHAR(36)      NOT NULL,   -- = reg_am.cierre_guid
  reg_am_id     INT           NOT NULL,
  total_sacos   SMALLINT      NOT NULL DEFAULT 0,   -- derivados, los recalcula el servidor
  total_peso    DECIMAL(11,2) NOT NULL DEFAULT 0,
  observaciones VARCHAR(500)  NULL,
  device_alias        VARCHAR(50) NULL,
  created_at_device   DATETIME    NULL,
  received_at_server  DATETIME    NOT NULL,
  device_clock_offset INT         NULL,
  origen        VARCHAR(10)   NOT NULL DEFAULT 'app',
  UNIQUE KEY uq_cosecha_guid (guid),
  UNIQUE KEY uq_cosecha_am (reg_am_id),      -- una tarea se cosecha UNA vez
  CONSTRAINT fk_cosecha_am FOREIGN KEY (reg_am_id) REFERENCES reg_am(id)
);

CREATE TABLE reg_cosecha_saco (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  cosecha_id INT          NOT NULL,
  numero     SMALLINT     NOT NULL,
  libras     DECIMAL(9,2) NOT NULL,
  UNIQUE KEY uq_saco (cosecha_id, numero),
  CONSTRAINT fk_saco_cosecha FOREIGN KEY (cosecha_id) REFERENCES reg_cosecha(id) ON DELETE CASCADE
);
```

**Por qué esta tabla NO repite las columnas del AM.** La pregunta es legítima
—una vista que va `cosecha → AM → catálogos` cuesta más que una plana— y está
medida sobre una copia de la base con **2× el volumen real** (26.426 cosechas
sobre 113.410 AM):

| Reporte | Vía AM | Tabla plana |
|---|---|---|
| Un mes, una finca, por trabajador | **1,08 ms** | 0,48 ms |
| Todo el histórico, sin filtro | **345 ms** | 230 ms |

El plan es el correcto: arranca por `reg_am` con `(finca_id, fecha_proceso)` y
entra a cosecha por la única (`eq_ref`), sin escaneo. **El costo no justifica
duplicar la verdad**: si `reg_cosecha.finca_id` dijera 1 y el AM dijera 2, la
nómina siempre le creería al AM, y la columna solo serviría para que alguien
lea la equivocada — que es exactamente cómo 3.176 filas de `z_tabla_am`
terminaron apuntando a módulos inexistentes. Si algún día esos 345 ms molestan,
lo que corresponde es una vista `vw_reg_cosecha` (o materializarla), no una
segunda copia del dato.

**LA SUMA DE LAS LIBRAS ES EL AVANCE DE LA TAREA.** `sync_cosecha` escribe
`reg_am.cantidad` con `total_peso` y marca `cierre_origen = 'cosecha'`. No es
una interpretación: de **14.466 pares** (PM de cosecha, fila de
`z_cosecha_cacao`) del mismo día, trabajador y subtarea, **13.835 tienen
`cantidad = total_peso` (95,6 %) y NINGUNO coincide con el conteo de sacos** —
la unidad de esas subtareas es Libra, no Saco.

`guid` es el mismo que queda en `reg_am.cierre_guid`: una cosecha **es** el
cierre de esa tarea, no un registro aparte que además la cierra. Vale también
para lo migrado.

El techo de 15 sacos de `z_cosecha_cacao.saco1..saco15` desapareció.

### Riego

**Riego NO cuelga de una tarea AM. Es una bitácora propia** (Kevin,
2026-09-03): el supervisor entrega su parte de riego y eso se registra tal
cual. Por eso `reg_riego` conserva `finca_id`, `supervisor_id`, `lote_id` y
`modulo_id` **propios** — no es denormalización, es su única fuente de verdad.

**Las tareas de riego sí se cierran con PM.** No se contradice con lo de arriba
porque son dos cosas distintas sobre la misma actividad: el AM/PM paga el
**jornal de la persona**, la bitácora registra **cuánta agua fue a qué lote y
por cuánto tiempo**. Los datos lo confirman: la tarea 3 (Riego) tiene 7
subtareas y **las 7 son en Jornal**, con 10.639 AM y 9.246 PM en el histórico,
mientras `z_riego` lleva sus 9.778 filas aparte.

Consecuencia práctica: **ninguna subtarea de riego se paga por Libra**, así que
el ruteo por unidad las deja del lado del PM sin ninguna lista aparte. Sus AM se
siguen cerrando desde el PM como cualquier otra tarea.

**Hueco conocido, sin dimensionar:** el mismo trabajo queda en dos lados **sin
enlace** — el AM/PM de la persona y la fila de bitácora. Hoy nadie puede
cruzarlos, así que un reporte de "horas de riego por lote con su costo de mano
de obra" no se puede armar. Se deja así a propósito (Kevin, 2026-09-03): el
puente no está dimensionado y no se inventa uno por las dudas.

`tiempo_riego` va en minutos enteros, no en `'HH:MM'` como VARCHAR: sumar y
comparar duraciones como texto es el mismo defecto que `fecha VARCHAR(10)`.

**`POST /v4/sync` con `tipo: riego` — HECHO el 2026-09-08.** Payload:
`{fecha_proceso, finca_id, supervisor_id, lote_id, modulo_id, tiempo_riego_min,
volumen_riego, observaciones}`. Lo que valida `sync_riego`:

- finca activa, supervisor activo (`eregistro`), lote **de esa finca** y, si
  viene, módulo **de ese lote** — la misma trampa que en AM: cada lote tiene su
  propio "1".
- `tiempo_riego_min` **obligatorio**, de 1 a 1440 (la columna es SMALLINT y un
  riego de más de un día es un dedazo: el máximo real de v3 son 4 h).
- `volumen_riego` opcional, `>= 0`, por defecto 0.
- I1: fecha futura → rechazo duro, igual que en AM.
- `subtarea_id` se escribe **NULL** siempre, y **no hay `captura_guid`**: esa
  columna no existe en `reg_riego` y no se inventa.
- El id público de `results` es el de `reg_riego`, no el de ningún AM: riego no
  cierra nada.

### Postcosecha

**El DDL vive en `docs/db/migrations/02-tablas-v4.sql` y manda sobre este
documento.** Acá estaba copiado con los nombres de la primera versión
(`pc_lote`, `pc_lote_cosecha`, una sola `pc_calidad`, `pc_lote_seq`) y quedó
mintiendo seis días: se sacó a propósito para que no vuelva a pasar.

| tabla | qué guarda |
|---|---|
| `pc_proceso` | la partida: `lot_code`, `fecha_cosecha`, pesos y el cierre |
| `pc_proceso_cosecha` | qué cosechas la componen. `UNIQUE (cosecha_id)`: una cosecha entra en una sola partida |
| `pc_etapa` | las cinco etapas, `UNIQUE (partida, etapa)` |
| `pc_calidad_fermentacion` | el corte de grano, una por partida |
| `pc_calidad_secado` | humedad e índice de grano, una por cada secado |
| `pc_foto` | fotos por etapa |
| `pc_lot_code_seq` | el consecutivo del `lot_code` |

Tres cosas que el servidor calcula y el teléfono **no manda**: `peso_lote` (suma
congelada de las cosechas enlazadas), `fecha_cosecha` (la menor de esas
cosechas) y `lot_code`. `peso_baba` y `humedad_promedio` son columnas generadas.

**La calidad son DOS tablas y no una** porque miden cosas distintas: el corte de
grano del fermentado (buena/ligera/violeta, enteros) y la humedad de los
secados. Colapsarlas dejaba 66 mediciones reales sin dónde ir.

Los porcentajes de fermentación **no se guardan**: se calculan desde
`buena/ligera/violeta`. Guardar un porcentaje derivado es guardarse una
inconsistencia futura.

### Revisión de registros — `reg_flag`

La bitácora de lo que `POST /v4/sync` **no pudo guardar bien**. La escribe el
servidor en el momento; se lee desde la base. No la ve el usuario, no hay
pantalla y no influye en el ACK.

```sql
CREATE TABLE reg_flag (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  origen       VARCHAR(15)  NOT NULL,   -- am | pm | cosecha | riego | postcosecha
  codigo       VARCHAR(15)  NOT NULL,   -- rechazado | duplicado | error
  guid         CHAR(36)     NOT NULL,
  registro_id  INT          NULL,       -- la fila de reg_am, cuando existe
  detalle      VARCHAR(255) NULL,
  payload      JSON         NULL,       -- el registro completo, como llegó
  device_alias VARCHAR(50)  NULL,
  created_at   DATETIME     NOT NULL
);
```

**`registro_id` es nullable y por eso el `payload` no es opcional.** Un rechazo
nunca llega a existir en `reg_am`: si no se guarda el payload, la marca queda
como "el guid X falló por Y" y no hay forma de reconstruir qué se intentó
cargar. Es el mismo patrón de `mig_descarte`.

**`origen` es el módulo, no la tabla.** AM y PM son la misma fila de `reg_am`;
que la marca venga de `pm` significa que lo que falló fue el **UPDATE del
cierre**, no un alta. `device_alias` va aparte porque viaja en la cabecera del
lote, no en el payload.

#### Los tres códigos

| Código | Cuándo | `registro_id` |
|---|---|---|
| `rechazado` | El registro salió `rejected`. `detalle` es el mismo `reason` que recibió el teléfono | NULL |
| `duplicado` | Se aceptó un AM de una persona que ya tenía otro en la misma subtarea, finca y día | el nuevo |
| `error` | Fallo de base: el registro queda PENDIENTE y hoy sólo aparecía en el log de PHP | NULL |

**El reenvío del mismo `guid` NO se marca.** Devuelve `duplicate` porque la app
reintenta cuando se pierde el ACK — wifi cortado, portal cautivo. Es el
protocolo funcionando; marcarlo llenaría la tabla de ruido normal y enterraría
el duplicado real.

**Distinta subtarea el mismo día tampoco es duplicado**: es una reasignación.
De los 63 pares (fecha, persona) repetidos de agosto, 9 lo eran.

#### Cómo se lee

`vw_reg_flag` (`docs/db/migrations/04-vistas-v4.sql`) resuelve finca, lote,
módulos, tarea, subtarea, trabajador y responsable a nombres, con LEFT JOIN a
`reg_am` porque un rechazo no tiene fila.

```sql
SELECT * FROM vw_reg_flag ORDER BY marcado_at DESC;
```

### Secuencia del `lot_code`

```sql
CREATE TABLE pc_lot_code_seq (
  julian_day SMALLINT NOT NULL,
  year_2d    TINYINT  NOT NULL,
  last_seq   TINYINT  NOT NULL DEFAULT 0,
  PRIMARY KEY (julian_day, year_2d)
) ENGINE=InnoDB;
```

```sql
INSERT INTO pc_lot_code_seq (julian_day, year_2d, last_seq)
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
- **Postcosecha: sólo las partidas cuyo peso está RESPALDADO** por las cosechas
  que se les pueden enlazar (Kevin, 2026-09-05). `peso_lote` es por diseño la
  suma congelada de `pc_proceso_cosecha`; una partida sin enlaces traería un
  peso que nadie puede recalcular. En la ventana entran 2 de 4, las dos
  cerradas; las dos que estaban en curso el 27-08 se quedan en `z_*` y **nadie
  las va a cerrar desde la app nueva**. La app nueva arranca sin partidas
  abiertas.
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

`docs/db/migrations/03-migracion-agosto.sql`. Corrido dos veces seguidas sobre
la copia real: la segunda no inserta nada **y los 550 guid son los mismos** —es
idempotente y además reproducible, porque los guid se derivan del id de origen.
Cero rechazos de FK, cero filas tocadas en las `z_*`.

| origen (>= 2026-08-01) | destino |
|---|---|
| `z_tabla_am` 590 | `reg_am` 529 filas en 367 capturas, 61 descartes |
| `z_tabla_pm` 598 | 495 cierres sobre filas de `reg_am` + 21 filas nuevas `mig-pm`, 103 descartes |
| `z_cosecha_cacao` 60 | `reg_cosecha` 41, 201 sacos, 17.701,00 lb (9 duplicados exactos, 10 sin cierre AM) |
| `z_riego` 279 | `reg_riego` 106 (173 duplicados exactos, todos del 2026-08-19) |
| `z_postharvest_*` 4 partidas | `pc_proceso` 4, 25 enlaces, 13 etapas, 2 calidades, 4 fotos |

529 + 61 = 590 y 495 + 103 = 598: todo lo que entró está o migrado o auditado.
`mig_descarte` queda con 359 filas y **nada se borra del origen**: los duplicados
exactos de cosecha y riego se marcan y se saltan, pero siguen enteros en `z_*`.
El `peso_lote` de las 4 partidas es la suma exacta de su cosecha enlazada.

Tres cosas que salieron al escribirlo y no estaban en ningún documento:

1. **`z_riego.hora` vale `'0'` en las 9.778 filas.** Columna muerta, como
   `codigo_tarea` y `codigo_subtarea`. No hay hora del día en el origen: se usa
   la de `created_at` cuando cae el mismo día (35 de 279) y 00:00 en el resto.
2. **14 de las 60 filas de cosecha de agosto traen `finca = 0`.** La columna
   tiene `DEFAULT 0` y la app vieja no siempre la manda. Se deriva de
   `z_lote.finca_id`, que sí la tiene, y queda constancia en `mig_descarte`.
3. **MariaDB no soporta `LATERAL`.** El despivote de `saco1..saco15` va con una
   tabla de números y `CASE`, no con un derivado lateral.

### Bis — vistas UNION para los reportes de la web — RETIRADAS (2026-09-02)

> **Se retiraron el 2026-09-02.** El SQL está en
> `docs/db/migrations/_historico/2026-08-31-03-vistas-union.sql`, con el porqué
> en el README de esa carpeta. En corto: la web resuelve v3/v4 con un selector
> por período, así que nadie mezcla; las dos vistas escritas hoy están rotas
> (leen `reg_pm`); agosto está duplicado a propósito y una UNION sin corte lo
> cuenta doble; y toda vista con UNION es de sólo lectura, así que no sirve para
> los formularios. **Lo que sigue valiendo es la medición**, que costó tiempo
> obtener y está abajo.

Kevin confirmó que las pantallas de la web siguen en uso, y decidió (2026-08-31)
**convivencia con diferenciador**: las dos mitades se leen unidas, cada fila
marcada con su origen, hasta una fusión futura sin fecha.

Probado el 2026-08-31 sobre una **copia real de la base** (MariaDB 10.11,
108.149 filas en `z_tabla_pm`, la ventana de agosto migrada).
SQL en `docs/db/migrations/_historico/2026-08-31-03-vistas-union.sql`.

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
   sale **dos veces**: está migrado en `reg_am` y sigue en `z_tabla_pm`.
   Son 598 filas de nómina contadas doble.
3. **Sólo lectura.** Toda vista con `UNION` es no actualizable: `UPDATE` da
   **ERROR 1288** y `information_schema.views.is_updatable = NO`. Grocery CRUD
   puede **listar** desde la vista; insertar, editar y borrar siguen contra la
   tabla base. No hace falta clave sintética de texto: basta con desplazar los
   `id` nuevos (`r.id + 1000000`; los viejos llegan a ~121.000), y así la PK
   sigue siendo entera.

### El trabajo real: NO eran 19 vistas — HECHO el 2026-09-14

Este párrafo decía "20 vistas dependen de las `z_*` transaccionales, una ya está
hecha, quedan 19". **Al medirlo contra la base real el 2026-09-14 el número se
cayó solo.** Hay **22 vistas v3**, y se reparten así:

| grupo | n | qué pasa |
|---|---|---|
| No tocan nada que V4 reemplace | 10 | las 3 de fotos, las 2 de `dryingquality`, `maxlot`, `paymenthistory`, los 2 `util_*` |
| **Muertas** | 5 | `vwpmdetail`, `vw_reporte_pago`, `vw_reporte_pago2`, `vw_pm_payment_adjustment_list`, `vw_opr_pm_payments_daily_adjustments` |
| **Hechas** | 5 | ver abajo |
| No se pueden repuntar hoy | 3 | los dos de ajustes + `vw_postharvest_rpt_001` |

**"Muertas" quiere decir que ningún controlador ni modelo las nombra**: sólo
aparecen en `application/logs/log-2024-11-*.php`. **Cuidado con
`vw_reporte_pago`**: sigue siendo el criterio de aceptación de la nómina, pero
**la web no la lee**, así que repuntarla no le sirve a ninguna pantalla.

Las cinco hechas, todas en `04-vistas-v4.sql` y con **contrato de columnas
idéntico al de su gemela v3** (verificado con `information_schema`, de modo que
cambiar una pantalla sea cambiar el nombre de la tabla y nada más):

| V4 | reemplaza a | la abre |
|---|---|---|
| `vw_reg_reporte_am_base` | `vw_reporte_am_base` | `AM.php` |
| `vw_reg_reporte_am` | `vw_reporte_am` | `AM.php`, `Reporteam_model.php` |
| `vw_reg_reporte_pm` | `vw_reporte_pm` | `PM.php`, `Pm_model.php` |
| `vw_reg_cosecha_resumen` | `vw_cosecha_cacao_resumen` | `Cosechacacao.php` |
| `vw_reg_harvest_pending_lots` | `vw_harvest_pending_lots` | `Postharvest_model.php` |

Sigue siendo cierto que **no es "el mismo cambio de una palabra"**: el AM y el PM
son ahora la misma fila, la cosecha tiene tabla de sacos y la postcosecha tiene
el enlace con cosecha que el esquema viejo nunca tuvo. Las viejas **no se
tocan**: siguen leyendo `z_*` hasta julio de 2026. Las diferencias deliberadas —
semana ISO, `fecha` como DATE de verdad, `jornales` por `COUNT(*)`— y las dos
verrugas de v3 que se conservan a propósito están comentadas vista por vista en
el archivo.

**Los ajustes de pago se quedan en v3** (Kevin, 2026-09-14).
`vwpm_paymentadjustment_fullreport` y `vw_temporaryworkers_pivot` leen
`tbl_pm_payment_daily_adjustment`, `tbl_pm_payment_weekly_deductions` y
`tbl_pm_payment_paymenthistory`, que V4 no modela. **Las tres están en CERO
filas**: maquinaria construida y nunca usada, y `Payment_model.php` —el archivo
con más lógica de negocio del repo— opera sobre ellas. En vez de replicarlas, al
final de `04-vistas-v4.sql` hay un **guardián** que aborta el archivo si dejan de
estar vacías. Es el mismo caso de
`tbl_pm_payment_daily_adjustment.pm_id`, que tiene **FK a `z_tabla_pm(id)`** y no
puede apuntar a `reg_am`: si el módulo se activa, hay que modelar los ajustes y
repuntar esa FK **antes del corte**.

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
       a.modulos, a.personal_id, a.subtarea_id,
       IF(a.cierre_guid IS NULL,'0','1') AS tiene_pm
FROM reg_am a;
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
| GET  | `/v4/postcosecha_pendientes` | Cosechas que todavía no entraron en ninguna partida, agrupadas por día. |
| GET  | `/v4/postcosecha_abiertas` | Partidas sin peso final, con su última etapa. |

**Sin guiones en las rutas**: CI mapea el segmento de URI al nombre del método y
`postcosecha-pendientes` no es un identificador PHP válido. Es la misma razón
por la que `am_abiertos` se llama así.

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
    { "guid": "ad31cfcb-...", "status": "created", "id": 42 }
  ]
}
```

`tipo` ∈ `am | pm | cosecha | riego | pc_proceso | pc_etapa | pc_calidad_ferm |
pc_calidad_sec | pc_resultado`.

**`pc_resultado` cierra la partida**: escribe `peso_final` y deja la etapa
`resultado` en la misma transacción, porque para el supervisor es un solo acto.
Por eso `pc_etapa` rechaza `etapa: resultado`. El cierre es atómico con
`peso_final IS NULL` en el WHERE, igual que `cierre_guid IS NULL` en el PM.

**El PM no cierra lo que se paga por peso** (Kevin, 2026-09-05): ahí la cantidad
son los sacos y eso tiene formulario propio. El criterio es la **unidad**, no la
tarea: `Supervisor de cosecha` cuelga de la tarea Cosecha y se paga por jornal,
así que la cierra el PM. **Las dos pantallas se reparten una sola lista** —
`cosecha_subtarea_ids` de `application/config/v4.php`, vacía = derivar las
subtareas activas cuya unidad esté en `cosecha_unidad_ids` (hoy `4` = Libra, las
seis de cacao). Un criterio distinto de cada lado deja subtareas sin quien las
cierre; era el caso de la subtarea 24.

### Estado: `am`, `pm` y `cosecha` IMPLEMENTADOS y probados

`V4::sync_post()` ya no devuelve 501. Probado con `curl` contra CodeIgniter
levantado sobre la copia real de la base (receta en la memoria del proyecto).

**La regla que hace todo lo demás simple: un guid que NO aparece en `results`
se queda PENDIENTE en el teléfono y se reintenta.** Eso se usa a propósito en
tres casos:

1. **Tipos todavía no implementados** (`riego`, `pc_*`): se omiten en silencio.
   El día que existan, la cola los reenvía sola. Nadie tiene que tocar el
   teléfono.
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

### El contrato de `POST /v4/sync` con el modelo final

La forma de `reg_am` y las razones del diseño están en §3. Acá sólo el contrato
y lo que se probó.

```json
{ "tipo": "am",
  "payload": { "captura_guid": "…", "fecha_proceso": "…", "finca_id": 1,
               "responsable_id": 26, "cultivo_id": 1, "lote_id": 2,
               "subtarea_id": 65, "modulo_ids": [3,8,25],
               "personal_id": 4, "comentario": "" } }

{ "tipo": "pm",
  "payload": { "am_guid": "…", "trabajador_id": 4, "responsable_id": 26,
               "cantidad": 2.5, "hora_cierre": "…", "comentario": "" } }

{ "tipo": "cosecha",
  "payload": { "am_guid": "…", "trabajador_id": 4, "responsable_id": 26,
               "hora_cierre": "…",
               "sacos": [ {"numero": 1, "libras": 50.5},
                          {"numero": 2, "libras": 48.25} ],
               "total_sacos": 2, "total_peso": 98.75,
               "observaciones": "" } }
```

`personal_id` va **en singular**: cada persona es su propio registro, con su
propio guid y su propio ACK. La pantalla acumula varias personas y manda N
registros; eso es del front, no del modelo. Las N comparten `captura_guid`.

`trabajador_id` en el cierre es redundante —la fila ya sabe de quién es— pero si
viene tiene que coincidir: es la red que atrapa un `am_guid` mal copiado antes
de escribir el avance en la persona equivocada.

Finca, cultivo, lote, subtarea, módulos, fecha de proceso y hora de inicio los
**deriva el servidor del AM**. El teléfono ya no puede contradecir la
programación de la mañana, que era el agujero real.

**Probado con `curl` contra la base real:**

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

**Cosecha y el reparto con el PM, probado con `curl` contra la base real
(2026-09-03):**

| caso | resultado |
|---|---|
| cosecha sobre un AM de cosecha abierto | `created` con el id del AM; `reg_am.cantidad` = suma de libras, `cierre_origen = 'cosecha'` |
| cosecha sobre un AM que NO es de cosecha | `rejected` — "se cierra desde el PM" |
| **PM sobre un AM de cosecha** | `rejected` — "se cierra desde su propia pantalla" |
| `trabajador_id` que no es el de la fila | `rejected` |
| totales del teléfono descuadrados | `created` con los del servidor + marca `error` en `reg_flag` |
| `sacos: []` / dos sacos con el mismo número | `rejected` |
| el mismo lote otra vez | `duplicate` con **el id del AM**, sin filas nuevas |
| `GET /v4/am_abiertos?fecha=2026-08-18` | 25 abiertas → **4** para el PM y **18** para cosecha (3 de poscosecha no salen en ninguna) |

Un saco de 0 libras se rechaza: es una celda vacía de la grilla de 15, no un
saco. Y el id que vuelve es **siempre el de `reg_am`**, también en `duplicate`:
antes un mismo guid devolvía el id del AM al crearse y el de `reg_cosecha` al
reenviarse.

### La migración, y el cuadre que la valida

Las cuatro migraciones consolidadas están en `docs/db/migrations/` (`01..04`);
las siete anteriores, en `_historico/` con un README que dice de qué estado a
qué estado llevaba cada una. **Producción nunca tuvo `reg_am_personal` ni
`reg_pm`**, así que las migraciones no la hacen pasar por ellas.

Corrido desde el dump, con sólo `01..04`:

| | |
|---|---|
| filas de `reg_am` | **550** |
| cerradas / abiertas | **495 / 55** |
| capturas distintas | **367** |
| programaciones deducidas (`origen='mig-pm'`) | **21** |
| `vw_reg_reporte_pago` de agosto | **495 filas, 79.298,40 en cantidad, 15.091,66 en total** |

Ese último renglón es idéntico a lo que devuelve `vw_reporte_pago` desde
`z_tabla_pm`. **La nómina de agosto no se movió ni un centavo.** Es el criterio
de aceptación de cualquier cambio en las migraciones.

**Los 21 avances sin programación**: se les creó la fila completa, con
`origen = 'mig-pm'` y un comentario que lo dice. En V3 el PM era prácticamente
una copia del AM con más datos, así que la mañana se reconstruye del propio
avance. El modelo queda simétrico desde el 1 de agosto, sin excepciones.

**Los guid son deterministas**, derivados del id de origen
(`z_tabla_am:<id>`, `z_tabla_pm:<id>`, `am-de-pm:<id>`). Por eso la migración es
reproducible: dos corridas dan exactamente la misma base y se pueden comparar.
La versión anterior sacaba 183 de los 550 guid de `UUID()` y no lo era.

**Trampa del dump:** `docs/db/init/01-schema.sql` trae las tablas v4 en su forma
vieja, vacías, y `CREATE TABLE IF NOT EXISTS` las acepta en silencio. Por eso
`02-tablas-v4.sql` abre con un guardián que aborta con un mensaje legible.


### `GET /v4/catalogos`: las subtareas viajan con `id_finca`

`z_subtarea.id_finca` existía y no se estaba usando. Cada finca tiene su propio
juego: **78 subtareas activas en Bellita y 21 en Pacaritambo**. La app filtra
por finca — y también las tareas, mostrando solo las que tienen al menos una
subtarea de esa finca, para que nadie elija una tarea y se encuentre la lista
de subtareas vacía.

`z_tarea` **no** tiene finca; el corte por finca solo se puede hacer desde la
subtarea hacia arriba.

### El PM cierra un AM: qué arregló del diseño anterior

*(La mecánica y el contrato están arriba, en §El contrato de `POST /v4/sync`.
Esto es sólo lo que la decisión resolvió, que no se ve en el contrato.)*

Decisión de Kevin (2026-09-01): **"NO se pueden crear PM, un PM solo es el
reflejo de un AM".** Antes el PM era un registro suelto y el teléfono mandaba
finca, lote, subtarea y hora de inicio otra vez, así que podía contradecir la
programación de la mañana. Ahora los deriva el servidor.

Lo que eso arregló, verificado en la base: `hora_inicio` heredada del AM
(06:57:50) contra `hora_cierre` real (16:00) — **se acabaron los "0 días, 0
horas, 0 minutos" de la app vieja**, que salían de que el PM guardaba las dos
horas del mismo momento. Y `pm_week` = 33, igual que `WEEK('2026-08-13', 3)`.

**Lo que se acepta perder:** en agosto, 16 de 598 PM (2,7 %) fueron de gente sin
AM cargado esa mañana. Ahora hay que crear el AM primero.


### `GET /v4/am_abiertos?fecha=YYYY-MM-DD[&finca_id=N][&modulo=pm|cosecha]`

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

`modulos` sale de la columna `reg_am.modulos` resuelta a nombres con `FIND_IN_SET`, y va porque la
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

Desde el 2026-09-02 devuelve además **`captura_guid`**, que es lo que la pantalla
PM necesita para agrupar por tarea en vez de listar personas sueltas ordenadas
por nombre. Es `NULL` en las filas migradas con `origen = 'mig-pm'`, que no
salieron de ningún formulario: la app las trata como grupo de una sola persona.

### La justificación del registro retroactivo — CERRADO (2026-09-14)

`01-sincronizacion.md` exige una **justificación escrita** cuando la fecha supera
la ventana de retroactividad del módulo, y la pantalla la pide y bloquea el
guardado sin ella.

**Hasta el 2026-09-14 no había dónde guardarla**: viajaba dentro de `comentario`
con el prefijo `[RETROACTIVO]` y recortada a 255 caracteres junto con el
comentario del usuario, así que el motivo quedaba mezclado con texto libre y no
se podía consultar aparte.

**Ahora es un campo propio del payload, `justificacion_retro`** (opcional,
255), con su columna:

| tabla | columna | la escribe | sobre qué fecha |
|---|---|---|---|
| `reg_am` | `justificacion_retro` | `sync_am` | `fecha_proceso` |
| `reg_am` | `justificacion_retro_cierre` | `sync_pm`, `sync_cosecha` | `hora_cierre` |
| `reg_riego` | `justificacion_retro` | `sync_riego` | `fecha_proceso` |
| `pc_proceso` | `justificacion_retro` | `sync_pc_proceso` | `fecha_inicio` |

- **PM y Cosecha comparten columna** porque las dos cierran una fila de `reg_am`
  y las dos mandan `hora_cierre`. `reg_cosecha` no necesita columna propia.
- **`pc_etapa` no lleva justificación**: la única fecha de la partida que elige
  el usuario es `fecha_inicio`. Las etapas tienen su propia validación.
- **Omitir el campo deja NULL** y nada se rompe. NULL significa *la fecha cayó
  dentro de la ventana*, no *no se sabe*.
- **Por qué ahora y no después**: ninguna migración `reg_*` está aplicada en
  producción, así que agregar las columnas no cuesta nada. Nunca iba a ser más
  barato.
- `02-tablas-v4.sql` trae una **sección de `ALTER ... ADD COLUMN IF NOT EXISTS`
  al final** para las bases de desarrollo que ya tenían las tablas creadas: un
  `CREATE TABLE IF NOT EXISTS` no agrega columnas y V4.php fallaría al insertar
  con un mensaje que no dice nada de esto.

**Riego es el caso que lo justifica**: sus `observaciones` son **por fila** y un
registro real son 18-25 filas, así que meter el motivo ahí lo habría repetido 25
veces. Hoy una sola justificación se copia en las N filas del registro —es el
único lugar posible, porque cada fila es su propio registro con su guid y su ACK,
sin cabecera común— pero en un campo que se puede consultar.

Verificado con curl contra CI3 y la base real: los cinco tipos guardan el motivo
en su columna, y omitirlo deja NULL.

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

### Lo que se probó del resto del contrato, contra la base real

| caso | resultado |
|---|---|
| AM válido con 3 personas y 2 módulos | 3 `created`, un guid por persona |
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
| Registro de hace 20 días | `created` |
| AM a las 22:00 | `created` |
| `created_at_device` adelantado | `created` |
| Fallo del INSERT | rollback: la fila NO queda, y el guid se puede reenviar |
| Body ilegible / lote de 201 | 400 / 413 |

Tras los rechazos: **cero filas fantasma**.

Reglas del servidor, sin excepción:

- El año y la semana se DERIVAN de `fecha_proceso` con `WEEK(...,3)`; no se guardan.
- `total_sacos` / `total_peso` se recalculan desde el detalle.
- `lot_code` lo asigna el servidor.
- Los porcentajes de fermentación se calculan, no se guardan.
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
