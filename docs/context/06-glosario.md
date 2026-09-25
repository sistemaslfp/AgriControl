# 06 — Glosario de dominio

| Término | Significado |
|---|---|
| **Finca / Hacienda** | Unidad productiva mayor (`z_finca`). Hoy dos: Bellita (id 1) y Pacaritambo. En la interfaz se dice "hacienda". |
| **Lote** | Subdivisión de una finca (`z_lote`). `tiene_modulos` indica si tiene módulos activos. |
| **Módulo** | Subdivisión de un lote (`z_modulo`). Los nombres se repiten entre lotes (cada lote tiene su "1"). Un registro lleva varios: `lfp_am.modulos` es un CSV de ids. |
| **Cultivo** | `z_cultivo` (cacao). |
| **Tarea / Subtarea** | Catálogo de trabajo. La subtarea es lo que se registra (`z_subtarea`), con su tarifa y unidad. |
| **Ulabor (unidad de labor)** | Unidad del avance: Jornal, Ha, Libra, Kg, Metro, Planta… (`z_ulabor`). **Libra (4)** manda la subtarea a Cosecha. |
| **Tipo de pago** | Area Ejecutada / Jornal / Avance de Labor. Informativo: no entra en el cálculo. |
| **Tarifa** | Precio por unidad (`z_subtarea.tarifa`). **Pago = cantidad × tarifa.** |
| **AM** | La tarea de la mañana: quién hace qué subtarea, en qué lote y módulos. Una fila de `lfp_am` por persona. |
| **PM** | El **cierre** de un AM: cantidad (avance), hora, comentario y quién cierra. No es una tabla: son las columnas `cierre_*` de la misma fila. **No se puede crear un PM sin AM.** |
| **Abierta / cerrada** | Una tarea AM está abierta si `cierre_guid IS NULL`. |
| **Cosecha** | Cierre de un AM de subtarea en Libra: se cargan los sacos y la suma de libras es la `cantidad` (el pago). `lfp_cosecha` + `lfp_cosecha_saco`. |
| **Riego** | **Bitácora** del agua (lote, módulo, minutos, volumen) en `lfp_riego`. No cierra nada: el jornal del regador se paga por AM/PM. Se dice "registro", no "parte". |
| **Postcosecha / partida** | Proceso de una o más cosechas juntas (`pc_proceso`, con `lot_code` que asigna el servidor): peso → presecado → fermentado → secado al sol / a máquina → resultado, más calidad y fotos. |
| **Responsable / supervisor** | Personal que firma el AM o el cierre (`responsable_id`, `responsable_cierre_id`). |
| **Vigente** | `z_personal.eregistro = 'A'`. `estado` es el **tipo de contrato** (Afiliado, Eventual, Contratista…), no la vigencia. |
| **Eventual** | Trabajador no fijo (`z_personal.estado = 3`). |
| **Ajuste** | Bono o descuento sobre el pago semanal de una persona en una tarea cerrada. |
| **Deducción** | Descuento semanal por trabajador (`tbl_pm_payment_weekly_deductions`). |
| **guid** | Id único que genera la app por registro; hace idempotente el envío. `captura_guid` agrupa las personas de un mismo formulario. |
| **Retroactivo** | Registro con fecha pasada, permitido dentro de `retroactividad_dias` con justificación (`justificacion_retro`). Fecha futura: siempre rechazada. |
| **Flag** | Rechazo, duplicado o error de `/v4/sync` guardado en `lfp_flag`. |
| **Semana** | Semana ISO (`WEEK(fecha,3)`), no se guarda: se deriva. |

> ⚠️ La expansión literal de **AM** y **PM** (*ante/post meridiem* o
> *asignación/producción*) sigue sin confirmar; en la práctica son la mañana
> (programación) y la tarde (cierre).
