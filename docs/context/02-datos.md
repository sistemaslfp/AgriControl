# 02 — Modelo de datos

Schema: **`lfp_prodapp`** sobre **MariaDB 10.4.18**. 41 tablas y 22 vistas.

El dump vive en `docs/db/init/01-schema.sql` (no versionado: trae datos reales).
**Ese archivo es la fuente de verdad del esquema**; la tabla de inventario de
abajo se extrajo del código y sirve solo para orientarse rápido.

## Cómo obtener el esquema real (hazlo una vez)

Hay acceso completo a la BD vía MySQL Workbench. Extraer el DDL y versionarlo
elimina la única fuente grande de incertidumbre de este repo:

```bash
# Solo estructura, sin datos. Incluye vistas, triggers y rutinas.
mysqldump -h HOST -u USUARIO -p --no-data --routines --triggers \
          --skip-add-drop-table lfp_prodapp > docs/db/schema.sql
```

Alternativa por GUI: Workbench → *Server* → *Data Export* → marcar `lfp_prodapp`
→ *Dump Structure Only* → *Export to Self-Contained File*.

Guardar en `docs/db/schema.sql` y anotar aquí la fecha del volcado. Cuando
exista, **ese archivo manda sobre esta tabla de inventario**.

## Convención de nombres

- `z_*` → tablas maestras/transaccionales legacy.
- `tbl_*` → tablas nuevas del módulo de pagos.
- `vw_*` / `vwpm_*` → **vistas SQL** (solo lectura; Grocery CRUD las usa con
  `set_primary_key()` forzado).

## Catálogos

| Tabla | Contenido | Modelo |
|---|---|---|
| `z_finca` | Fincas (nombre, ha) | `Fincas_model` |
| `z_lote` | Lotes por finca | `Lotes_model` |
| `z_modulo` | Módulos por lote | `Modulos_model` |
| `z_cultivo` | Cultivos | `Cultivos_model` |
| `z_tarea` | Tareas | `Tareas_model` |
| `z_subtarea` | Subtareas | `Subtareas_model` |
| `z_ulabor` | Unidades de labor | `Unidad_labor_model` |
| `z_tipo_pago` | Tipos de pago | (usado en `Subtarea.php`) |
| `z_tarifas_historia` | Historial de tarifas | `Historiatarifas.php` |
| `z_personal` | Trabajadores | `Personal_model` |
| `z_personal_roles` | Roles del personal | `Personal.php::roles()` |
| `z_personal_estado` | Estados del personal | `PersonnelStatus_model` |
| `tbl_pm_cost_groups` | Grupos de costo | `PmCostGroup.php` |

## Transaccionales

| Tabla | Contenido | Modelo |
|---|---|---|
| `z_tabla_pm` | Registros PM (producción/pago). Tabla más consultada del sistema | `Pm_model`, `Payment_model` |
| `z_riego` | Riegos | `Riego_model` |
| `z_cosecha_cacao` | Cosecha de cacao | `Cosechacacao_model` |
| `tbl_pm_payment_daily_adjustment` | Ajustes diarios de pago | `PmPaymentDailyAdjustment.php` |
| `tbl_pm_payment_conversionrate` | Tasas de conversión de tarifa | `Payment_model::get_conversion_rate` |

Los registros AM se leen vía vistas; la escritura pasa por `Am_model::create_am` / `close_am`.

## Postcosecha

`z_postharvest_predrying`, `z_postharvest_fermentation`, `z_postharvest_sundrying`,
`z_postharvest_machinedrying`, `z_postharvest_result`,
`z_postharvest_fermentationquality`, `z_postharvest_dryingquality`.
Modelo único: `Postharvest_model` (un `create*FromAPI` por etapa + `save_image`).

## Vistas SQL

| Vista | Uso |
|---|---|
| `vw_reporte_am_base` | Reporte AM (`AM::index`) |
| `vw_reporte_pm` | Reporte PM (`PM::index`) |
| `vw_pm_rpt_eventuales` | Reporte de eventuales |
| `vw_pm_temporaryworkers`, `vw_pm_temporaryworkers_reports`, `vw_temporaryworkers_pivot` | Eventuales / pivote |
| `vwpm_paymentadjustment_fullreport` | Reporte completo de ajustes de pago |
| `vw_harvest_pending_lots` | Lotes pendientes de postcosecha |
| `vw_postharvest_rpt_001` | Reporte de postcosecha |
| `vw_postharvest_photos_fermentation`, `vw_postharvest_photos_sundrying` | Fotos por etapa |

## Autenticación (Ion Auth)

Tablas estándar de Ion Auth definidas en `application/config/ion_auth.php`
(`users`, `groups`, `users_groups`, `login_attempts`).
También se requiere la tabla **`ci_sessions`** (`config.php` usa
`sess_driver = 'database'`, `sess_save_path = 'ci_sessions'`). Sin ella no hay
login posible.

**Grupos usados en código:** `1` = admin, `2` = supervisor. El resto = solo lectura
o sin acceso, según el controlador.

## Patrón común en modelos

```php
$this->db->select(...)->from('tabla')->where(...);
return $this->db->get()->result();      // o ->result_array()
```
Casi todos los modelos tienen `db_table_exists()` y `get_all()`.
`Grocery_crud_model` y `Ion_auth_model` son de librería: **no los toques**.
