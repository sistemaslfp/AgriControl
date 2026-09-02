# 03 — Mapa de pantallas y correcciones por módulo

> Base: capturas de `MOBIL/agricontrol/capturas/` (app instalada v2.0.5).
> Objetivo: proyecto **Ionic + Angular nuevo**, reescritura limpia, replicando
> estas pantallas con las correcciones de abajo. No se hereda código.

## Navegación global

- **Menú Principal** (grilla) → módulos. Engranaje arriba a la derecha →
  Configuración. Pie fijo con la versión.
- Los formularios largos (AM, PM) están **paginados**: `Encabezado` → `Tarea 1`
  → `Tarea 2`… Hoy sólo se avanza con las flechas `<` `>`.
- **Decidido: la paginación acepta los dos movimientos — swipe horizontal y
  flechas.** Se implementa con un `ion-slides`/Swiper con `allowTouchMove: true`
  y botones de flecha enlazados al mismo control. Ninguno de los dos puede ser
  el único camino: el swipe es el gesto natural, las flechas son el descubrible.
- Indicador de paso visible (`1 / 3`) — hoy no hay ninguno y no se sabe cuántas
  tareas se han cargado.

### Corrección transversal 1 — las flechas se montan sobre los campos

En `am-tarea`, `pm-tarea` y `am-default` las flechas `<` `>` flotan a media
altura y quedan **encima** de "Seleccione Personal" y de "Unidad de Labor",
tapando el control. Van a una barra fija inferior, fuera del área de scroll,
junto al indicador de paso.

### Corrección transversal 2 — vocabulario

La misma cosa se llama de tres maneras: **"Finca"** (AM, Cosecha),
**"Hacienda"** (PM, listas de pendientes/enviados) y `z_finca` en la BD.
**DECIDIDO (2026-08-31, Kevin): "Finca" y "Responsable"**, en toda la app.
Se eligieron por coincidir con la base (`z_finca`, `finca_id`,
`responsable_id`): así la pantalla, la columna y el reporte dicen lo mismo.
"Hacienda" y "Supervisor" quedan fuera.

### Corrección transversal 3 — fecha y hora

Hoy `Fecha Proceso` / `Fecha Cosecha` / `Fecha Inicio` son de **solo lectura**:
toman el reloj del teléfono en el instante de abrir la pantalla. Pasan a ser
**selector de fecha y hora editable**, porque el registro se captura después de
que el trabajo ocurrió. Ese valor es `fecha`+`hora` de operación;
`created_at_device` se sigue tomando del reloj sin que el usuario lo vea
(ver `01-sincronizacion.md`).

---

## Menú Principal

Celdas: `AM`, `PM`, `COSECHA`, `RIEGO`, `POSCOSECHA`, `ACTUALIZAR MAESTROS`,
`REVISAR PENDIENTES`, `REVISAR ENVIADOS`.

Correcciones:

- La grilla tiene **cuatro celdas vacías** rellenando filas de a tres. Quitar.
- `REVISAR PENDIENTES` debe mostrar el **contador** de registros en cola. Es el
  dato que el supervisor necesita antes de irse del campo.
- Indicador de estado de red y de última sincronización exitosa en el encabezado.

---

## Configuración

Acordeón: `Horario de Ingreso`, `Restricción de Finca`, `Cosecha de Cacao`,
`Servidor`, `Limpieza de Tablas`, botón `GUARDAR`, y `First Run`.

- **Horario de Ingreso** — AM `06:00–12:00`, PM `13:00–18:00`. Pasa a venir del
  servidor (`/v4/bootstrap`) y se muestra como solo lectura, con opción de
  sobrescribir local sólo en modo desarrollo.
- **Cosecha de Cacao** — selección de subtareas visibles en el módulo de
  cosecha. Se mantiene, pero el listado también debería llegar del servidor.
- **Servidor** — hoy sólo acepta `servidor:puerto/{directorio}/v{N}` con N
  numérico. En la app nueva: campo de URL base completa, con validación y un
  botón **"Probar conexión"** que golpee `/v4/hora` y muestre el resultado.
  Añadir aquí el **alias del dispositivo** (sin login).
- **Limpieza de Tablas** — `Eliminar AM/PM/Cosecha/Riego` borran datos locales.
  **Riesgo real**: nada impide borrar registros PENDIENTES no sincronizados.
  Corrección: bloquear el borrado si hay pendientes de ese tipo, con el conteo
  a la vista, y exigir confirmación escrita.
- **Valores por defecto** (2026-09-02) — `Finca` y `Cultivo`. Un equipo se
  queda en la misma finca y el mismo cultivo toda la temporada: fijarlos acá
  los deja pre-elegidos en AM y en PM, ahorra dos toques por tarea y sobre todo
  evita el error de cargar en la finca equivocada. Se pueden vaciar con la ✕ y
  se pueden cambiar dentro de cada registro.
  Esto es, con mucha probabilidad, lo que era la **"Restricción de Finca"** de
  la app vieja (pendiente #8), de la que no había captura ni explicación.

---

## AM — "Reporte AM"

Página 1 `Encabezado`: Fecha Proceso (fecha + hora), Finca, Responsable.
Página 2..N `Tarea N`: Cultivo, **Tarea**, Lote, Subtarea, Módulo,
Personal (múltiple), Comentarios, botón `SIGUIENTE +`.
Página final: `Revisar y enviar`.

**Los lotes se ordenan y se nombran distinto** (2026-09-01): primero los
numéricos por valor (`Lote 0`, `Lote 1`, … `Lote 5`) y después los que tienen
nombre, alfabéticamente (`Administrativos`, `AREA CAMPAMENTO`, …). **A los que
tienen nombre no se les antepone "Lote"**: nadie dice "Lote Administrativos".
El orden se hace en TypeScript y no en SQL a propósito: en SQLite
`CAST('Administrativos' AS INTEGER)` da 0 y el área administrativa terminaba
mezclada con el lote "0", que existe de verdad.

**La cascada es Cultivo → Tarea → Subtarea** (2026-09-01). La subtarea queda
apagada hasta que haya tarea, y entonces muestra solo las de esa tarea: sin ese
corte, un cultivo vuelca decenas de subtareas sueltas en una sola lista.
**Los códigos de tarea y subtarea no se muestran**: son control interno.

**Tareas y subtareas se filtran además por finca** (2026-09-02).
`z_subtarea.id_finca` existía sin usarse, y cada finca tiene su propio juego:
78 subtareas en Bellita y 21 en Pacaritambo. Las tareas se filtran a las que
tienen al menos una subtarea de esa finca — `z_tarea` no tiene finca, así que
el corte sale desde abajo. Sin esto se puede elegir una tarea y encontrarse la
lista de subtareas vacía.

**`Módulos` va justo debajo de `Lote`** (2026-09-02): es una subdivisión del
lote, y leerlo en cualquier otro lugar del formulario no tiene sentido.

- El selector de Responsable/Personal era un **action sheet** con la lista
  completa y `Cancelar`. Con ~1.100 personas eso necesitaba buscador y filtro.
  **Resuelto (2026-09-01)** con un selector único para toda la app:

  - **Ventana flotante centrada**, no pantalla completa, que **se cierra
    tocando fuera** y además tiene botón `Listo`.
  - **La ventana mide exactamente lo que mide su contenido**: encabezado más
    una fila por opción, con techo de 12 filas y de 72 vh. Una ventana de 600
    px para elegir entre dos responsables deja media pantalla en blanco, y una
    de 250 px para buscar entre 1.100 personas es inservible.
  - **Tocar la opción que ya estaba elegida también cierra.** Va por el click
    del ítem y no por el `ionChange` del radio: si el valor no cambia, el
    evento no dispara y la ventana se quedaba abierta sin hacer nada.
  - **El buscador aparece solo si hace falta** (más de 10 opciones). Con seis
    responsables es estorbo; con 1.100 personas es imprescindible. Busca sin
    tildes y por palabras sueltas: "ALAVA ERICKA" encuentra "ALAVA TOMALA
    ERICKA PATRICIA".
  - **En selección múltiple cada toque aplica ya**, así que cerrar tocando
    fuera nunca pierde lo elegido.
  - **El Responsable se filtra por `z_personal.rol = 8`** (responsable de
    campo) **y por finca**. Verificado contra los datos: hay 6 personas activas
    con ese rol, son exactamente las 6 que figuran como `responsable_id` en los
    590 AM de agosto, y en las 590 filas la finca del responsable **siempre**
    coincide con la del AM.
  - **Elegir el responsable ANTES que la finca no lo borra.** Al fijar la finca
    se revisa si el responsable elegido pertenece a ella: solo entonces se
    limpia, diciendo por qué. Borrarlo siempre obligaba a elegirlo dos veces
    sin explicación; no borrarlo nunca dejaba pasar un responsable de la otra
    finca, que el servidor no rechaza pero es un dato equivocado.
- `Módulo` sólo se pide si `lote.tiene_modulos = true` (ver `02-bd-y-api.md` §3).
- **OJO, esta nota describía V3 y ya no aplica.** En `z_tabla_am` un AM con N
  personas eran N filas. En V4 **las personas son tabla hija** (`reg_am_personal`),
  así que una tarea con N personas es **una** fila de `reg_am`. Lo que sí
  genera varias filas son varias TAREAS: **una tarea = un guid = una fila**.
  Consecuencia que la pantalla tiene que decir y dice: el ACK es por registro,
  así que un AM de tres tareas puede terminar con dos `created` y una
  `rejected`. La revisión no promete atomicidad, porque el servidor no la da.
- Falta un resumen antes de guardar: hoy se guarda a ciegas. Agregar página
  final "Revisar y enviar" con el conteo de tareas y de personal.

---

### Regla dura del AM (2026-08-31, Kevin)

**No se puede guardar un AM sin al menos una persona asociada.** El botón de
guardar queda deshabilitado y se explica por qué; no se deja guardar para que
lo rechace el servidor tres horas después, cuando el responsable ya se fue del
lote. El servidor también lo rechaza (`personal_ids vacio`), pero esa es la
segunda barrera, no la primera.

### Una persona, una tarea AM a la vez (2026-08-31, Kevin)

La regla: una persona no puede estar en dos tareas AM al mismo tiempo; la
anterior tiene que cerrarse con un PM antes de reasignarla.

Lo que la app hace hoy, y hasta dónde llega de verdad:

1. **Dentro del mismo formulario: bloqueo duro.** La misma persona en dos
   tareas del mismo AM es siempre un error, y se sabe sin consultar nada.
2. **Entre formularios, en el mismo equipo: aviso que exige confirmar.** Se
   muestra el AM anterior (lote, subtarea, hora) y el responsable decide.
3. **Entre equipos: no se cubre.** Un AM cargado en otra tablet es invisible, y
   offline no hay a quién preguntarle.

Por qué el nivel 2 es aviso y no bloqueo, con datos y no con opinión: en la
ventana de agosto (590 AM reales) hubo **9 reasignaciones legítimas** de la
misma persona el mismo día sin un PM que cerrara la anterior — el PM llegaba a
las 16:00. Un bloqueo duro las habría impedido en el campo. Los otros 61 casos
de repetición son reintentos exactos de la app vieja, o sea el pendiente
#Limpieza.

El espejo local vive en `am_persona_local` / `pm_cierre_local` (SQLite del
teléfono). "Cerrado" = existe un PM del mismo (persona, fecha, lote, subtarea),
que es la definición que mejor calzó contra los datos: 533 de 590.

**La validación de verdad no existe todavía.** Exige `reg_pm.am_id` (o
`reg_am_personal.cerrado_por_pm_id`), la validación en `sync_am` y un endpoint
de AM abiertos. Es un paso propio, posterior a estas pantallas. Ver el detalle
y el hallazgo de `tiene_pm` en `00-plan.md`.

## PM — "Reporte PM": el CIERRE de una tarea AM

**Reescrito el 2026-09-01. Decisión de Kevin: "NO se pueden crear PM, un PM
solo es el reflejo de un AM".** El PM dejó de capturar tareas.

Página 1 `Tareas de la mañana`: Fecha de proceso, Hora de cierre, Finca,
**Responsable que cierra**, y la **lista de asignaciones AM abiertas** de esa
fecha, con casilla por cada (tarea, persona).
Página 2..N: una por asignación elegida, con **Avance** en la unidad que ya
define la subtarea, y Comentarios.
Página final: `Revisar y enviar`.

En la pantalla no hay Cultivo, ni Tarea, ni Lote, ni Subtarea, ni Módulo: todo
eso viene del AM y el teléfono no puede contradecirlo. Antes se podía mandar un
PM con un lote distinto al de la programación de la mañana y nadie se enteraba.

El **Responsable sí se elige acá**, y a propósito: es quien zanja la tarea, que
no tiene por qué ser el que la programó a la mañana.

### De dónde sale la lista, y por qué de dos lados

- `GET /v4/am_abiertos` es la fuente autoritativa, pero **solo conoce los AM
  que ya llegaron al servidor**.
- El **espejo local** (`am_persona_local`) cubre los AM capturados en este
  equipo que siguen PENDIENTES en la cola. Sin él, un supervisor sin señal no
  podría cerrar por la tarde la tarea que él mismo cargó por la mañana.

Cada fila muestra **trabajador, lote, módulo y subtarea**: sin el módulo, dos
asignaciones del mismo lote y la misma subtarea se ven idénticas. Se juntan y se
deduplican por (`am_guid`, persona); gana la del servidor, que trae los nombres
ya resueltos. Las que salen solo del espejo local se marcan
**"cargada en este equipo, todavía sin enviar"**, para que el supervisor sepa
qué está viendo.

### Lo que esto arregla del diseño anterior

- **`Unidad de Labor` deja de ser un selector muerto y gris.** Sale de la
  subtarea del AM y se muestra como etiqueta del campo: "Avance en Libra".
- **Los tiempos dejan de dar `0 días, 0 horas, 0 minutos`.** La hora de inicio
  es la del AM y la de cierre la pone el supervisor; en la prueba contra la
  base real quedó 06:57:50 → 16:00.
- **Desaparece la colisión con la clave natural** que advertía
  `02-bd-y-api.md` §4: el PM ya no repite la combinación, apunta a una
  asignación concreta.
- `pm_year` / `pm_week` **no los manda la app**: los calcula el servidor con
  `format('o')`, no con `'Y'`.

### Lo que hay que aceptar

En agosto **16 de 598 PM (2,7%) fueron de gente sin AM cargado esa mañana**.
Con esta pantalla esos casos ya no se pueden registrar: hay que crear el AM
primero. Es intencional (Kevin, 2026-09-01) y empuja a que el AM se cargue
siempre por la mañana, que es la conducta que se quiere.

## Cosecha de Cacao

Pantalla 1: Fecha Cosecha, Finca, Supervisor, Subtarea (filtrada por la
configuración de "Cosecha de Cacao").
Pantalla 2: Trabajador, cantidad de sacos (selector 1–15), Módulo,
Total Libras, grilla `Saco 01..15`, Observaciones, `ADICIONAL`, `GUARDAR`.

- La grilla de sacos mapeaba a `z_cosecha_cacao.saco1..saco15` — 15 columnas
  fijas. **Con las tablas nuevas ese techo desaparece**: `reg_cosecha_saco` es
  una tabla hija (ver `02-bd-y-api.md` §3). La UI muestra una lista dinámica
  sin límite fijo.
- La captura muestra los sacos salteados (`01, 04, 07, 10, 13`): es la grilla de
  tres columnas cortada por el diálogo. Verificar que en la app nueva los 15
  campos entren en una lista vertical con teclado numérico y avance automático.
- `Total Libras` se calcula; falta mostrar **`Total Sacos`** al lado, que sí se
  persiste (`total_sacos`).
- `ADICIONAL` (gris) — **[CONFIRMAR]** qué hace. Presumiblemente agrega otro
  trabajador al mismo encabezado.

---

## Riego

Sin capturas. Campos según `z_riego`: supervisor, fecha, hora, finca,
codigo_tarea, codigo_subtarea, lote, modulo, tiempo_riego, volumen_riego,
observaciones. Mismo patrón que Cosecha. **[PENDIENTE]** capturas para el
detalle de pantalla.

---

## Postcosecha — el módulo más complejo

Es una **máquina de estados por lote**, no un formulario. Pantalla
"Registros Abiertos" lista los lotes en proceso con su `Etapa`, y
`NUEVO REGISTRO` abre uno.

Flujo observado en las capturas:

1. **Pesaje** — Fecha Inicio, Supervisor, `Seleccione Lotes` (multi-selección de
   cosechas por fecha con su peso: `2026-08-17 | 2779.70 lb`), Peso Mallas
   (vacías), No. Proceso, Comentarios Pesaje → `INICIAR PRESECADO`.
2. **Presecado** — muestra No. Proceso, Peso lote, Peso Mallas,
   **Peso Baba** (= peso lote − peso mallas, calculado), fecha inicio,
   comentarios → `INICIAR FERMENTADO`.
3. **Fermentado** — fecha inicio/fin, tiempo transcurrido, comentarios,
   `Datos Calidad` (Buena / Ligera / Violeta + porcentajes calculados) y
   `CARGAR FOTO` → `REGISTRAR DATOS CALIDAD` / `INICIAR SECADO (SOL)`.
4. **Secado (sol)** — fecha inicio/fin, tiempo, comentarios, Datos Calidad →
   `INICIAR SECADO (MÁQ)` o `REGISTRAR PESO`.
5. **Secado (máquina)** — opcional, mismo patrón.
6. **Resultado** — `Ingresar Peso Final` → `REGISTRAR PESO`. Cierra el lote.

Correcciones:

- **`No. Proceso` lo escribe el usuario hoy** (`P-465`, lote `462`). Pasa a ser
  **asignado por el servidor** con formato `dddnnaa` y **solo lectura** en la
  app (ver `02-bd-y-api.md` §6). Esto obliga a que el pesaje se sincronice
  antes de continuar, o a que la app muestre "pendiente de número" hasta el ACK.
  **[DECIDIR]** cuál de las dos: bloquear hasta tener número es más simple y
  rompe el offline; mostrar provisional es correcto y más trabajo.
- Los tiempos salen siempre `0 días, 0 horas, 0 minutos` porque inicio y fin se
  registran en el mismo instante. Con el selector de fecha/hora el supervisor
  registra el momento real. Es la razón principal por la que el selector entra
  en el alcance.
- Las etapas escriben en tablas con `UNIQUE KEY (lot_id)`: una etapa por lote,
  irrepetible. La UI debe reflejarlo — una vez cerrada, la etapa no se reabre
  desde el teléfono.
- **Fotos**: `CARGAR FOTO` en fermentación y secado → `z_postharvest_photos`
  (`lot_id`, `stage`, `picture_name`, `picture_order`). Cola de subida propia,
  ver `01-sincronizacion.md`.
- La app permite iniciar postcosecha **sin conexión**, pero
  `Seleccione Lotes` depende de `getPendingPostharvestLots` del servidor.
  Hay que cachear esa lista en la última sincronización y avisar de su antigüedad.

---

## Registros Pendientes / Registros Enviados

Dos grillas espejo: `AM`, `PM`, `COSECHA`, `RIEGO`, `POSCOSECHA` (hoy
**deshabilitado en ambas** — falta implementar).

Cada lista muestra tarjeta con supervisor, hacienda, lote, operador, totales,
Fecha Operación, Fecha Creación, `VER DETALLE` y un ícono de reloj de arena.
"Registros Cosecha Pendientes" muestra `Próxima Sincronización: 2026-08-27
09:05:48`; "Registros AM Enviados" muestra `Última Sincronización`.

Correcciones:

- Habilitar **POSCOSECHA** en pendientes y enviados.
- El ícono de reloj de arena no distingue PENDIENTE de ENVIANDO de RECHAZADO.
  Tres estados, tres indicadores, y el motivo visible en los rechazados.
- `Próxima Sincronización: 09:05:48` mostrada a las 11:54 (ya pasada) delata que
  el temporizador se cuelga. En la app nueva, ese campo muestra el estado real
  de la cola: "reintentando en 2 min", "sin conexión", "al día".
- Botón de sincronización manual en la barra (hoy existe el ícono de refrescar;
  debe forzar el envío de la cola, no sólo recargar la lista).
- **Detalle Registro** ya expone el `Registro:` con el UUID — mantenerlo, es la
  única forma de rastrear un registro entre teléfono y servidor.

---

## Orden de construcción sugerido

1. Esqueleto Ionic + SQLite + cola de sincronización + Configuración + catálogos.
   Sin esto nada más se puede probar.
2. AM y PM (cubren el 80% del uso diario).
3. Pendientes / Enviados con los tres estados.
4. Cosecha de Cacao.
5. Riego.
6. Postcosecha (máquina de estados + fotos). El más caro; va al final a
   propósito.

---

## Anexo (2026-08-28) — El selector de fecha en pantalla

La política completa está en `01-sincronizacion.md`, sección "Integridad de
fechas". Lo que toca a la UI:

- El calendario nace acotado: `min = ahora_corregido − ventana del módulo`,
  `max = ahora_corregido`. `ahora_corregido = reloj del teléfono + offset del
  servidor`, nunca el reloj pelado.
- **No se ofrecen fechas futuras.** Sin interruptor, sin excepción.
- Para ir más atrás de la ventana, un interruptor habilita el rango completo y
  exige una **justificación escrita**. Sin texto, el botón de guardar queda
  deshabilitado.
- **En pantalla ese interruptor NO dice "registro retroactivo".** "Retroactivo"
  es jerga de estos documentos; el supervisor en el lote no la usa. Dice
  **"Estoy cargando un día anterior"**, y el campo de motivo pregunta **"¿Por
  qué se carga tarde?"** con un ejemplo real ("sin señal en el lote, se cargó
  al día siguiente").
- Fuera de la ventana horaria AM/PM: aviso visible, el registro se guarda igual.
  El usuario decide; el sistema anota.
- Si la app nunca sincronizó la hora, banner permanente: "sin hora verificada";
  se permite capturar y los registros salen marcados.

Las tres pantallas afectadas son las mismas de la Corrección transversal 3:
`Fecha Proceso` (AM, PM), `Fecha Cosecha` (Cosecha) y `Fecha Inicio` / fechas de
etapa (Postcosecha). En postcosecha, además, la fecha de fin de una etapa no
puede ser anterior a su inicio ni al fin de la etapa previa — el selector se
acota con el fin de la etapa anterior como `min`.
