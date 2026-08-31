# Continuar el trabajo — estado al 2026-08-31

Texto para abrir una sesión nueva. Lee esto primero, después
`00-plan.md`, y sólo entonces el documento del tema que toque.

---

## Dónde estamos

La app móvil vieja (v2.0.5) se reescribe desde cero en Ionic + Angular. El
repositorio Android original no existe. En paralelo, la base gana un juego de
tablas nuevas y una API V4; **nada de lo viejo se apaga**.

- **Paso 1 — HECHO.** Esqueleto de la app: Angular 22 zoneless + Ionic 9 +
  Capacitor 8, SQLite local, cola de sincronización con backoff, catálogos,
  pantallas Menú y Configuración. `MOBIL/app-v4/`.
- **Paso 2 — HECHO.** Las 17 tablas `reg_*` / `pc_*`, con 26 FK.
  `docs/db/migrations/2026-08-28-02-tablas-v4.sql`. Kevin las creó **a mano**.
- **Migración de la ventana de agosto — HECHA y verificada.**
  `docs/db/migrations/2026-08-31-05-migracion-agosto.sql`.
- **Paso 3 — la mitad del servidor HECHA.** `POST /v4/sync` implementado para
  `am` y `pm`, probado con curl contra una copia real de la base.
- **Paso 3 — la mitad de la app, PENDIENTE.** Es lo siguiente.

## Lo siguiente, en orden

1. **Pantallas AM y PM en la app** (`MOBIL/app-v4/`), contra el endpoint que ya
   responde. La pantalla AM **debe bloquear el avance si no hay al menos una
   persona asociada** — el servidor lo rechaza y el usuario tiene que enterarse
   antes de guardar, no después de sincronizar.
2. **Levantar el contenedor en PHP 8.1** y validar lo que el ensayo no cubrió
   (lista en `docker/php/Dockerfile`): guardado real desde Grocery CRUD, campos
   de archivo, login POST de ion_auth, y `Operations/PM`.
3. Después: Pendientes/Enviados, Cosecha, Postcosecha, Riego, y el corte.

## Las decisiones cerradas que no hay que volver a discutir

- **Se migró sólo desde `2026-08-01`**, ambas fincas. El histórico se queda en
  `z_*`. La fusión completa está **diferida sin fecha**.
- **Las tablas `z_*` y los endpoints V3 quedan activos hasta nuevo aviso**: la
  web los usa como "Datos Históricos" y otra finca sigue trabajando con ese
  sistema. **No proponer renombrarlos a `_v3` ni apagar V3.**
- **La web resuelve v3/v4 con un selector por período**: hasta 2026-07-31 sólo
  v3; agosto los dos (duplicado a propósito, es el colchón de comparación);
  desde 2026-09-01 sólo v4. Con eso **no hacen falta vistas UNION**.
- **Sólo se reciclan los catálogos.** Ninguna tabla transaccional se reutiliza.
- **La app v2.0.5 no convive con la nueva.** Por eso se migraron también las
  partidas de postcosecha abiertas.
- **V3 no se arregla.** Lo único futuro, por confirmar, es borrar las filas
  repetidas que generó la app móvil (pendiente #Limpieza).
- **PHP 8.1** (decisión del 2026-08-31).
- App nueva: **v0.1.1**, autoría **Life Food Products**.

## Las trampas que ya costaron tiempo

- **Desde PHP 8.1 mysqli LANZA excepciones** en vez de devolver `FALSE`, y CI3
  no lo sabe: su chequeo de `db_debug` no llega a correr y la excepción mata el
  request. V4 lo maneja con `try/catch`; **V3 y la web no**.
- **`db_debug` viene TRUE fuera de producción**: una violación de FK imprime una
  página de error y mata el request.
- **Zoneless**: sin zone.js, todo estado que la vista muestre tiene que ser un
  `signal`. Un campo plano mutado desde un callback async no repinta **y no
  lanza error**.
- **mysqli devuelve TODO como string.** En JavaScript `"0"` es *truthy*. Al
  agregar cualquier consulta a V4, castear con `castRows`.
- **La base no se carga sola** en este proyecto: `$autoload['libraries']` está
  vacío. V4 usa `requireDb()` perezoso, a propósito.
- **CORS vive en `application/config/rest.php`**, no en el controlador.
- **`pm_year` va con `format('o')`, no con `format('Y')`.** V3 usa `'Y'` y por
  eso 181 filas de diciembre de 2025 quedaron en `(2025, semana 1)`.
- El `tar` sobre el mount de Windows se pasa de los 45 s de `device_bash` y deja
  archivos truncados. **Usar `git archive`.**

## Cómo verificar de verdad

Nada se da por bueno con `php -l` y el SQL validado aparte. Para servidor:
levantar CodeIgniter en el contenedor y pegarle con `curl`. Para base: importar
`docs/db/init/01-schema.sql` (dump con datos, ignorado por git) en MariaDB en el
contenedor. Las dos recetas están en la memoria del proyecto.

## Mapa de documentos

| documento | para qué |
|---|---|
| `00-plan.md` | índice, orden de construcción, pendientes abiertos y decididos |
| `01-sincronizacion.md` | cola, ACK, invariantes I1..I5, máquina de estados |
| `02-bd-y-api.md` | tablas nuevas, migración, contrato de la API, seguridad |
| `03-pantallas.md` | las pantallas, una por una |
| `04-mapa-bd.md` | qué hay en la base hoy y quién usa cada tabla |
| `PROMPT-ARRANQUE.md` | el prompt con el que se abrió el paso 1 |
