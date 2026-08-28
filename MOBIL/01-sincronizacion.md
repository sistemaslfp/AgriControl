# 01 — Reglas de sincronización (app móvil v3)

> Actualizado 2026-08-28 con las respuestas de kevin.
> Aplica a la reescritura Ionic+Angular contra la API **V4**.

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
    { "guid": "c4a19d02-...", "status": "rejected",  "reason": "subtarea 88 inactiva" },
    { "guid": "5b8f1a44-...", "status": "created",   "id": 113443,
      "flags": ["retroactivo_excedido"] }
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
- `flags` no cambia el estado: el registro entró. Es información para la web.

**No hay confirmación manual en ningún punto.** El supervisor no "acepta" nada;
la pantalla "Registros Enviados" es lectura del estado, no una acción.

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
| I2 | `created_at_device <= received_at_server + 5min` | Reloj del teléfono adelantado | Acepta + flag `reloj_adelantado` |
| I3 | `fecha_proceso <= created_at_device + 2h` | Se fechó hacia adelante en el teléfono | Acepta + flag `fecha_futura_local` |
| I4 | `created_at_device − fecha_proceso <= ventana(módulo)` | Retroactivo excesivo | Acepta + flag `retroactivo_excedido` |
| I5 | Postcosecha: `fin >= inicio` y cada etapa arranca después del fin de la anterior | Cadena rota | **Rechazo duro** |

La tolerancia de 2 h en I1 e I3 absorbe el desfase de reloj y el caso de quien
empieza a registrar antes de que termine la jornada. No es margen para fechar
mañana.

I1 e I5 son los únicos rechazos duros. Una fecha futura no es criterio del
usuario: es un error de tecleo o una manipulación. Una cadena de etapas
invertida hace que el cálculo de tiempo de fermentado dé negativo.

### Ventanas de retroactividad (propuesta)

| Módulo | Atrás | Adelante | Razón |
|---|---|---|---|
| AM | 3 días | 0 | Es la programación del día |
| PM | 3 días | 0 | Es el cierre del día |
| Cosecha | 7 días | 0 | Puede acumularse una semana de pesajes |
| Riego | 7 días | 0 | Igual |
| Postcosecha | 30 días | 0 | El proceso completo dura semanas |

**[CONFIRMAR] los cinco números.** Son la única parte de esta sección que
depende del negocio, no de la técnica.

### Cómo se ve en la app

- El selector de fecha nace acotado: `min = ahora_corregido − ventana`,
  `max = ahora_corregido`.
- Para salir de la ventana hacia atrás, el usuario activa un interruptor
  **"registro retroactivo"** y escribe una justificación obligatoria.
- Ese registro sale con `flags: ["retroactivo_excedido"]` y la justificación en
  el comentario. Queda en la web para revisión.
- Hacia adelante no hay interruptor. El calendario no ofrece fechas futuras.

Así queda respetado el criterio del usuario — nunca se le bloquea el registro de
trabajo que sí ocurrió — pero la decisión queda firmada en vez de invisible.

### El servidor revalida

La app puede estar desactualizada o el teléfono manipulado. El servidor recalcula
los cinco invariantes contra `received_at_server` y **escribe los flags él
mismo**, ignorando los que mandó el cliente. El cliente los usa sólo para avisar
en pantalla antes de guardar.

Los flags viven en `reg_flag` (ver `02-bd-y-api.md` §6), no en columnas
sueltas de cada tabla.

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
correcciones se hacen en el sistema web. Único borrado permitido: un registro
PENDIENTE que nunca tuvo ACK, con confirmación explícita, asentado en una tabla
local `sync_audit`. **[CONFIRMAR]** si se permite ese borrado.

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
- El servidor **registra** la violación como flag `fuera_de_ventana_horaria` en
  `reg_flag`. No la castiga.

Esto es lo único que separa "confiar en el criterio del usuario" de "no tener
control": el criterio queda medido. Si un supervisor carga el 40% de sus PM
fuera de ventana, eso se ve en un reporte en vez de perderse.

Corolario necesario del offline-first: un registro capturado el martes dentro de
ventana y sincronizado el jueves **se acepta**. El servidor nunca valida horario
contra su propio reloj — sólo contra `fecha`+`hora` de proceso.

La validación de `V3.php` (`am_valid_time_get` / `pm_valid_time_get`, con
`"23:00:00"` hardcodeado) no se replica en V4.
