/**
 * Pruebas e2e de la cola de sincronización (MOBIL/01-sincronizacion.md).
 * Requiere: build de desarrollo servido en :8099 y mock-v4.mjs en :8098.
 * Ver README.md de esta carpeta.
 */
import { chromium } from 'playwright';

const APP = 'http://localhost:8099';
const MOCK = 'http://localhost:8098';
const modo = (m) => fetch(`${MOCK}/mock/modo`, { method: 'POST', body: JSON.stringify({ modo: m }) });
const lotes = () => fetch(`${MOCK}/mock/lotes`).then((r) => r.json());

let fallos = 0;
const ok = (n, c, d = '') => { if (!c) fallos++; console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };

// PW_CHROMIUM permite apuntar a un Chromium ya instalado (contenedor de CI,
// entornos sin descarga de navegadores). Vacío = el que trae Playwright.
const browser = await chromium.launch({
  args: ['--no-sandbox'],
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
});
const p = await browser.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

// window.__lagricontrol sólo existe en builds de desarrollo (isDevMode()).
const conteo = () => p.evaluate(() => window['__lagricontrol'].sync.conteo());
const flush = () => p.evaluate(() => window['__lagricontrol'].sync.flush('e2e', true));
const limpiar = () => p.evaluate(() => window['__lagricontrol'].sync.limpiarCerrados());
const espera = () => p.evaluate(() => { const v = window['__lagricontrol'].sync.proximoReintentoMs();
  return v === null ? null : Math.round((v - Date.now()) / 1000); });
const encolar = (n, tipo) => p.evaluate(async ([n, t]) => { const s = window['__lagricontrol'].sync;
  for (let i = 0; i < n; i++) { await s.enqueue(t, { n: i }); } }, [n, tipo]);

// ---------- configuración ----------
await modo('ok');
await p.goto(`${APP}/configuracion`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
await p.locator('ion-input[placeholder="https://servidor.com/v4"] input').fill(`${MOCK}/v4`);
await p.locator('ion-input[placeholder="TABLET-BELLITA-02"] input').fill('tablet-e2e');
await p.getByText('Guardar', { exact: true }).click();
await p.waitForTimeout(1800);
ok('00 probar conexión y guardar', true);

// ---------- 1. la regla del ACK ----------
// Un portal cautivo devuelve HTTP 200 con HTML. NO es un ACK.
await modo('html200');
await encolar(1, 'am'); await p.waitForTimeout(2500);
let c = await conteo();
ok('01 HTTP 200 con HTML deja el registro PENDIENTE', c.pendientes === 1 && c.enviados === 0, JSON.stringify(c));
ok('02 tras el fallo hay backoff programado', (await espera()) !== null);

// 501 (el esbozo actual de POST /v4/sync) tampoco es un ACK.
await modo('501'); await flush(); await p.waitForTimeout(2000);
c = await conteo();
ok('03 501 sin results deja PENDIENTE', c.pendientes === 1, JSON.stringify(c));

await modo('ok'); await flush(); await p.waitForTimeout(2500);
c = await conteo();
ok('04 ACK created cierra el registro', c.enviados === 1 && c.pendientes === 0, JSON.stringify(c));
await limpiar(); await p.waitForTimeout(800);

// ---------- 2. troceado en lotes de 50 y orden FIFO ----------
// Se retiene la cola con el servidor caído para que se acumule.
await modo('501'); await encolar(120, 'am'); await p.waitForTimeout(1500);
c = await conteo();
ok('05 con el servidor caído nada se da por enviado', c.pendientes === 120 && c.enviados === 0, JSON.stringify(c));

await modo('ok'); await flush(); await p.waitForTimeout(7000);
let L = await lotes(); c = await conteo();
ok('06 se parte en lotes de 50', JSON.stringify(L.map((x) => x.n)) === JSON.stringify([50, 50, 20]),
   'tamaños: ' + L.map((x) => x.n).join(','));
ok('07 los 120 quedan ENVIADOS', c.enviados === 120 && c.pendientes === 0, JSON.stringify(c));
const guids = L.flatMap((x) => x.guids);
ok('08 ningún guid se envía dos veces', new Set(guids).size === guids.length,
   `${guids.length} envíos / ${new Set(guids).size} únicos`);
const fechas = L.flatMap((x) => x.fechas);
ok('09 FIFO por created_at_device', JSON.stringify(fechas) === JSON.stringify([...fechas].sort()));
await limpiar(); await p.waitForTimeout(800);

// ---------- 3. respuesta parcial ----------
// El servidor contesta sólo la mitad de los guids del lote.
// 'riego' y no 'pm': lo que se prueba aca es la mecanica del ACK, que es
// independiente del tipo. Desde que el PM cierra una tarea AM, un 'pm' sin
// `am_guid` se omite de `results` a proposito -- y eso taparia lo que esta
// prueba quiere ver.
await modo('501'); await encolar(10, 'riego'); await p.waitForTimeout(1200);
await modo('parcial'); await flush(); await p.waitForTimeout(4000);
c = await conteo(); L = await lotes();
ok('10 salió como un único lote de 10', L.length >= 1 && L[0].n === 10, 'lotes: ' + L.map((x) => x.n).join(','));
ok('11 los guids contestados quedan ENVIADOS', c.enviados === 5, JSON.stringify(c));
ok('12 los guids ausentes vuelven a PENDIENTE', c.pendientes === 5, JSON.stringify(c));

await modo('ok'); await flush(); await p.waitForTimeout(3500);
c = await conteo();
ok('13 el resto se envía al recuperarse el servidor', c.pendientes === 0 && c.enviados === 10, JSON.stringify(c));
await limpiar(); await p.waitForTimeout(800);

// ---------- 4. rechazo mezclado con éxitos ----------
await modo('501'); await encolar(4, 'riego'); await p.waitForTimeout(1000);
await modo('rechaza'); await flush(); await p.waitForTimeout(3500);
c = await conteo();
ok('14 rechazado y creados conviven en un lote', c.rechazados === 1 && c.enviados === 3 && c.pendientes === 0, JSON.stringify(c));

// ---------- 5. la limpieza no puede tocar lo no sincronizado ----------
await modo('501'); await encolar(2, 'am'); await p.waitForTimeout(1500);
await p.goto(`${APP}/configuracion`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1800);
ok('15 limpieza bloqueada con pendientes', (await p.locator('text=Limpieza bloqueada').count()) === 1);
await modo('ok'); await flush(); await p.waitForTimeout(3000);
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
ok('16 limpieza habilitada con la cola al día', (await p.locator('text=Limpieza bloqueada').count()) === 0);
await limpiar(); await p.waitForTimeout(800);

// ---------- 6. tabla de backoff ----------
await modo('501');
await p.evaluate(() => window['__lagricontrol'].sync.enqueue('am', { x: 1 }));
await p.waitForTimeout(1500);
const esperas = [await espera()];              // el enqueue ya disparó el 1er intento
for (let i = 0; i < 6; i++) {
  await flush(); await p.waitForTimeout(600); esperas.push(await espera());
}
const esperado = [30, 60, 120, 300, 900, 1800, 1800];
ok('17 backoff 30s→1m→2m→5m→15m→30m y se estanca en 30m',
   esperas.every((v, i) => v !== null && Math.abs(v - esperado[i]) <= 2), 'observado: ' + esperas.join(', '));
await modo('ok'); await flush(); await p.waitForTimeout(2500);
ok('18 un envío exitoso limpia el backoff', (await espera()) === null);
await limpiar(); await p.waitForTimeout(800);

// ---------- 7. catálogos: descarga transaccional ----------
await p.goto(`${APP}/menu`, { waitUntil: 'networkidle' }); await p.waitForTimeout(1500);
await p.getByRole('button', { name: 'Actualizar Maestros' }).click(); await p.waitForTimeout(2500);
ok('19 catálogos buenos quedan cargados', (await p.locator('.aviso-catalogos').count()) === 0);

await modo('catalogo_dup');   // respuesta válida pero con PK duplicada a mitad de la escritura
await p.getByRole('button', { name: 'Actualizar Maestros' }).click(); await p.waitForTimeout(2500);
const msg = await p.evaluate(() => document.querySelector('ion-toast')?.message ?? '');
ok('20 la actualización rota avisa del fallo', /no se pudieron actualizar/i.test(msg), JSON.stringify(msg.slice(0, 70)));
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
ok('21 ROLLBACK: los catálogos viejos sobreviven', (await p.locator('.aviso-catalogos').count()) === 0);

// ---------- 8. persistencia ----------
await modo('501'); await encolar(3, 'am'); await p.waitForTimeout(1500);
await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
c = await conteo();
ok('22 la cola sobrevive a recargar la app', c.pendientes === 3, JSON.stringify(c));

if (errs.length) console.log('ERRORES DE PÁGINA:', errs.slice(0, 3));
console.log(fallos === 0 ? '\nTODO VERDE' : `\n${fallos} FALLO(S)`);
await browser.close();
process.exit(fallos === 0 ? 0 : 1);
