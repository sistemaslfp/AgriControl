# Pruebas e2e de la cola de sincronización

Verifican las promesas de `MOBIL/01-sincronizacion.md` que no se pueden
comprobar leyendo el código: el ACK, el troceado en lotes, el orden FIFO, el
backoff y la escritura transaccional de catálogos.

No corren en CI ni hacen falta para desarrollar. Se corren cuando se toca
`sync-queue.service.ts` o `catalog.service.ts`.

```bash
# 1. build de DESARROLLO (el hook window.__lagricontrol sólo existe ahí)
npm run build -- -c development
npx http-server www -p 8099 -s -P "http://localhost:8099?"

# 2. servidor V4 simulado
node e2e/mock-v4.mjs

# 3. las pruebas (necesita playwright: npm i -D playwright && npx playwright install chromium)
node e2e/cola.spec.mjs
```

El mock reemplaza a la API V4 y permite forzar escenarios que un servidor real
no produce a pedido: portal cautivo que devuelve 200 con HTML, respuestas
parciales, rechazos y catálogos corruptos.
