# Prompt de arranque — Paso 1 del plan móvil V4

Texto para abrir la sesión de implementación. Copiar tal cual.

---

Trabajo en el repositorio `lifprodecsa_lagricontrol-main` (CodeIgniter 3.1.11 +
Grocery CRUD, PHP 7.4, MariaDB 10.4). Vamos a construir desde cero la app móvil
que reemplaza a LAgricontrol v2.0.5, siguiendo un plan ya cerrado.

**Antes de escribir una línea, leé en este orden:**

1. `MOBIL/00-plan.md` — índice, decisiones cerradas, orden de construcción y los
   nueve pendientes abiertos.
2. `MOBIL/01-sincronizacion.md` — offline-first, `guid`, definición del ACK,
   integridad de fechas.
3. `MOBIL/02-bd-y-api.md` — modelo de datos nuevo y contrato de la API V4.
4. `MOBIL/03-pantallas.md` — mapa de pantallas (referencia, todavía no toca).
5. `CLAUDE.md` y `docs/context/` del repo para el contexto del sistema web.

**Objetivo de esta sesión: el paso 1 del orden de construcción, nada más.**
Esqueleto de la app y los cimientos de sincronización. Sin AM, sin PM, sin
cosecha, sin postcosecha.

Entregables:

- Proyecto **Ionic + Angular** nuevo en `MOBIL/app-v4/`, con su propio
  `.gitignore` (fuera `node_modules/`, `www/`, `android/`, `ios/`).
- **SQLite** con `@capacitor-community/sqlite`: esquema local de la cola, los
  catálogos y `sync_audit`.
- **Servicio de cola de sincronización**: FIFO por `created_at_device`, lotes de
  50, backoff `30s→30m`, estados `PENDIENTE / ENVIANDO / ENVIADO / RECHAZADO`.
  El ACK es la aparición del `guid` en `results`, **nunca el HTTP 200**.
- **Servicio de reloj**: `clock_offset` desde `GET /v4/hora`; todo cálculo de
  "ahora" usa `device_now + offset`.
- **Pantalla de Configuración**: URL base con botón "Probar conexión", alias del
  dispositivo, y la sección de limpieza bloqueada si hay pendientes.
- **Pantalla Menú Principal** con contador de pendientes y estado de la cola.
- **"Actualizar Maestros"**: descarga completa y transaccional de catálogos.
- Del lado servidor, `application/controllers/V4.php` con **sólo tres endpoints**:
  `GET /v4/hora`, `GET /v4/bootstrap`, `GET /v4/catalogos`. `POST /v4/sync` se
  deja esbozado pero no se implementa en esta sesión.
- Los tres `ALTER TABLE` aditivos de catálogos (`estado` en `z_finca` y
  `z_ulabor`, `tiene_modulos` en `z_lote`) como script en `docs/db/migrations/`.

**Restricciones que no se negocian:**

- **No renombrar ni modificar ninguna tabla `z_*` existente** más allá de los
  tres `ALTER` aditivos de arriba. La web tiene que seguir funcionando idéntica.
- **No tocar** `V1.php`, `V2.php`, `V3.php` ni `API/V3.php`. Están congelados.
- Las tablas nuevas se llaman `reg_*` y `pc_*`. **Los catálogos no se duplican.**
- Todo lo nuevo en `utf8mb4_spanish_ci`.
- Consultas parametrizadas y whitelist de campos en todo V4. Nunca
  `$this->input->post()` completo hacia un modelo.
- Nada de credenciales en el repo.
- Sin login. Alias de dispositivo configurable.

**Cómo quiero que trabajes:**

- Si algo del plan te parece equivocado, decilo antes de implementarlo.
- Marcá con `[Seguro]`, `[Probable]` o `[Adivinando]` cuando afirmes algo sobre
  el código o la base que no hayas verificado leyéndolo.
- Los nueve pendientes de `00-plan.md` no bloquean este paso. Si alguno te
  bloquea de verdad, preguntá; no inventes la respuesta.
- Trabajá directo sobre los archivos del proyecto. No me mandes archivos por chat.

Empezá listando qué vas a hacer y en qué orden, y esperá mi visto bueno antes de
crear el proyecto Ionic.
