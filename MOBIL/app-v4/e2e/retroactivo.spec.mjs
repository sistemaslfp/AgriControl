/**
 * Pruebas e2e del MODO LIBRE y de las ventanas configurables
 * (Kevin, 2026-09-14).
 *
 * Qué cambió y por qué estas comprobaciones existen:
 *
 *  - Hasta el 2026-09-14 el interruptor "Estoy cargando un día anterior"
 *    existía SOLO en AM. PM, Cosecha, Riego y Postcosecha llamaban a
 *    `limites(tipo, false)` con el `false` escrito a mano, así que la ventana
 *    de su módulo era un LIMITE DURO del calendario: 3 días para PM, 7 para
 *    cosecha y riego, 30 para postcosecha, sin forma de pasarse desde el
 *    teléfono. Eso es lo que se abre acá.
 *
 *  - La justificación dejó de viajar pegada dentro de `comentario` como
 *    '[RETROACTIVO] ...' y pasó a ser un campo propio, `justificacion_retro`,
 *    con su columna en la base. La comprobación 07 es la que vale: mira el
 *    payload REAL que llegó al mock, no la pantalla.
 *
 *  - Las ventanas se editan en Configuración y lo del equipo le GANA al
 *    servidor. La trampa que cubre la 12: si mandara el servidor, el cambio
 *    se borraría solo en el próximo "Actualizar Maestros". Por eso la prueba
 *    vuelve a pulsar Actualizar Maestros DESPUÉS de guardar.
 *
 * Requiere: build de desarrollo en :8099 y mock-v4.mjs en :8098.
 */
import { chromium } from 'playwright';

const APP = 'http://localhost:8099';
const MOCK = 'http://localhost:8098';
const modo = (m) =>
  fetch(`${MOCK}/mock/modo`, { method: 'POST', body: JSON.stringify({ modo: m }) });
const lotes = () => fetch(`${MOCK}/mock/lotes`).then((r) => r.json());

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
const esperarModalCerrado = () =>
  p.waitForFunction(() => document.querySelectorAll('ion-modal.show-modal').length === 0, {
    timeout: 5000,
  });

/** Días entre el `min` del ion-datetime y hoy. Es la ventana, vista desde el DOM. */
async function limitesDelSelector(raiz) {
  // `min`/`max` van por PROPERTY binding ([min]="limites().min"), no como
  // atributo: getAttribute() devuelve null y la prueba pasa en falso.
  return p.evaluate((r) => {
    const dt = document.querySelector(`${r} ion-datetime`);
    return dt ? { min: dt.min ?? null, max: dt.max ?? null } : { min: null, max: null };
  }, raiz);
}

async function ventanaDelSelector(raiz) {
  const { min } = await limitesDelSelector(raiz);
  if (!min) return null;
  return Math.round((Date.now() - new Date(min).getTime()) / 86400000);
}

// ------------------------------------------------------------------
// 0. Configuración y catálogos
// ------------------------------------------------------------------
await modo('ok');
await p.goto(`${APP}/configuracion`, { waitUntil: 'networkidle' });
await t(2500);
await p.locator('ion-input[placeholder="https://servidor.com/v4"] input').fill(`${MOCK}/v4`);
await p.locator('ion-input[placeholder="TABLET-BELLITA-02"] input').fill('tablet-e2e');
await p.getByText('Guardar', { exact: true }).click();
await t(1800);

await p.goto(`${APP}/menu`, { waitUntil: 'networkidle' });
await t(1500);
await p.locator('button.celda', { hasText: 'Actualizar Maestros' }).click();
await t(2500);

// ------------------------------------------------------------------
// 1. AM: la ventana acota, el interruptor la abre
// ------------------------------------------------------------------
await p.goto(`${APP}/am`, { waitUntil: 'networkidle' });
await t(1800);

const ventanaCerrada = await ventanaDelSelector('app-am');
ok(
  '01 sin el interruptor el calendario se abre sólo la ventana del módulo',
  ventanaCerrada !== null && ventanaCerrada >= 2 && ventanaCerrada <= 4,
  `dias=${ventanaCerrada}`,
);

const interruptor = p.locator('app-am app-retroactivo ion-checkbox').first();
ok('02 el interruptor de día anterior existe en AM', (await interruptor.count()) === 1);

await interruptor.click();
await t(600);
const ventanaAbierta = await ventanaDelSelector('app-am');
ok(
  '03 con el interruptor el calendario se abre muy hacia atrás',
  ventanaAbierta !== null && ventanaAbierta > 300,
  `dias=${ventanaAbierta}`,
);

// El máximo NO se mueve: el futuro no tiene interruptor (I1 del servidor).
const { max } = await limitesDelSelector('app-am');
ok(
  '04 el interruptor NO habilita fechas futuras',
  max !== null && new Date(max).getTime() <= Date.now() + 120000,
  String(max),
);

// ------------------------------------------------------------------
// 2. El motivo es obligatorio, y viaja en su propio campo
// ------------------------------------------------------------------
const motivo = p.locator('app-am app-retroactivo ion-input input').first();
ok('05 con el interruptor encendido aparece el campo del motivo', (await motivo.count()) === 1);

// Una fecha vieja de verdad, más allá de cualquier ventana razonable.
const vieja = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 19);
await p.evaluate((v) => {
  const dt = document.querySelector('app-am ion-datetime');
  dt.value = v;
  dt.dispatchEvent(new CustomEvent('ionChange', { detail: { value: v }, bubbles: true }));
}, vieja);
await t(800);

// Hay DOS banners de alerta a esta altura: el de "la fecha es de hace más
// de N días" y el de los problemas del encabezado. El motivo lo reclama el
// segundo, así que se miran todos.
const problemasSinMotivo = (await p.locator('app-am .banner.alerta').allInnerTexts()).join(' ');
ok(
  '06 sin escribir el motivo, la pantalla lo reclama',
  problemasSinMotivo.toLowerCase().includes('justificaci'),
  problemasSinMotivo.replace(/\n/g, ' ').slice(0, 110),
);

await motivo.fill('El equipo estuvo sin bateria toda la semana.');
await t(500);

// Encabezado completo y una tarea mínima, para poder guardar.
const campo = (texto) => p.locator('app-am ion-item', { hasText: texto }).first();
const elegirUno = async (etiqueta, opcion) => {
  await campo(etiqueta).click();
  await t(400);
  await p.locator('ion-modal ion-radio', { hasText: opcion }).first().click();
  await esperarModalCerrado();
  await t(300);
};
await elegirUno('Finca', 'Bellita');
await elegirUno('Responsable', 'HOLGUIN');
await p.locator('app-am .paso-siguiente').first().click();
await t(700);
await elegirUno('Lote', 'Lote 5');
await elegirUno('Tarea', 'MANTENIMIENTO');
await campo('Subtarea').click();
await t(500);
await p.locator('ion-modal ion-radio', { hasText: 'PODA DE FORMACION' }).first().click();
await esperarModalCerrado();
await t(400);
await campo('Seleccionar personal').click();
await t(600);
await p.locator('ion-modal ion-checkbox').first().click();
await t(300);
await p.mouse.click(8, 8);
await esperarModalCerrado();
await t(400);
await p.locator('app-am .paso-siguiente').first().click();
await t(700);

await p.locator('app-am ion-button', { hasText: 'Guardar 1 tarea' }).first().click();
await t(3000);

const enviados = (await lotes()).flatMap((l) => l.records ?? []);
const am = enviados.filter((r) => r.tipo === 'am');
ok('07a el AM retroactivo se mandó', am.length === 1, `n=${am.length}`);
ok(
  '07 el motivo viaja en justificacion_retro, NO pegado al comentario',
  am[0]?.payload?.justificacion_retro === 'El equipo estuvo sin bateria toda la semana.' &&
    !String(am[0]?.payload?.comentario ?? '').includes('[RETROACTIVO]'),
  JSON.stringify({
    j: am[0]?.payload?.justificacion_retro,
    c: am[0]?.payload?.comentario,
  }),
);

// ------------------------------------------------------------------
// 3. Las otras cuatro pantallas también lo tienen
// ------------------------------------------------------------------
for (const [ruta, raiz, n] of [
  ['/pm', 'app-pm', '08'],
  ['/cosecha', 'app-cosecha', '09'],
  ['/riego', 'app-riego', '10'],
]) {
  await p.goto(`${APP}${ruta}`, { waitUntil: 'networkidle' });
  await t(1800);
  const c = await p.locator(`${raiz} app-retroactivo ion-checkbox`).count();
  ok(`${n} ${ruta} tiene el interruptor de día anterior`, c === 1, `interruptores=${c}`);
}

// Postcosecha abre en la LISTA de partidas: el interruptor vive en el pesaje,
// que es la vista 'nuevo'. Por eso hay que entrar antes de buscarlo.
await p.goto(`${APP}/postcosecha`, { waitUntil: 'networkidle' });
await t(2000);
await p.locator('app-postcosecha ion-button', { hasText: 'Nuevo registro' }).first().click();
await t(1500);
ok(
  '11 el pesaje de postcosecha tiene el interruptor de día anterior',
  (await p.locator('app-postcosecha app-retroactivo ion-checkbox').count()) === 1,
);

// ------------------------------------------------------------------
// 4. Las ventanas se editan en Configuración y le ganan al servidor
// ------------------------------------------------------------------
await p.goto(`${APP}/configuracion`, { waitUntil: 'networkidle' });
await t(2000);

// El `label` del ion-input va por property binding, asi que no hay atributo
// por el que filtrar: se busca por el texto que la etiqueta pinta.
const campoAm = p.locator('ion-item', { hasText: 'AM (programación)' }).first();
ok('12a la sección de días por módulo existe', (await campoAm.count()) === 1);

await campoAm.locator('input').fill('60');
await p.getByText('Guardar días', { exact: true }).click();
await t(1500);

// LA TRAMPA: Actualizar Maestros pisa BOOTSTRAP_JSON entero. Si el override
// viviera ahí dentro, este click lo borraría y el usuario no entendería por
// qué su número volvió solo a 3.
await p.goto(`${APP}/menu`, { waitUntil: 'networkidle' });
await t(1200);
await p.locator('button.celda', { hasText: 'Actualizar Maestros' }).click();
await t(2500);

await p.goto(`${APP}/am`, { waitUntil: 'networkidle' });
await t(1800);
const ventanaNueva = await ventanaDelSelector('app-am');
ok(
  '12 el día configurado en el equipo sobrevive a Actualizar Maestros',
  ventanaNueva !== null && ventanaNueva >= 59 && ventanaNueva <= 61,
  `dias=${ventanaNueva}`,
);

await p.goto(`${APP}/configuracion`, { waitUntil: 'networkidle' });
await t(2000);
const origen = await p
  .locator('ion-item', { hasText: 'AM (programación)' })
  .first()
  .locator('ion-note')
  .innerText();
// El texto se pinta en MAYUSCULAS por CSS (text-transform en .origen-ventana),
// igual que el de ion-button: comparar en minusculas o la prueba falla por el
// estilo y no por la pantalla.
ok(
  '13 la pantalla dice que ese número lo puso el equipo',
  origen.toLowerCase().includes('equipo'),
  origen,
);

await p.getByText('Restaurar los del servidor', { exact: true }).click();
await t(1500);
await p.goto(`${APP}/am`, { waitUntil: 'networkidle' });
await t(1800);
const ventanaRestaurada = await ventanaDelSelector('app-am');
ok(
  '14 restaurar devuelve la ventana del servidor',
  ventanaRestaurada !== null && ventanaRestaurada >= 2 && ventanaRestaurada <= 4,
  `dias=${ventanaRestaurada}`,
);

ok('15 sin errores de JavaScript en toda la sesión', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} PRUEBA(S) FALLIDA(S)`);
process.exit(fallos === 0 ? 0 : 1);
