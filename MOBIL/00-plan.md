# 00 — Plan de la app móvil V4 (índice y estado)

Reemplaza a la app **LAgricontrol v2.0.5** (Ionic + Capacitor,
`io.ionic.starter`, sin repositorio disponible). Abierto el 2026-08-28,
al día al **2026-09-02**.

| Doc | Contenido |
|---|---|
| [01-sincronizacion.md](01-sincronizacion.md) | Offline-first, SQLite, cola, `guid`, definición del ACK, integridad de fechas, fotos, catálogos |
| [02-bd-y-api.md](02-bd-y-api.md) | Modelo de datos V4, convivencia con V3, migración, contrato de la API, seguridad |
| [03-pantallas.md](03-pantallas.md) | Mapa de pantallas por módulo |
| [04-mapa-bd.md](04-mapa-bd.md) | Qué hay en la base hoy y quién usa cada tabla |
| [PROMPT-CONTINUAR.md](PROMPT-CONTINUAR.md) | Estado para abrir una sesión nueva. **Empezar por acá** |
| [app-v4/e2e/README.md](app-v4/e2e/README.md) | Cómo correr las suites y las trampas de Ionic |

## Orden de construcción

| # | Paso | Estado |
|---|---|---|
| 1 | **Esqueleto**: proyecto Ionic, SQLite, cola, Configuración, catálogos, `/v4/hora`, `/v4/bootstrap` | **HECHO** (2026-08-31) |
| 2 | **DDL** de las tablas nuevas + verificar que la web V3 no cambió | **HECHO** — `docs/db/migrations/02-tablas-v4.sql`, 13 tablas |
| 3 | **AM y PM** — el 80 % del uso diario | **HECHO** — `POST /v4/sync` y las pantallas `/am` y `/pm` |
| 4 | **Pendientes / Enviados** con los tres estados reales | **HECHO** — pantalla `/registros`, una sola para las dos mitades |
| 5 | **Cosecha de Cacao** | **HECHO** — cierra una tarea AM: `tipo: cosecha` en `/v4/sync` y la pantalla `/cosecha` |
| 6 | **Postcosecha** — máquina de estados + fotos. El más caro | pendiente |
| 7 | **Riego** — bitácora propia, no cierra tareas AM. `reg_riego` ya está y no se rehace | pendiente — faltan las capturas (#9) |
| 8 | **Migración del histórico y corte** | diferido sin fecha |

La migración de la ventana de agosto está **hecha y verificada**
(`docs/db/migrations/03-migracion-agosto.sql`), y es independiente del paso 8:
migra desde 2026-08-01, no el histórico.

---

# Decisiones cerradas

Una conclusión por tema. Si algo acá contradice al código, **el código gana** y
se actualiza esto en el mismo commit.

## Qué cierra cada pantalla

**El PM no cierra cosecha ni poscosecha** (Kevin, 2026-09-03). Esas dos piden
más datos que una cantidad y tienen formulario propio; el PM queda para lo
administrativo y las tareas puntuales. De los 550 AM de agosto, **252 son de
cosecha y 38 de poscosecha**: más de la mitad de la lista del PM no le
correspondía.

**Cosecha funciona como el PM: cierra una tarea AM.** No crea tareas y no vuelve
a elegir trabajador — las personas ya vienen de la programación de la mañana.
Solo carga los sacos de cada una, y **la suma de las libras pasa a ser el avance
de la tarea** (`reg_am.cantidad`). Medido sobre 14.466 pares del histórico:
95,6 % de los PM de cosecha tienen `cantidad = total_peso` y ninguno coincide
con el conteo de sacos.

**Poscosecha queda sin quién la cierre hasta el paso 6.** Son 38 AM en agosto,
unidad Jornal. Es la consecuencia conocida de sacarla del PM.

**Riego no cierra nada: es una bitácora propia** (2026-09-03). El supervisor
entrega su parte y se registra tal cual, así que `reg_riego` conserva sus
`finca_id`, `supervisor_id`, `lote_id` y `modulo_id` — es su única fuente de
verdad, no una copia del AM. **Las tareas de riego del AM sí se cierran con
PM**: son dos cosas distintas sobre la misma actividad, el AM/PM paga el jornal
de la persona (las 7 subtareas de la tarea Riego son en Jornal, con 10.639 AM y
9.246 PM en el histórico) y la bitácora registra el agua (9.778 filas en
`z_riego`). Riego **no** entra en `tarea_cosecha_ids` ni `tarea_poscosecha_ids`.

*Queda un hueco conocido y sin dimensionar: los dos lados no tienen enlace, así
que no se puede cruzar el agua con el costo de mano de obra. Se deja así a
propósito.*

**Cosecha no repite las columnas del AM, y el costo está medido**: sobre 2× el
volumen real, un reporte de un mes y una finca cuesta 1,08 ms yendo por el AM
contra 0,48 ms con una tabla plana; el histórico completo sin filtro, 345 ms
contra 230 ms. No alcanza para justificar una segunda copia del dato que la
nómina no va a creer. Si algún día molesta, se resuelve con una vista.

## El modelo de datos

**UN REGISTRO = UNA PERSONA EN UNA TAREA.** `reg_am` es la única tabla: lleva la
programación de la mañana, la persona y el cierre de la tarde en la misma fila.
Es la forma de `z_tabla_am`. No existen `reg_am_personal`, `reg_pm`,
`reg_pm_modulo` ni `reg_am_modulo`.

**El PM no es una tabla: es un UPDATE de esa misma fila.** Es idempotente porque
el guid del cierre vive en la fila (`cierre_guid`), y el UPDATE lleva
`AND cierre_guid IS NULL`, así que el cierre es atómico sin transacción. Mismo
guid → `duplicate`; otro guid sobre una fila cerrada → `rejected`; el AM todavía
no llegó al servidor → el guid se omite de `results` y la cola reintenta sola.

*La objeción que se le había puesto a este diseño —"la cola es solo-inserción y
un UPDATE necesita su propia historia de idempotencia"— tenía respuesta, y es
ésa. Las mismas garantías que el INSERT.*

**Los módulos son una columna con comas; las personas son filas.** No es
inconsistencia. Un módulo es un elemento de un conjunto sin atributos propios, y
una lista con comas guarda bien un conjunto. Una persona, con el cierre adentro,
carga seis datos suyos —avance, hora de cierre, comentario, quién cerró, guid
del cierre y fecha del cierre—: en columnas con comas serían seis listas
alineadas por posición, una coma dentro de un comentario desalinea todo en
silencio, y cerrar a UNA persona obligaría a reescribir la cadena entera, así
que dos equipos cerrando personas distintas de la misma tarea se pisarían y se
perdería un avance. Con una fila por persona son dos UPDATE a filas distintas.

El costo de repetir la cabecera está medido: **el 27,5 % de las capturas de
agosto tienen más de una persona, con un máximo de 9** (medido el 2026-09-02
sobre las 367 capturas migradas). `z_tabla_am` hace exactamente esto con 113.410
filas y ocupa 8,7 MB.

**Lo que sostiene la integridad de `modulos` sin FK:** que ya **no se pueden
borrar módulos**. `Modulo.php` llama `unset_delete()` sin condición de grupo; la
baja se hace con `estado` = Inactivo. Ese borrado era la causa real de que
**3.176 filas de `z_tabla_am` (2,80 %) apunten hoy a módulos inexistentes** — un
VARCHAR no pudo impedirlo, pero una tabla hija tampoco habría impedido el DELETE
que las rompió. Sumado a la validación de `sync_am` (módulo ∈ lote, que cubre
las otras 16 filas que apuntan a un módulo de otro lote), la columna queda tan
sana como la tabla. Queda resignado que un `DELETE` por SQL directo deje ids
colgando: en este servidor eso no es teórico, hubo un Adminer expuesto por HTTP
hasta el 2026-08-28.

`captura_guid` conserva qué filas salieron del mismo formulario, que es lo que
"Registros Enviados" necesita para mostrar una tarjeta y no cinco.

## Convivencia con V3

- **Las tablas `z_*` y los endpoints V3 quedan activos hasta nuevo aviso.** La
  web los usa como "Datos Históricos" y otra finca sigue trabajando con ese
  sistema. **No proponer renombrarlos a `_v3` ni apagar V3.**
- **Se migró sólo desde `2026-08-01`**, ambas fincas. El histórico se queda en
  `z_*`. La fusión completa está **diferida sin fecha**. *(Pendiente #3)*
- **La web resuelve v3/v4 con un selector por período**: hasta 2026-07-31 sólo
  v3; agosto los dos (duplicado a propósito, es el colchón de comparación);
  desde 2026-09-01 sólo v4. **Con eso no hacen falta vistas UNION** — y hay tres
  razones más en `docs/db/migrations/_historico/README.md`.
- **Sólo se reciclan los catálogos.** Ninguna tabla transaccional se reutiliza.
- **La app v2.0.5 no convive con la nueva.** Por eso se migraron también las 4
  partidas de postcosecha de la ventana, **abiertas incluidas**: la web sólo
  permite VER postcosecha, así que una partida que quedara en `z_*` no la
  cerraría nadie. *(Pendiente #10)*
- **V3 no se arregla.** Lo único futuro, por confirmar, es borrar las filas
  repetidas que generó la app móvil. **No incluye el bug de `pm_year`/`pm_week`,
  que sigue vivo y vuelve a morder en diciembre de 2029.** *(Pendiente
  #Limpieza, diferido)*
- **Producción sigue en V3.** Ninguna migración de V4 está aplicada allá; todo
  el trabajo pasó por la base de desarrollo. Por eso las migraciones se
  consolidaron en cuatro archivos y las de conversión se retiraron a
  `_historico/`.

## Migración y nómina

**El cuadre que vale, y el criterio de aceptación de cualquier cambio en las
migraciones:** partiendo del dump y corriendo sólo `01..04`, la base queda en
**550 filas, 495 cerradas, 55 abiertas, 21 deducidas, 367 capturas**, y
`vw_reg_reporte_pago` de agosto da **495 filas, 79.298,40 de cantidad y 15.091,66
de total** — idéntico a `vw_reporte_pago` desde `z_tabla_pm`. La nómina no se
movió un centavo.

*(Ojo: el 79.298,40 es la suma de **cantidad**, no de dinero. El dinero es
15.091,66.)*

**Las 21 filas deducidas** son avances de `z_tabla_pm` sin AM que los respalde.
En V3 el PM era prácticamente una copia del AM, así que la mañana se reconstruye
del propio avance; quedan con `origen = 'mig-pm'`.

**Los duplicados nunca llegaron al pago.** `vw_reporte_pago` es
`SELECT DISTINCT`, así que las 103 filas duplicadas de agosto nunca se pagaron.
La deduplicación no cambia ni un centavo de lo ya pagado. *(Pendiente #12,
resuelto con datos)*

## La app

- **Proyecto Ionic + Angular nuevo.** Reescritura limpia, sin heredar código.
  Angular 22 zoneless + Ionic 9 + Capacitor 8. **v0.1.1**, autoría **Life Food
  Products**.
- **Sin login**, alias de dispositivo configurable. **Sin edición** de registros
  en el teléfono.
- **ACK** = aparición del `guid` en `results` con `created` o `duplicate`. No es
  el HTTP 200. Automático, del servidor, por registro.
- **Una tarea = un guid = una fila.** Un AM de tres tareas puede terminar con dos
  `created` y una `rejected`. Ninguna pantalla promete atomicidad.
- **`guid` = única unicidad dura.** La clave natural es índice de detección: el
  histórico tiene hasta 37 repeticiones de la misma combinación.
- **Ventana horaria AM/PM**: validación sólo local. El servidor no rechaza, deja
  flag. El criterio del usuario manda, pero queda medido.
- **Fechas**: retroactivo permitido con ventana por módulo y justificación
  escrita al excederla; **futuro rechazado siempre**. El reloj del teléfono sólo
  se usa corregido por el offset de `/v4/hora`.
- **Fotos dentro del alcance**, se suben tras el ACK del registro padre.
- **`lot_code` `dddnnaa`** asignado por el servidor. No hay etiquetas físicas: se
  trabaja como si el consecutivo hubiera arrancado en agosto. *(Pendientes #4 y
  #11)*
- **Swipe y flechas**, los dos, en los formularios paginados.
- **TLS obligatorio** y API key por dispositivo.
- **PHP 8.1.** El comentario que decía que Grocery CRUD y CI 3.1.11 rompen en
  PHP 8 **se probó y es falso**: bajo PHP 8.4 arrancan CI 3.1.11, ion_auth y
  Grocery CRUD 1.6.1 (listado, alta y edición) sin fatales. Falta validar el
  guardado real, los campos de archivo, el login POST y `Operations/PM` — lista
  en `docker/php/Dockerfile`. **Ojo con `public/php.ini`**: si producción es
  PHP-CGI, borrarlo baja el límite de subida a 2 MB y rompe las fotos.
  *(Pendiente #5)*

## Vocabulario y pantalla

- **"Finca" y "Responsable"**, en toda la app. Se eligieron por coincidir con la
  base (`z_finca`, `finca_id`, `responsable_id`), para no traducir entre
  pantalla, BD y reporte. "Hacienda" y "Supervisor" no se usan más.
  *(Pendiente #6)*
- **"Retroactivo" es jerga de estos documentos.** En pantalla el interruptor dice
  **"Estoy cargando un día anterior"**.
- **Los códigos de tarea y subtarea no se muestran**: son control interno.
- **Los selectores son ventanas flotantes** con el alto exacto de su contenido,
  que cierran tocando fuera; el buscador aparece sólo con más de 10 opciones; la
  selección múltiple aplica en vivo; tocar la opción ya elegida también cierra.
- **Lotes**: primero los numéricos por valor, después los de nombre,
  alfabéticamente; y **a un lote con nombre no se le antepone "Lote"**. En
  Bellita hay 5 numéricos ("0" a "4") y 4 áreas con nombre (Administrativos,
  campamento, empacadora, área social), todas de 1 ha y sin módulos. `Módulos`
  va justo debajo de `Lote`.

## Reglas de captura

- **Cascada Cultivo → Tarea → Subtarea.** Tareas y subtareas **se filtran por
  finca** (`z_subtarea.id_finca`, que existía sin usarse): 78 en Bellita, 21 en
  Pacaritambo. `z_tarea` no tiene finca; el corte sale desde la subtarea hacia
  arriba.
- **Responsable = `z_personal.rol = 8`**, dentro del personal que
  `/v4/catalogos` ya filtró por **`eregistro = 'A'`**. Son 6 —5 en Bellita, 1 en
  Pacaritambo— y son exactamente los 6 que figuran en los AM de agosto.
  **`eregistro`, no `estado`**: hay 8 personas con `rol = 8` y `estado` no es una
  bandera de baja sino el tipo de contratación (FK a `z_personal_estado`).
  Detalle en `docs/context/99-riesgos.md`.
- **Un PENDIENTE que nunca llegó al servidor SÍ se puede descartar** (cierra el
  pendiente #2), con confirmación que nombra la tarea y asiento en `sync_audit`
  con el payload completo. Un ENVIADO o un ENVIANDO no: ya están del otro lado.
  El `DELETE` revalida `estado = 'PENDIENTE' AND acked_at IS NULL` en la propia
  sentencia, porque entre que la pantalla dibujó la lista y el usuario confirmó
  el envío automático pudo haberlo mandado.
- **Las tarjetas agrupan por el TRABAJO** (lote, subtarea, módulos), no por
  `captura_guid`. Ese campo dice qué filas salieron del mismo formulario y sirve
  para rastrear; agrupar por él daba dos tarjetas idénticas cuando dos personas
  del mismo trabajo se cargaban como dos tareas. Sobre agosto las dos claves dan
  el mismo resultado: 367 tarjetas, 29 abiertas.
- **AM sin personal: no se guarda.** Bloqueo en la app, además del rechazo del
  servidor.
- **"Una persona, una tarea AM a la vez": bloqueo duro dentro del formulario,
  aviso confirmable entre formularios, y entre equipos no se cubre.** No es
  tibieza. La medición sobre la ventana de agosto (590 filas de `z_tabla_am`):
  hay 63 pares (fecha, persona) con más de un AM el mismo día, pero **61 de los
  extras son reintentos exactos** —misma hora, mismo lote, misma subtarea: es el
  pendiente #Limpieza, no doble asignación—. **Sólo 9 son reasignaciones
  legítimas**, y en ellas el PM que cerraba la anterior llegó recién a las 16:00.
  Un bloqueo duro entre formularios habría impedido esas 9 capturas en el campo.
  Offline, entre equipos, no hay a quién preguntar.
- **Configuración tiene Finca y Cultivo por defecto**, que quedan pre-elegidos en
  AM y PM y se pueden cambiar en cada registro. Cierra el pendiente #8
  ("Restricción de Finca") por reemplazo: no había captura ni explicación de qué
  hacía en la app vieja. Si aparece que hacía otra cosa, se revisa.
- **La tarea AM nueva precarga sólo cultivo y lote.** El personal se elige de
  cero cada vez.

## Un hallazgo que conviene no olvidar

`z_tabla_am` YA tiene una columna `tiene_pm`, y hay un `Am_model::close_am()` con
endpoints en V1, V2, V3 y API/V3. **Las 113.410 filas están en `'0'`: nunca se
cerró ninguna.** Además `close_am()` filtra por `date('Y-m-d')` del servidor, así
que un PM retroactivo no cerraría nada aunque se llamara. El mecanismo de V3
existe y está muerto — por eso V4 lo resuelve en el modelo (`cierre_guid`) y no
con una bandera.

---

# Pendientes abiertos

## Necesito respuesta

| # | Pendiente | Dónde |
|---|---|---|
| 1 | Las cinco ventanas de retroactividad (AM/PM 3 d, Cosecha 7 d, Riego 7 d, Postcosecha 30 d) | 01 §Integridad de fechas |
| 9 | Capturas de pantalla del módulo Riego | 03 §Riego |

## Cerrados con datos

- **#7 — el botón `ADICIONAL` de Cosecha agregaba otro trabajador al mismo
  encabezado** (2026-09-03). **2.710 de los 3.641 encabezados de
  `z_cosecha_cacao` (74 %) tienen más de un trabajador, con un máximo de 21.**
  *En la app nueva el botón no hace falta*: cosecha cierra una tarea AM y las
  personas ya vienen de ahí. `reg_cosecha` **no** lleva `captura_guid` — el que
  agrupa es el del AM.

## Trabajo identificado, sin decisión que tomar

- **`Supervisor de cosecha` (subtarea 24) no tiene sacos que pesar.** Cuelga de
  la tarea Cosecha, así que la pantalla de cosecha se la ofrece y le exige al
  menos un saco; pero su unidad es **Jornal**, no Libra. Son 241 filas en
  `z_tabla_am` y 4 abiertas hoy en `reg_am`. Hay que decidir si esas subtareas
  vuelven al PM (por unidad de labor) o si la pantalla acepta cerrarlas sin
  sacos.
- **Vista plana de cosecha para los reportes web.** Hoy un reporte va
  `cosecha → AM → catálogos`. Está medido y alcanza (1,08 ms por mes y finca),
  pero conviene una `vw_reg_cosecha` para que el que escribe el reporte no
  repita el join. Ver `02-bd-y-api.md` §Cosecha.
- **Repuntar las 19 vistas restantes** a `reg_am`/`pc_*` para el período desde
  agosto. Sólo se hizo `vw_reg_reporte_pago`, que es la nómina.
- **Campo propio para la justificación del registro retroactivo.** Hoy viaja
  dentro de `comentario` con prefijo `[RETROACTIVO]`, recortada a 255: el motivo
  queda mezclado con texto libre y no se puede consultar aparte.
- **Validar la finca de la persona y de la subtarea en `sync_am`.**
  `z_personal.id_finca` y `z_subtarea.id_finca` existen y el servidor no las
  compara contra `finca_id`. Ver `docs/context/99-riesgos.md`.
- **Levantar el contenedor en PHP 8.1** y validar lo que el ensayo no cubrió.

## Acciones técnicas de higiene

- Sacar `.env` del control de versiones. Agregarlo a `.gitignore` **no lo
  destrackea**: hace falta `git rm --cached .env`.
- Cerrar `.htaccess` a todo lo que no sea `index.php` y `assets/`.
- Hecho el 2026-08-28: movidos a `_to_delete/public-2026-08-28/`
  `colmillo.php` (Adminer 4.8.1 expuesto por HTTP), `info.php` (`phpinfo()`),
  `dole.php` y `error_log`.

## Bloqueante conocido

El repositorio Android original no existe. Todo lo de aquí exige recompilar, lo
cual está resuelto por la reescritura — pero el APK v2.0.5 instalado sólo acepta
HTTP contra `localhost`, `192.168.0.5`, `192.168.0.16` y `192.168.2.67`
(`network_security_config.xml`). Para probar la app vieja contra el Docker local
sigue haciendo falta `adb reverse tcp:8080 tcp:8080`.
