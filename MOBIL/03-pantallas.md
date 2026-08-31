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
Elegir una y usarla en toda la app. Igual con "Responsable" (AM) vs
"Supervisor" (Cosecha, Postcosecha) vs `responsable_id`/`supervisor`.
**[DECIDIR]** los dos términos.

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
- **Restricción de Finca** — sin captura. **[CONFIRMAR]** qué hace.

---

## AM — "Reporte AM"

Página 1 `Encabezado`: Fecha Proceso (fecha + hora), Finca, Responsable.
Página 2..N `Tarea N`: Cultivo, Lote, Subtarea, Módulo, Personal (múltiple),
Comentarios, botón `SIGUIENTE +`.

- El selector de Responsable/Personal es un **action sheet** con la lista
  completa y `Cancelar`. Con ~1.100 personas, esto necesita **buscador** y
  filtro por finca. Es la queja más previsible del usuario.
- `Módulo` sólo se pide si `lote.tiene_modulos = true` (ver `02-bd-y-api.md` §3).
- Un AM con N personas genera N filas en `z_tabla_am`. Ver la nota de `guid` por
  fila en `02-bd-y-api.md` §7.
- Falta un resumen antes de guardar: hoy se guarda a ciegas. Agregar página
  final "Revisar y enviar" con el conteo de tareas y de personal.

---

### Regla dura del AM (2026-08-31, Kevin)

**No se puede guardar un AM sin al menos una persona asociada.** El botón de
guardar queda deshabilitado y se explica por qué; no se deja guardar para que
lo rechace el servidor tres horas después, cuando el supervisor ya se fue del
lote. El servidor también lo rechaza (`personal_ids vacio`), pero esa es la
segunda barrera, no la primera.

## PM — "Reporte PM"

Página 1 `Encabezado`: Fecha Proceso, Hacienda, Responsable, Trabajador.
Página 2..N `Tarea N`: Fecha Cierre, Cultivo, Lote, Subtarea, Módulo,
Unidad de Labor, Avance, Comentarios, `SIGUIENTE +`.

- **`Unidad de Labor` aparece deshabilitada y gris.** Se deriva de
  `z_subtarea.unidad_labor_id`: al elegir la subtarea, la unidad queda fijada.
  Debe mostrarse como **texto de apoyo junto al campo Avance** ("Avance: 3.5
  QUINTAL"), no como un selector muerto.
- `Avance 0` sin unidad a la vista es el error de captura más fácil de cometer.
- `Fecha Cierre` está en la página de tarea y `Fecha Proceso` en el encabezado,
  con el mismo valor por defecto. Hoy el servidor guarda `hora_inicio` desde
  `time` y `hora_cierre` desde `closeTime`; la pantalla no deja fijar la hora de
  inicio. Con el selector de fecha/hora, ambas quedan editables.
- El trabajador se elige en el **encabezado**, así que un PM = un trabajador con
  N tareas. Eso choca con la clave natural si dos tareas comparten subtarea
  (ver la advertencia de `02-bd-y-api.md` §4).

---

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
- Para ir más atrás de la ventana, un interruptor **"registro retroactivo"**
  habilita el rango completo y exige una **justificación escrita**. Sin texto,
  el botón de guardar queda deshabilitado.
- Fuera de la ventana horaria AM/PM: aviso visible, el registro se guarda igual.
  El usuario decide; el sistema anota.
- Si la app nunca sincronizó la hora, banner permanente: "sin hora verificada";
  se permite capturar y los registros salen marcados.

Las tres pantallas afectadas son las mismas de la Corrección transversal 3:
`Fecha Proceso` (AM, PM), `Fecha Cosecha` (Cosecha) y `Fecha Inicio` / fechas de
etapa (Postcosecha). En postcosecha, además, la fecha de fin de una etapa no
puede ser anterior a su inicio ni al fin de la etapa previa — el selector se
acota con el fin de la etapa anterior como `min`.
