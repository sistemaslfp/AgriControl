# Actualización y despliegue en producción (XAMPP)

> Estado del proceso antes de este documento: **no existe**. `docs/context/99-riesgos.md`
> lo deja anotado como pregunta sin responder ("¿Cómo se despliega hoy? No hay
> Dockerfile, compose, CI ni script de deploy"). Lo que sigue es un procedimiento
> propuesto a partir de lo que el código y `docs/context/*` sí confirman, más lo
> que se sabe del entorno real: XAMPP con Apache, la base de datos y el código
> **en la misma máquina**. Donde falta un dato de esa máquina puntual, queda
> marcado `[Confirmar]` en vez de inventado.
>
> Esto es un entorno distinto al de `docs/context/07-entorno.md` (Docker con
> `mysql_dev_container`, pensado para desarrollo local). No mezclar los dos: la
> config de un entorno no sirve para el otro (ver sección 3).

## 1. Por qué esto importa antes de tocar código

`application/config/database.php` trae credenciales **hardcodeadas**, y el
`.env` de la raíz está versionado pero el código nunca lo lee (`phpdotenv` no
se inicializa en ningún punto — `docs/context/99-riesgos.md`, deuda técnica #3).
Eso significa que **una actualización de código que sobreescriba
`database.php` con la versión del repositorio puede apuntar la app a la base
equivocada o dejarla sin conectar**, sin ningún aviso previo. Este es el riesgo
central de cualquier "copiar y pegar" de archivos sobre XAMPP, y la razón de
la sección 3.

## 2. Antes de actualizar — respaldo

No saltarse ningún punto, incluso para cambios chicos:

1. **Base de datos.** Exportar el schema completo `lfp_prodapp` antes de tocar
   nada:
   ```bash
   mysqldump -u root -p lfp_prodapp > respaldo_lfp_prodapp_YYYYMMDD.sql
   ```
   (usuario y contraseña son los reales de esa instalación de XAMPP, no los del
   Docker de desarrollo — ver sección 3). Alternativa sin línea de comandos:
   phpMyAdmin → seleccionar `lfp_prodapp` → **Exportar** → método rápido, SQL.
   Guardar el archivo fuera de la carpeta del proyecto.

2. **Código actual.** Copiar la carpeta completa que sirve Apache
   (normalmente algo como `C:\xampp\htdocs\LifprodecsaAgricontrol`) a una
   carpeta con fecha, por ejemplo `..._respaldo_YYYYMMDD`. No se sobreescribe
   el respaldo hasta confirmar que la actualización funciona.

3. **Anotar qué se está reemplazando.** Si la carpeta activa es un repo git,
   guardar el commit actual (`git log -1`). Si no lo es, alcanza con la fecha
   del respaldo del punto 2 — pero entonces cualquier vuelta atrás depende
   sólo de esa copia.

4. Confirmar espacio en disco libre para el respaldo de base de datos: el
   dump de estructura y datos de `lfp_prodapp` puede pesar varias decenas de
   MB (el dump de referencia en `docs/db/init/01-schema.sql` pesa ~25 MB).

## 3. Qué copiar y qué no tocar al actualizar

### 3.1 Qué SÍ se copia — el código de la mejora

Lo que normalmente trae una actualización de este proyecto (features nuevas,
correcciones, ajustes de pantallas) son cambios dentro de `application/`. En
el caso típico, esto es lo que se copia de la carpeta nueva a la carpeta
activa:

| Carpeta / archivo | Contenido |
|---|---|
| `application/controllers/*.php` | Pantallas Grocery CRUD, módulos de `Operations/PM/`, controladores de la API (`V1/V2/V3.php`) |
| `application/models/*.php` | Queries (Query Builder de CI) |
| `application/views/**` | Wrappers de Grocery CRUD (`views/Crud/`) y el layout (`views/themes/admin/`) |
| `application/core/*.php` | `MY_Controller.php`, `Public_Controller`, `Auth_Controller`, si cambiaron |
| `application/helpers/*.php` | Helpers propios |
| `application/hooks/*.php` | Si el proyecto usa hooks de CI |
| `application/libraries/*.php` | Librerías propias (no confundir con `application/third_party/`, que es de terceros) |
| `application/language/*.php` | Si cambió texto de interfaz |
| `application/config/*.php` **excepto** `database.php` | El resto de la config (rutas, autoload, `ion_auth.php`, etc.) normalmente sí se actualiza — sólo `database.php` queda fuera por tener las credenciales reales (sección 3.2) |
| `public/assets/**` propio del proyecto | CSS/JS/imágenes de la app (no lo que viene empaquetado con Grocery CRUD, salvo que se esté actualizando esa librería — ver abajo) |

**Casos raros — sólo si la actualización lo dice explícitamente**, porque
`CLAUDE.md` los marca como "nunca editar" salvo pedido explícito:

- `system/` — sólo si se decide subir de versión CodeIgniter (no es el caso
  normal; regla dura #3 de `CLAUDE.md`).
- `vendor/`, `application/vendor/`, `application/third_party/` — sólo si se
  está actualizando una librería de terceros puntual (Grocery CRUD, Ion Auth).
  Si no es ese el cambio, esta carpeta **no se toca**.
- `public/index.php` — sólo si cambió lógica del punto de entrada en sí (no la
  línea de `ENVIRONMENT`, que es local — sección 3.2). Si sólo cambia esa
  línea entre versiones del repo, no se copia: se ajusta a mano.
- `composer.json` / `composer.lock` — sólo si se agregó o cambió una
  dependencia real. Hoy Composer sólo instala `phpdotenv`, que el código nunca
  usa (`docs/context/07-entorno.md`), así que en la práctica este archivo casi
  nunca necesita tocarse en producción.

**Cómo saber exactamente qué archivos trae la actualización**, ya que hoy no
hay script de deploy ni tabla de versiones: si la carpeta activa es un repo
git, comparar contra el commit anotado en el paso 3 de la sección 2
(`git diff --name-only <commit-anterior> <commit-nuevo>`) da la lista exacta.
Si no es un repo git, la única forma confiable es comparar carpeta contra
carpeta (por fecha de modificación o por checksum) antes de copiar a ciegas.

### 3.2 Qué NO se debe pisar

Esta es la otra mitad: aunque la tabla de arriba diga "sí se copia", los
siguientes archivos y carpetas son **locales a esta máquina** y deben
preservarse o revisarse a mano después de copiar, nunca reemplazarse en
bloque por la versión del paquete de actualización:

| Archivo / carpeta | Por qué no se pisa |
|---|---|
| `application/config/database.php` | Tiene host, usuario y contraseña reales de esta máquina. La versión de desarrollo apunta a `mysql_dev_container` / `root` / `root_password` (Docker) — si esa versión llega a producción, la app deja de conectar a la base real. |
| `public/index.php` | La línea de `ENVIRONMENT` está hardcodeada (hoy en `development` en el repo, según `docs/context/99-riesgos.md` #6). Si en esta máquina ya se cambió a mano a `production`, una copia ciega la revierte y vuelve a exponer errores y stack traces completos al público. **[Confirmar]** si en esta instalación ya está en `production`. |
| `application/config/config.php` (o el archivo donde viva `base_url`) | El `base_url` conocido apunta a una IP fija de LAN (`docs/context/99-riesgos.md` #10). Si esta máquina usa otra IP o puerto, hay que confirmarlo antes de copiar la versión del repo encima. |
| `application/logs/` | Logs de CodeIgniter ya generados. No se reemplazan ni se borran. |
| `application/cache/` | Cache generado en esta máquina. |
| `public/uploads/` | Archivos subidos por los usuarios (fotos de postcosecha, etc.). Es contenido, no código: **nunca se sobreescribe ni se borra**. |
| `.env` | Está versionado pero es decorativo (nadie lo lee). No hace daño copiarlo, pero tampoco resuelve nada si se edita — no confundirlo con la fuente real de configuración, que es `database.php`. |

**Recomendación práctica:** en vez de copiar la carpeta del paquete de
actualización encima de la carpeta activa, copiar el paquete nuevo aparte y
traer archivo por archivo (o carpeta por carpeta de `application/controllers`,
`application/models`, etc.) excluyendo explícitamente la tabla de arriba. Hoy
no hay script que automatice esto — es manual hasta que se decida armar uno.

**Nunca tocar** (regla ya fijada en `CLAUDE.md`): `system/`, `vendor/`,
`application/vendor/`, `application/third_party/`.

## 4. Migraciones de base de datos

- **Dónde viven:** `docs/db/migrations/*.sql`, en orden numérico
  (`01-catalogos.sql`, `02-tablas-v4.sql`, `03-migracion-historico.sql`,
  `04-vistas-v4.sql`, `05-ajustes-pago-v4.sql`). Los archivos intermedios ya
  superados están en `docs/db/migrations/_historico/` como referencia — **no
  se vuelven a correr**, la carpeta existe para explicar cómo se llegó al
  estado actual, no como pasos pendientes.
- **No hay herramienta de control de versiones de esquema** (no hay Phinx ni
  equivalente): este repo no lleva registro automático de qué migración ya
  corrió contra qué base. Hasta que exista, anotar a mano en este documento
  (o en un archivo aparte tipo `CHANGELOG-db.md`) fecha y archivo cada vez que
  se corre una migración contra la base real.
- **Cliente recomendado: MySQL Workbench.** Dos comportamientos de Workbench
  que rompen migraciones si no se conocen:
  - No acepta bloques `DELIMITER` + `BEGIN ... END` / `BEGIN NOT ATOMIC`: el
    parser los rechaza antes de mandar nada al servidor. Las migraciones de
    este repo ya evitan ese patrón a propósito.
  - Abre cada sesión con `SQL_SAFE_UPDATES = 1`: un `UPDATE` sin `WHERE` sobre
    una columna clave devuelve error 1175. Si una migración nueva necesita un
    `UPDATE` amplio, agregar un `WHERE` que no filtre nada (ej. `WHERE id > 0`)
    en vez de desactivar la opción.
- **Antes de correr cualquier migración contra la base real:** respaldo
  (sección 2), sin excepción. Si el cambio es grande, probarlo antes contra
  una copia restaurada del respaldo, no contra la base en vivo.
- **Orden de dependencia:** si se va a reconstruir la base desde cero para
  probar, primero `docs/db/init/01-schema.sql`, después
  `docs/db/init/00-definer-user.sql` (o el equivalente para el usuario
  `DEFINER` de las vistas), y recién ahí las migraciones en orden. Correr las
  migraciones sobre un dump que ya trae tablas intermedias sin limpiar puede
  fallar en silencio — si eso pasa, revisar si hace falta un paso de limpieza
  antes (ver `docs/db/migrations/_historico/00-limpiar-intermedias.sql` como
  referencia de qué tipo de limpieza puede hacer falta).
- **Regla del proyecto:** una migración ya aplicada en producción no se borra
  ni se reescribe. Si aparece un error en datos ya migrados, se documenta (en
  este archivo o en la base misma) y se corrige hacia adelante, no
  reescribiendo el histórico.

## 5. Procedimiento de actualización, paso a paso

1. Respaldo de base de datos y de código (sección 2).
2. Si la actualización va a tardar o toca tablas en uso, avisar a quien esté
   usando el sistema (no hay ventana de mantenimiento automatizada hoy).
3. Copiar el código nuevo, **excluyendo** los archivos de la sección 3.
4. Revisar a mano `application/config/database.php`, el `ENVIRONMENT` de
   `public/index.php` y el `base_url` — confirmar que siguen apuntando a los
   valores reales de esta máquina después de la copia.
5. Si la actualización incluye cambios de base de datos, correr las
   migraciones pendientes (sección 4), una por una, verificando cada una
   antes de seguir con la próxima.
6. Reiniciar Apache y MySQL desde XAMPP (sección 6).
7. Verificar:
   - Abrir la URL base del sitio y confirmar que redirige a `auth/login`.
   - Iniciar sesión con un usuario real.
   - Probar al menos un endpoint de la API vigente (`.../v3/...` o `.../v4/...`
     según lo que esté activo).
   - Revisar `application/logs/` (logs de CodeIgniter) y el log de errores de
     Apache de XAMPP buscando algo nuevo desde el reinicio.
8. Si algo falla y no se resuelve rápido, seguir el rollback (sección 7) en
   vez de seguir probando en vivo.

## 6. Comandos y atajos de XAMPP

Asumiendo instalación por defecto en `C:\xampp` **[Confirmar ruta real en esta
máquina]**:

| Acción | Cómo |
|---|---|
| Abrir el panel de control | `C:\xampp\xampp-control.exe` |
| Iniciar/detener Apache | Panel de XAMPP → botón **Start**/**Stop** junto a Apache; o `C:\xampp\apache\bin\httpd.exe -k start` / `-k stop` / `-k restart` |
| Iniciar/detener MySQL/MariaDB | Panel de XAMPP → botón **Start**/**Stop** junto a MySQL |
| Probar la config de Apache antes de reiniciar | `C:\xampp\apache\bin\httpd.exe -t` (avisa errores de sintaxis en `httpd.conf` o los vhosts sin llegar a tumbar el servicio) |
| Log de errores de Apache | `C:\xampp\apache\logs\error.log` |
| Log de acceso de Apache | `C:\xampp\apache\logs\access.log` |
| Log de errores de MySQL/MariaDB | `C:\xampp\mysql\data\<nombre-de-la-máquina>.err` |
| Logs propios de la aplicación | `application/logs/` dentro del proyecto |
| Administrar la base sin línea de comandos | `http://localhost/phpmyadmin` (el puerto puede no ser el 80 — ver nota abajo) |
| Si Apache/MySQL corren como servicio de Windows en vez de por el panel | `net stop <nombre-servicio>` / `net start <nombre-servicio>` — confirmar el nombre exacto en `services.msc` |

**[Confirmar]** — `docs/context/99-riesgos.md` registra que el `base_url` de
esta app apunta a `http://192.168.100.81:6080/...`, es decir Apache **no**
necesariamente escucha en el puerto 80 por defecto en esta instalación. Antes
de usar los comandos de arriba tal cual, confirmar contra la máquina real:
puerto de Apache, puerto de MySQL (¿3306 estándar o reasignado, como en el
Docker de desarrollo que usa 3307?) y si XAMPP está en `C:\xampp` o en otra
ruta.

## 7. Rollback

1. Detener Apache (sección 6).
2. Restaurar la carpeta de código desde el respaldo de la sección 2 (reemplazo
   completo, no selectivo).
3. Restaurar la base de datos si la actualización llegó a modificarla:
   ```bash
   mysql -u root -p lfp_prodapp < respaldo_lfp_prodapp_YYYYMMDD.sql
   ```
   Esto sobreescribe todo lo que se haya cargado en la base después del
   respaldo — si hay datos nuevos que valga la pena conservar (registros de
   campo cargados durante la ventana de la actualización), exportarlos antes
   de restaurar.
4. Reiniciar Apache y MySQL.
5. Repetir la verificación del paso 7 de la sección 5 contra la versión
   restaurada.

## 8. Lo que este documento todavía no puede afirmar

Preguntas abiertas que hay que cerrar con Kevin para que este procedimiento
deje de tener huecos marcados `[Confirmar]`:

- Ruta real de instalación de XAMPP y puertos de Apache/MySQL en la máquina
  de producción.
- Si `ENVIRONMENT` en `public/index.php` ya está en `production` en esta
  instalación o sigue en `development` (afecta si los errores se muestran al
  público).
- Si `application/config/database.php` de esta máquina ya está fuera del
  control de versiones (para que una actualización de código nunca lo toque)
  o si hoy se edita a mano cada vez.
- Si existe algún respaldo automatizado de la base de datos, o si todo
  respaldo es manual como se asume en este documento.
- Qué migraciones de `docs/db/migrations/` ya corrieron contra esta base real
  y cuáles siguen pendientes.
