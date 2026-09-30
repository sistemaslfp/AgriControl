/**
 * Aviso de actualizacion en el menu: aparece solo si /v4/version publica un
 * version_code mayor que el instalado. En el navegador no hay plugin nativo,
 * asi que solo se prueba el aviso; la descarga e instalacion se prueban en
 * el telefono.
 *
 * Requiere: build de desarrollo en :8099 y mock-v4.mjs en :8098.
 */
import { chromium } from 'playwright';

const APP = 'http://localhost:8099';
const MOCK = 'http://localhost:8098';
const modo = (m) =>
  fetch(`${MOCK}/mock/modo`, { method: 'POST', body: JSON.stringify({ modo: m }) });

let fallos = 0;
const ok = (n, c, d = '') => {
  if (!c) fallos++;
  console.log(`${c ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`);
};

const browser = await chromium.launch({
  args: ['--no-sandbox'],
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
});
const p = await browser.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const t = (ms) => p.waitForTimeout(ms);

await modo('ok');
await p.goto(`${APP}/configuracion`, { waitUntil: 'networkidle' });
await t(2500);
await p.locator('ion-input[placeholder="https://servidor.com/v4"] input').fill(`${MOCK}/v4`);
await p.locator('ion-input[placeholder="TABLET-BELLITA-02"] input').fill('tablet-e2e');
await p.getByText('Guardar', { exact: true }).click();
await t(1800);

await p.goto(`${APP}/menu`, { waitUntil: 'networkidle' });
await t(2000);
const aviso = p.locator('app-menu .aviso-actualizacion');
ok('01 con la misma version publicada no hay aviso', (await aviso.count()) === 0);
ok('02 el pie muestra la version del build',
  (await p.locator('app-menu .pie-version').innerText()).includes('v0.1.2'));

await modo('version_nueva');
await p.goto(`${APP}/menu`, { waitUntil: 'networkidle' });
await t(2000);
ok('03 con una version mayor aparece el aviso', (await aviso.count()) === 1);
const texto = (await aviso.innerText()).replace(/\s+/g, ' ');
ok('04 el aviso dice la version nueva y la instalada',
  texto.includes('0.1.3') && texto.includes('0.1.2'), texto);

// El APK llega como descarga y el popup queda en blanco: se registra la URL.
await p.evaluate(() => { window['__abierta'] = null; window.open = (u) => { window['__abierta'] = u; return null; }; });
await aviso.locator('ion-button').click();
await t(500);
const abierta = await p.evaluate(() => window['__abierta']);
ok('05 en el navegador el boton abre la URL del APK', abierta === `${MOCK}/v4/apk`, String(abierta));

ok('06 sin errores de JavaScript', errs.length === 0, errs.join(' | '));
await browser.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
