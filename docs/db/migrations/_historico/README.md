# Migraciones retiradas — historia, no camino

**Nada de esta carpeta se corre.** Está acá porque hay una base de desarrollo
que sí pasó por estos estados, y borrar los archivos dejaría un esquema que
nadie puede reproducir ni reconciliar.

## Por qué se retiraron

Producción **nunca tuvo ninguna tabla `reg_*` ni `pc_*`**: sigue corriendo V3
con la app v2.0.5 (confirmado por Kevin el 2026-09-02). Todo lo de V4 pasó sólo
por la base de desarrollo.

Tres de estos archivos existen únicamente para convertir un estado intermedio
en el final. Los tres estados intermedios se crearon y se deshicieron dentro de
la misma semana de desarrollo, mientras se discutía el modelo de datos. Hacer
que producción pase por ellos —crear `reg_pm` un martes para borrarla un
jueves— no aporta nada y deja una cadena de seis archivos donde alcanzan
cuatro.

La regla "una migración aplicada no se borra" **sigue valiendo**, y por eso
estos archivos no se borraron: se aplica a lo aplicado, que en producción es
nada y en desarrollo es todo esto.

## Qué hacía cada uno

| archivo | de qué estado a qué estado |
|---|---|
| `2026-08-28-01-catalogos-v4.sql` | agrega `estado` a `z_finca`/`z_ulabor` y `tiene_modulos` a `z_lote`. **Vive en `../01-catalogos.sql`**, corregido: este tenía un `where l.id>0;` suelto DESPUÉS del `;` que hacía abortar el archivo con ERROR 1064 |
| `2026-08-28-02-tablas-v4.sql` | crea 17 tablas: `reg_am` como cabecera + `reg_am_personal` + `reg_am_modulo`, y `reg_pm` + `reg_pm_modulo` aparte. **Vive en `../02-tablas-v4.sql`** con 13 tablas y `reg_am` en su forma final |
| `2026-08-31-03-vistas-union.sql` | dos vistas UNION v3+v4 (`vw_pm_compat`, `vw_reporte_pm_u`) como prueba de concepto de las 20 que habría que repuntar. **Retirada, ver abajo** |
| `2026-08-31-05-migracion-agosto.sql` | carga la ventana desde 2026-08-01 en el esquema de 17 tablas. **Vive en `../03-migracion-agosto.sql`**, cargando `reg_am` directo en su forma final |
| `2026-09-01-01-pm-cierra-am.sql` | agrega `reg_pm.am_personal_id` UNIQUE para que un PM cierre una asignación AM en vez de crear una tarea |
| `2026-09-02-01-modulos-clave-natural.sql` | quita el `id` autoincremental de `reg_am_modulo` / `reg_pm_modulo` y vuelve PRIMARY KEY la pareja (−40 % de tamaño) |
| `2026-09-03-01-fusion-pm-en-am.sql` | aplana todo en una sola `reg_am`: una fila = una persona, con el cierre adentro. Crea `vw_reg_reporte_pago`, que **vive en `../04-vistas-v4.sql`** |

Los tres últimos son puro estado intermedio: `2026-09-03-01` hace `DROP TABLE`
de las cuatro tablas que los otros dos ajustan.

## Por qué se descartaron las vistas UNION

No fue sólo "probablemente sobran". Tres razones, en orden de peso:

1. **La web resuelve v3/v4 con un selector por período** (hasta 2026-07-31 sólo
   v3; agosto los dos; desde 2026-09-01 sólo v4). Con el selector cada pantalla
   lee una fuente y nadie mezcla.
2. **Estas dos vistas hoy están rotas**: leen `reg_pm` y `reg_pm_modulo`, que
   ya no existen. Conservarlas no era gratis, exigía reescribirlas.
3. **Agosto está duplicado a propósito** —el mismo dato en `z_*` y en `reg_am`,
   como colchón de comparación— así que una UNION sin el `WHERE fecha < @CORTE`
   cuenta cada fila dos veces. El propio archivo lo advierte en su cabecera.

Y una cuarta que vale para cualquier diseño futuro: **toda vista con `UNION` es
de sólo lectura** (`UPDATE` → ERROR 1288). Si la web va a escribir en v4, los
formularios tienen que apuntar a las tablas, no a una vista.

Lo que sí queda vivo del archivo es la **medición**, que costó tiempo obtener:
la unión funciona y cuesta **+22 % en un `COUNT(*)` sin filtro** (1.418 →
1.734 ms sobre 108.149 filas); filtrada por mes no se degrada (74–212 ms). Y
las dos trampas de colación: `z.columna COLLATE utf8mb4_spanish_ci` sobre una
columna utf8mb3 da **ERROR 1253** —hay que `CONVERT(... USING utf8mb4)`
primero— mientras que el `UNION` por sí solo no falla, porque MariaDB resuelve
la colación del resultado.

## Cómo volver a cero en desarrollo

`00-limpiar-intermedias.sql` borra las tablas `reg_*`/`pc_*` en cualquiera de
sus formas y deja la base lista para las cuatro migraciones consolidadas. No
toca ninguna tabla `z_*`.

```bash
mariadb lfp_prodapp < docs/db/migrations/_historico/00-limpiar-intermedias.sql
for f in 01-catalogos 02-tablas-v4 03-migracion-agosto 04-vistas-v4; do
  mariadb lfp_prodapp < "docs/db/migrations/$f.sql"
done
```

## La trampa del dump

`docs/db/init/01-schema.sql` **no está limpio**: trae las 17 tablas v4 en su
forma vieja, vacías. `CREATE TABLE IF NOT EXISTS` las acepta en silencio, así
que `../02-tablas-v4.sql` parecería correr bien y dejaría un `reg_am` sin
`personal_id` ni `cierre_*`. Por eso ese archivo abre con un guardián que
**aborta con un mensaje legible** en vez de dejar pasar el error.
