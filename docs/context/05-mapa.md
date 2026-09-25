# 05 — Mapa: ¿dónde está X?

## Controladores web (`application/controllers/`)

| Archivo | Responsabilidad | Tabla/vista | Permiso |
|---|---|---|---|
| `Inicio.php` | Home tras login | — | login |
| `Auth.php` | Login, contraseña, usuarios (con rol y hacienda) y grupos | `users`, `groups` | admin global |
| `Finca.php` | Haciendas | `z_finca` | admin global |
| `Lote.php` | Lotes | `z_lote` | maestras (por hacienda) |
| `Modulo.php` | Módulos (sin borrado) | `z_modulo` | maestras (por hacienda) |
| `Cultivos.php` | Cultivos | `z_cultivo` | admin global |
| `Tarea.php` | Tareas | `z_tarea` | admin global |
| `Subtarea.php` | Subtareas; `tipoPago`, `unidadLabor` | `z_subtarea`, `z_tipo_pago`, `z_ulabor` | maestras / admin global |
| `Personal.php` | Personal; `roles`, `estado` | `z_personal*` | maestras / admin global |
| `PmCostGroup.php` | Grupos de costo | `tbl_pm_cost_groups` | admin global |
| `Historiatarifas.php` | Historial de tarifas | `z_tarifas_historia` | lectura |
| `AM.php` | Reporte de labores + `pivotLabores` | `vw_lfp_reporte_am_base`, `vw_lfp_reporte_am` | lectura |
| `PM.php` | `reportePagos` (lectura); `editarPM`, `listarPM` (edita el cierre) | `vw_lfp_reporte_pm`, `lfp_am` | lectura / edita |
| `Cosechacacao.php` | Cosecha, `sacos`, `resumen` | `vw_lfp_cosecha*` | lectura |
| `Riego.php` | Bitácora de riego | `lfp_riego` | edita |
| `Postharvest.php` | Reporte, `Master`, etapas, calidad y fotos | `vw_lfp_postharvest_rpt`, `pc_*` | lectura / edita |
| `ReporteEventuales.php` | ⚠ rota: la vista `vw_pm_rpt_eventuales` no existe. Fuera del menú | — | — |
| `PmPaymentDailyAdjustment.php` | ⚠ clase mal escrita (`PmPaymentDailyAdjusment`), no rutea | — | — |
| `Reportepago.php` | ⚠ contiene la clase `Proyectos`, sin `index()` — residuo | — | — |
| `Prueba.php` | Sandbox. **No es producción** | — | — |

## Pagos (`application/controllers/Operations/PM/`)

| Archivo | Estado | Métodos clave |
|---|---|---|
| `PaymentAdjustment.php` | ✅ en uso (menú) | `index` (filtro), `addBonusDiscount`, `saveBonusDiscount`, `addDeduction`, `saveDeduction`, `showReport`, `listAdjustments`, `editBonusDiscount`, `updateBonusDiscount`, `editDeduction`, `updateDeductions`, `rateConversion` |
| `Payment.php` | ⚠ legacy, fuera del menú; carga vistas de una ruta que no existe | `getFilteredPmRecords`, `show_pivoted_data`, … |

Modelo: `models/Payment_model.php`. Lo que usa `PaymentAdjustment` lee
`vw_lfp_ajuste_pago`; quedan métodos sobre vistas v3
(`vw_pm_temporaryworkers*`) y `backupAndDeleteDuplicates()` sobre `z_tabla_pm`
que solo usa el legacy.

## API

`V4.php` (vigente) y su copia `API/V4.php`; `V1`/`V2`/`V3` legacy.
Configuración en `config/v4.php`. Ver `03-api.md`.

## Núcleo y utilidades

```
application/core/MY_Controller.php      login, helpers, template
application/core/MY_Loader.php          ->css() ->js() ->section()
application/core/MY_Output.php          motor de templates
application/helpers/acceso_helper.php   rol y hacienda
application/helpers/alertas_helper.php  errores visibles
application/libraries/Grocery_CRUD.php  CRUD generator
application/libraries/Ion_auth.php      auth
application/config/                     routes, database, ion_auth, rest, grocery_crud, v4
```

## Base de datos y documentación

```
docs/db/init/            dump v3 que carga Docker (01-schema.sql no versionado)
docs/db/migrations/      01..06 esquema V4 (orden obligatorio); _historico/ no se corre
docs/deploy/             despliegue en producción (XAMPP)
MOBIL/00-plan.md…04      plan, sincronización, contrato de la API, pantallas, mapa de la BD
MOBIL/app-v4/            app Ionic/Angular + suites e2e
```

## Búsquedas rápidas

```bash
grep -rn "set_table('" application/controllers          # qué pantalla usa qué tabla
grep -rn "acceso_exigir\|acceso_crud" application/controllers   # permisos por pantalla
grep -n "function .*_get\|function .*_post" application/controllers/V4.php
grep -rn "nombre_de_columna" application/models docs/db/migrations
```
