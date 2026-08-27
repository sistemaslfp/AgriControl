# 05 — Mapa: ¿dónde está X?

## Controladores web (`application/controllers/`)

| Archivo | Responsabilidad | Tabla/vista |
|---|---|---|
| `Inicio.php` | Home tras login + logout | — |
| `Auth.php` | Login, logout, password, alta/edición de usuarios y grupos (Ion Auth) | users/groups |
| `Finca.php` | CRUD fincas | `z_finca` |
| `Lote.php` | CRUD lotes | `z_lote` |
| `Modulo.php` | CRUD módulos | `z_modulo` |
| `Cultivos.php` | CRUD cultivos | `z_cultivo` |
| `Tarea.php` | CRUD tareas (+ `ino_generate_po_number`) | `z_tarea` |
| `Subtarea.php` | CRUD subtareas, tipo de pago, unidad de labor, historial de tarifas | `z_subtarea` |
| `Historiatarifas.php` | Historial de tarifas | `z_tarifas_historia` |
| `Personal.php` | CRUD personal, roles, estados | `z_personal*` |
| `PmCostGroup.php` | Grupos de costo | `tbl_pm_cost_groups` |
| `PmPaymentDailyAdjustment.php` | Ajuste diario de pago (⚠ clase mal escrita: `PmPaymentDailyAdjusment`) | `tbl_pm_payment_daily_adjustment` |
| `AM.php` | Reporte AM + `pivotLabores` | `vw_reporte_am_base` |
| `PM.php` | Reporte PM, editar/ver/listar, export, validación finca-lote-módulo | `z_tabla_pm`, `vw_reporte_pm` |
| `ReporteEventuales.php` | Reporte de trabajadores eventuales | `vw_pm_rpt_eventuales` |
| `Reportepago.php` | ⚠ contiene la clase `Proyectos`, sin `index()` — residuo | — |
| `Riego.php` | Riego + conversión hora↔decimal | `z_riego` |
| `Cosechacacao.php` | Cosecha de cacao + resumen y peso total | `z_cosecha_cacao` |
| `Postharvest.php` | Todo el flujo de postcosecha + fotos | `z_postharvest_*` |
| `Prueba.php` | Sandbox/ejemplo. **No es producción** | `—` |

## Pagos (`application/controllers/Operations/PM/`)

| Archivo | Métodos clave |
|---|---|
| `Payment.php` | `getFilteredPmRecords`, `show_pivoted_data`, `edit_pivoted_data`, `save_deductions`, `update_deductions`, `list_adjusments`, `edit_adjusments`, `createNewAdjustment`, `getYearsByFarm`, `getWeeksByFarmYear` |
| `PaymentAdjustment.php` | `addBonusDiscount`, `saveBonusDiscount`, `editBonusDiscount`, `addDeduction`, `saveDeduction`, `updateDeductions`, `showReport`, `listAdjustments`, `rateConversion` |

Modelo de soporte: `models/Payment_model.php` (~30 métodos; es el archivo con
más lógica de negocio del repo).

## API

`V1.php`, `V2.php`, `V3.php`, `API/V3.php` → ver `03-api.md`.

## Núcleo y utilidades

```
application/core/MY_Controller.php     login + template
application/core/Auth_Controller.php   helpers de ACL
application/core/MY_Loader.php         ->css() ->js() ->section()
application/core/MY_Output.php         motor de templates
application/libraries/Grocery_CRUD.php CRUD generator
application/libraries/Ion_auth.php     auth
application/libraries/Image_moo.php    manejo de imágenes
application/helpers/                   3 helpers, ver 04-convenciones.md
application/config/                    routes, database, ion_auth, rest, grocery_crud
```

## Búsquedas rápidas

```bash
grep -rn "set_table('z_" application/controllers   # qué controlador usa qué tabla
grep -rn "function .*_get\|function .*_post" application/controllers/V3.php
grep -rn "nombre_de_columna" application/models    # dónde se usa una columna
```
