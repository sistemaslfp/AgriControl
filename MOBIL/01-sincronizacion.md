# 01 — Reglas de sincronización

> Aplica a la reescritura Ionic + Angular contra la API **V4**.
> Escrito el 2026-08-28, revisado el 2026-09-02.
>
> **Todo lo de este documento sobrevivió al cambio de modelo de datos del
> 2026-09-03.** El ACK, la cola, el backoff, los tres tiempos, las invariantes
> I1..I5 y la máquina de estados son independientes de qué es un registro: sólo
> cambió qué hay adentro de uno. La única regla que el cambio agregó está más
> abajo, en §El cierre es un UPDATE.

## Principio

El teléfono **captura**, no es fuente de verdad. Todo registro se escribe
primero en SQLite local y se envía después. La pantalla nunca espera a la red.

Consecuencia directa: el servidor tiene que ser idempotente. Si no lo es, cada
reintento crea un duplicado — que es exactamente lo que pasa hoy.

## Identidad del registro: `guid`

- El dispositivo genera un **UUID v4** al guardar. No cambia nunca.
- Viaja en cada envío y se persiste en el servidor con **índice único**.
- Reenviar el mismo `guid` devuelve `duplicate` y **no inserta nada**.

La app v2.0.5 **ya genera este UUID** (visible en "Detalle Registro" →
`Registro: ad31cfcb-4823-4e9b-bcfb-26445358372f`) pero el servidor lo descarta.
Ese es el agujero que cierra este documento.

---

## Qué es el ACK y quién lo otorga

Es automático, del servidor, **por registro**, y no es el HTTP 200.

`POST /v4/sync` responde **siempre 200** para el lote y trae un resultado por
cada `guid`:

```json
{
  "server_time": "2026-08-28T14:03:11-05:00",
  "results": [
    { "guid": "ad31cfcb-...", "status": "created",   "id": 113442 },
    { "guid": "7f0e2b91-...", "status": "duplicate", "id": 113301 },
    { "guid": "c4a19d02-...", "status": "rejected",  "reason": "subtarea 88 inactiva" }
  ]
}
```

Regla dura: **el ACK es la aparición del `guid` en `results` con `created` o
`duplicate`.** No el código HTTP.

Por qué la distinción importa: un proxy, un portal cautivo de wifi o un Apache
mal configurado devuelven 200 con un HTML cualquiera. Si la app tomara el 200
como confirmación, borraría de la cola registros que nunca llegaron a la base.
Con la regla de arriba, esa respuesta no contiene el `guid` → el registro se
queda en PENDIENTE y se reintenta.

- `created` y `duplicate` cierran el registro con el mismo efecto.
- `rejected` lo pasa a RECHAZADO. No se reintenta. Se muestra el motivo.
- `guid` ausente del `results`, 5xx, timeout o respuesta ilegible → **todo el
  lote queda PENDIENTE**.

**No hay confirmación manual en ningún punto.** El supervisor no "acepta" nada;
la pantalla "Registros Enviados" es lectura del estado, no una acción.

---

## El cierre es un UPDATE, y también es idempotente

Desde el 2026-09-03 un registro de campo es **una persona en una tarea**, y el
avance de la tarde no crea nada: **rellena los campos `cierre_*` de esa misma
fila**. Eso rompería la premisa de esta cola —que es solo-inserción e
idempotente por `guid`— si no fuera por una cosa: **el guid del cierre se guarda
en la fila que cierra**, en `cierre_guid`.

Con eso el UPDATE tiene exactamente las mismas garantías que el INSERT:

| situación | respuesta | qué hace la app |
|---|---|---|
| el cierre entra por primera vez | `created` | ACK, sale de la cola |
| llega el mismo `cierre_guid` otra vez | `duplicate` | ACK, sale de la cola |
| llega OTRO guid sobre una fila ya cerrada | `rejected` | RECHAZADO, se muestra el motivo |
| **el AM todavía no llegó al servidor** | **el guid se omite de `results`** | queda PENDIENTE y la cola reintenta sola |

La última fila es el caso nuevo y es el que importa: el AM y su cierre pueden
salir del mismo teléfono, y el AM puede seguir en la cola cuando el cierre ya se
intenta enviar. **No hace falta ordenar la cola ni inventar dependencias entre
registros**: el servidor omite el guid, y la regla que ya existía —"`guid`
ausente de `results` → el registro queda PENDIENTE"— hace el resto.

El UPDATE lleva `AND cierre_guid IS NULL` en su `WHERE`, así que es **atómico
sin transacción**: dos equipos cerrando a la vez no se pisan, y el segundo
recibe `rejected` en vez de sobrescribir el avance del primero.

Consecuencia para la pantalla: un cierre puede quedar PENDIENTE por un motivo
que no es la red —su AM no llegó— y eso no es un error ni hay que mostrarlo como
tal.

---

## Los tres tiempos

Nunca mezclarlos. Cada registro transaccional lleva los tres:

| Campo | Quién lo pone | Para qué |
|---|---|---|
| `fecha` + `hora` (proceso) | El supervisor, con selector de fecha/hora | Cuándo ocurrió el trabajo. Dato de negocio. |
| `created_at_device` | El teléfono, al guardar | Cuándo se capturó. Auditoría y orden de cola. |
| `received_at_server` | El servidor, con su `NOW()` | Único tiempo confiable. Es el árbitro. |

### El reloj del teléfono no se usa para validar nada

Se puede cambiar a mano en dos toques. Mecánica:

1. `GET /v4/hora` devuelve la hora del servidor.
2. La app guarda `clock_offset_seconds = server_time − device_time`.
3. Todo cálculo de "ahora" en la app usa `device_now + clock_offset`, nunca
   `device_now` pelado.
4. El offset viaja en cada envío (`device_clock_offset`) para que el servidor
   sepa qué creía el teléfono.
5. Si la app nunca sincronizó, no hay offset: permite capturar y marca los
   registros como no verificables.

---

## Integridad de fechas

El problema real: hoy se puede elegir cualquier fecha pasada y crear registros
sin ningún control. Y el caso legítimo existe — en postcosecha el proceso
arrancó ayer y se registra hoy, o sea `created_at_device > fecha_proceso`.

Retroactivo es normal. Lo que hay que acotar es **cuánto**, y hay que dejar
rastro de quién decidió salirse de la norma.

### Invariantes

| # | Invariante | Si se viola | Acción |
|---|---|---|---|
| I1 | `fecha_proceso <= received_at_server + 2h` | Fecha en el futuro | **Rechazo duro** |
| I5 | Postcosecha: `fin >= inicio` y cada etapa arranca después del fin de la anterior | Cadena rota | **Rechazo duro** — *pendiente: el módulo no está construido* |

La tolerancia de 2 h en I1 absorbe el desfase de reloj y el caso de quien
empieza a registrar antes de que termine la jornada. No es margen para fechar
mañana.

**Son los únicos dos, y hoy sólo I1 está implementado**; I5 llega con
Postcosecha. Una fecha futura no es criterio del usuario: es un error de tecleo
o una manipulación. Una cadena de etapas invertida hace que el cálculo de tiempo
de fermentado dé negativo.

El servidor **no mide nada más**. No compara relojes, no mide atraso de carga y
no deja banderas por eso: el registro entra o se rechaza. `reg_flag` es otra
cosa (ver más abajo).

### Ventanas de retroactividad — sólo en la app

| Módulo | Atrás | Adelante |
|---|---|---|
| AM | 3 días | 0 |
| PM | 3 días | 0 |
| Cosecha | 7 días | 0 |
| Riego | 7 días | 0 |
| Postcosecha | 30 días | 0 |

Llegan en `/v4/bootstrap` y **sólo acotan el selector de fecha**:
`min = ahora_corregido − ventana`, `max = ahora_corregido`. Hacia adelante no
hay interruptor: el calendario no ofrece fechas futuras. El servidor acepta lo
que le llegue mientras cumpla I1.

**[CONFIRMAR] los cinco números.**

### `reg_flag`: la bitácora de lo que no entró

El servidor deja una fila en `reg_flag` cuando un registro sale `rejected`,
cuando falla la base, y cuando un AM llega duplicado (misma persona, subtarea,
finca y día). Guarda el payload completo, porque un rechazo nunca llega a
existir en `reg_am`.

**El reenvío del mismo `guid` no se marca**: eso es la app reintentando porque
se perdió el ACK, o sea el protocolo funcionando.

Nada de esto cambia la respuesta: se lee desde la base, el usuario no la ve. Ver `02-bd-y-api.md` §Revisión de registros.

---

## Máquina de estados local

    PENDIENTE ──envío──> ENVIANDO ──ACK created/duplicate──> ENVIADO
                            │
                            └── rejected ──> RECHAZADO

- **PENDIENTE**: guardado en SQLite, en cola.
- **ENVIANDO**: request en vuelo. Si la app muere aquí, al reabrir vuelve a
  PENDIENTE (el `guid` protege del doble insert).
- **ENVIADO**: hay ACK. Se conserva **30 días** para "Registros Enviados" y
  luego se purga.
- **RECHAZADO**: error de validación, no de red. No se reintenta.

**Sin edición en el teléfono.** Un registro guardado es inmutable. Las
correcciones se hacen en el sistema web.

**Único borrado permitido: un registro PENDIENTE que nunca tuvo ACK**
(confirmado por Kevin el 2026-09-02, cierra el pendiente #2). Va con
confirmación explícita que nombra la tarea y queda asentado en `sync_audit` con
el payload completo. Un ENVIADO o un ENVIANDO no se borran: ya están del otro
lado.

Dos detalles que hacen que esto sea seguro y no un agujero:

- El `DELETE` revalida `estado = 'PENDIENTE' AND acked_at IS NULL` **en la
  propia sentencia**. Entre que la pantalla dibujó la lista y el usuario
  confirmó, el envío automático pudo haberlo mandado; sin esa condición se
  borraría de la cola un registro que ya está en el servidor y el teléfono
  perdería el único rastro de que existió.
- El asiento va **antes** del borrado. Si el DELETE falla sobra un asiento, que
  es inocuo; al revés, el registro se perdería sin rastro.

## Cola de envío

- Orden **FIFO por `created_at_device`**.
- Lotes de **50 registros** por request como máximo.
- Disparadores: al guardar, al recuperar conectividad, cada **15 minutos**, y
  botón manual en "Registros Pendientes".
- Backoff: `30s, 1m, 2m, 5m, 15m, 30m` y se queda en 30m. **Sin límite de
  reintentos** para errores de red.
- Un registro nunca se borra de SQLite antes del ACK.

## Fotos

Dentro del alcance. Regla: **la foto se sube después de que su registro padre
tiene ACK.**

- Archivos en el filesystem del dispositivo (`Filesystem` de Capacitor). En
  SQLite va la ruta, el `guid` del padre, la etapa y el orden.
- Compresión antes de subir: lado mayor **1600 px**, JPEG calidad **80**.
- Cola separada, mismo backoff.
- No se borra el archivo local hasta el ACK de la foto.
- Si el padre quedó RECHAZADO, sus fotos se descartan con él.

## Catálogos (bajada)

"Actualizar Maestros" hace **descarga completa**, no incremental. Las tablas son
chicas (3 fincas, 23 lotes, 87 módulos, ~1.100 personal, 129 subtareas) y
ninguna tiene `updated_at`; un delta exigiría cambiar el esquema para ahorrar
kilobytes.

- La app sólo guarda y muestra filas con `estado = '1'`.
- Descarga **transaccional**: se escribe en tablas temporales y se hace swap al
  final. Un corte de red no puede dejar la app sin catálogos.
- Sin catálogos descargados, los módulos de captura quedan bloqueados.

## Identificación del dispositivo

Sin login. En Configuración se define un **alias** (ej. `TABLET-BELLITA-02`).

- Viaja como header `X-Device-Alias` y se persiste en `device_alias`.
- Es trazabilidad, **no es seguridad**. La autenticación va por API key
  (ver `02-bd-y-api.md` §8).

## Ventanas horarias AM/PM — validación local

**Decidido: el servidor no rechaza por ventana horaria.** La información del
sistema refleja el trabajo de campo, y el campo no se detiene a las 12:00.

- La ventana (AM 06:00–12:00, PM 13:00–18:00) llega en `/v4/bootstrap` y la app
  la valida **localmente**, contra `hora_proceso`, no contra la hora de envío.
- Fuera de ventana: aviso claro, el usuario decide, el registro se guarda.
- El servidor no la mira ni la registra en ningún lado.

**Reconfirmado el 2026-09-02 (Kevin):** *"en campo pueden y van a subir la info
de la mañana en la tarde. Dejar el rango de horario como visual únicamente,
sólo tomarlo en cuenta para análisis, no bloquear."* La ventana AM es un aviso
en pantalla; la PM ni siquiera se muestra.

Corolario necesario del offline-first: un registro capturado el martes dentro de
ventana y sincronizado el jueves **se acepta**. El servidor no valida horario.

La validación de `V3.php` (`am_valid_time_get` / `pm_valid_time_get`, con
`"23:00:00"` hardcodeado) no se replica en V4.
