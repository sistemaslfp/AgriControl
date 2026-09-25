# 01 — Arquitectura

## Ciclo de un request web

1. `public/index.php` arranca CI3 (`system/core/CodeIgniter.php`).
2. `application/config/routes.php` → default controller = `inicio`.
   Rutas explícitas (solo 2, ambas residuales): `api/users(:num)` y
   `filter_records → Payment/filter`. **Todo lo demás es ruteo implícito**
   `clase/metodo/param`.
3. `MY_Controller::__construct()`:
   - carga Ion Auth y **redirige a `auth/login` si no hay sesión**;
   - carga los helpers `acceso` y `alertas`;
   - `acceso_forzar_parametros()` pisa cualquier `farm`/`farmId`/`farm_id`/
     `finca_id`/`id_finca` del GET/POST con la hacienda del usuario (si tiene);
   - `alerta_bd_en_escritura()` apaga `db_debug` y `mysqli_report` en las
     URLs de escritura de Grocery CRUD (`insert`, `update`, `delete`…);
   - fija el template `admin/index` y pasa `$data_template['acceso']`.
4. `Public_Controller` añade el chequeo de `site_open` y, si el user-agent es
   móvil, cambia el template a `admin/index_mobile`.
5. El controlador aplica `acceso_exigir()` / `acceso_crud*()`, arma el
   `grocery_CRUD` y termina con `$this->load->view('Crud/…', (array)$output)`.

## Permisos y hacienda (`helpers/acceso_helper.php`)

`acceso_usuario()` devuelve (cacheado por request):

| Clave | Significado |
|---|---|
| `grupo` | 1 Admin global, 2 Supervisor, 3 Operador, 4 Admin hacienda |
| `finca` / `finca_nombre` | hacienda del usuario (`users.finca_id`); `null` = todas. El grupo 1 siempre es global |
| `admin_global` | grupo 1 |
| `maestras` | grupos 1 y 4 (4 solo Personal, Subtareas, Lotes, Módulos de su hacienda) |
| `edita` | grupos 1, 2 y 4. El 3 es solo lectura |

Herramientas: `acceso_exigir($permiso)` (redirige a `/`),
`acceso_crud($crud, $tabla, $condicion)` (filtra el listado y rechaza
editar/borrar un id ajeno escrito en la URL), `acceso_crud_finca()` (tablas
con columna de finca propia: filtra, limita el selector y fija el valor al
guardar), `acceso_lotes_sql()` y `acceso_validar_lote()`.

El menú (`views/themes/admin/index.php`) se arma con esas mismas claves, pero
**el menú no protege nada**: cada controlador exige su permiso.

## Errores visibles (`helpers/alertas_helper.php`)

Grocery CRUD solo muestra un motivo si llega en la fase de validación.
`alerta_validar($crud, $motivo)` y `alerta_crud_error($crud, $mensaje)` lo
hacen llegar; `alerta_flash()` sirve para las vistas hechas a mano. Un
`callback_before_*` que devuelve `false` sin esto termina en "error al
guardar" genérico.

## Extensiones del core (`application/core/`)

| Archivo | Rol |
|---|---|
| `MY_Controller.php` | Define `MY_Controller`, `Admin_Controller`, `Public_Controller` |
| `Auth_Controller.php` | Helpers de ACL de Ion Auth. **No se usa**: los permisos van por `acceso_helper` |
| `MY_Loader.php` | Añade `->css()`, `->js()`, `section()` / `get_section()` al loader |
| `MY_Output.php` | Templates: `set_template()`, `set_title()`, `set_message()`, secciones |

## Capas

- **Catálogos** (`Finca`, `Lote`, `Modulo`, `Cultivos`, `Tarea`, `Subtarea`,
  `Personal`, `PmCostGroup`, `Historiatarifas`): Grocery CRUD sobre `z_*`.
  Módulos no se borran (se inactivan).
- **Registros V4** (lo que llega de la app):

| Pantalla | Fuente | Escritura |
|---|---|---|
| `AM` (labores + pivot) | `vw_lfp_reporte_am_base`, `vw_lfp_reporte_am` | solo lectura |
| `PM/reportePagos` | `vw_lfp_reporte_pm` | solo lectura |
| `PM/editarPM`, `PM/listarPM` | `lfp_am` | edita el cierre (grupos con `edita`) |
| `Cosechacacao` (+ `sacos`, `resumen`) | `vw_lfp_cosecha`, `vw_lfp_cosecha_saco`, `vw_lfp_cosecha_resumen` | solo lectura |
| `Riego` | `lfp_riego` | editable |
| `Postharvest` (+ `Master`) | `vw_lfp_postharvest_rpt` | solo lectura |
| `Postharvest/Predrying…DryingQuality` | `pc_etapa`, `pc_calidad_fermentacion`, `pc_calidad_secado`, `pc_foto` | editable |

- **Ajustes de pago** (`Operations/PM/PaymentAdjustment.php` +
  `models/Payment_model.php`): bonos, descuentos y deducciones semanales sobre
  `vw_lfp_ajuste_pago` (una fila = una persona en una tarea cerrada de
  `lfp_am`). Vistas hechas a mano, no Grocery CRUD, salvo el listado y
  `rateConversion`.
- **API**: `V4.php` vigente; `V1`/`V2`/`V3` legacy. Ver `03-api.md`.

## Vistas

```
views/themes/admin/index.php          layout maestro (desktop) + menú por permisos
views/themes/admin/index_mobile.php   layout móvil
views/themes/admin/AM/base.php        pivote de labores AM
views/Crud/default.php                salida estándar de Grocery CRUD
views/Crud/farm-date_filter.php       + combo de hacienda y fecha
views/Crud/date-range_filter.php      + rango de fechas
views/Crud/pm-edit.php, pm-report.php PM
views/pages/operations/pm/payment_adjustment/*.php   bonos, deducciones, reporte
views/auth/*                          login, usuarios y grupos (Ion Auth)
views/payments/*.php                  legacy de Operations/PM/Payment.php (sin uso)
```

Toda vista hecha a mano que sea un formulario debe tener su botón
"Volver" a la sección general (Grocery CRUD ya trae el suyo).

## Assets

`public/assets/` (temas, js, css, Grocery CRUD). Se enlazan con
`$this->load->js(...)` desde `MY_Controller::_init()` y desde cada controlador.
Los listados usan scroll con encabezado fijo, sin paginación.
