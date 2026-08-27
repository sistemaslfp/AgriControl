# CLAUDE.md — lagricontrol (LIFPRODECSA)

> Este archivo es el ÚNICO que se carga automáticamente en cada sesión.
> Todo lo demás vive en `docs/context/` y se lee **bajo demanda**.
> Regla de oro: si la respuesta está aquí, **no leas más archivos**.

## Qué es esto

App web de control agrícola (cacao/banano) para fincas: registro de labores de
campo, asistencia, riego, cosecha, postcosecha y **cálculo de pago semanal a
trabajadores**. Backend monolítico PHP + API REST consumida por una app móvil.

## Stack (verificado)

| Pieza | Valor |
|---|---|
| Framework | CodeIgniter **3.1.11** (MVC clásico, `system/` intacto) |
| PHP | Estilo PHP 7.x, sin tipado estricto |
| DB | **MariaDB 10.4.18** (no MySQL) — schema `lfp_prodapp`, driver `mysqli`, 41 tablas + 22 vistas |
| Auth web | **Ion Auth** (`application/third_party/ion_auth`) |
| CRUD/UI | **Grocery CRUD** (tema `tablestrap4`) — genera el 80% de las pantallas |
| API REST | `chriskacerguis/codeigniter-restserver` (`REST_Controller`) |
| Env | ⚠️ `vlucas/phpdotenv` está en `composer.json` pero **nunca se inicializa**: nada lee `.env`. La config real está hardcodeada en `application/config/*.php` |
| Entrada | `public/index.php` (`ENVIRONMENT` hardcodeado a `development`) |
| Sesiones | driver `database` → **requiere tabla `ci_sessions`** |
| Servidor | Apache con `mod_rewrite` (hay `.htaccess` en `public/`) |

## Reglas duras

1. **Nunca edites** `system/`, `vendor/`, `application/vendor/`,
   `application/third_party/`. Son librerías de terceros.
2. **No inventes columnas ni tablas.** El schema SQL no está en el repo. Si
   necesitas un campo, búscalo primero en `docs/context/02-datos.md`; si no
   está, dilo y pide el DDL en lugar de asumir.
3. **No refactorices a CI4, Composer PSR-4, ni PHP 8** salvo pedido explícito.
   Es CI3 legacy y funciona.
4. Todo controlador de UI extiende `Public_Controller` (login obligatorio).
   Los de API extienden `REST_Controller` (sin auth, ver riesgos).
5. Textos de interfaz en **español**. Nombres de tabla/columna en español.
   Código nuevo: nombres en inglés solo si el archivo vecino ya lo hace.

## Mapa mental en 10 líneas

```
public/index.php
  └─ application/core/MY_Controller.php   → login + template admin/index
       ├─ Public_Controller               → todos los controladores web
       └─ Auth_Controller                 → ACL por rol/nivel (poco usado)
application/controllers/*.php             → 1 archivo = 1 pantalla Grocery CRUD
application/controllers/V1|V2|V3.php      → API móvil (V3 = vigente)
application/controllers/Operations/PM/    → módulo de PAGOS (lógica real, no CRUD)
application/models/*_model.php            → queries (Query Builder de CI)
application/views/Crud/*.php              → wrappers de salida de Grocery CRUD
application/views/themes/admin/index.php  → layout maestro
```

## Índice de contexto — lee solo lo que aplique

| Si el prompt trata de… | Lee |
|---|---|
| arquitectura, flujo de request, layout, temas | `docs/context/01-arquitectura.md` |
| tablas, vistas SQL, entidades, relaciones | `docs/context/02-datos.md` |
| endpoints móviles, V1/V2/V3, payloads | `docs/context/03-api.md` |
| cómo escribir un controlador/CRUD nuevo | `docs/context/04-convenciones.md` |
| "¿dónde está X?" / archivo por responsabilidad | `docs/context/05-mapa.md` |
| AM, PM, finca, lote, módulo, ulabor, tarifa | `docs/context/06-glosario.md` |
| levantar el proyecto, Docker, errores de arranque | `docs/context/07-entorno.md` |
| deuda técnica, riesgos, decisiones | `docs/context/99-riesgos.md` |

## Comandos

```bash
docker compose up -d             # levanta Apache+PHP 7.4 (:8080) y MySQL (:3307)
docker compose logs -f web       # errores de PHP
docker compose down -v           # reset total, reimporta docs/db/init/*.sql
docker compose exec web php -l ruta/al/archivo.php   # lint antes de dar por buena una edición
```
Detalle completo y diagnóstico: `docs/context/07-entorno.md`.
**No hay build ni bundler. Es PHP plano; editar = recargar el navegador.**
**Este repo no compila ningún `.apk`**: la app Android es otro proyecto.

## Gotchas que cuestan tiempo

- Grocery CRUD **exige** que la tabla tenga PK; para vistas SQL se fuerza con
  `$crud->set_primary_key('col')` (ver `AM.php`).
- Los permisos se resuelven a mano con `$this->ion_auth->get_users_groups()->row()->id`
  comparando `1` (admin) y `2` (supervisor). No hay capa de ACL unificada.
- Hay **acentos mal codificados** en comentarios de varios controladores
  (mojibake). No los "arregles" masivamente: ensucia el diff.
- **La API vigente es `application/controllers/V3.php`** (decisión del equipo,
  2026-08-21). `V1.php`, `V2.php` y `API/V3.php` son copias legacy: no las
  edites, no las borres todavía.
- **Nada carga `.env`.** Si necesitas una variable de entorno, hoy no existe el
  mecanismo: o lo bootstrapeas en `public/index.php`, o editas los config.
- `sess_driver = 'database'`: sin la tabla `ci_sessions` el login falla en seco.
