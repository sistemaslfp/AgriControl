# Pruebas e2e

Dos suites. Verifican promesas que no se pueden comprobar leyendo el código.

- **`cola.spec.mjs`** — `MOBIL/01-sincronizacion.md`: el ACK, el troceado en
  lotes, el orden FIFO, el backoff y la escritura transaccional de catálogos.
  Se corre cuando se toca `sync-queue.service.ts` o `catalog.service.ts`.
- **`am-pm.spec.mjs`** — `MOBIL/03-pantallas.md`: el payload exacto que espera
  `sync_am`/`sync_pm` de `application/controllers/V4.php`, un guid por tarea,
  el bloqueo del AM sin personal, el bloqueo por persona repetida, el aviso de
  AM abierto, el filtro del responsable por rol 8, la cascada
  Cultivo → Tarea → Subtarea, y el PM que cierra tareas AM en vez de crearlas.
  63 comprobaciones.
  Se corre cuando se tocan las pantallas de captura.

- **`registros.spec.mjs`** — `MOBIL/03-pantallas.md` §Registros: las tarjetas
  agrupadas por trabajo, los tres estados con tres indicadores, el motivo del
  rechazo a la vista, el botón que fuerza el envío, y el descarte de un
  PENDIENTE con su asiento en `sync_audit`. Verifica además que un ENVIADO o un
  RECHAZADO **no** ofrezcan descartar.
  31 comprobaciones.
  Se corre cuando se toca `registros.page.*` o `sync-queue.service.ts`.

- **`cosecha.spec.mjs`** — `MOBIL/03-pantallas.md` §Cosecha: que la pantalla
  **cierra una tarea AM** y no crea nada, que **no hay selector de trabajador**,
  que el payload es `{am_guid, sacos[...]}` sin finca ni lote ni subtarea, que
  los sacos viajan renumerados 1..N, y **el reparto con el PM**: el PM ya no
  muestra las tareas de cosecha y cosecha no muestra las demás.
  23 comprobaciones.
  Se corre cuando se toca `cosecha.page.*`, `pm.page.ts` o el filtro por módulo.

  **Ojo con `hasText: 'Cosecha'`**: Playwright busca subcadena sin distinguir
  mayúsculas, así que también matchea la celda **Poscosecha** del menú, que
  sigue gris. Hay que anclar con `/^Cosecha$/`. Para contar filas de saco,
  `hasText: 'Saco '` cuenta de más: se usa `.numero-saco`.

- **`riego.spec.mjs`** — `MOBIL/03-pantallas.md` §Riego: que la pantalla es una
  **bitácora** (no pide trabajador ni tarea), que un lote con dos módulos genera
  **dos filas de una vez**, que el tiempo sale de los seis chips y viaja en
  **minutos**, que el volumen es opcional y viaja en 0, que el payload **no**
  lleva `subtarea_id` ni `captura_guid`, que repetir (lote, módulo) **avisa sin
  bloquear** y que cambiar la finca borra lo cargado. 34 comprobaciones.

  **Ojo con el localizador del lote**: `hasText: '5'` matchea primero al lote 1,
  porque su detalle dice "12.5 ha". Hay que pedir `'Lote 5'` entero.

  **`am-pm.spec.mjs` usa PODA DE FORMACION y no COSECHA CACAO** en las tareas
  que después cierra el PM, justamente porque el PM ya no cierra cosecha. Y
  `cola.spec.mjs` encola `riego` para probar **la mecánica del ACK**: ahí el
  tipo da igual y el mock ACKea cualquier cosa. Desde el 2026-09-08 el servidor
  real **sí** implementa `riego` y valida su payload, así que esos registros de
  prueba no pasarían por un servidor de verdad.

  **El mock GUARDA ESTADO entre corridas** (los días de cosecha consumidos no
  vuelven): correr `postcosecha.spec.mjs` dos veces sin reiniciarlo da 7 fallos
  que no son del código. Reiniciar el mock entre suites.

No corren en CI ni hacen falta para desarrollar.

```bash
# 1. build de DESARROLLO (el hook window.__lagricontrol sólo existe ahí)
npm run build -- -c development
npx http-server www -p 8099 -s -P "http://localhost:8099?"

# 2. servidor V4 simulado
node e2e/mock-v4.mjs

# 3. las pruebas (necesita playwright: npm i -D playwright && npx playwright install chromium)
node e2e/cola.spec.mjs
node e2e/am-pm.spec.mjs
node e2e/registros.spec.mjs
node e2e/cosecha.spec.mjs
node e2e/postcosecha.spec.mjs
node e2e/riego.spec.mjs
```

**Las seis se corren juntas**: dos veces una regla nueva dejó suites rojas
durante un día porque sólo se corrió la que parecía afectada.

Si el entorno ya tiene un Chromium instalado y no se quiere descargar otro,
`PW_CHROMIUM=/ruta/al/chrome node e2e/am-pm.spec.mjs`.

Dos cosas que cuestan tiempo si no se saben, y que estas pruebas ya resuelven:

- **`ion-button` se come el `aria-label`** en su shadow DOM, así que no sirve
  para localizar las flechas de paso. Tienen clases `paso-anterior` /
  `paso-siguiente` justamente para eso.
- **`isDisabled()` de Playwright solo entiende controles nativos**: un
  `ion-button` deshabilitado le parece habilitado y la prueba pasa en falso.
  Hay que leer `aria-disabled`.
- Ionic deja las páginas anteriores montadas en el `ion-router-outlet`: todo
  locator de página se ancla a `app-am` / `app-pm`, o un `ion-item` de
  Configuración compite con uno de AM.
- **Un `.click()` sobre el `<ion-backdrop>` NO cierra el modal**: Ionic escucha
  el gesto, no el click del elemento. Hay que hacer un click de ratón real en
  una esquina (`p.mouse.click(8, 8)`).
- **Después de cerrar hay que ESPERAR** a que se vaya la clase `show-modal`:
  Ionic deja el `ion-modal` en el DOM y mientras tanto sigue interceptando los
  toques, así que el siguiente click de la página se cuelga 30 s.
- **Al componente dentro de un `ion-modal` hay que ponerle la clase
  `ion-page` a mano.** Ionic no se la pone: sin ella el componente queda
  `display: block` con la altura de su contenido, el `ion-content` se derrumba
  y media ventana queda en blanco.
- **Tras cerrar un modal hay que esperar la condición, no un timeout fijo**
  (`esperarModalCerrado`): 500 ms alcanzan a veces y a veces no, y el fallo se
  ve como un click que se cuelga 30 s en otra parte de la prueba.
- **Un modal con `--height: auto` colapsa el layout** si adentro hay
  `ion-header` + `ion-content` + `ion-footer`: la receta de altura automática
  de Ionic exige un div normal. Con `ion-content` el propio `ion-modal`
  termina interceptando los toques y las opciones dejan de ser clicables. El
  selector usa altura fija por eso.

- **El "Guardar" de Configuración no es decorativo.** Sin él la URL no se
  persiste, y eso se paga dos veces: no bajan los catálogos —la pantalla muestra
  `#301` y "Sin datos de catálogo"— y la cola no tiene a dónde enviar. Parecen
  dos bugs distintos y es un `.click()` que falta en el setup.
- **No usar `.first()` sobre un locator que puede matchear varias cosas.** Costó
  una prueba intermitente que pasaba o fallaba según la corrida — y destapó un
  bug real: la lista del PM desempataba el orden por el `captura_guid`, que es
  un UUID aleatorio, así que las tarjetas cambiaban de lugar en cada recarga.
  Una prueba que falla a veces es peor que una que falla siempre.
- **El estado de un `ion-segment` se lee del componente, no del DOM.**
  `aria-selected` y `ng-reflect-*` no están en un build sin debug: una prueba
  que los mire pasa o falla según cómo se compiló, no según lo que hace la
  pantalla. Va por `window.ng.getComponent(...)`.
- **`pkill` devuelve exit 144 y se lleva el resto del comando.** Matar el mock o
  el servidor de la app y relanzarlos tiene que ser en dos pasos, o el
  `node e2e/...` que va después nunca corre y parece que la suite fallo.
- **Playwright no viene con `npm ci`**: es `devDependency` opcional. Instalarlo
  con `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i -D playwright` y apuntarle a un
  Chromium existente con `PW_CHROMIUM`, o se baja 150 MB de navegador.

El mock reemplaza a la API V4 y permite forzar escenarios que un servidor real
no produce a pedido: portal cautivo que devuelve 200 con HTML, respuestas
parciales, rechazos y catálogos corruptos.
