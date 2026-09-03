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
- **Sigue siendo cierto, y volvió a serlo el 2026-09-03.** Un AM con N
  personas son N filas, como en `z_tabla_am`: **un registro = una persona en
  una tarea**, con su propio guid y su propio ACK. La acumulación de personal
  es de esta pantalla, no del modelo. Las N comparten `captura_guid`.
  Consecuencia que la pantalla tiene que decir y dice: el ACK es por registro,
  así que una captura de tres personas puede terminar con dos `created` y una
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
teléfono). "Cerrado" = existe un cierre del mismo (persona, fecha, lote,
subtarea), que es la definición que mejor calzó contra los datos: 533 de 590.

**Contra el servidor la pregunta ya no es ambigua**: una asignación está abierta
si su fila de `reg_am` tiene `cierre_guid IS NULL`, y eso es lo que devuelve
`GET /v4/am_abiertos`. La heurística local sigue existiendo sólo para los AM que
todavía no salieron de este teléfono. El hallazgo de `tiene_pm` —la columna de
V3 que nunca se usó— está en `00-plan.md`.

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

Las dos fuentes se juntan y se deduplican por (`am_guid`, persona); gana la del
servidor, que trae los nombres ya resueltos. Lo que sale solo del espejo local se
marca **"cargada en este equipo, todavía sin enviar"**, para que el supervisor
sepa qué está viendo.

### La lista se agrupa por TAREA, no por persona (2026-09-02)

**Una tarjeta por tarea**: lote, módulo y subtarea. Tocarla abre una **ventana
flotante con el personal de esa tarea**, donde se eligen una o varias personas;
la selección aplica en vivo y la tarjeta queda mostrando a quién se eligió y un
contador `2/4`.

El motivo es de control, no de comodidad: la lista plana venía **ordenada por
nombre**, así que las personas de una misma tarea quedaban salteadas entre las de
otras y quien revisaba el PM después —otro supervisor, o administración— no tenía
cómo saber cuáles se habían programado juntas. Sobre los datos de agosto la
lista pasa de **55 filas a 29 tarjetas** (16 de una persona, 1 de dos, 11 de tres,
1 de cuatro).

La tarjeta dice **"N personas por cerrar"**, no "N personas", y la diferencia
importa: `/v4/am_abiertos` sólo devuelve lo abierto, así que una tarea de 4
personas con 2 ya cerradas aparece como tarea de 2. Son las 2 que faltan.

**Los pasos de captura no cambian**: sigue habiendo una página de avance por
persona, porque la `cantidad` es de la persona y es lo que se paga.

#### Qué identifica a una tarea: el TRABAJO, no el `captura_guid`

La clave del grupo es **lote + subtarea + módulos**. No lleva fecha ni finca
porque la lista ya viene filtrada por las dos
(`GET /v4/am_abiertos?fecha&finca_id`).

**Se probó primero con `captura_guid` y estaba mal.** Dos personas puestas en la
misma subtarea del mismo lote, pero cargadas como dos tareas distintas del
formulario AM, salían como **dos tarjetas idénticas palabra por palabra**:
`Lote 1 · Mód. 02 · COSECHA CACAO · 1 persona por cerrar`, dos veces. El
supervisor no las puede distinguir — que es exactamente la ilegibilidad que
esta pantalla venía a arreglar. Son el mismo trabajo: se cierran juntas.

`captura_guid` responde otra pregunta —qué filas salieron del mismo
formulario— y sirve para rastrear, no para agrupar trabajo. Sobre los datos
reales de agosto **las dos claves dan el mismo resultado** (367 tarjetas, 29
abiertas), porque la migración construyó el guid a partir de esta misma
identidad; la diferencia sólo aparece en lo que captura la app.

**De paso se arregló `am.page.ts`**, que generaba un `captura_guid` por ENVÍO
del formulario en vez de por tarea. Ya no decide el agrupamiento, pero el campo
tenía que significar lo mismo en la app que en la migración: un campo que quiere
decir dos cosas según de dónde venga la fila es una trampa para el que lo use
después.

**Un bug que esto destapó:** la lista desempataba el orden por la clave del
grupo, que era un UUID aleatorio, así que dos tareas del mismo lote y subtarea
salían en distinto orden en cada recarga y las tarjetas saltaban de lugar. Ahora
desempata por hora de proceso, nombre y `am_guid`, que son estables.

### Lo que esto arregla del diseño anterior

- **`Unidad de Labor` deja de ser un selector muerto y gris.** Sale de la
  subtarea del AM y se muestra como etiqueta del campo: "Avance en Libra".
- **Los tiempos dejan de dar `0 días, 0 horas, 0 minutos`.** La hora de inicio
  es la del AM y la de cierre la pone el supervisor; en la prueba contra la
  base real quedó 06:57:50 → 16:00.
- **Desaparece la colisión con la clave natural** que advertía
  `02-bd-y-api.md` §4: el cierre ya no repite la combinación, es un UPDATE de
  una fila concreta.
- **El año y la semana ya no se guardan**: se derivan con `WEEK(fecha,3)`. El
  bug de V3 que puso 181 filas de diciembre de 2025 en (2025, semana 1) no puede
  repetirse en un valor que no se almacena.

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
- `ADICIONAL` (gris) — **agrega otro trabajador al mismo encabezado**, cerrado
  con datos el 2026-09-03: 2.710 de los 3.641 encabezados de `z_cosecha_cacao`
  (74 %) tienen más de uno, con un máximo de 21. En la app nueva cada trabajador
  es su propio registro y los N comparten `captura_guid`, igual que en AM.

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

## Registros Pendientes / Registros Enviados — HECHO (paso 4)

**Una sola pantalla** (`/registros`), con un segmento arriba para las dos
mitades y chips para filtrar por módulo. El menú conserva sus dos entradas —es
el vocabulario que el supervisor ya conoce— y cada una abre esta pantalla en la
pestaña que corresponde (`?vista=pendientes` / `?vista=enviados`).

La app vieja tenía dos grillas por módulo, o sea diez pantallas. Un supervisor
que quiere saber "¿me falta enviar algo?" tenía que abrir cinco para
responderse.

**Una tarjeta = un TRABAJO en un estado**, con la misma clave que la pantalla PM
(ahí está el porqué), más la fecha y la finca porque esta lista cruza días. Un
cierre PM no describe un trabajo propio —lo hereda del AM— así que se agrupa por
el AM al que apunta.

**El estado entra en la clave a propósito.** El ACK es por registro, así que un
AM de tres personas puede terminar con dos ENVIADOS y una RECHAZADA. Si el
estado no separara, esa tarjeta tendría que mostrar dos estados a la vez y
mentiría en cualquiera de los dos.

### Las correcciones de la app vieja, una por una

- **Tres estados, tres indicadores.** El reloj de arena único no distinguía
  PENDIENTE de ENVIANDO de RECHAZADO. Ahora cada uno tiene ícono, color y la
  palabra escrita — el ícono solo no le sirve a quien no lo conoce.
- **Un chip por módulo con las DOS cuentas**, `AM 3/12`: 3 pendientes y 12
  enviados. Como las dos mitades comparten ventana, el chip comparte las dos
  cuentas y se ve dónde falta trabajo sin cambiar de pestaña. Las cuentas se
  distinguen por color, no por posición: `3/12` sin color obliga a recordar cuál
  es cuál, y un cero se apaga para que resalte lo que sí tiene algo.
- **El menú tiene UNA celda, `Pendientes / Enviados`**, a lo ancho de la grilla.
  Eran dos celdas que abrían la misma pantalla, o sea que prometían dos lugares
  distintos. Además estaban en `habilitada: false` desde el paso 1: se veían
  grises aunque la navegación ya funcionaba.
- **Las cuentas de las pestañas salen de las MISMAS tarjetas que se muestran.**
  Antes venían de `cola.conteo()` y el segmento decía `ENVIADOS (0)` mientras el
  chip decía `0/3`: el contador sumaba sólo `enviados` e ignoraba `rechazados`,
  que viven en esa misma pestaña. Dos fuentes para la misma cuenta terminan
  discrepando siempre. Un rechazado cuenta del lado de Enviados —es donde
  está— pero **se dice aparte**, porque es el único estado que necesita que
  alguien haga algo.
- **La tarjeta habla en nombres, nunca en códigos**: Lote · Módulo, Tarea /
  Subtarea, y las personas por nombre. La tarea da el contexto que la subtarea
  sola no tiene, porque una misma subtarea puede colgar de más de una tarea.
- **El UUID sale de la tarjeta.** No le dice nada a quien mira la lista. Sigue
  siendo la única forma de rastrear un registro entre teléfono y servidor, así
  que su lugar es Detalle Registro.
- **El motivo del rechazo va a la vista**, no detrás de un `VER DETALLE`: es lo
  único que le dice al supervisor qué corregir. Si las N filas de la tarjeta
  fallaron por lo mismo, el motivo va una vez; si difieren, se dice cuántos
  motivos hay, porque esconderlos detrás del primero haría creer que se arregla
  con un solo cambio.
- **`Próxima Sincronización: 09:05:48` desaparece.** Mostrada a las 11:54 —ya
  pasada— delataba que el temporizador se colgaba: una hora fija no puede decir
  la verdad si el envío se atascó. En su lugar va el estado real de la cola:
  "Enviando…", "Sin conexión: se reintenta solo al volver.", "Reintentando en
  2 min.", "Al día.".
- **El botón de la barra fuerza el envío**, no sólo recarga la lista. En la app
  vieja el ícono de refrescar no tenía forma de empujar la cola.
- **POSCOSECHA ya no está deshabilitado**: los chips salen de lo que hay en la
  lista, así que aparece solo cuando existan registros de ese tipo.

### Los motivos de rechazo se escriben para el supervisor

Los redacta el servidor (`V4.php`, `sync_valida_catalogos` y
`sync_motivo_modulo`) y **ya no llevan ids**. El texto que vuelve es lo único
que ve quien tiene que corregir el registro en el campo, y un
`subtarea 88 inactiva` no le dice nada: no conoce los ids, no los ve en ninguna
pantalla, y el número no le indica qué tocar.

Se arregló en el servidor y no en la app a propósito: sirve para cualquier
cliente de la API, y traducir cadenas del lado del cliente se rompe en silencio
el día que alguien cambia una coma en el mensaje.

Verificado con `curl` contra la base real el 2026-09-02:

| antes | ahora |
|---|---|
| `modulo 3 inexistente, inactivo o no pertenece al lote 1` | `el modulo 1 es del lote 2, no del lote 1` |
| `modulo 9999 inexistente…` | `ese modulo no existe` |
| `el lote 1 no pertenece a la finca 2` | `el lote 1 no pertenece a la finca Pacaritambo` |
| `subtarea 99999 inexistente o inactiva` | `la subtarea #99999 no existe o esta inactiva` |
| `personal 225 inexistente o inactivo` | `el trabajador FERNANDEZ CEPEDA DARIO FELIPE no existe o esta dado de baja` |
| `fecha_proceso en el futuro (I1)` | `la fecha de proceso es futura: no se puede registrar trabajo que todavia no ocurrio` |

Dos detalles que cuestan poco y se notan:

- **El módulo nombra el lote al que SÍ pertenece.** Los nombres de módulo se
  repiten entre lotes —cada lote tiene su "1"— así que nombrarlo solo no
  distingue nada; lo útil es decir de qué lote es, que es lo que hay que
  corregir. Y separa tres casos que el mensaje único mezclaba: no existe, está
  inactivo, o es de otro lote. El tercero es el único que el supervisor puede
  resolver solo, y es el que más pasa (16 filas de `z_tabla_am` lo tienen).
- **`#99999` aparece sólo cuando el id no existe en la base.** No es un dato del
  negocio: es un cliente mandando algo que no está. Resolver el nombre cuesta
  una consulta extra **sólo en el camino de error**; el camino feliz no paga
  nada.

### Descartar un pendiente (cierra el pendiente #2)

**Se puede descartar un registro PENDIENTE que nunca llegó al servidor**, con
confirmación que **nombra la tarea** —un guid no le dice nada a nadie y una
confirmación genérica se acepta sin leer— y asiento en `sync_audit` con el
payload completo.

Un ENVIADO o un ENVIANDO **no** ofrecen descartar: ya están del otro lado.

Dos cosas que sostienen que esto sea seguro:

- El `DELETE` revalida `estado = 'PENDIENTE' AND acked_at IS NULL` en la propia
  sentencia. Entre que la pantalla dibujó la lista y el usuario confirmó, el
  envío automático pudo haberlo mandado; sin esa condición se borraría de la
  cola un registro que ya está en el servidor.
- El asiento va **antes** del borrado. Si el DELETE falla sobra un asiento, que
  es inocuo; al revés, un registro se perdería sin rastro. Si después falta un
  avance en la nómina, tiene que poder distinguirse "nunca se cargó" de "alguien
  lo descartó".

### Lo que queda pendiente de esta pantalla

- **Detalle Registro** (tocar la tarjeta y ver el payload campo por campo). Hoy
  la tarjeta muestra lo que identifica el trabajo, las personas, el estado, el
  motivo y el UUID; el resto del payload no se puede mirar desde la app.
- Los tipos `cosecha`, `riego` y `pc_*` no se pueden probar todavía: no existen
  las pantallas que los generan.

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
