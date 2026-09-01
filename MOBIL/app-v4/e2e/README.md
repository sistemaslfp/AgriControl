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
  44 comprobaciones.
  Se corre cuando se tocan las pantallas de captura.

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
```

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
- **Un modal con `--height: auto` colapsa el layout** si adentro hay
  `ion-header` + `ion-content` + `ion-footer`: la receta de altura automática
  de Ionic exige un div normal. Con `ion-content` el propio `ion-modal`
  termina interceptando los toques y las opciones dejan de ser clicables. El
  selector usa altura fija por eso.

El mock reemplaza a la API V4 y permite forzar escenarios que un servidor real
no produce a pedido: portal cautivo que devuelve 200 con HTML, respuestas
parciales, rechazos y catálogos corruptos.
