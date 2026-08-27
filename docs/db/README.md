# Base de datos local

## 1. Exportar el esquema desde el servidor

MySQL Workbench → **Server ▸ Data Export**
- Marca el schema `lfp_prodapp`
- *Dump Structure Only* (o *Structure and Data* si quieres datos de prueba)
- ✅ Include Create Schema, ✅ Dump Stored Procedures and Functions,
  ✅ Dump Events, ✅ Dump Triggers  ← **las vistas `vw_*` viajan aquí**
- *Export to Self-Contained File* → guarda como `docs/db/init/01-schema.sql`

Equivalente por consola:

```bash
mysqldump -h HOST -u USUARIO -p --no-data --routines --triggers \
          --databases lfp_prodapp > docs/db/init/01-schema.sql
```

## 2. Tabla de sesiones — ya resuelto

`config.php` usa `sess_driver = 'database'`; sin la tabla `ci_sessions` el login
falla sin mensaje claro.

**No hay nada que hacer:** el archivo `02-ci_sessions.sql` ya está en este
directorio y se ejecuta solo. Usa `CREATE TABLE IF NOT EXISTS`, así que si el
dump del servidor ya trae la tabla, la sentencia se ignora sin error.

Este archivo **sí** se versiona (es DDL, no datos); el `.gitignore` excluye
`01-schema.sql` y cualquier otro dump por la excepción explícita.

## 3. Ojo con MariaDB

El servidor es **MariaDB 10.4.18**, no MySQL. El `docker-compose.yml` usa
`mariadb:10.4` por eso. No cambies la imagen a `mysql:8` "porque es más nuevo".

El dump trae 41 tablas, 22 vistas y datos. Las vistas tienen
`DEFINER=\`bellita\`@\`%\``; por eso existe `00-definer-user.sql`.

## 4. Reglas

- Los `.sql` de `init/` se ejecutan **solo la primera vez** que se crea el
  volumen `mysql_data`. Para reimportar: `docker compose down -v && docker compose up -d`.
- Los archivos van en orden alfabético: `01-`, `02-`, …
- **`docs/db/init/*.sql` está en `.gitignore`**: puede contener datos reales de
  producción. No lo subas al repositorio.
