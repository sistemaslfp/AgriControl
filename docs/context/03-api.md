# 03 — API REST (app móvil)

Base: `REST_Controller` de `chriskacerguis/codeigniter-restserver`.
Config: `application/config/rest.php`. Formato por defecto: **JSON**.

## Versiones — leer antes de tocar

| Archivo | Estado |
|---|---|
| `application/controllers/V1.php` | legacy |
| `application/controllers/V2.php` | legacy, ~idéntico a V1 |
| `application/controllers/V3.php` | ✅ **VIGENTE — editar SOLO aquí** |
| `application/controllers/API/V3.php` | copia legacy con los mismos 41 métodos |

**Decidido el 2026-08-21: la API activa es `application/controllers/V3.php`.**
Todo cambio de API va ahí. `V1`, `V2` y `API/V3` quedan congelados: no se editan
y no se borran hasta verificar en el servidor que ninguna versión de la app
móvil sigue apuntando a sus URLs (`/v1/...`, `/v2/...`, `/api/v3/...`).

## Convención

Método `nombre_get` / `nombre_post` → URL `…/v3/nombre` con el verbo HTTP
correspondiente. Ej.: `fincas_get()` → `GET /v3/fincas`.

## Endpoints de V3

**Catálogos (GET):** `personal`, `lotes`, `cultivos`, `fincas`, `tareas`,
`subtareas`, `supervisores`, `modulos`, `ulabores`, `users`, `index`

**AM / PM:**
- `GET close_am` — cierra la jornada AM
- `GET am_valid_time`, `GET pm_valid_time` — ventana horaria válida para registrar
- `POST addAm`, `POST addPm`
- `GET reporteam`
- `GET fincas_pmpendientes`, `GET supervisores_pmpendientes`, `GET operarios_pmpendientes`

**Operaciones de campo:**
- `POST addIrrigation` — riego
- `POST addCacaoHarvest` — cosecha de cacao
- `GET riego`

**Postcosecha (POST salvo indicado):**
`postHarvestWeight`, `postHarvestPreDrying`, `postHarvestFermentation`,
`postHarvestSunDrying`, `postHarvestMachineDrying`, `postHarvestResults`,
`postharvestResultData`, `postHarvestFermentationQuality`,
`postHarvestDryingQuality`, `uploadPicture`, `uploadPicture2`, `uploadPicture3`,
`GET getPendingPostharvestLots`, `GET postharvestLastLot`

**Usuarios:** `user_get`, `user_post`, `user_put`, `user_delete`
(ruta con alias: `$route['api/users(:num)'] = 'api/users/id/$1'`).

## Validación

`application/helpers/datetime_validation_helper.php`:
`isTimeValid()`, `isValidDate()`, `isValidPickerTime()` — se usan en los
endpoints `*_valid_time` y en los `addAm/addPm` para rechazar registros fuera
de la ventana horaria permitida.

## Seguridad — estado actual

`rest.php` tiene `rest_auth = false`, `rest_enable_keys = false`,
`rest_ip_whitelist_enabled = false` y credenciales de ejemplo
(`admin / 1234`). **La API está abierta.** Ver `99-riesgos.md`.
