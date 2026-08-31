# Mapa de la base — qué hay hoy y quién lo usa

Medido el 2026-08-31 sobre una copia real de `lfp_prodapp`
(el dump de `docs/db/init/01-schema.sql`). 58 tablas y 23 vistas.

La base tiene **cuatro grupos de tablas**, y la única pregunta que importa para
cada una es: ¿la usa v3, v4, o las dos?

---

## Grupo 1 — Catálogos: se comparten, NO se duplican

Son la fuente única de verdad. Los leen la web, V3 y V4 por igual. No se copian
a tablas nuevas, no se renombran, no se tocan. Todas las FK de las tablas nuevas
apuntan aquí.

| tabla | filas | qué es |
|---|---|---|
| `z_finca` | 2 | Bellita, Pacaritambo |
| `z_lote` | 14 | 8 con módulos |
| `z_modulo` | 43 | ids de 1 a 85, con huecos |
| `z_cultivo` | 1 | Cacao |
| `z_tarea` | 14 | grupos de labor |
| `z_subtarea` | 99 | la labor y su tarifa |
| `z_ulabor` | 8 | unidades de labor |
| `z_personal` | 929 | trabajadores y supervisores |
| `z_personal_estado` | 5 | afiliado, etc. |
| `z_personal_roles` | 16 | |
| `z_tipo_pago` | 3 | |
| `z_tarifas_historia` | 410 | histórico de tarifas |
| `z_unidades`, `z_reportepm` | 0 | vacías |

**Trampa conocida:** `estado` está mezclado. `z_cultivo`/`z_modulo`/`z_lote`
usan `'1'`; `z_tarea` y `z_subtarea` usan `'A'`. Filtrar por `estado='1'` parejo
devuelve cero tareas. V4 filtra `estado IN ('1','A')`.

---

## Grupo 2 — Transaccionales VIEJAS (v3): se congelan, no se borran

Aquí está todo lo que registró la app v2.0.5 y la web hasta hoy. **Se quedan
tal cual, indefinidamente**: la web las usa como "Datos Históricos" y otra finca
sigue trabajando con ese sistema.

| tabla | filas | rango | de las cuales ≥ 2026-08-01 |
|---|---|---|---|
| `z_tabla_am` | 113.410 | 2021-04-05 → 2026-08-27 | 590 |
| `z_tabla_pm` | 108.149 | 2021 → 2026-08-27 | 598 |
| `z_cosecha_cacao` | 12.559 | 2024 → 2026-08-27 | 60 |
| `z_riego` | 9.778 | 2023-11-27 → 2026-08-20 | 279 |
| `z_postharvest_*` (9 tablas) | 98 partidas, 251 fotos | 2024-08 → 2026-08-27 | 4 partidas |

Las 9 de postcosecha: `_weight`, `_lotsharvest`, `_predrying`, `_fermentation`,
`_sundrying`, `_machinedrying`, `_result`, `_fermentationquality`,
`_dryingquality`, `_photos`.

**Cero FK entre ellas.** `z_tabla_pm.KEY FK_TRABAJADOR (id)` indexa `id`, no
`trabajador`: nombre engañoso, índice inútil.

**Tres fechas malformadas en toda la base:** `z_tabla_pm` id 82273 con
`'20-02-2025'`, y dos de `z_cosecha_cacao` en formato US (`'01/30/2024'`,
`'03/13/2024'`). Nada más.

---

## Grupo 3 — Transaccionales NUEVAS (v4): 17 tablas, todo nuevo

Ninguna recicla estructura vieja. Diseño propio, `guid` como unicidad dura,
26 FK reales, `utf8mb4_spanish_ci`, columnas generadas.

**Campo**
- `reg_am` + `reg_am_personal` + `reg_am_modulo` — la programación AM pasa a ser
  cabecera + personas + módulos, en vez de una fila por persona.
- `reg_pm` + `reg_pm_modulo` — el avance de la tarde.
- `reg_cosecha` + `reg_cosecha_saco` — los 15 `sacoN` dejan de ser columnas.
- `reg_riego`.

**Postcosecha**
- `pc_proceso` — la partida. `peso_baba` es columna generada.
- `pc_proceso_cosecha` — **el enlace que el esquema viejo nunca tuvo**: qué
  cosechas entraron en qué partida.
- `pc_etapa` — las cinco tablas de etapa colapsadas en una.
- `pc_calidad_fermentacion` y `pc_calidad_secado` — son DOS cosas distintas y se
  quedan separadas. `humedad_promedio` es generada.
- `pc_foto`, `pc_lot_code_seq`.

**Servicio**
- `reg_flag` — banderas del servidor (fuera de ventana horaria, retroactivo).
- `mig_descarte` — auditoría de la migración.

Estado hoy en la base de Kevin: **creadas a mano, vacías**. En la copia de
prueba tienen la ventana de agosto migrada.

---

## Grupo 4 — Soporte y restos

- Autenticación: `users` 3, `groups` 3, `users_groups` 3, `login_attempts` 0,
  `ci_sessions`.
- Módulo de pagos: `tbl_pm_cost_groups` 6 y **seis tablas más, todas vacías**
  (`tbl_pm_payment_daily_adjustment`, `_paymenthistory`, `_weekly_deductions`,
  `_conversionrate`, `tbl_pm_cost_conversion_factors`). El módulo existe pero no
  se usa. Una de ellas tiene FK a `z_tabla_pm`.
- Backups viejos: `tbl_cacahoharvest_backup` 2.697, `tbl_pm_backuppm` 12.730.
- **23 vistas**, de las cuales 20 leen las transaccionales viejas: 8 de PM,
  2 de AM, 2 de cosecha, 7 de postcosecha.

---

## Qué contiene cada período (el selector de la web)

Con la ventana de agosto migrada, el reparto queda así:

| período | v3 (`z_*`) | v4 (`reg_*`/`pc_*`) |
|---|---|---|
| hasta 2026-07-31 | **todo** | nada |
| agosto 2026 | sí | sí — **el mismo dato, a propósito** |
| desde 2026-09-01 | lo que registre la otra finca | todo lo demás |

Agosto está duplicado a propósito: es el colchón para comparar durante el
arranque. Por eso el selector v3/v4 tiene sentido justo ahí.

**Consecuencia de diseño:** con el selector, **no hacen falta vistas `UNION`**.
Cada pantalla lee una fuente u otra según el período; nadie tiene que mezclar.
Lo que sí hace falta es que las pantallas de v4 tengan **sus propias vistas**
sobre `reg_*`/`pc_*` — no son las viejas con una palabra cambiada, porque la
forma cambió: AM es cabecera+hijos, cosecha tiene tabla de sacos, postcosecha
tiene el enlace con cosecha.

## Nota sobre colaciones (verificado, corrige lo que decían versiones previas)

- `utf8mb3_spanish2_ci` ∪ `utf8mb4_spanish_ci` → **funciona**, resuelve a
  `utf8mb4_spanish_ci`. El cambio de charset decide.
- `utf8mb3_spanish2_ci` ∪ `utf8mb3_general_ci` → **ERROR 1271**, mismo charset y
  distinta colación, no hay ganador. Le pasa a `z_tabla_am` con
  `z_cosecha_cacao`.
- La salida es `CONVERT(col USING utf8mb4)` en los dos lados.
- `col COLLATE utf8mb4_spanish_ci` sobre una columna utf8mb3 → **ERROR 1253**.
