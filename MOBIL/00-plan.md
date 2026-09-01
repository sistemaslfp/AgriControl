# 00 — Plan de la app móvil V4 (índice y estado)

Cerrado el 2026-08-28. Reemplaza a la app **LAgricontrol v2.0.5** (Ionic +
Capacitor, `io.ionic.starter`, sin repositorio disponible).

| Doc | Contenido |
|---|---|
| [01-sincronizacion.md](01-sincronizacion.md) | Offline-first, SQLite, cola, `guid`, definición del ACK, integridad de fechas, fotos, catálogos |
| [02-bd-y-api.md](02-bd-y-api.md) | Modelo de datos V4 sobre tablas nuevas, convivencia con V3, migración con data limpia, API, seguridad |
| [03-pantallas.md](03-pantallas.md) | Mapa de pantallas por módulo con correcciones |

## Decisiones cerradas

- **Proyecto Ionic + Angular nuevo.** Reescritura limpia, sin heredar código.
- **Tablas nuevas** (`reg_*`, `pc_*`) en la misma base. Las `z_*` se conservan
  intactas y sólo se renombran a `_v3` en el corte final. Los catálogos **no se
  duplican**.
- **Sin login**, alias de dispositivo configurable. **Sin edición** de registros
  en el teléfono.
- **ACK** = aparición del `guid` en `results` con `created` o `duplicate`. No es
  el HTTP 200. Automático, del servidor, por registro.
- **Ventana horaria AM/PM**: validación sólo local. El servidor no rechaza, deja
  flag. El criterio del usuario manda, pero queda medido.
- **Fechas**: retroactivo permitido con ventana por módulo y justificación
  escrita al excederla; **futuro rechazado siempre**. El reloj del teléfono sólo
  se usa corregido por el offset de `/v4/hora`.
- **`guid` = única unicidad dura.** La clave natural es índice de detección: el
  histórico tiene hasta 37 repeticiones de la misma combinación.
- **Fotos dentro del alcance**, se suben tras el ACK del registro padre.
- **`lot_code` `dddnnaa`** asignado por el servidor.
- **Swipe y flechas**, los dos, en los formularios paginados.
- **TLS obligatorio** y API key por dispositivo.

## Orden de construcción

1. **Esqueleto**: proyecto Ionic, SQLite, cola de sincronización, Configuración,
   catálogos, `/v4/hora` y `/v4/bootstrap`. Sin esto nada se puede probar.
2. **DDL** de las tablas nuevas en desarrollo + verificar que la web V3 no
   cambió en nada.
3. **AM y PM** — el 80% del uso diario.
4. **Pendientes / Enviados** con los tres estados reales.
5. **Cosecha de Cacao.**
6. **Postcosecha** — máquina de estados + fotos. El más caro.
7. **Riego** — al final, por decisión. Faltan capturas de pantalla para
   especificarlo.
8. **Migración** del histórico y **corte**.

## Pendientes

### Necesito respuesta

| # | Pendiente | Dónde |
|---|---|---|
| 1 | Las cinco ventanas de retroactividad (AM/PM 3 d, Cosecha 7 d, Riego 7 d, Postcosecha 30 d) | 01 §Integridad de fechas |
| 2 | ¿Se permite borrar un registro PENDIENTE nunca enviado? | 01 §Máquina de estados |
| 4 | ¿`lot_code` sin componente de finca es correcto? | 02 §3 |
| 7 | ¿Qué hace el botón `ADICIONAL` en Cosecha? | 03 §Cosecha |
| 8 | ¿Qué hace "Restricción de Finca" en Configuración? | 03 §Configuración |
| 9 | Capturas de pantalla del módulo Riego | 03 §Riego |

### Decidido

**#6 — Vocabulario (2026-08-31, Kevin). CERRADO.** **"Finca"** y
**"Responsable"** en toda la app. Se eligieron por coincidir con la base
(`z_finca`, `finca_id`, `responsable_id`), para no traducir entre pantalla,
BD y reporte. "Hacienda" y "Supervisor" no se usan más.

**#3 — Qué se migra (2026-08-28, Kevin).** Ventana de antecedente de **un mes:
desde `2026-08-01`**. En postcosecha, **sólo partidas cerradas**. La fusión
completa de `z_*` con `reg_*`/`pc_*` y la limpia de duplicados quedan
**diferidas sin fecha**.

**Convivencia con diferenciador (2026-08-31, Kevin).** Los reportes de la web
siguen en uso y leen las dos mitades unidas, con una columna `fuente`
('v3'/'v4') por fila. **Probado sobre una copia real de la base**: funciona,
cuesta +22 % en el conteo sin filtro y nada en las consultas filtradas. SQL en
`docs/db/migrations/2026-08-31-03-vistas-union.sql`, medición en
`02-bd-y-api.md` §5 bis. Son **20 vistas** las que hay que repuntar, no una.

**#11 — `lot_code` (2026-08-31, Kevin).** No hay etiquetas físicas. Se trabaja
como si el consecutivo hubiera arrancado en agosto. Cerrado.

**#10 — Partidas abiertas (2026-08-31, Kevin).** La v2.0.5 **no** va a convivir
con la app nueva; la web sigue como vista histórica de V3. Como la web sólo
permite VER postcosecha, una partida que quedara en `z_*` no la podría cerrar
nadie: se migran **las 4 partidas de la ventana, cerradas y en curso**. Cerrado.

**#12 — Nómina de agosto (2026-08-31, resuelto con datos).** No hace falta
decidir nada: `vw_reporte_pago` es `SELECT DISTINCT`, así que las 103 filas
duplicadas **nunca llegaron al pago**. El reporte devuelve 495 filas y
79.298,40 — exactamente lo mismo que la base migrada. La deduplicación no
cambia ni un centavo de lo ya pagado. Cerrado.

**#5 — PHP de produccion (2026-08-31, Kevin).** Se trabaja en **PHP 8.1**.
`docker/php/Dockerfile` pasa de `php:7.4-apache` a `php:8.1-apache`. El
comentario que decia que Grocery CRUD y CI 3.1.11 rompen en PHP 8 **se probo y
es falso**: bajo PHP 8.4 arrancan CI 3.1.11, ion_auth y Grocery CRUD 1.6.1
(listado, alta y edicion) sin fatales. Falta validar el guardado real, los
campos de archivo, el login POST y `Operations/PM` — lista en el Dockerfile.
Y ojo con `public/php.ini`: si produccion es PHP-CGI, borrarlo baja el limite
de subida a 2 MB y rompe las fotos.

**#Limpieza (2026-08-31, Kevin, DIFERIDO).** V3 no se arregla: los endpoints
quedan tal cual. Lo unico que se hara a futuro, por confirmar, es **eliminar
las filas repetidas que genero la app movil**. No incluye el bug de
`pm_year`/`pm_week` de V3, que sigue vivo y vuelve a morder en diciembre 2029.

**#AM sin personal (2026-08-31, Kevin).** Confirmado: es una validacion, no una
suposicion. El servidor rechaza un AM sin `personal_ids`, y **la app tiene que
bloquear el avance** de la pantalla AM si no hay al menos una persona asociada.

**Paso 3 bis — PM reescrito (2026-09-01, Kevin). El PM CIERRA un AM.**
"NO se pueden crear PM, un PM solo es el reflejo de un AM." La pantalla PM
dejó de capturar tareas: lista las asignaciones AM abiertas de la fecha
(`GET /v4/am_abiertos` + el espejo local, para las que aún no llegaron al
servidor) y solo carga el **avance** y quién cerró.

- DDL: `reg_pm.am_personal_id`, UNIQUE — una asignación se cierra una vez.
  `docs/db/migrations/2026-09-01-01-pm-cierra-am.sql`.
- **Se descartó fundir el PM dentro de `reg_am_personal`**, que era la otra
  opción: la cola del teléfono es solo-inserción e idempotente por guid, y
  "rellenar los campos que le faltan al AM" es un UPDATE de una fila que puede
  no existir todavía en el servidor. Con la columna, el PM sigue siendo un
  INSERT y si el AM no llegó el guid se omite de `results` y la cola reintenta
  sola. Además no toca la migración de agosto ni el reporte de pago.
- **Se acepta perder un caso**: en agosto 16 de 598 PM (2,7%) fueron de gente
  sin AM cargado esa mañana. Ahora hay que crear el AM primero.
- Probado con `curl` contra la base real ya migrada: 8 casos, cero filas
  fantasma. Tabla en `02-bd-y-api.md` §7.

**Selectores (2026-09-01, Kevin).** Ventana flotante que cierra tocando fuera,
**con el alto exacto de su contenido**; buscador solo con más de 10 opciones;
selección múltiple que aplica en vivo; tocar la opción ya elegida también
cierra. **Responsable filtrado por `rol = 8` y por finca** (verificado: son 6,
son exactamente los 6 responsables de los AM de agosto, y en las 590 filas la
finca del responsable siempre coincide con la del AM); elegirlo antes que la
finca ya no lo borra — se limpia solo si no pertenece a ella. Cascada
**Cultivo → Tarea → Subtarea**, y **los códigos de tarea/subtarea no se
muestran** (control interno).

**Lotes (2026-09-01, Kevin).** Se ordenan primero los numéricos por valor y
después los que tienen nombre, alfabéticamente; y **a los que tienen nombre no
se les antepone "Lote"**. En Bellita hay 5 lotes numéricos ("0" a "4") y 4
áreas con nombre (Administrativos, campamento, empacadora, área social), todas
de 1 ha y sin módulos.

**Módulos (2026-09-01).** La lista de tareas AM abiertas del PM muestra el
módulo junto al lote: sin él, dos asignaciones del mismo lote y la misma
subtarea se ven idénticas. `GET /v4/am_abiertos` lo devuelve desde
`reg_am_modulo`, y el espejo local del teléfono lo guarda en una columna nueva
`am_persona_local.modulos`.

**Vocabulario de pantalla (2026-09-01).** "Retroactivo" es jerga de estos
documentos. En la app el interruptor dice **"Estoy cargando un día anterior"**.

**Paso 3 — app (2026-08-31). Pantallas AM y PM HECHAS.** `MOBIL/app-v4/`,
rutas `/am` y `/pm`, habilitadas desde el menú. Verificado con una suite e2e
nueva contra el mock: `e2e/am-pm.spec.mjs`, **33 comprobaciones, todas en
verde**, incluyendo el payload campo por campo contra lo que exige
`sync_am`/`sync_pm`. Decisiones tomadas con Kevin ese día:

- **El trabajador del PM va en la TAREA, no en el encabezado.** `reg_pm`
  tiene `trabajador_id` a nivel de fila, así que el servidor nunca exigió lo
  contrario; un solo PM cubre la cuadrilla entera en vez de un formulario por
  persona.
- **La tarea AM nueva precarga solo cultivo y lote.** El personal se elige de
  cero cada vez.
- **Una tarea = un guid = una fila.** El ACK es por registro, así que un AM de
  tres tareas puede terminar con dos `created` y una `rejected`. La pantalla
  de revisión lo dice; no promete atomicidad.

**#AM abierto (2026-08-31, Kevin). Alcance acotado con datos.** *(La parte
que faltaba — el cierre AM→PM real — quedó resuelta el 2026-09-01, ver arriba.)* La regla es
"una persona no puede tener dos tareas AM a la vez; la anterior se cierra con
un PM". Lo que se implementó y por qué:

| nivel | comportamiento | por qué |
|---|---|---|
| dentro del formulario | **bloqueo duro** | es siempre un error de captura y se sabe sin consultar nada |
| entre formularios, mismo equipo | **aviso que exige confirmar** | ver la medición de abajo |
| entre equipos | **no se cubre** | offline no hay a quién preguntar |

La medición, sobre la ventana de agosto (590 filas de `z_tabla_am`): hay 63
pares (fecha, persona) con más de un AM el mismo día, pero **61 de los extras
son reintentos exactos** — misma hora, mismo lote, misma subtarea: es el
pendiente #Limpieza, no doble asignación. **Solo 9 son reasignaciones
legítimas**, y en ellas el PM que cerraba la anterior llegó recién a las 16:00.
Un bloqueo duro entre formularios habría impedido esas 9 capturas en el campo.

**Hallazgo que esto destapó:** `z_tabla_am` YA tiene una columna `tiene_pm`, y
hay un `Am_model::close_am()` con endpoints en V1, V2, V3 y API/V3. **Las
113.410 filas están en `'0'`: nunca se cerró ninguna.** Además `close_am()`
filtra por `date('Y-m-d')` del servidor, así que un PM retroactivo no cerraría
nada aunque se llamara. El mecanismo de V3 existe y está muerto. **`reg_am` de
V4 no tiene esa columna y `reg_pm` no tiene vínculo al AM**, así que hoy
"cerrarse en PM" no es expresable en el modelo nuevo.

**Paso 3 — servidor (2026-08-31).** `POST /v4/sync` implementado para `am` y
`pm` y probado con curl contra la base real. Detalle y tabla de pruebas en
`02-bd-y-api.md` §7. Falta la mitad de pantallas (AM/PM en la app) y los tipos
`cosecha`, `riego` y `pc_*`, que hoy se omiten de `results` a propósito.

**Alcance (2026-08-31, Kevin).** Las **dos fincas** (Bellita y Pacaritambo)
pasan a v4, porque la web va a usar v4. El corte por fecha global es correcto;
no hace falta filtrar por finca. Los endpoints V3 y las tablas `z_*` siguen
activos: la web los usa como "Datos Históricos" y otra finca sigue en ese
sistema.

### Acciones técnicas antes de escribir código

- Correr la consulta de `variantes` / `rango_seg` sobre `z_tabla_pm` (02 §5) para
  saber si los duplicados son reintentos o tramos reales. Define la regla de
  migración.
- Sacar `.env` del control de versiones. Agregarlo a `.gitignore` **no
  lo destrackea**: hace falta `git rm --cached .env`. El repo tiene **un solo
  commit y ningún remoto**, así que un `git commit --amend` lo borra del
  historial por completo. No hizo falta rotar credenciales: nunca salió del disco.
- Cerrar `.htaccess` a todo lo que no sea `index.php` y `assets/`.

### Bloqueante conocido

El repositorio Android original no existe. Todo lo de aquí exige recompilar, lo
cual está resuelto por la reescritura — pero el APK v2.0.5 instalado sólo acepta
HTTP contra `localhost`, `192.168.0.5`, `192.168.0.16` y `192.168.2.67`
(`network_security_config.xml`). Para probar la app vieja contra el Docker local
sigue haciendo falta `adb reverse tcp:8080 tcp:8080`.

## Prompt de arranque

Mapa de la base (qué tabla usa v3, cuál v4, cuáles se comparten): `04-mapa-bd.md`.

`PROMPT-ARRANQUE.md` — texto listo para abrir la sesión de implementación del
paso 1.

## Hecho el 2026-08-28

- Movidos a `_to_delete/public-2026-08-28/`: `colmillo.php` (Adminer 4.8.1
  expuesto por HTTP), `info.php` (`phpinfo()`), `dole.php`, `error_log`.
