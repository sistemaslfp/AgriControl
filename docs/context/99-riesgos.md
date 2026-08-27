# 99 — Riesgos, deuda técnica y decisiones

Lee esto antes de proponer cambios "obvios".

## Decisiones tomadas (2026-08-21)

- ✅ **La API vigente es `application/controllers/V3.php`.** `V1`, `V2` y
  `API/V3` quedan congelados: no editar, no borrar hasta verificar que ninguna
  build de la app móvil apunta a sus URLs.
- ✅ **No existe el DDL en el repo**, pero sí acceso completo a la BD por
  MySQL Workbench. Acción pendiente: volcar el esquema a `docs/db/schema.sql`
  (comando en `02-datos.md`). Hasta entonces, **no se asumen columnas**.
- ✅ **Este repo NO contiene la app Android.** Es solo web + API. El `.apk` vive
  en otro proyecto que consume `V3`.

## Seguridad (accionable, prioridad alta)

1. **`.env` está versionado** y `.gitignore` solo ignora `application/logs/*`.
2. **`application/config/database.php` tiene credenciales hardcodeadas**
   (`root` / `root_password` / host `mysql_dev_container`). El `.env` existe
   pero **nadie lo lee** (ver punto 3 de deuda técnica).
3. **API sin autenticación**: `rest_auth = false`, sin API keys, sin whitelist.
   Cualquiera con la URL escribe registros AM/PM.
4. **`csrf_protection = FALSE`** en `config.php`.
5. **`encryption_key` es débil y está en el repo** (`'Rm1mJUnou5'`, 10 chars).
6. **`ENVIRONMENT` está hardcodeado a `'development'`** en `public/index.php`
   (línea 57), con la línea que lee `$_SERVER['CI_ENV']` comentada arriba.
   En producción esto expone errores y stack traces completos.
7. **`public/info.php`** — casi seguro un `phpinfo()` expuesto. También hay
   `public/php.ini`, `public/error_log`, `public/colmillo.php`, `public/dole.php`
   colgando del directorio público. Revisar qué son.
8. `.htaccess` de `public/` fija `Access-Control-Allow-Origin: "*"` para assets.

> Ninguno de estos se arregla por iniciativa propia: tocar credenciales, CSRF o
> `ENVIRONMENT` rompe despliegues. Repórtalos y espera decisión.

## Deuda técnica

1. **Cuádruple duplicación de la API** (V1/V2/V3/API/V3), ~41 métodos idénticos.
2. `Reportepago.php` define la clase `Proyectos` — archivo muerto o mal renombrado.
3. **`phpdotenv` instalado pero nunca inicializado.** No hay `require` del
   autoload de Composer ni `Dotenv::createImmutable()` en ningún lado. El `.env`
   de la raíz es decorativo.
4. `PmPaymentDailyAdjustment.php` declara `class PmPaymentDailyAdjusment`
   (falta la `t`): CI **no** lo resuelve por ruteo normal.
5. `Cosechacacao_model` define `createFromAPI` **dos veces**.
6. `Prueba.php` / `Prueba_model.php` / `views/prueba/` son código de práctica.
7. Mojibake (`M&oacute;dulos`, `c��digo`) en comentarios y strings.
8. Sin tests propios (PHPUnit está en `application/vendor`, sin suite).
9. Lógica de permisos repetida (`$group != 1 && $group != 2`) en ~15 archivos,
   pese a que `Auth_Controller` ya ofrece `require_group()` / `require_min_level()`.
10. `config['base_url']` apunta a una IP de LAN concreta:
    `http://192.168.100.81:6080/LifprodecsaAgricontrol/public`.

## Sin confirmar — pregunta antes de asumir

- [ ] ¿Qué significan literalmente **AM** y **PM** en el negocio?
- [ ] ¿Grupos de Ion Auth más allá de `1` (admin) y `2` (supervisor)?
- [ ] ¿Cómo se despliega hoy? No hay Dockerfile, compose, CI ni script de deploy,
      pero el hostname `mysql_dev_container` delata un stack Docker perdido.
- [ ] ¿`z_tabla_pm` se escribe solo por API o también desde el CRUD web?
- [ ] ¿Dónde vive el repo de la app Android que consume `V3`?

## Mantenimiento de estos documentos

Generados leyendo el código el **2026-08-21**. Si un `.md` contradice al código,
**el código gana** — y se actualiza el `.md` en el mismo commit.
