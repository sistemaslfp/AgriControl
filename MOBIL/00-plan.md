# 00 — Plan de la app móvil V4 (índice y estado)

Cerrado el 2026-08-28. Reemplaza a la app **LAgricontrol v2.0.5** (Ionic +
Capacitor, `io.ionic.starter`, sin repositorio disponible).

| Doc | Contenido |
|---|---|
| [01-sincronizacion.md](01-sincronizacion.md) | Offline-first, SQLite, cola, `guid`, definición del ACK, integridad de fechas, fotos, catálogos |
| [02-bd-y-api.md](02-bd-y-api.md) | Modelo de datos V4 sobre tablas nuevas, convivencia con V3, migración con data limpia, API, seguridad |
| [03-pantallas.md](03-pantallas.md) | Mapa de pantallas por módulo con correcciones |

## Decisiones cerradas

- **Proyecto Ionic + Angular nuevo.** Reescritura limpia, sin heredar código.
- **Tablas nuevas** (`reg_*`, `pc_*`) en la misma base. Las `z_*` se conservan
  intactas y sólo se renombran a `_v3` en el corte final. Los catálogos **no se
  duplican**.
- **Sin login**, alias de dispositivo configurable. **Sin edición** de registros
  en el teléfono.
- **ACK** = aparición del `guid` en `results` con `created` o `duplicate`. No es
  el HTTP 200. Automático, del servidor, por registro.
- **Ventana horaria AM/PM**: validación sólo local. El servidor no rechaza, deja
  flag. El criterio del usuario manda, pero queda medido.
- **Fechas**: retroactivo permitido con ventana por módulo y justificación
  escrita al excederla; **futuro rechazado siempre**. El reloj del teléfono sólo
  se usa corregido por el offset de `/v4/hora`.
- **`guid` = única unicidad dura.** La clave natural es índice de detección: el
  histórico tiene hasta 37 repeticiones de la misma combinación.
- **Fotos dentro del alcance**, se suben tras el ACK del registro padre.
- **`lot_code` `dddnnaa`** asignado por el servidor.
- **Swipe y flechas**, los dos, en los formularios paginados.
- **TLS obligatorio** y API key por dispositivo.

## Orden de construcción

1. **Esqueleto**: proyecto Ionic, SQLite, cola de sincronización, Configuración,
   catálogos, `/v4/hora` y `/v4/bootstrap`. Sin esto nada se puede probar.
2. **DDL** de las tablas nuevas en desarrollo + verificar que la web V3 no
   cambió en nada.
3. **AM y PM** — el 80% del uso diario.
4. **Pendientes / Enviados** con los tres estados reales.
5. **Cosecha de Cacao.**
6. **Postcosecha** — máquina de estados + fotos. El más caro.
7. **Riego** — al final, por decisión. Faltan capturas de pantalla para
   especificarlo.
8. **Migración** del histórico y **corte**.

## Pendientes

### Necesito respuesta

| # | Pendiente | Dónde |
|---|---|---|
| 1 | Las cinco ventanas de retroactividad (AM/PM 3 d, Cosecha 7 d, Riego 7 d, Postcosecha 30 d) | 01 §Integridad de fechas |
| 2 | ¿Se permite borrar un registro PENDIENTE nunca enviado? | 01 §Máquina de estados |
| 4 | ¿`lot_code` sin componente de finca es correcto? | 02 §3 |
| 5 | ¿Producción corre en Docker o en hosting PHP-CGI? Decide si `public/php.ini` se borra | 02 §8 |
| 6 | Vocabulario: ¿"Finca" o "Hacienda"? ¿"Responsable" o "Supervisor"? | 03 §Corrección transversal 2 |
| 7 | ¿Qué hace el botón `ADICIONAL` en Cosecha? | 03 §Cosecha |
| 8 | ¿Qué hace "Restricción de Finca" en Configuración? | 03 §Configuración |
| 9 | Capturas de pantalla del módulo Riego | 03 §Riego |

### Decidido

**#3 — Qué se migra (2026-08-28, Kevin).** Ventana de antecedente de **un mes:
desde `2026-08-01`**. En postcosecha, **sólo partidas cerradas**. La fusión
completa de `z_*` con `reg_*`/`pc_*` y la limpia de duplicados quedan
**diferidas sin fecha**.

**Convivencia con diferenciador (2026-08-31, Kevin).** Los reportes de la web
siguen en uso y leen las dos mitades unidas, con una columna `fuente`
('v3'/'v4') por fila. **Probado sobre una copia real de la base**: funciona,
cuesta +22 % en el conteo sin filtro y nada en las consultas filtradas. SQL en
`docs/db/migrations/2026-08-31-03-vistas-union.sql`, medición en
`02-bd-y-api.md` §5 bis. Son **20 vistas** las que hay que repuntar, no una.

**#11 — `lot_code` (2026-08-31, Kevin).** No hay etiquetas físicas. Se trabaja
como si el consecutivo hubiera arrancado en agosto. Cerrado.

**#10 — Partidas abiertas (2026-08-31, Kevin).** La v2.0.5 **no** va a convivir
con la app nueva; la web sigue como vista histórica de V3. Como la web sólo
permite VER postcosecha, una partida que quedara en `z_*` no la podría cerrar
nadie: se migran **las 4 partidas de la ventana, cerradas y en curso**. Cerrado.

**#12 — Nómina de agosto (2026-08-31, resuelto con datos).** No hace falta
decidir nada: `vw_reporte_pago` es `SELECT DISTINCT`, así que las 103 filas
duplicadas **nunca llegaron al pago**. El reporte devuelve 495 filas y
79.298,40 — exactamente lo mismo que la base migrada. La deduplicación no
cambia ni un centavo de lo ya pagado. Cerrado.

**Alcance (2026-08-31, Kevin).** Las **dos fincas** (Bellita y Pacaritambo)
pasan a v4, porque la web va a usar v4. El corte por fecha global es correcto;
no hace falta filtrar por finca. Los endpoints V3 y las tablas `z_*` siguen
activos: la web los usa como "Datos Históricos" y otra finca sigue en ese
sistema.

### Acciones técnicas antes de escribir código

- Correr la consulta de `variantes` / `rango_seg` sobre `z_tabla_pm` (02 §5) para
  saber si los duplicados son reintentos o tramos reales. Define la regla de
  migración.
- Sacar `.env` del control de versiones. Agregarlo a `.gitignore` **no
  lo destrackea**: hace falta `git rm --cached .env`. El repo tiene **un solo
  commit y ningún remoto**, así que un `git commit --amend` lo borra del
  historial por completo. No hizo falta rotar credenciales: nunca salió del disco.
- Cerrar `.htaccess` a todo lo que no sea `index.php` y `assets/`.

### Bloqueante conocido

El repositorio Android original no existe. Todo lo de aquí exige recompilar, lo
cual está resuelto por la reescritura — pero el APK v2.0.5 instalado sólo acepta
HTTP contra `localhost`, `192.168.0.5`, `192.168.0.16` y `192.168.2.67`
(`network_security_config.xml`). Para probar la app vieja contra el Docker local
sigue haciendo falta `adb reverse tcp:8080 tcp:8080`.

## Prompt de arranque

Mapa de la base (qué tabla usa v3, cuál v4, cuáles se comparten): `04-mapa-bd.md`.

`PROMPT-ARRANQUE.md` — texto listo para abrir la sesión de implementación del
paso 1.

## Hecho el 2026-08-28

- Movidos a `_to_delete/public-2026-08-28/`: `colmillo.php` (Adminer 4.8.1
  expuesto por HTTP), `info.php` (`phpinfo()`), `dole.php`, `error_log`.
