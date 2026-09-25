# 07 — Levantar el proyecto en local (Windows + Docker)

Este repo contiene la **web + API** y, en `MOBIL/app-v4`, la app móvil V4
(Ionic/Angular), que se compila aparte. Esta guía es solo para la web.
Para producción (XAMPP) ver `docs/deploy/actualizacion-produccion.md`.

Stack: Docker Compose con Apache + **PHP 7.3** y **MariaDB 10.4**, contra una
copia local de la BD (`docker-compose.yml`, `docker/php/`).

## Por qué PHP 7.3

Producción corre **PHP 7.3.27 en XAMPP** (decisión del 2026-09-15: desarrollar
en la misma versión). La imagen `php:7.3-apache` es 7.3.33, mismo comportamiento.

- CI 3.1.11 y Grocery CRUD 1.6.1 **sí arrancan en PHP 8.x** (probado en 8.4),
  pero en 8.1 la sesión de CI emite `E_DEPRECATED` que rompen el login. Si algún
  día se sube producción a 8.x, el arreglo es actualizar `system/` a CI 3.1.13,
  no callar los avisos. Ver comentario en `docker/php/Dockerfile`.
- `opcache` está activado en el contenedor: el bind mount de Windows hace lento
  cada `include`.

## Por qué MariaDB 10.4 y no MySQL

El servidor reporta `5.5.5-10.4.18-MariaDB`. Importar ese dump en MySQL 8
falla o cambia el comportamiento en silencio. El contenedor usa la misma versión.

## Por qué el servicio de BD se llama `mysql_dev_container`

`application/config/database.php` tiene ese hostname **hardcodeado**. Si lo
renombras, tendrás que editar `database.php` y el cambio se cuela en un commit.

## Pasos

### 1. Requisitos
- Docker Desktop con backend WSL2, Git.
- El repo en una ruta **sin espacios ni acentos**.

### 2. Traer la BD
`docs/db/init/` se monta en `/docker-entrypoint-initdb.d` y se ejecuta en orden
alfabético **solo la primera vez** que se crea el volumen:

| Archivo | Qué es | ¿Se versiona? |
|---|---|---|
| `00-definer-user.sql` | Crea el usuario `bellita`, DEFINER de las vistas v3 | Sí |
| `01-schema.sql` | Dump de producción (estructura + datos, **solo v3**) | **No** — datos reales |
| `02-ci_sessions.sql` | Red de seguridad para la tabla de sesiones | Sí |

### 3. Arrancar
```bash
docker compose build
docker compose up -d
docker compose logs -f mysql_dev_container   # espera "ready for connections"
```

### 4. Aplicar el esquema V4 (obligatorio)
El dump no trae `lfp_*` ni `pc_*`: sin esto **todas las pantallas de
registros fallan**. Correr en orden, desde Workbench (`127.0.0.1:3307`) o:
```bash
for f in docs/db/migrations/0*.sql; do
  docker compose exec -T mysql_dev_container mysql -uroot -proot_password lfp_prodapp < "$f"
done
```
`01` → `06`. `_historico/` **no** se corre. `03` migra todo el histórico y
tarda.

### 5. Permisos de escritura
```bash
docker compose exec web chown -R www-data:www-data application/logs application/cache public/uploads
```

### 6. Abrir
- Web: `http://localhost:8080/` → redirige a `auth/login`
  (desde otra máquina de la red, la IP del host; HTTP plano, sin TLS).
- API: `http://localhost:8080/v4/hora`
- BD desde Workbench: `127.0.0.1:3307`, `root` / `root_password`.

### 7. Usuario para entrar
El dump trae `users`, `groups` y `users_groups` reales. Ion Auth guarda
hashes: si nadie recuerda una contraseña, hay que reescribir el hash. Tras la
migración 06, el usuario necesita `finca_id` correcto para ver su hacienda.

## Diagnóstico rápido

| Síntoma | Causa casi siempre |
|---|---|
| 404 en toda URL menos la raíz | `mod_rewrite` o `AllowOverride All` — revisa `docker/php/vhost.conf` |
| Página en blanco | fatal de PHP → `docker compose logs web` y `application/logs/` |
| Redirect infinito en `auth/login` | falta la tabla `ci_sessions` |
| `Table 'lfp_prodapp.lfp_am' doesn't exist` / `vw_lfp_*` | no corriste las migraciones del paso 4 |
| `ERROR 1449 ... definer does not exist` | no corrió `00-definer-user.sql` (usuario `bellita`) |
| Errores raros al importar el dump | levantaste MySQL en vez de MariaDB 10.4 |
| `Unable to connect to your database server` | MariaDB aún iniciando, o `MYSQL_ROOT_PASSWORD` ≠ `database.php` |
| CSS/JS rotos, rutas raras | `base_url` mal: revisa `APP_BASE_URL` en `docker-compose.yml` |
| Login roto con avisos `Deprecated` | el contenedor quedó en PHP 8.x: reconstruye con `docker compose build` |
| Un usuario no ve datos | su `users.finca_id` apunta a otra hacienda, o su grupo es 3 (solo lectura) |
| Cambio en el código no se refleja | bind mount caído → `docker compose restart web` |

## Reset total
```bash
docker compose down -v   # borra el volumen; los .sql de init se reejecutan
docker compose up -d     # y luego el paso 4 otra vez
```

## Lo que NO configuran estos archivos

- **No tocan** `database.php` ni `config.php`. El único override es
  `application/config/development/config.php`, que actúa solo si existe
  `APP_BASE_URL` (fija `base_url` y baja el log a nivel 1).
- **No arreglan** los puntos de seguridad de `99-riesgos.md`.
