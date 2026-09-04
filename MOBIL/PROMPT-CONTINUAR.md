# Continuar el trabajo — estado al 2026-09-02

Leé esto primero. Después `00-plan.md` para las decisiones cerradas, y sólo
entonces el documento del tema que toque.

---

## Dónde estamos

La app móvil vieja (v2.0.5) se reescribe desde cero en Ionic + Angular. El
repositorio Android original no existe. En paralelo, la base gana un juego de
tablas nuevas y una API V4. **Nada de lo viejo se apaga**, y **producción sigue
corriendo V3 con la app vieja**: ninguna migración de V4 está aplicada allá.

- **Paso 1 — HECHO.** Esqueleto de la app: Angular 22 zoneless + Ionic 9 +
  Capacitor 8, SQLite local, cola de sincronización con backoff, catálogos,
  pantallas Menú y Configuración. `MOBIL/app-v4/`.
- **Paso 2 — HECHO.** Las 13 tablas `reg_*` / `pc_*` con sus FK.
  `docs/db/migrations/02-tablas-v4.sql`.
- **Paso 4 — HECHO (2026-09-02).** Pantalla `/registros`: Pendientes | Enviados
  en una sola pantalla, agrupada por trabajo, con los tres estados
  diferenciados, el motivo del rechazo a la vista, sincronización manual y
  descarte de pendientes con asiento en `sync_audit`. Cierra el pendiente #2.
- **Paso 3 — HECHO, las dos mitades.** `POST /v4/sync` para `am` y `pm`, y las
  **pantallas AM y PM** en la app (`/am`, `/pm`, habilitadas desde el menú).
  El 2026-09-02 la lista del PM pasó a **agruparse por tarea**, con ventana
  flotante para elegir el personal (55 filas → 29 tarjetas en agosto).
- **Paso 5 — HECHO (2026-09-03), las dos mitades.** **Cosecha CIERRA una tarea
  AM, como el PM**: no crea tareas y no elige trabajador. `tipo: cosecha` en
  `POST /v4/sync` cuelga `reg_cosecha` (+ sacos) del AM y escribe
  `reg_am.cantidad` con la suma de las libras; la pantalla `/cosecha` lista las
  tareas AM de cosecha abiertas y solo pesa los sacos de cada persona.
- **El PM ya no muestra ni cierra cosecha ni poscosecha** (2026-09-03).
  `GET /v4/am_abiertos` acepta `&modulo=pm|cosecha` y `sync_pm` rechaza una
  tarea de cosecha con un motivo legible. **Poscosecha queda sin quién la cierre
  hasta el paso 6**: son 38 AM en agosto, unidad Jornal.
- **Migración de la ventana de agosto — HECHA y verificada.**
  `docs/db/migrations/03-migracion-agosto.sql`.
- **Migraciones consolidadas — HECHO (2026-09-02).** De seis archivos a cuatro
  (`01-catalogos`, `02-tablas-v4`, `03-migracion-agosto`, `04-vistas-v4`). Las
  viejas están en `_historico/` con un README que explica de qué estado a qué
  estado llevaba cada una.

### Lo verificado, contra la copia real de la base

- Partiendo del dump y corriendo sólo `01..04`: **550 filas, 495 cerradas, 55
  abiertas, 21 deducidas, 367 capturas**.
- **`vw_reg_reporte_pago` de agosto: 495 filas, 79.298,40 de cantidad y
  15.091,66 de total** — idéntico a `vw_reporte_pago` desde `z_tabla_pm`. **Ése
  es el criterio de aceptación de cualquier cambio de migración.**
- Las cuatro migraciones son **idempotentes y reproducibles**: la 2ª corrida no
  inserta nada y los 550 guid son los mismos.
- Diff fila por fila contra el resultado de la cadena vieja de seis archivos:
  550 de 550 emparejan, 20 columnas idénticas.
- Nueve casos de `POST /v4/sync` con `curl` contra la base real, cero filas
  fantasma, incluido el que prueba que cerrar a la segunda persona de una
  captura no pisa a la primera.
- e2e: **66 comprobaciones** en `app-v4/e2e/am-pm.spec.mjs`, **22** en
  `cola.spec.mjs` y **31** en `registros.spec.mjs`, todas en verde con la app
  compilada y estables en dos corridas seguidas.
- Los motivos de rechazo de `V4.php`, probados con **curl contra la base real**:
  las suites e2e corren contra el mock y NO los cubren.
- **Cosecha, las dos puntas**: 23 comprobaciones e2e en `cosecha.spec.mjs` (el
  reparto PM/cosecha incluido) y el cierre mandado por curl a CI3 contra la base
  real — `cantidad` = 149,75, `cierre_origen = 'cosecha'`, sacos guardados y
  cero filas fantasma.
- **La migración sigue cuadrando con el modelo nuevo**: 550 / 495 / 55 / 21 /
  367 y `vw_reg_reporte_pago` en 495 / 79.298,40 / 15.091,66, con 41 cosechas y
  217 sacos colgados de su AM. **No cierra ningún AM**: las 15 cosechas cuyo AM
  quedó abierto van a `mig_descarte`, porque cerrarlas haría que V4 pagara filas
  que V3 no paga.

## Lo siguiente, en orden

1. **Paso 6 — Postcosecha** o **paso 7 — Riego**, y el orden del plan no
   coincide con el uso: en agosto de 2026 hubo **279 filas de riego contra 60
   de cosecha**, y postcosecha lleva **4 partidas en todo 2026** (77 en 2024).
   Riego está bloqueado sólo por las capturas de pantalla (pendiente #9) y su
   tabla `reg_riego` ya existe y **no hay que rehacerla**: riego es una bitácora
   propia, no cierra tareas AM (ver `00-plan.md` y `02-bd-y-api.md` §Riego).
   Postcosecha es el módulo más caro y el menos usado — y antes de construirlo
   conviene auditar el DDL de `pc_*` contra los datos reales, que es exactamente
   lo que le faltó a `reg_cosecha`.
2. **Detalle Registro**: tocar una tarjeta y ver el payload campo por campo,
   con el UUID. Es lo único que quedó fuera del paso 4.
3. **Repuntar las 19 vistas restantes** (`vw_reporte_am`, `vw_reporte_pm` y las
   demás) a `reg_am` para el período desde agosto. Sólo se hizo
   `vw_reg_reporte_pago`, que es la nómina. Las viejas **no se tocan**: los
   endpoints V3 y la web histórica se quedan con `z_*` hasta julio de 2026.
4. **Campo propio para la justificación del registro retroactivo.** Hoy viaja
   dentro de `comentario` con prefijo `[RETROACTIVO]`, recortada a 255.
5. **Validar finca de persona y de subtarea en `sync_am`.** Las columnas existen
   (`z_personal.id_finca`, `z_subtarea.id_finca`) y el servidor no las compara.
6. **Levantar el contenedor en PHP 8.1** y validar lo que el ensayo no cubrió
   (lista en `docker/php/Dockerfile`): guardado real desde Grocery CRUD, campos
   de archivo, login POST de ion_auth, y `Operations/PM`.
7. Después: el corte.

Las decisiones cerradas —las que no hay que volver a discutir— están en
**`00-plan.md`**, una conclusión por tema. No se repiten acá.

---

## Las trampas que ya costaron tiempo

Esta lista vale más que el resto de los documentos juntos.

### Base de datos y migraciones

- **`docs/db/init/01-schema.sql` NO está limpio.** Trae las 17 tablas v4 en su
  forma VIEJA, vacías, porque se crearon a mano antes de consolidar. Y
  `CREATE TABLE IF NOT EXISTS` las acepta **en silencio**: la migración parece
  correr bien y deja un `reg_am` sin `personal_id` ni `cierre_*`, que recién
  falla más adelante con un mensaje que no dice nada de esto. `02-tablas-v4.sql`
  abre con un guardián que aborta con un mensaje legible; para dejar una base
  virgen, `_historico/00-limpiar-intermedias.sql`.
- **MySQL Workbench abre cada sesión con `SQL_SAFE_UPDATES = 1`**, y un `UPDATE`
  sin `WHERE` sobre una columna clave devuelve **ERROR 1175**. Por consola de
  MariaDB el modo viene apagado. Por eso `01-catalogos.sql` lleva un
  `WHERE l.id > 0` que no filtra nada. Y ojo: **`= 1` ENCIENDE el modo**, no lo
  apaga; el que lo apaga es `= 0`.
- **Los nombres de columna de los catálogos están mezclados**: `z_subtarea` usa
  `nombre_subtarea` y `z_ulabor` usa `ulabor_nombre`, pero `z_cultivo` usa
  `nombre`. Un JOIN escrito "de memoria" muere con *Unknown column*.
- **`estado` en `z_personal` NO es una bandera de baja**: es el tipo de
  contratación (1 Afiliado, 2 No afiliado, 3 Eventual, 4 Contratista, 6 Período
  de prueba). La vigencia la dice **`eregistro`** ('A'/'I'). Filtrar por
  `estado = '1'` devuelve sólo los Afiliados. V3 se contradice a sí mismo:
  `Personal_model::get_all()` usa `eregistro` y dos métodos más abajo usan
  `estado`.
- **`estado` está mezclado entre catálogos**: `z_cultivo`/`z_modulo`/`z_lote`
  usan `'1'`; `z_tarea` y `z_subtarea` usan `'A'`. Filtrar por `estado='1'`
  parejo devuelve cero tareas. V4 filtra `estado IN ('1','A')`.
- **`z_tabla_pm.hora_inicio` casi nunca coincide con `z_tabla_am.hora`** — 592
  de 598 filas de agosto difieren. La clave de emparejamiento AM↔PM de la
  migración es (trabajador, fecha, lote, subtarea), **sin la hora**.
- **`pm_year` va con `format('o')`, no con `format('Y')`.** V3 usa `'Y'` y por
  eso 181 filas de diciembre de 2025 quedaron en `(2025, semana 1)`. En V4 el
  año y la semana no se guardan: se derivan con `WEEK(fecha,3)`. La app **no**
  manda `pm_year`/`pm_week`.

### Servidor

- **Desde PHP 8.1 mysqli LANZA excepciones** en vez de devolver `FALSE`, y CI3
  no lo sabe: su chequeo de `db_debug` no llega a correr y la excepción mata el
  request. V4 lo maneja con `try/catch`; **V3 y la web no**.
- **`db_debug` viene TRUE fuera de producción**: una violación de FK imprime una
  página de error y mata el request.
- **Toda consulta nueva de V4 necesita `try/catch` y apagar `db_debug`.** Sin
  eso, desde PHP 8.1 la excepción de mysqli sube hasta `RestController` y el
  endpoint responde una traza HTML de CI3 **con HTTP 200**, indistinguible de
  una respuesta buena para la app.
- **mysqli devuelve TODO como string.** En JavaScript `"0"` es *truthy*. Al
  agregar cualquier consulta a V4, castear con `castRows`. En la app, lo mismo
  con `tiene_modulos`: se compara contra `1`, no se usa como booleano.
- **La base no se carga sola** en este proyecto: `$autoload['libraries']` está
  vacío. V4 usa `requireDb()` perezoso, a propósito.
- **CORS vive en `application/config/rest.php`**, no en el controlador.
- **Toda fecha que sale de la app lleva offset.** `sync_fecha()` hace
  `new DateTime($valor)`, y una cadena sin offset se interpreta en la zona del
  SERVIDOR: con el teléfono en otra zona, la hora de proceso se corre sin que
  nadie lo note.

### App (Angular / Ionic)

- **Zoneless**: sin zone.js, todo estado que la vista muestre tiene que ser un
  `signal`. Un campo plano mutado desde un callback async no repinta **y no
  lanza error**. Por eso los formularios usan `(ionInput)` a un signal y no
  `ngModel`.
- **A un componente dentro de un `ion-modal` hay que ponerle `ion-page` a
  mano**: Ionic no se la pone y el `ion-content` se derrumba, dejando media
  ventana en blanco. Y `--height: auto` no es alternativa: colapsa el layout y
  el modal se come los toques.
- **`ion-button` se come el `aria-label`** en su shadow DOM, y el `isDisabled()`
  de Playwright no entiende un `ion-button` deshabilitado (hay que leer
  `aria-disabled`). Las dos cosas hacen pasar pruebas en falso. El resto de las
  trampas de Ionic, con su detalle, están en `app-v4/e2e/README.md`.

- **`reg_flag` es la bitácora de lo que no entró** (2026-09-03): `rechazado`,
  `duplicado` y `error`, con el payload completo. La escribe `V4.php` al
  sincronizar, se lee por `vw_reg_flag` desde la base y el usuario no la ve. Se
  quitaron las cinco banderas de reloj y ventana: no medían nada útil. **El
  reenvío del mismo guid no se marca**: es el ACK perdido, no un problema.
- **La ventana horaria NO bloquea y el servidor no la mira.** Es un aviso en
  pantalla contra la hora de proceso, nada más.

### Herramientas

- **`captura_guid` NO es lo que agrupa las tarjetas.** Dice qué filas salieron
  del mismo formulario, y sirve para rastrear. Agrupar por él daba dos tarjetas
  idénticas cuando dos personas del mismo trabajo se cargaban como dos tareas
  del formulario. Las pantallas agrupan por la **identidad del trabajo** (lote,
  subtarea, módulos). Corregido de paso `am.page.ts`, que lo generaba por envío
  y no por tarea: ahora significa lo mismo que en la migración.
- **No desempatar un orden por un UUID.** La lista del PM lo hacía y las
  tarjetas saltaban de lugar en cada recarga. La prueba e2e pasaba o fallaba
  según la corrida, que es peor que fallar siempre.
- **`pkill` devuelve exit 144 y se lleva el resto del comando.** Matar el mock y
  relanzarlo tiene que ir en dos llamadas o la suite que sigue nunca corre.

- **`git commit` se cuelga sobre el mount de Windows** refrescando el índice, y
  además git no puede borrar sus `.git/index.lock` / `HEAD.lock`, que dejan el
  repo trabado. Se commitea con plumbing: `git write-tree`, `git commit-tree`,
  `git update-ref`. `git status` sobre el repo entero también se cuelga.
- El `tar` sobre el mount de Windows se pasa de los 45 s de la shell y deja
  archivos truncados. **Usar `git archive`.**
- **`ng build` no entra en los 45 s de la shell, y nada queda corriendo en
  segundo plano entre llamadas.** Compilar y correr e2e exige un entorno con
  procesos largos: empaquetar `src/ e2e/ public/ *.json` (unos 110 KB), hacer
  `npm ci` y trabajar ahí.

---

## Cómo verificar de verdad

Nada se da por bueno con `php -l` ni leyendo otro documento.

**Base:** importar `docs/db/init/01-schema.sql` (dump con datos, 25 MB, ignorado
por git) en MariaDB en el contenedor; **el dump trae su propio `CREATE DATABASE`
y la base se llama `lfp_prodapp`**. Después
`_historico/00-limpiar-intermedias.sql` y las cuatro migraciones en orden.

**Servidor:** levantar CodeIgniter en el contenedor y pegarle con `curl`.
Extraer CI3 con `git archive` (no `tar`), incluyendo `application/views` —sin
`views/errors/` cualquier error de CI3 se vuelve un `include()` fallido—, y
`php -S` con un `router.php` que haga **`chdir` a `public/`**: sin eso CI3 muere
con "Your system folder path does not appear to be set correctly". Poner
`ENVIRONMENT` en `production` para que las respuestas sean JSON limpio; en
`development`, CI 3.1.11 bajo PHP 8.2+ escupe deprecations antes del JSON y
rompe hasta el código de estado.

**App:** `ng build -c development` (el hook `window.__lagricontrol` sólo existe
ahí), servir `www/`, levantar `e2e/mock-v4.mjs` y correr las dos suites.

Las recetas completas están en la memoria del proyecto.

---

## Mapa de documentos

| documento | para qué |
|---|---|
| `00-plan.md` | índice, orden de construcción, **decisiones cerradas** y pendientes |
| `01-sincronizacion.md` | cola, ACK, invariantes I1..I5, máquina de estados |
| `02-bd-y-api.md` | tablas nuevas, migración, contrato de la API, seguridad |
| `03-pantallas.md` | las pantallas, una por una |
| `04-mapa-bd.md` | qué hay en la base hoy y quién usa cada tabla |
| `app-v4/e2e/README.md` | cómo correr las dos suites y las trampas de Ionic |
| `docs/db/migrations/_historico/README.md` | qué hacía cada migración retirada y por qué |
| `docs/context/99-riesgos.md` | deuda técnica y seguridad del sistema web |
| `PROMPT-ARRANQUE.md` | **histórico**, no sirve para arrancar nada |
