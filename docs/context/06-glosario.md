# 06 — Glosario de dominio

| Término | Significado |
|---|---|
| **Finca** | Unidad productiva mayor (`z_finca`: nombre, ha). |
| **Lote** | Subdivisión de una finca (`z_lote`). |
| **Módulo** | Subdivisión de un lote (`z_modulo`). Un registro puede llevar varios (multiselect). |
| **Cultivo** | Cacao, banano, etc. (`z_cultivo`). |
| **Tarea / Subtarea** | Catálogo de trabajo agrícola. La subtarea es lo que se registra en campo (`z_tarea`, `z_subtarea`). |
| **Ulabor (unidad de labor)** | Unidad de medida de la labor: jornal, hora, planta, saco… (`z_ulabor`). |
| **Tarifa** | Precio por unidad de labor; se historiza en `z_tarifas_historia`. |
| **AM** | Registro **matutino / de asignación**: fecha, hora, finca, supervisor, cultivo, lote, módulos, operario, subtarea. Es el "quién va a hacer qué hoy". Se cierra con `close_am`. |
| **PM** | Registro **vespertino / de producción**: lo efectivamente hecho — cantidad, unidad de labor, tarifa, total. Es la base del pago. |
| **Eventual / temporary worker** | Trabajador no fijo; tiene reportes propios (`vw_pm_temporaryworkers*`). |
| **Ajuste (adjustment)** | Bono o descuento aplicado al pago semanal de un trabajador. |
| **Deducción** | Descuento recurrente/manual sobre el pago (`saveDeductions`, `updateDeductions`). |
| **Postcosecha** | Cadena de proceso del cacao: peso → prosecado → fermentación → secado (sol o máquina) → resultados → calidad. |

> ⚠️ La expansión literal de **AM** y **PM** (¿*ante meridiem* / *post meridiem*?
> ¿*Asignación* / *Producción*?) es **inferencia**, no está escrita en el código.
> Confírmalo con el equipo antes de usarla en documentación externa.
