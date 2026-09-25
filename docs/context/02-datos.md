# 02 — Modelo de datos

Schema **`lfp_prodapp`** sobre **MariaDB 10.4.18**. Conviven dos generaciones:

| Generación | Tablas | Estado |
|---|---|---|
| **v3** | `z_*`, `tbl_*`, vistas `vw_*`/`vwpm_*` | catálogos `z_*` **vivos**; transaccionales `z_*` **congelados** (histórico ya migrado) |
| **V4** | `lfp_*`, `pc_*`, vistas `vw_lfp_*` | **vigente**: lo escribe la app y lo lee la web |

## Fuentes de verdad del esquema

- **v3**: `docs/db/init/01-schema.sql` — dump de producción (41 tablas,
  22 vistas, con datos). **No versionado**.
- **V4**: `docs/db/migrations/`, en orden. Idempotentes, sin `DELIMITER`
  (corren en MySQL Workbench):

| Archivo | Qué hace |
|---|---|
| `01-catalogos.sql` | `z_finca.estado`, `z_ulabor.estado`, `z_lote.tiene_modulos` |
| `02-tablas-v4.sql` | crea `lfp_*`, `pc_*`, `lfp_flag`, `mig_descarte` |
| `03-migracion-historico.sql` | migra **todo** el histórico v3 a V4; lo que no entra va a `mig_descarte` |
| `04-vistas-v4.sql` | vistas `vw_lfp_*` (mismo contrato de columnas que su equivalente v3) |
| `05-ajustes-pago-v4.sql` | repunta los ajustes de pago a `lfp_am` y crea `vw_lfp_ajuste_pago` |
| `06-usuarios-hacienda.sql` | `users.finca_id`, grupos 2/3 renombrados y grupo 4 |

`_historico/` es la historia de desarrollo (tablas `reg_*` intermedias):
**no se corre**. Una migración aplicada en producción no se reescribe.

## Convención de nombres

- `z_*` → catálogos y transaccionales v3.
- `tbl_*` → módulo de pagos (v3, reusado por V4 en ajustes).
- `lfp_*` → registros V4. `pc_*` → postcosecha V4.
- `vw_lfp_*` → vistas V4. `vw_*` / `vwpm_*` sin `lfp` → vistas v3.

## Catálogos (vivos, compartidos por v3 y V4)

| Tabla | Contenido | Notas |
|---|---|---|
| `z_finca` | Haciendas (Bellita = 1, Pacaritambo) | `estado` desde migración 01 |
| `z_lote` | Lotes por finca | `estado`, `tiene_modulos` |
| `z_modulo` | Módulos por lote | se inactivan, no se borran |
| `z_cultivo`, `z_tarea` | Cultivos, tareas | solo admin global |
| `z_subtarea` | Subtareas: `tarifa`, `unidad_labor_id`, `tipo_pago_id`, `id_finca` | la **unidad** decide PM vs Cosecha |
| `z_ulabor` | Unidades de labor (Libra = 4) | |
| `z_tipo_pago` | Area Ejecutada / Jornal / Avance | informativo: no entra en el pago |
| `z_tarifas_historia` | Historial de tarifas | |
| `z_personal` | Trabajadores | **`eregistro` = vigencia** (`A`/`I`); `estado` = tipo de contrato |
| `z_personal_roles`, `z_personal_estado` | Roles y tipos de contrato | |
| `tbl_pm_cost_groups`, `tbl_pm_payment_conversionrate` | Grupos de costo, factor de conversión | |

## Registros V4

| Tabla | Una fila = | Claves |
|---|---|---|
| `lfp_am` | **una persona en una tarea**: programación de la mañana (AM) **y** su cierre (PM) en la misma fila | `guid` único; `cierre_guid` único; abierta si `cierre_guid IS NULL` |
| `lfp_cosecha` | el cierre de un AM de cosecha | `lfp_am_id` único; su `guid` = `lfp_am.cierre_guid` |
| `lfp_cosecha_saco` | un saco de una cosecha (`numero`, `libras`) | `(cosecha_id, numero)` |
| `lfp_riego` | una línea de bitácora de riego (lote, módulo, minutos, volumen) | `guid`. **No cuelga de `lfp_am`** |
| `lfp_flag` | un rechazo, duplicado o error de `/v4/sync` (`origen`, `codigo`, `payload`) | la escribe `V4.php` |
| `mig_descarte` | una fila v3 que no se migró o se migró marcada | `motivo`, `payload` |

Columnas clave de `lfp_am`: `fecha_proceso`, `finca_id`, `responsable_id`,
`cultivo_id`, `lote_id`, `modulos` (**CSV de ids** ordenado, `3,8,25`),
`subtarea_id`, `personal_id`, `captura_guid` (agrupa las N personas de un
mismo formulario), `justificacion_retro`, `origen`; y el cierre: `cantidad`,
`hora_cierre`, `comentario_cierre`, `justificacion_retro_cierre`,
`responsable_cierre_id`, `cierre_guid`, `cierre_origen` (`pm`/`cosecha`),
más marcas de dispositivo (`device_alias`, `*_at_device`, `*_offset`).

**Año y semana no se guardan**: se derivan con `WEEK(fecha,3)` /
`YEARWEEK(fecha,3)` (ISO). **El pago = `lfp_am.cantidad × z_subtarea.tarifa`**
(`vw_lfp_reporte_pago`). En cosecha, `cantidad` = suma de libras.

## Postcosecha V4

`pc_proceso` (la partida: `lot_code` asignado por el servidor vía
`pc_lot_code_seq`, pesos), `pc_proceso_cosecha` (qué cosechas entran; cada
cosecha una sola vez), `pc_etapa` (una por etapa, `inicio`/`fin`),
`pc_calidad_fermentacion` (una por partida), `pc_calidad_secado` (una por
etapa de secado), `pc_foto`.

## Vistas V4

| Vista | Uso |
|---|---|
| `vw_lfp_reporte_am_base`, `vw_lfp_reporte_am` | reporte de labores y pivot (`AM.php`, `Reporteam_model`) |
| `vw_lfp_reporte_pm` | reporte de pago (`PM::reportePagos`, `Pm_model`) |
| `vw_lfp_reporte_pago` | cálculo de pago (`cantidad × tarifa`) |
| `vw_lfp_cosecha`, `vw_lfp_cosecha_saco`, `vw_lfp_cosecha_resumen` | cosecha (`Cosechacacao.php`) |
| `vw_lfp_harvest_pending_lots` | cosechas pendientes de postcosecha |
| `vw_lfp_postharvest_rpt`, `vw_lfp_postharvest_fotos` | postcosecha (`Postharvest.php`) |
| `vw_lfp_ajuste_pago` | base de los ajustes de pago (`Payment_model`) |
| `vw_lfp_flag` | lectura de `lfp_flag` (hoy no la usa ninguna pantalla) |

Las vistas con JOIN son **de solo lectura**: las pantallas que editan apuntan a
`lfp_am`, `lfp_riego` o `pc_*`.

## v3 congelado (no apuntar pantallas nuevas aquí)

`z_tabla_am`, `z_tabla_pm`, `z_cosecha_cacao`, `z_riego`, `z_postharvest_*`,
`z_reportepm` y sus vistas (`vw_reporte_*`, `vw_pm_temporaryworkers*`,
`vw_postharvest_*`, `vwpm_*`). Solo los escriben los endpoints legacy
`V1`/`V2`/`V3` (modelos `Am_model`, `Pm_model::create_pm`,
`Cosechacacao_model`, `Riego_model`, `Postharvest_model`).

## Ajustes de pago

`tbl_pm_payment_daily_adjustment.pm_id` apunta a **`lfp_am.id`** desde la
migración 05 (antes a `z_tabla_pm.id`). También
`tbl_pm_payment_weekly_deductions` y `tbl_pm_payment_paymenthistory`.

## Autenticación (Ion Auth)

Tablas `users`, `groups`, `users_groups`, `login_attempts` y **`ci_sessions`**
(`sess_driver = 'database'`; sin ella no hay login).
`users.finca_id` (FK a `z_finca`, NULL = todas) desde la migración 06.

| Grupo | Nombre | Puede |
|---|---|---|
| 1 | admin | todo, global; único que crea usuarios |
| 2 | Supervisor | edita registros de su hacienda, sin maestras |
| 3 | Operador | solo lectura de su hacienda |
| 4 | Admin hacienda | edita registros y maestras de su hacienda (Personal, Subtareas, Lotes, Módulos) |

## Patrón común en modelos

```php
$this->db->select(...)->from('tabla')->where(...);
return $this->db->get()->result();
```
`Grocery_crud_model` y `Ion_auth_model` son de librería: **no los toques**.
