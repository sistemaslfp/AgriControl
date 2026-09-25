# 03 — API REST (app móvil)

Base: `RestController` de `chriskacerguis/codeigniter-restserver`.
Config: `application/config/rest.php`. Formato: **JSON**.

## Versiones — leer antes de tocar

| Archivo | Estado |
|---|---|
| `application/controllers/V4.php` | ✅ **VIGENTE** — app móvil V4 (`MOBIL/app-v4`). Escribe `lfp_*` y `pc_*` |
| `application/controllers/API/V4.php` | copia **byte a byte** de `V4.php` (ruta `/api/v4/...`). Si cambias uno, copia al otro |
| `application/controllers/V3.php` | legacy congelada — app v2.0.5. Escribe `z_*` |
| `application/controllers/V1.php`, `V2.php` | legacy congeladas |

`API/V3.php` se eliminó el 2026-09-16. Desde esa fecha todas las haciendas
envían por V4. V1/V2/V3 **no se editan**; no se borran hasta confirmar en el
servidor que ningún equipo les pega.

## V4 — endpoints

| Método y ruta | Qué hace |
|---|---|
| `GET /v4/hora` | hora del servidor. **No carga la base**: sirve para "Probar conexión" y para el offset del reloj |
| `GET /v4/bootstrap` | configuración de `config/v4.php` (ventanas, días retroactivos, `cosecha_subtarea_ids`) |
| `GET /v4/catalogos` | `version`, fincas, lotes, módulos, cultivos, tareas, subtareas, ulabores y personal activo (tipos casteados) |
| `GET /v4/am_abiertos?fecha=YYYY-MM-DD[&finca_id=N][&modulo=pm\|cosecha]` | tareas AM sin cierre, una fila por persona. `fecha` obligatoria |
| `GET /v4/postcosecha_pendientes[?desde=…]` | cosechas disponibles para armar una partida |
| `GET /v4/postcosecha_abiertas` | partidas abiertas con sus etapas |
| `POST /v4/sync` | cola de la app: lote de hasta **200** registros |

Sin guion en las rutas: CI mapea el segmento al nombre del método.

## `POST /v4/sync`

Cada registro: `{guid, tipo, created_at_device, payload}`. Cabecera
`X-Device-Alias` (permitida en CORS desde `rest.php`, no desde el controlador).

Tipos: `am`, `pm`, `cosecha`, `riego`, `pc_proceso`, `pc_etapa`,
`pc_resultado`, `pc_calidad_ferm`, `pc_calidad_sec`.

Respuesta 200 con `results[]`, cada uno `created` | `duplicate` | `rejected`:

- **ACK = el `guid` aparece en `results` con `created`/`duplicate`**, no el HTTP 200.
- **Un guid ausente de `results` queda PENDIENTE** y la app lo reintenta
  (error de base, tipo desconocido). `rejected` es solo para lo que reenviar no
  arregla (payload inválido, catálogo inexistente, fecha futura) y no se
  reintenta.
- El `id` devuelto es siempre el de `lfp_am` (en postcosecha, el de la
  partida; `pc_proceso` devuelve también `lot_code`).
- Body ilegible → 400. Más de 200 registros → 413.

Reglas de negocio que valida el servidor:

- `pm` y `cosecha` **cierran** una fila de `lfp_am` (UPDATE con
  `cierre_guid IS NULL`); no crean tareas. Subtarea de unidad Libra → solo
  `cosecha`; el resto → solo `pm`.
- `am` sin personas → `rejected`. Una persona con otro AM sin cerrar ese día
  → `rejected` (se excluye el propio guid para no romper el reintento).
- Lote ∈ finca, módulo ∈ lote, personal con `eregistro = 'A'`, catálogos con
  `estado` activo. **No valida** que la persona o la subtarea sean de esa finca.
- Fecha futura → `rejected`. Fecha pasada: permitida dentro de la ventana
  retroactiva de `config/v4.php` con justificación (`justificacion_retro`).
- Motivos de rechazo legibles (nombres, no ids), armados en el servidor.
- Rechazos, duplicados y errores quedan en `lfp_flag` con el payload, fuera de
  la transacción.

Trampas de implementación (aplican a cualquier consulta nueva de V4):
cargar la base con `requireDb()`, envolver en `try/catch (Throwable)` con
`db_debug` apagado, castear con `castRows()`, fechas siempre con offset y
semana con `format('o')`.

Contrato completo: `MOBIL/02-bd-y-api.md` §7 y `MOBIL/01-sincronizacion.md`.

## `config/v4.php`

| Clave | Valor actual |
|---|---|
| `ventanas_horarias` | AM 06:00–12:00, PM 13:00–18:00 (informativo) |
| `retroactividad_dias` | am 3, pm 3, cosecha 7, riego 7, postcosecha 30 |
| `cosecha_unidad_ids` | `[4]` (Libra) |
| `cosecha_subtarea_ids` | `[]` (override manual) |

Cambiar un valor aquí no exige recompilar la app: viaja en `/v4/bootstrap`.

## V3 legacy (referencia)

Convención `nombre_get`/`nombre_post` → `/v3/nombre`. Catálogos
(`personal`, `lotes`, `fincas`, …), `addAm`, `addPm`, `close_am`,
`addIrrigation`, `addCacaoHarvest`, `postHarvest*`, `uploadPicture*`.
Escribe en `z_tabla_am`, `z_tabla_pm`, `z_riego`, `z_cosecha_cacao`,
`z_postharvest_*`, que **la web ya no lee**. Bug conocido y no corregido: año
con `format('Y')` en vez de `'o'` en el cambio de año.

## Seguridad — estado actual

`rest_auth = false`, `rest_enable_keys = false`,
`rest_ip_whitelist_enabled = false`. **La API está abierta.** Activar
`rest_enable_keys` es global y rompería V3; la auth de V4 debe resolverse
dentro de V4 (pendiente). Ver `99-riesgos.md`.
