# 99 — Riesgos, deuda técnica y decisiones

Lee esto antes de proponer cambios "obvios".

## Decisiones vigentes

- ✅ **API vigente = `V4.php`** (app móvil V4). `V1`, `V2`, `V3` congeladas: no
  editar, no borrar hasta verificar en el servidor que nadie les pega.
  `API/V3.php` se eliminó el 2026-09-16.
- ✅ **La web lee solo V4** (`lfp_*`, `pc_*`, `vw_lfp_*`) desde el 2026-09-16.
  Todo el histórico v3 está migrado (`03-migracion-historico.sql`); lo que no
  entró está en `mig_descarte`. Los errores de la data vieja **se registran, no
  se corrigen**.
- ✅ Ediciones en la web: PM (cierre), Riego y Postcosecha (etapas y calidad).
  Cosecha, AM y reportes son solo lectura.
- ✅ **Ajustes de pago en V4** (`05-ajustes-pago-v4.sql`): `pm_id` apunta a
  `lfp_am.id`. El guardián que abortaba si había ajustes se quitó.
- ✅ **Usuarios por hacienda** (2026-09-25): 4 grupos y `users.finca_id`. Solo
  el admin global crea usuarios y ve las maestras compartidas.
- ✅ **PHP 7.3** en desarrollo, igual que producción (XAMPP, 7.3.27).
- ✅ Ruteo PM/Cosecha **por unidad Libra**, sin columna nueva en `z_subtarea`.
- ✅ El DDL de V4 está versionado en `docs/db/migrations/`. El de v3 sigue
  solo en el dump no versionado.

## Seguridad (accionable, prioridad alta)

1. **`application/config/database.php` tiene credenciales hardcodeadas**
   (`root` / `root_password` / `mysql_dev_container`). En producción se edita a
   mano: una copia ciega del repo la rompe (ver `docs/deploy/`).
2. **API sin autenticación**: `rest_auth = false`, sin API keys, sin whitelist.
   Cualquiera con la URL escribe registros por V3 o V4. La auth de V4 (API key
   por dispositivo) sigue pendiente; `rest_enable_keys` es global y rompería V3.
3. **`csrf_protection = FALSE`** en `config.php`.
4. **`encryption_key` débil y versionada** (`'Rm1mJUnou5'`).
5. **`ENVIRONMENT` hardcodeado a `'development'`** en `public/index.php`:
   expone errores y trazas si llega así a producción.
6. `.htaccess` de `public/` fija `Access-Control-Allow-Origin: "*"` para assets.

Resueltos: `.env` ya no está versionado (`.gitignore`); `public/colmillo.php`
(Adminer expuesto), `info.php`, `dole.php` y `error_log` se retiraron el
2026-08-28. `public/php.ini` se deja a propósito (límite de subida de fotos).

> Ninguno se arregla por iniciativa propia: tocar credenciales, CSRF o
> `ENVIRONMENT` rompe despliegues. Repórtalos y espera decisión.

## Deuda técnica

1. **`API/V4.php` es copia byte a byte de `V4.php`**: dos archivos que hay que
   mantener iguales a mano. Falta decidir cuál URL usa la app y retirar la otra.
2. V1/V2/V3 duplicados (~41 métodos) y todavía escriben tablas `z_*` que la
   web ya no lee.
3. **Chequeos de grupo por número** (`$group != 1 && $group != 2`,
   `$group == 3`) en `Postharvest.php`, `Cosechacacao.php`, `Personal.php`,
   `Subtarea.php` y otros, anteriores a los 4 roles. Con los grupos nuevos el
   grupo 4 (Admin hacienda) puede quedar fuera donde debería editar. Migrar a
   `acceso_puede()`.
4. `Operations/PM/Payment.php` y `views/payments/*` son legacy: fuera del menú,
   cargan vistas de una ruta inexistente; `Payment_model` conserva métodos sobre
   vistas v3 y `backupAndDeleteDuplicates()` sobre `z_tabla_pm`.
5. `Reportepago.php` define la clase `Proyectos` — archivo muerto.
6. `PmPaymentDailyAdjustment.php` declara `PmPaymentDailyAdjusment` (falta la
   `t`): no rutea.
7. `phpdotenv` instalado pero nunca inicializado.
8. `Auth_Controller.php` no se usa (los permisos van por `acceso_helper`).
9. `Prueba.php` / `Prueba_model.php` / `views/prueba/` son código de práctica.
10. Mojibake en comentarios y strings viejos.
11. Sin tests de la web (las e2e son de la app, contra un mock).
12. `config['base_url']` apunta a una IP de LAN fija
    (`http://192.168.100.81:6080/LifprodecsaAgricontrol/public`).
13. **`lfp_flag` no la lee nadie**: se escribe en cada rechazo y no hay pantalla
    ni reporte. Decidir si se le hace uno o queda como forense.

## Sin confirmar — pregunta antes de asumir

- [ ] Significado literal de **AM** y **PM**.
- [ ] Qué migraciones ya corrieron en la base de producción.
- [ ] Si algún equipo sigue pegando a `/v3/...` (antes de borrar V1/V2/V3).
- [ ] Qué URL usa la app en producción: `/v4/...` o `/api/v4/...`.

## `z_personal`: `eregistro` manda, `estado` es el tipo de contrato (2026-09-02)

**La única bandera de vigencia de una persona es `eregistro`**: `'A'` activo,
`'I'` inactivo. Si dice `'I'`, la persona no va, sin importar nada más.

**`estado` NO es una bandera de baja: es el tipo de contratación**, y apunta a
`z_personal_estado`:

| id | descripción |
|---|---|
| 1 | Afiliado |
| 2 | No afiliado |
| 3 | Eventual |
| 4 | Contratista |
| 6 | Período de prueba |

Por eso **filtrar personal por `estado = '1'` no devuelve "los activos": devuelve
sólo los Afiliados**, y deja fuera a eventuales y contratistas que sí trabajan.
Es un filtro de nómina disfrazado de filtro de vigencia, y el error es fácil
porque `estado` es el nombre que uno esperaría.

Lo que se ve en los datos: de las 8 personas con `rol = 8` (responsables), 7
tienen `estado = '1'` y sólo **6 tienen `eregistro = 'A'`**. La que discrepa es
la **id 225** (Bellita), con `estado = '1'` y `eregistro = 'I'`. Los 6 que quedan
—5 en Bellita, 1 en Pacaritambo— son exactamente los 6 que firman los AM de
agosto: el filtro correcto está validado por los datos.

**V3 (legacy) se contradice a sí mismo:** `Personal_model::get_all()` filtra por
`eregistro` (línea 18) y dos métodos más abajo filtran por `estado`
(líneas 28 y 36). Según qué pantalla de la web se abra, la id 225 aparece o no.
V4 usa `eregistro` en los dos lugares que importan: `/v4/catalogos` y
`sync_personal_activo()`.

### Lo que falta validar en el servidor

`sync_valida_catalogos()` de `V4.php` verifica finca, cultivo, subtarea,
responsable y personal activos, que el lote pertenezca a la finca declarada y
que cada módulo pertenezca al lote. **No verifica nada contra la finca de la
persona ni de la subtarea**, y las columnas existen:

- [ ] **`z_personal.id_finca` vs `finca_id`**, para el responsable y para el
      trabajador. Hoy un responsable de Bellita puede firmar un AM de
      Pacaritambo. En las 590 filas de agosto siempre coincidió, pero eso es una
      medición, no una regla: nada lo impide.
- [ ] **`z_subtarea.id_finca` vs `finca_id`**. La app ya filtra las subtareas por
      finca (78 en Bellita, 21 en Pacaritambo); el servidor no. Un AM de
      Pacaritambo puede llegar con una subtarea de Bellita y entra.

Las dos son del mismo tipo que la validación módulo ∈ lote que ya existe: la FK
comprueba que el id exista, no que pertenezca a la finca correcta.

## Pantallas rotas hoy

- **`ReporteEventuales.php:30` hace `set_table('vw_pm_rpt_eventuales')` y esa
  vista NO EXISTE en la base.** Rota desde antes de V4 y fuera del menú.
  Kevin, 2026-09-14: anotarla y no tocarla.

## Mantenimiento de estos documentos

Generados leyendo el código el 2026-08-21; **revisados contra el código el
2026-09-25** (web sobre V4, usuarios por hacienda, migraciones 01–06). Si un
`.md` contradice al código, **el código gana** — y se actualiza el `.md` en el
mismo commit.
