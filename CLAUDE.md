# CLAUDE.md — lagricontrol (LIFPRODECSA)

> Este archivo es el ÚNICO que se carga automáticamente en cada sesión.
> Todo lo demás vive en `docs/context/` y se lee **bajo demanda**.
> Regla de oro: si la respuesta está aquí, **no leas más archivos**.

## Qué es esto

App web de control agrícola (cacao) para dos haciendas (Bellita y Pacaritambo):
registro de labores de campo (AM/PM), cosecha, riego, postcosecha y **cálculo
de pago semanal a trabajadores**. Backend monolítico PHP + API REST consumida
por la app móvil V4 (`MOBIL/app-v4`, Ionic/Angular, offline-first).

**Estado a 2026-09-25:** la web y la app leen y escriben el modelo **V4**
(tablas `lfp_*` y `pc_*`, vistas `vw_lfp_*`). Todo el histórico v3 ya está
migrado a esas tablas. Las `z_*` transaccionales quedan como respaldo congelado;
las `z_*` de catálogo siguen vivas y compartidas.

## Stack (verificado)

| Pieza | Valor |
|---|---|
| Framework | CodeIgniter **3.1.11** (MVC clásico, `system/` intacto) |
| PHP | **7.3** — misma versión que producción (XAMPP, PHP 7.3.27). Docker también en 7.3 |
| DB | **MariaDB 10.4.18** (no MySQL) — schema `lfp_prodapp`, driver `mysqli` |
| Auth web | **Ion Auth** + `application/helpers/acceso_helper.php` (rol y hacienda) |
| CRUD/UI | **Grocery CRUD 1.6.1** (temas `tablestrap4` y `tablestrap4_datefilter`) |
| API REST | `chriskacerguis/codeigniter-restserver` (`RestController`) |
| Env | Nada lee `.env` (`phpdotenv` instalado, nunca inicializado). Config hardcodeada en `application/config/*.php` |
| Entrada | `public/index.php` (`ENVIRONMENT` hardcodeado a `development`) |
| Sesiones | driver `database` → **requiere tabla `ci_sessions`** |

## Reglas duras

1. **Nunca edites** `system/`, `vendor/`, `application/vendor/`,
   `application/third_party/`. Son librerías de terceros.
2. **No inventes columnas ni tablas.** El DDL de V4 está en
   `docs/db/migrations/0*.sql`; el de v3 en `docs/db/init/01-schema.sql`
   (no versionado). Si un campo no aparece ahí, pregunta.
3. **No agregues columnas a catálogos compartidos** (`z_*`) si el problema se
   resuelve con pantallas, filtros o variables existentes.
4. **No refactorices a CI4, PSR-4 ni PHP 8.** Producción corre PHP 7.3.
5. La web **solo lee/escribe V4** (`lfp_*`, `pc_*`, `vw_lfp_*`) más catálogos
   `z_*`. No vuelvas a apuntar una pantalla a `z_tabla_pm`, `z_tabla_am`,
   `z_riego`, `z_cosecha_cacao` ni `z_postharvest_*`.
6. Todo controlador web extiende `Public_Controller` y usa `acceso_*` para
   permisos y hacienda. Los de API extienden `RestController` (sin auth).
7. Textos de interfaz en **español neutro**. Tablas/columnas en español.

## Mapa mental

```
public/index.php
  └─ core/MY_Controller.php          → login + helpers acceso/alertas + template
       └─ Public_Controller          → todos los controladores web
controllers/*.php                    → pantallas (Grocery CRUD sobre lfp_*/vw_lfp_*)
controllers/Operations/PM/           → ajustes de pago (lógica real, no CRUD)
controllers/V4.php                   → API móvil VIGENTE (+ copia idéntica API/V4.php)
controllers/V1|V2|V3.php             → API legacy congelada (escribe z_*)
config/v4.php                        → ventanas, retroactividad, ruteo de cosecha
helpers/acceso_helper.php            → roles, hacienda, filtros forzados
helpers/alertas_helper.php           → errores visibles en Grocery CRUD
docs/db/migrations/01..06            → esquema V4, en orden
MOBIL/                               → app móvil V4 y su documentación
```

## Índice de contexto — lee solo lo que aplique

| Si el prompt trata de… | Lee |
|---|---|
| arquitectura, flujo de request, layout, permisos | `docs/context/01-arquitectura.md` |
| tablas, vistas, migraciones, relaciones | `docs/context/02-datos.md` |
| endpoints móviles, V4, `/v4/sync`, V3 legacy | `docs/context/03-api.md` |
| cómo escribir un controlador/CRUD nuevo | `docs/context/04-convenciones.md` |
| "¿dónde está X?" / archivo por responsabilidad | `docs/context/05-mapa.md` |
| AM, PM, cierre, partida, hacienda, ulabor, tarifa | `docs/context/06-glosario.md` |
| levantar el proyecto, Docker, errores de arranque | `docs/context/07-entorno.md` |
| deuda técnica, riesgos, decisiones | `docs/context/99-riesgos.md` |
| despliegue en producción (XAMPP) | `docs/deploy/actualizacion-produccion.md` |
| app móvil, sincronización, pantallas de la app | `MOBIL/00-plan.md` y siguientes |

## Comandos

```bash
docker compose up -d             # Apache+PHP 7.3 (:8080) y MariaDB 10.4 (:3307)
docker compose logs -f web       # errores de PHP
docker compose down -v           # reset total, reimporta docs/db/init/*.sql
docker compose exec web php -l ruta/al/archivo.php   # lint antes de dar por buena una edición
```
Después de un reset hay que correr `docs/db/migrations/01..06` a mano
(el init solo carga el dump v3). Detalle: `docs/context/07-entorno.md`.
**No hay build en la web. Es PHP plano; editar = recargar el navegador.**
La app móvil (`MOBIL/app-v4`) sí se compila; tiene su propia documentación.

## Gotchas que cuestan tiempo

- Grocery CRUD **exige** PK; para vistas se fuerza con `set_primary_key()`.
  **Una vista con JOIN es de solo lectura**: una pantalla que edita debe apuntar
  a la tabla `lfp_*`/`pc_*`, no a la `vw_lfp_*`.
- Permisos y hacienda: grupos 1 Admin global, 2 Supervisor, 3 Operador
  (lectura), 4 Admin hacienda; `users.finca_id` NULL = todas. En un CRUD nuevo
  usar `acceso_exigir()` y `acceso_crud()`/`acceso_crud_finca()`;
  **ocultar el selector no filtra nada**.
- Un `callback_before_*` que devuelve `false` muestra un error genérico: usa
  `alerta_validar()` / `alerta_crud_error()` para que el usuario vea el motivo.
- `$autoload['libraries']` está vacío: un controlador que usa `$this->db` debe
  cargar la base (`$this->load->database()`).
- mysqli devuelve **todo como string**: castear antes de mandar JSON.
- Semana ISO: `WEEK(fecha,3)` / `format('o')`, nunca `year()`+`week()` modo 0.
- **Cosecha vs PM se decide por unidad**: subtareas con `unidad_labor_id = 4`
  (Libra) se cierran en Cosecha; todo lo demás en PM (`config/v4.php`).
- Hay **mojibake** en comentarios viejos. No lo "arregles" masivamente.
- `sess_driver = 'database'`: sin la tabla `ci_sessions` el login falla en seco.
