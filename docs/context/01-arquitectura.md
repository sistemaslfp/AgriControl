# 01 — Arquitectura

## Ciclo de un request web

1. `public/index.php` arranca CI3 (`system/core/CodeIgniter.php`).
2. `application/config/routes.php` → default controller = `inicio`.
   Rutas explícitas (solo 2): `api/users(:num)`, `filter_records → Payment/filter`.
   **Todo lo demás es ruteo implícito** `clase/metodo/param`.
3. `MY_Controller::__construct()` carga Ion Auth y **redirige a `auth/login`
   si no hay sesión**; luego fija el template `admin/index` y JS base.
4. `Public_Controller` añade: chequeo de `site_open` y, si el user-agent es
   móvil, cambia el template a `admin/index_mobile`.
5. El controlador construye un `grocery_CRUD` y termina con
   `$this->load->view('Crud/default', (array)$output);`.

## Extensiones del core (`application/core/`)

| Archivo | Rol |
|---|---|
| `MY_Controller.php` | Define `MY_Controller`, `Admin_Controller`, `Public_Controller` |
| `Auth_Controller.php` | Helpers de ACL: `require_min_level`, `require_group`, `require_role`, `acl_permits`, `force_ssl` |
| `MY_Loader.php` | Añade `->css()`, `->js()`, `section()` / `get_section()` al loader |
| `MY_Output.php` | Sistema de templates: `set_template()`, `set_title()`, `set_message()`, secciones |

`MY_Output` es lo que permite que los controladores no hagan `include` del
layout: el layout `views/themes/admin/index.php` se aplica en `_display()`.

## Capas

- **Controladores CRUD** (`Finca`, `Lote`, `Modulo`, `Cultivo`, `Tarea`,
  `Subtarea`, `Personal`, `Riego`, `Historiatarifas`, `PmCostGroup`):
  casi sin lógica, todo es configuración de Grocery CRUD.
- **Controladores de reporte** (`AM`, `PM`, `ReporteEventuales`, `Cosechacacao`):
  Grocery CRUD sobre **vistas SQL** + filtros por querystring/URI + export.
- **Módulo de pagos** (`controllers/Operations/PM/Payment.php` y
  `PaymentAdjustment.php` + `models/Payment_model.php`): aquí sí hay lógica de
  negocio real (pivotes, deducciones, bonos, tarifas de conversión).
- **API** (`V1`, `V2`, `V3`, `API/V3`): `REST_Controller`, métodos con sufijo
  `_get` / `_post` / `_put` / `_delete`.
- **Postcosecha** (`Postharvest.php` + `Postharvest_model.php`): flujo por
  etapas (peso → prosecado → fermentación → secado sol/máquina → resultados →
  calidad), con subida de fotos.

## Vistas

```
views/themes/admin/index.php         layout maestro (desktop)
views/themes/admin/index_mobile.php  layout móvil
views/themes/admin/AM/base.php       pivote de labores AM
views/Crud/default.php               salida estándar de Grocery CRUD
views/Crud/farm-date_filter.php      + combo de finca y filtro de fecha
views/Crud/date-range_filter.php     + rango de fechas
views/Crud/pm-edit.php, pm-report.php
views/payments/*.php                 resumen y edición de pagos
views/pages/operations/pm/payment_adjustment/*.php   bonos, deducciones, reportes
views/auth/*                         pantallas de Ion Auth
```

## Assets

`public/assets/` (temas, js, css). Se enlazan con `$this->load->js(...)` desde
`MY_Controller::_init()` y desde cada controlador.
