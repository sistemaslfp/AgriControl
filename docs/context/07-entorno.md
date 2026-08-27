# 07 — Levantar el proyecto en local (Windows + Docker)

**Este repo es una app web PHP. No contiene código Android ni compila ningún
`.apk`.** La app móvil es un proyecto aparte que solo consume la API `V3`.

Stack elegido: Docker Compose con Apache + PHP 7.4 y **MariaDB 10.4**, contra
una copia local de la BD. Los archivos ya están en el repo (`docker/`, `docker-compose.yml`).

## Por qué PHP 7.4 y no 8.x

Grocery CRUD 1.x y CodeIgniter 3.1.11 usan constructores estilo PHP 4 y
`each()` en algunas rutas. En PHP 8 revientan con fatal error. No subas de
versión "para modernizar": ese cambio es un proyecto, no un ajuste.

## Por qué MariaDB 10.4 y no MySQL

El servidor real reporta `5.5.5-10.4.18-MariaDB` (visible en la cabecera del
dump). MariaDB y MySQL divergieron: importar un dump de MariaDB 10.4 en MySQL 8
falla o cambia el comportamiento silenciosamente. El contenedor local usa la
misma versión que producción.

## Por qué el servicio de BD se llama `mysql_dev_container`

`application/config/database.php` tiene ese hostname **hardcodeado**. Nombrando
así el servicio en Compose, Docker lo resuelve por DNS interno y el archivo de
config no se toca. Si lo renombras, tendrás que editar `database.php` y ese
cambio se te va a colar en un commit.

## Pasos

### 1. Requisitos
- Docker Desktop con backend WSL2.
- Git.
- El repo en una ruta **sin espacios ni acentos**.

### 2. Traer el esquema de la BD
Sigue `docs/db/README.md`. El directorio `docs/db/init/` se ejecuta en orden
alfabético dentro del contenedor:

| Archivo | Qué es | ¿Se versiona? |
|---|---|---|
| `00-definer-user.sql` | Crea el usuario `bellita`, DEFINER de las 22 vistas | Sí |
| `01-schema.sql` | Dump de Workbench (estructura + datos) | **No** — datos reales |
| `02-ci_sessions.sql` | Red de seguridad para la tabla de sesiones | Sí |

> Si arrancas sin el dump, Apache levanta pero **cualquier pantalla explota**
> al primer query. La BD no es opcional.

### 3. Arrancar
```bash
docker compose build
docker compose up -d
docker compose logs -f mysql_dev_container   # espera "ready for connections"
```

### 4. Dependencias de Composer
```bash
docker compose exec web bash -c "curl -sS https://getcomposer.org/installer | php && php composer.phar install"
```
> Composer aquí solo instala `phpdotenv`, que **el código nunca usa**
> (ver `99-riesgos.md`). Si el paso falla, la app igual funciona. No pierdas
> tiempo con esto.

### 5. Permisos de escritura
```bash
docker compose exec web chown -R www-data:www-data application/logs application/cache public/uploads
```

### 6. Abrir
`http://localhost:8080/` → debe redirigir a `auth/login`.

- Web: `http://localhost:8080/`
- API: `http://localhost:8080/v3/fincas`
- MySQL desde Workbench: `127.0.0.1:3307`, usuario `root`, password `root_password`

### 7. Usuario para entrar
El dump actual incluye datos de `users`, `groups` y `users_groups`, así que
sirven las credenciales reales del sistema. Ion Auth guarda hashes: no se puede
"inventar" una contraseña; si nadie recuerda una, hay que reescribir el hash.

## Diagnóstico rápido

| Síntoma | Causa casi siempre |
|---|---|
| 404 en toda URL menos la raíz | `mod_rewrite` o `AllowOverride All` — revisa `docker/php/vhost.conf` |
| Página en blanco | fatal de PHP → `docker compose logs web` y `application/logs/` |
| Redirect infinito en `auth/login` | falta la tabla `ci_sessions` |
| `ERROR 1449 ... definer does not exist` al abrir reportes | no corrió `00-definer-user.sql` (usuario `bellita`) |
| Errores raros al importar el dump | levantaste MySQL en vez de MariaDB 10.4 |
| `Unable to connect to your database server` | MySQL aún iniciando, o `MYSQL_ROOT_PASSWORD` ≠ `database.php` |
| CSS/JS rotos, rutas raras | `base_url` mal: verifica `APP_BASE_URL` en `docker-compose.yml` |
| Fatal `each()` / constructor | levantaste con PHP 8 en vez de 7.4 |
| Cambio en el código no se refleja | el bind mount `.:/var/www/html` se cayó → `docker compose restart web` |

## Reset total
```bash
docker compose down -v   # borra el volumen; los .sql de init se reejecutan
docker compose up -d
```

## Lo que NO configuran estos archivos

- **No tocan** `application/config/database.php` ni `config.php`. El único
  override es `application/config/development/config.php`, que solo actúa si
  existe la variable `APP_BASE_URL`.
- **No arreglan** ninguno de los puntos de seguridad de `99-riesgos.md`.
  `ENVIRONMENT` sigue en `development`, la API sigue sin auth y CSRF sigue
  apagado. Eso es decisión de producto, no de entorno.
