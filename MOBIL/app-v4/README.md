# LAgricontrol app-v4

App de campo offline-first (**Angular 22 + Ionic 9 + Capacitor 8**) que
reemplaza a LAgricontrol v2.0.5. Consume la API **V4** del sistema web
(`application/controllers/V4.php`).

Diseño y reglas: ver `MOBIL/00-plan.md`, `01-sincronizacion.md`,
`02-bd-y-api.md` y `03-pantallas.md` en la raíz del repo.

## Requisitos

- **Node >= 22.22.3** (o 24.15+ / 26+). El CLI de Angular 22 rechaza versiones
  anteriores. Verificar con `node -v`.

## Desarrollo

```bash
npm install
npm start          # ng serve -> http://localhost:4200 (SQLite corre sobre WASM)
```

En el navegador la base SQLite persiste en IndexedDB vía `jeep-sqlite`.

## Build

```bash
npm run build      # produce www/
```

## Android (cuando toque)

```bash
npm run build
npx cap add android
npx cap sync android
```

Sin excepciones de cleartext en release: TLS obligatorio. Para probar contra
el Docker local usar el navegador (`npm start`) o un flavor de desarrollo.

## Decisiones del stack — leer antes de tocar versiones

- **Angular 22, no 19.** La línea 19 terminó en `19.2.25`: es su último release
  de LTS y arrastra avisos de seguridad sin parche posible. Se migró el
  2026-08-28.
- **Zoneless.** Angular 22 no usa zone.js. Todo estado que la vista muestre
  tiene que ser un `signal`. Un campo plano mutado desde un callback async no
  repinta la pantalla y **no lanza ningún error**: simplemente se queda con el
  valor viejo. Es el modo de fallo a vigilar al escribir AM, PM, cosecha y
  postcosecha.
- **Ionic 9 importa desde la raíz**: `from '@ionic/angular'`. El subpath
  `@ionic/angular/standalone` de Ionic 8 ya no existe.
- **`sql.js` fijado en 1.12.0**: es el `sql-wasm.wasm` compatible con
  `jeep-sqlite` 2.8.0. Con 1.13+ el navegador falla con `LinkError` al
  instanciar el WASM. No subir sin volver a probar en navegador.
- **`strict` y `strictTemplates` explícitos** en `tsconfig.json`. TypeScript 6
  ya trae `strict` activo por defecto, pero queda escrito para que no dependa
  de un default que puede cambiar.
- **Sin runner de tests.** Angular 22 dejó de traer Karma y apunta a Vitest;
  como no hay ni un `.spec.ts`, no se dejó configuración a medias. Agregar
  Vitest cuando haga falta.

## Estado (paso 1 del plan)

- Cola de sincronización completa (FIFO, lotes de 50, backoff 30s->30m,
  ACK = guid en `results`, nunca el HTTP 200).
- Reloj corregido por `/v4/hora` (`clock_offset`).
- Catálogos con descarga completa transaccional.
- Pantallas: Menú principal y Configuración.
- Módulos AM/PM/Cosecha/Riego/Poscosecha: pasos siguientes del plan.

En builds de desarrollo existe `window.__lagricontrol` (hook de inspección
de la cola). En producción no existe (`isDevMode()`).
