# Continuar el trabajo — estado al 2026-09-02

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
- **Paso 3 — HECHO, las dos mitades.** `POST /v4/sync` para `am` y `pm`, y las
  **pantallas AM y PM** en la app (`/am`, `/pm`, habilitadas desde el menú).
- **El PM CIERRA un AM (2026-09-01).** Ya no crea tareas: lista las
  asignaciones AM abiertas de la fecha y solo carga el avance. Columna nueva
  `reg_pm.am_personal_id` + `GET /v4/am_abiertos`. Probado con `curl` contra la
  base real ya migrada.
- **Verificación:** `e2e/am-pm.spec.mjs` 59 comprobaciones y
  `e2e/cola.spec.mjs` 22, **todas en verde**; y 8 casos de `sync_pm` con `curl`
  contra la copia real de la base, con cero filas fantasma.

## Lo siguiente, en orden

1. **Correr en el servidor de verdad las dos migraciones nuevas:**
   `2026-09-01-01-pm-cierra-am.sql` y `2026-09-02-01-modulos-clave-natural.sql`.
   Las dos están probadas contra una copia, ninguna aplicada en producción.
2. **Pendientes / Enviados** con los tres estados reales (PENDIENTE, ENVIANDO,
   RECHAZADO con el motivo a la vista). Hoy el menú manda a un aviso.
3. **Campo propio para la justificación del registro retroactivo.** Hoy viaja
   metida dentro de `comentario` con prefijo `[RETROACTIVO]`, recortada a 255:
   el motivo queda mezclado con texto libre y no se puede consultar aparte.
4. **Levantar el contenedor en PHP 8.1** y validar lo que el ensayo no cubrió
   (lista en `docker/php/Dockerfile`): guardado real desde Grocery CRUD, campos
   de archivo, login POST de ion_auth, y `Operations/PM`.
5. Después: Cosecha, Postcosecha, Riego, y el corte.

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
- **Vocabulario: "Finca" y "Responsable"**, en toda la app. Coinciden con la
  base. "Hacienda" y "Supervisor" no se usan más.
- **El PM no crea nada: cierra una tarea AM.** Lote, subtarea, cultivo, finca
  y hora de inicio los deriva el servidor del AM; el teléfono manda `am_guid`,
  trabajador, avance, hora de cierre y quién cerró. Se descartó fundir el PM
  dentro de `reg_am_personal` porque la cola es solo-inserción.
- **Responsable = `z_personal.rol = 8`.** Son 6 y son exactamente los 6 que
  figuran en los AM de agosto.
- **Cascada Cultivo → Tarea → Subtarea**, y los **códigos no se muestran**.
- Los selectores son **ventanas flotantes** con el alto exacto de su contenido,
  que cierran tocando fuera; el buscador aparece solo con más de 10 opciones.
- **Lotes**: primero los numéricos por valor, después los de nombre; y a un
  lote con nombre no se le antepone "Lote". `Módulos` va justo debajo de `Lote`.
- **Tareas y subtareas se filtran por finca** (`z_subtarea.id_finca`): 78 en
  Bellita, 21 en Pacaritambo. `z_tarea` no tiene finca; el corte sale desde la
  subtarea hacia arriba.
- **Configuración tiene Finca y Cultivo por defecto**, que quedan pre-elegidos
  en AM y PM. Cierra el pendiente #8 ("Restricción de Finca") por reemplazo.
- **Los módulos siguen en tabla hija y no en una columna con comas.** Se
  discutió el 2026-09-02 y se sostuvo con datos: 3.119 filas de `z_tabla_am`
  (2,75 %) apuntan a módulos borrados y 16 a un módulo de otro lote — un
  VARCHAR no puede impedir ninguna de las dos. El costo sí se atendió: sin `id`
  autoincremental, la pareja es PRIMARY KEY y la tabla ocupa 40 % menos.
- En pantalla no se dice "retroactivo": dice **"Estoy cargando un día
  anterior"**.
- **Una tarea = un guid = una fila.** El ACK es por registro: un AM de tres
  tareas puede terminar con dos `created` y una `rejected`. Ninguna pantalla
  promete atomicidad.
- **AM sin personal: no se guarda.** Bloqueo en la app, además del rechazo del
  servidor.
- **"Una persona, una tarea AM a la vez": bloqueo duro dentro del formulario,
  aviso confirmable entre formularios.** No es tibieza: en agosto hubo 9
  reasignaciones legítimas que un bloqueo duro habría impedido. Ver la
  medición en `00-plan.md`.

## Las trampas que ya costaron tiempo

- **Desde PHP 8.1 mysqli LANZA excepciones** en vez de devolver `FALSE`, y CI3
  no lo sabe: su chequeo de `db_debug` no llega a correr y la excepción mata el
  request. V4 lo maneja con `try/catch`; **V3 y la web no**.
- **`db_debug` viene TRUE fuera de producción**: una violación de FK imprime una
  página de error y mata el request.
- **Zoneless**: sin zone.js, todo estado que la vista muestre tiene que ser un
  `signal`. Un campo plano mutado desde un callback async no repinta **y no
  lanza error**. Por eso los formularios usan `(ionInput)` a un signal y no
  `ngModel`.
- **mysqli devuelve TODO como string.** En JavaScript `"0"` es *truthy*. Al
  agregar cualquier consulta a V4, castear con `castRows`. En la app, lo mismo
  con `tiene_modulos`: se compara contra `1`, no se usa como booleano.
- **La base no se carga sola** en este proyecto: `$autoload['libraries']` está
  vacío. V4 usa `requireDb()` perezoso, a propósito.
- **CORS vive en `application/config/rest.php`**, no en el controlador.
- **`pm_year` va con `format('o')`, no con `format('Y')`.** V3 usa `'Y'` y por
  eso 181 filas de diciembre de 2025 quedaron en `(2025, semana 1)`. La app
  **no** manda `pm_year`/`pm_week`: los calcula el servidor.
- **Toda fecha que sale de la app lleva offset.** `sync_fecha()` hace
  `new DateTime($valor)`, y una cadena sin offset se interpreta en la zona del
  SERVIDOR: con el teléfono en otra zona, la hora de proceso se corre sin que
  nadie lo note.
- **A un componente dentro de un `ion-modal` hay que ponerle `ion-page` a
  mano**: Ionic no se la pone y el `ion-content` se derrumba, dejando media
  ventana en blanco. Y `--height: auto` no es alternativa: colapsa el layout y
  el modal se come los toques.
- **`ion-button` se come el `aria-label`** en su shadow DOM, y el `isDisabled()`
  de Playwright no entiende un `ion-button` deshabilitado (hay que leer
  `aria-disabled`). Las dos cosas hacen pasar pruebas en falso. Detalle en
  `app-v4/e2e/README.md`, junto con las trampas del `ion-backdrop` y del modal
  con `--height: auto`.
- **Los nombres de columna de los catálogos están mezclados**: `z_subtarea` usa
  `nombre_subtarea` y `z_ulabor` usa `ulabor_nombre`, pero `z_cultivo` usa
  `nombre`. Un JOIN escrito "de memoria" muere con *Unknown column*.
- **Toda consulta nueva de V4 necesita `try/catch` y apagar `db_debug`.** Sin
  eso, desde PHP 8.1 la excepción de mysqli sube hasta `RestController` y el
  endpoint responde una traza HTML de CI3 **con HTTP 200**, indistinguible de
  una respuesta buena para la app.
- **`git commit` se cuelga sobre el mount de Windows** refrescando el índice, y
  además git no puede borrar sus `.git/index.lock` / `HEAD.lock`, que dejan el
  repo trabado. Se commitea con plumbing: `git write-tree`, `git commit-tree`,
  `git update-ref`.
- El `tar` sobre el mount de Windows se pasa de los 45 s de `device_bash` y deja
  archivos truncados. **Usar `git archive`.**
- **`ng build` no entra en los 45 s de `device_bash`, y nada queda corriendo en
  segundo plano entre llamadas.** Compilar y correr e2e exige un entorno con
  procesos largos: empaquetar `src/ e2e/ public/ *.json` (unos 110 KB), hacer
  `npm ci` y trabajar ahí.

## Cómo verificar de verdad

Nada se da por bueno con `php -l` y el SQL validado aparte. Para servidor:
levantar CodeIgniter en el contenedor y pegarle con `curl`. Para base: importar
`docs/db/init/01-schema.sql` (dump con datos, ignorado por git) en MariaDB en el
contenedor. Para la app: `ng build -c development`, servir `www/`, levantar
`e2e/mock-v4.mjs` y correr las dos suites de `app-v4/e2e/`. Las recetas están en
la memoria del proyecto.

Receta completa que ya se corrió entera y funciona: instalar MariaDB, importar
`01-schema.sql` (crea la base `lfp_prodapp`, no `lagricontrol`), aplicar las
tres migraciones, extraer CI3 con `git archive`, y `php -S` con un `router.php`
que haga **`chdir` a `public/`** — sin eso CI3 muere con "Your system folder
path does not appear to be set correctly". Poner `ENVIRONMENT` en `production`
para que las respuestas sean JSON limpio: en `development`, CI 3.1.11 bajo PHP
8.2+ escupe deprecations antes del JSON y rompe hasta el código de estado.

## Mapa de documentos

| documento | para qué |
|---|---|
| `00-plan.md` | índice, orden de construcción, pendientes abiertos y decididos |
| `01-sincronizacion.md` | cola, ACK, invariantes I1..I5, máquina de estados |
| `02-bd-y-api.md` | tablas nuevas, migración, contrato de la API, seguridad |
| `03-pantallas.md` | las pantallas, una por una |
| `04-mapa-bd.md` | qué hay en la base hoy y quién usa cada tabla |
| `app-v4/e2e/README.md` | cómo correr las dos suites y las trampas de Ionic |
| `PROMPT-ARRANQUE.md` | el prompt con el que se abrió el paso 1 |
