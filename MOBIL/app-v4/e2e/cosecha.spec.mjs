/**
 * Pruebas e2e de la pantalla Cosecha de Cacao (paso 5 del plan).
 *
 * Cosecha CIERRA una tarea AM, igual que el PM (Kevin, 2026-09-03). Lo que
 * verifican, que es lo que no se ve leyendo el codigo:
 *  - la pantalla NO vuelve a elegir trabajador: las personas salen de la tarea;
 *  - el payload es {am_guid, sacos[...]}, sin finca, lote ni subtarea;
 *  - los sacos viajan renumerados 1..N, sin huecos ni los que quedaron en 0;
 *  - **el PM ya no muestra las tareas de cosecha** y cosecha no muestra las
 *    demas;
 *  - no se cierra una tarea sin sacos pesados.
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
let raiz = 'app-cosecha';
const campo = (texto) => p.locator(`${raiz} ion-item`, { hasText: texto }).first();
const enModal = (sel, texto) => p.locator(`ion-modal ${sel}`, { hasText: texto }).first();
const flecha = (cual) => p.locator(`${raiz} ion-button.paso-${cual}`);
const boton = (texto) => p.locator(`${raiz} ion-button`, { hasText: texto }).first();
const deshabilitado = async (loc) => (await loc.getAttribute('aria-disabled')) === 'true';

const esperarModalCerrado = () =>
  p.waitForFunction(() => document.querySelectorAll('ion-modal.show-modal').length === 0, {
    timeout: 5000,
  });

async function elegirUno(etiqueta, opcion) {
  await campo(etiqueta).click();
  await t(400);
  await enModal('ion-radio', opcion).click();
  await esperarModalCerrado();
  await t(250);
}

const filasSaco = () => p.locator(`${raiz} .numero-saco`).count();
const inputSaco = (n) =>
  p.locator(`${raiz} ion-item`, { hasText: `Saco ${String(n).padStart(2, '0')}` })
   .first()
   .locator('input');
async function ponerLibras(n, valor) {
  await inputSaco(n).fill(String(valor));
  await inputSaco(n).blur();
  await t(200);
}

// ------------------------------------------------------------------
// 0. Configuracion, catalogos y DOS AM: uno de cosecha y uno que no
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

const celdaCosecha = p.locator('button.celda', { hasText: /^Cosecha$/ });
ok('00 la celda Cosecha ya no esta deshabilitada',
  (await celdaCosecha.count()) === 1 &&
    !(await celdaCosecha.first().getAttribute('class')).includes('deshabilitada'));

// Los AM se cargan por la API del mock, no por la pantalla: lo que se prueba
// aca es el cierre, no la captura de la manana.
const hoy = new Date();
const F = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
const amCosecha = 'c05ec8a1-0000-4000-8000-000000000001';
const amOtra    = 'c05ec8a1-0000-4000-8000-000000000002';
await fetch(`${MOCK}/v4/sync`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ device_alias: 'sembrador', device_clock_offset: 0, records: [
    { tipo: 'am', guid: amCosecha, created_at_device: `${F}T07:00:00-05:00`,
      payload: { captura_guid: 'c05ec8a1-0000-4000-8000-0000000000aa',
        fecha_proceso: `${F}T07:00:00-05:00`, finca_id: 1, responsable_id: 26,
        cultivo_id: 1, lote_id: 1, subtarea_id: 88, modulo_ids: [2], personal_id: 214 } },
    { tipo: 'am', guid: amOtra, created_at_device: `${F}T07:00:00-05:00`,
      payload: { captura_guid: 'c05ec8a1-0000-4000-8000-0000000000bb',
        fecha_proceso: `${F}T07:00:00-05:00`, finca_id: 1, responsable_id: 26,
        cultivo_id: 1, lote_id: 5, subtarea_id: 90, modulo_ids: [], personal_id: 301 } },
  ] }),
});

// ------------------------------------------------------------------
// 1. El reparto: cada pantalla ve lo suyo
// ------------------------------------------------------------------
await p.goto(`${APP}/pm`, { waitUntil: 'networkidle' });
await t(2500);
raiz = 'app-pm';
const textoPm = await p.locator(`${raiz} ion-content`).innerText();
ok('01 el PM ya NO muestra la tarea de cosecha',
  textoPm.includes('PODA DE FORMACION') && !textoPm.includes('COSECHA CACAO'),
  textoPm.replace(/\n/g, ' ').slice(0, 110));

await p.goto(`${APP}/cosecha`, { waitUntil: 'networkidle' });
await t(2500);
raiz = 'app-cosecha';
ok('02 la pantalla Cosecha abre',
  await p.locator('ion-title', { hasText: 'Cosecha de Cacao' }).isVisible());
const textoCos = await p.locator(`${raiz} ion-content`).innerText();
ok('03 cosecha muestra SOLO las tareas de cosecha',
  textoCos.includes('COSECHA CACAO') && !textoCos.includes('PODA DE FORMACION'),
  textoCos.replace(/\n/g, ' ').slice(0, 110));

ok('04 no hay selector de trabajador: las personas vienen de la tarea',
  (await p.locator(`${raiz} ion-item`, { hasText: 'Trabajador' }).count()) === 0);

// ------------------------------------------------------------------
// 2. Elegir la persona de la tarea y pesar sus sacos
// ------------------------------------------------------------------
await elegirUno('Finca', 'Bellita');
await campo('Supervisor').click();
await t(600);
await enModal('ion-radio', 'HOLGUIN').click();
await esperarModalCerrado();
await t(250);

await p.locator(`${raiz} ion-item.tarea-am`).first().click();
await t(600);
ok('05 la ventana lista el personal de esa tarea',
  (await p.locator('ion-modal ion-checkbox', { hasText: 'ALAVA TOMALA' }).count()) === 1);
await p.locator('ion-modal ion-checkbox', { hasText: 'ALAVA TOMALA' }).first().click();
await t(300);
await p.locator('ion-modal ion-button', { hasText: 'Listo' }).first().click();
await esperarModalCerrado();
await t(400);

await flecha('siguiente').click();
await t(700);
ok('06 el paso de sacos lo titula la persona de la tarea',
  (await p.locator(`${raiz} .titulo-seccion`).first().innerText()).includes('ALAVA TOMALA'));
ok('07 arranca con un saco vacio', (await filasSaco()) === 1);

await flecha('siguiente').click();
await t(700);
ok('08 sin sacos pesados no se puede cerrar', await deshabilitado(boton('Cerrar')));
await flecha('anterior').click();
await t(700);

await campo('¿Cuántos sacos?').locator('input').fill('20');
await campo('¿Cuántos sacos?').locator('input').blur();
await t(400);
ok('09 se pasa del techo de 15 sacos de z_cosecha_cacao', (await filasSaco()) === 20,
  String(await filasSaco()));
await campo('¿Cuántos sacos?').locator('input').fill('4');
await campo('¿Cuántos sacos?').locator('input').blur();
await t(400);
ok('10 achicar la cantidad saca los vacios del final', (await filasSaco()) === 4);

await ponerLibras(1, 50.5);
await ponerLibras(2, 48.25);
await ponerLibras(3, 51);
await ponerLibras(4, 20);
const totales = async () => (await p.locator(`${raiz} .totales`).allInnerTexts()).join(' | ');
ok('11 el total de libras se calcula en pantalla', (await totales()).includes('169.75'),
  await totales());

await p.locator(`${raiz} ion-item`, { hasText: 'Saco 02' }).first().locator('ion-button').click();
await t(400);
ok('12 quitar un saco renumera y no deja huecos',
  (await p.locator(`${raiz} .numero-saco`).allInnerTexts()).join('|') === 'Saco 01|Saco 02|Saco 03',
  (await p.locator(`${raiz} .numero-saco`).allInnerTexts()).join('|'));
ok('13 el total baja al quitar el saco', (await totales()).includes('121.5'), await totales());

// ------------------------------------------------------------------
// 2b. El servidor lo rechaza: se corrige aqui mismo y se reenvia
// ------------------------------------------------------------------
// Con los sacos ya cargados se fuerza el rechazo corregible del servidor
// ("hora_cierre anterior a la hora de la tarea AM"), que es el que de verdad
// aparece en campo. Lo que se prueba es que la pantalla vuelve CON SUS SACOS:
// volver a teclear veinte pesajes seria peor que el rechazo.
await fetch(`${MOCK}/mock/rechazar_pm`, {
  method: 'POST', body: JSON.stringify({ on: true, tipo: 'cosecha' }),
});
await flecha('siguiente').click();
await t(700);
await boton('Cerrar').click();
await t(3500);
const cRech = await p.evaluate(() => window['__lagricontrol'].sync.conteo());
ok('23r la cosecha vuelve RECHAZADA', cRech.rechazados === 1, JSON.stringify(cRech));

await p.goto(`${APP}/registros?vista=enviados`, { waitUntil: 'networkidle' });
await t(2000);
const tarjRech = p.locator('app-registros ion-item.tarjeta-registro', { hasText: 'Rechazado' });
ok('24r la cosecha rechazada ofrece corregir',
  (await tarjRech.locator('ion-button.corregir').count()) === 1,
  `corregir=${await tarjRech.locator('ion-button.corregir').count()}`);
await tarjRech.locator('ion-button.corregir').first().click();
await t(3000);
raiz = 'app-cosecha';
const tras = await p.evaluate(() => {
  const c = window['ng'].getComponent(document.querySelector('app-cosecha'));
  return { n: c.elegidas().length, sacos: c.elegidas()[0]?.sacos?.length,
           libras: c.totalPesoGeneral(), finca: c.finca()?.nombre,
           supervisor: c.responsable()?.nombre, problemas: c.problemas() };
});
ok('25r la pantalla vuelve con la persona, sus sacos y el encabezado armado',
  tras.n === 1 && tras.sacos === 3 && String(tras.libras) === '121.5' &&
    String(tras.supervisor).includes('HOLGUIN') && tras.problemas.length === 0,
  JSON.stringify(tras));
ok('25r-bis el motivo del rechazo queda a la vista',
  (await p.locator(`${raiz} .banner.correccion`).innerText()).includes('hora_cierre'),
  await p.locator(`${raiz} .banner.correccion`).innerText().catch(() => 'sin banner'));
// Se deja de rechazar y el mismo registro se reenvia: lo que sigue --el payload
// campo por campo-- es el del reenvio.
await fetch(`${MOCK}/mock/rechazar_pm`, {
  method: 'POST', body: JSON.stringify({ on: false, tipo: 'cosecha' }),
});
const guidRechazado = (await lotes())
  .flatMap((l) => l.records ?? [])
  .filter((r) => r.tipo === 'cosecha')
  .pop()?.guid;
// La correccion deja la pantalla en el paso de las tareas; el flujo que sigue
// avanza UN paso, asi que se lo deja donde estaba antes del rechazo.
await p.evaluate(() => {
  const c = window['ng'].getComponent(document.querySelector('app-cosecha'));
  c.irA(c.indiceRevision() - 1);
});
await t(500);

// ------------------------------------------------------------------
// 3. Cerrar y verificar el payload
// ------------------------------------------------------------------
await flecha('siguiente').click();
await t(700);
ok('14 con los sacos cargados el cierre se habilita', !(await deshabilitado(boton('Cerrar'))));

const antes = (await lotes()).length;
await boton('Cerrar').click();
await t(3500);

const enviados = (await lotes()).slice(antes).flatMap((l) => l.records);
const cos = enviados.filter((r) => r.tipo === 'cosecha');
ok('15 se manda un registro de cosecha por persona', cos.length === 1, `records=${cos.length}`);

const c = cos[0];
ok('16 el payload apunta a la tarea AM y no la contradice',
  c.payload.am_guid === amCosecha && c.payload.trabajador_id === 214,
  JSON.stringify({ am: c.payload.am_guid?.slice(0, 8), tr: c.payload.trabajador_id }));

ok('17 no viaja nada que el servidor derive del AM',
  c.payload.finca_id === undefined && c.payload.lote_id === undefined &&
    c.payload.subtarea_id === undefined && c.payload.modulo_id === undefined &&
    c.payload.captura_guid === undefined && c.payload.fecha_proceso === undefined,
  Object.keys(c.payload).join(','));

// La tarea AM tiene UN modulo (02): todos los sacos lo heredan sin preguntar.
ok('18 los sacos viajan renumerados 1..N, con el unico modulo del AM',
  JSON.stringify(c.payload.sacos) ===
    JSON.stringify([{ numero: 1, libras: 50.5, modulo_id: 2 }, { numero: 2, libras: 51, modulo_id: 2 },
                    { numero: 3, libras: 20, modulo_id: 2 }]),
  JSON.stringify(c.payload.sacos));

ok('19 los totales del telefono cuadran con sus sacos',
  c.payload.total_sacos === 3 && c.payload.total_peso === 121.5,
  JSON.stringify({ ts: c.payload.total_sacos, tp: c.payload.total_peso }));

ok('26r el reenvio usa el MISMO guid: el servidor sigue pudiendo deduplicar',
  c.guid === guidRechazado, `rechazado=${guidRechazado} reenviado=${c.guid}`);
ok('27r tras corregir no queda nada rechazado ni pendiente',
  JSON.stringify(await p.evaluate(() => window['__lagricontrol'].sync.conteo()))
    .includes('"rechazados":0'),
  JSON.stringify(await p.evaluate(() => window['__lagricontrol'].sync.conteo())));
ok('20 la hora de cierre viaja con offset',
  /[+-]\d{2}:\d{2}$/.test(String(c.payload.hora_cierre)), String(c.payload.hora_cierre));

// ------------------------------------------------------------------
// 4. La tarea cerrada no vuelve a ofrecerse
// ------------------------------------------------------------------
await p.goto(`${APP}/cosecha`, { waitUntil: 'networkidle' });
await t(2500);
const textoCos2 = await p.locator(`${raiz} ion-content`).innerText();
ok('21 la tarea ya cerrada no vuelve a la lista',
  !textoCos2.includes('COSECHA CACAO'),
  textoCos2.replace(/\n/g, ' ').slice(0, 90));

// ------------------------------------------------------------------
// 5. Una tarea con DOS modulos: se eligen por persona y cada saco dice el suyo
// ------------------------------------------------------------------
const amDos = 'c05ec8a1-0000-4000-8000-000000000003';
await fetch(`${MOCK}/v4/sync`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ device_alias: 'sembrador', device_clock_offset: 0, records: [
    { tipo: 'am', guid: amDos, created_at_device: `${F}T07:00:00-05:00`,
      payload: { captura_guid: 'c05ec8a1-0000-4000-8000-0000000000cc',
        fecha_proceso: `${F}T07:00:00-05:00`, finca_id: 1, responsable_id: 26,
        cultivo_id: 1, lote_id: 1, subtarea_id: 88, modulo_ids: [2, 3], personal_id: 301 } },
  ] }),
});
await p.goto(`${APP}/cosecha`, { waitUntil: 'networkidle' });
await t(2500);
await elegirUno('Finca', 'Bellita');
await campo('Supervisor').click();
await t(600);
await enModal('ion-radio', 'HOLGUIN').click();
await esperarModalCerrado();
await t(250);
await p.locator(`${raiz} ion-item.tarea-am`, { hasText: '02, 03' }).first().click();
await t(600);
await p.locator('ion-modal ion-checkbox', { hasText: 'BRIONES' }).first().click();
await t(300);
await p.locator('ion-modal ion-button', { hasText: 'Listo' }).first().click();
await esperarModalCerrado();
await t(400);
await flecha('siguiente').click();
await t(700);

const itemModulos = p.locator(`${raiz} ion-item.modulos-persona`);
ok('30 con dos modulos en el AM se pide elegir cuales trabajo',
  (await itemModulos.innerText()).includes('Sin elegir'), await itemModulos.innerText());
const probs = () => p.evaluate(() =>
  window['ng'].getComponent(document.querySelector('app-cosecha')).problemas());
ok('31 sin elegir modulo no se puede cerrar',
  (await probs()).some((x) => x.includes('módulos')), JSON.stringify(await probs()));

await itemModulos.click();
await t(600);
for (const m of ['Módulo 02', 'Módulo 03']) {
  await p.locator('ion-modal ion-checkbox', { hasText: m }).first().click();
  await t(250);
}
await p.locator('ion-modal ion-button', { hasText: 'Listo' }).first().click();
await esperarModalCerrado();
await t(400);

const chipsSaco = p.locator(`${raiz} ion-chip.modulo-saco`);
ok('32 con dos modulos elegidos cada saco muestra su modulo',
  (await chipsSaco.count()) === 1, `chips=${await chipsSaco.count()}`);
// Cada toque del selector aplica en vivo: con el primero marcado todos los
// sacos toman ese modulo, y al sumar el segundo lo ya asignado se conserva.
ok('33 al elegir, el saco toma el primer modulo marcado',
  (await chipsSaco.first().innerText()).includes('02'), await chipsSaco.first().innerText());
await ponerLibras(1, 40);
await chipsSaco.first().click();
await t(300);
ok('34 tocar el chip pasa al siguiente modulo',
  (await chipsSaco.first().innerText()).includes('03'), await chipsSaco.first().innerText());
await boton('Agregar saco').click();
await t(400);
ok('35 el saco nuevo sigue en el modulo del anterior',
  (await chipsSaco.nth(1).innerText()).includes('03'), await chipsSaco.nth(1).innerText());
await chipsSaco.nth(1).click();
await t(300);
await ponerLibras(2, 30);
ok('36 el chip da la vuelta entre los modulos elegidos',
  (await chipsSaco.nth(1).innerText()).includes('02'), await chipsSaco.nth(1).innerText());
ok('36b con todos los sacos asignados no queda nada que corregir',
  (await probs()).length === 0, JSON.stringify(await probs()));

await flecha('siguiente').click();
await t(700);
const revision = (await p.locator(`${raiz} .por-modulo`).first().innerText()).replace(/\s+/g, ' ');
ok('37 la revision reparte las libras por modulo',
  revision.includes('Mód. 02: 30 lb') && revision.includes('Mód. 03: 40 lb'), revision);

const antes2 = (await lotes()).length;
await boton('Cerrar').click();
await t(3500);
const cos2 = (await lotes()).slice(antes2).flatMap((l) => l.records).filter((r) => r.tipo === 'cosecha');
ok('38 cada saco viaja con su modulo',
  cos2.length === 1 && JSON.stringify(cos2[0].payload.sacos) ===
    JSON.stringify([{ numero: 1, libras: 40, modulo_id: 3 }, { numero: 2, libras: 30, modulo_id: 2 }]),
  JSON.stringify(cos2[0]?.payload?.sacos));
ok('39 el servidor lo acepta',
  JSON.stringify(await p.evaluate(() => window['__lagricontrol'].sync.conteo())).includes('"rechazados":0'),
  JSON.stringify(await p.evaluate(() => window['__lagricontrol'].sync.conteo())));

// El detalle en Registros muestra cada saco con nombres, no ids.
await p.goto(`${APP}/registros?vista=enviados`, { waitUntil: 'networkidle' });
await t(2000);
await p.locator('app-registros [data-cat="cosecha"] ion-item.categoria-registros').click().catch(() => {});
await t(500);
if ((await p.locator('app-registros ion-item.tarjeta-registro', { hasText: 'BRIONES' }).count()) === 0) {
  await p.locator('app-registros [data-cat="cosecha"] ion-item.categoria-registros').click();
  await t(500);
}
await p.locator('app-registros ion-item.tarjeta-registro', { hasText: 'BRIONES' }).first().click();
await t(1000);
const detSacos = await p.locator('app-detalle-registro').innerText();
ok('40 el detalle lista cada saco con numero, libras, lote y modulo por nombre',
  detSacos.includes('número: 1, libras: 40, lote: 1, módulo: 03') &&
    detSacos.includes('número: 2, libras: 30, lote: 1, módulo: 02') && !detSacos.includes('modulo_id'),
  detSacos.replace(/\n+/g, ' | ').slice(0, 300));

// Kevin, 2026-09-29: una persona en dos modulos se ve como dos bloques, cada
// uno con sus sacos y sus totales.
const bloquesDet = await p.locator('app-detalle-registro ion-list.bloque-registro').allInnerTexts();
const b02 = bloquesDet.find((x) => x.includes('BRIONES MERO JUAN · Mód. 02')) ?? '';
const b03 = bloquesDet.find((x) => x.includes('BRIONES MERO JUAN · Mód. 03')) ?? '';
ok('41 el detalle parte la cosecha en un bloque por modulo',
  bloquesDet.length === 2 && !!b02 && !!b03, bloquesDet.map((x) => x.split('\n').slice(0, 3).join(' ')).join(' || '));
ok('42 cada bloque trae solo sus sacos y sus totales',
  /Total de sacos\s*1/.test(b02) && /Peso total\s*30/.test(b02) && !b02.includes('libras: 40') &&
    /Total de sacos\s*1/.test(b03) && /Peso total\s*40/.test(b03) && !b03.includes('libras: 30'),
  (b02 + ' || ' + b03).replace(/\n+/g, ' ').slice(0, 300));

// ------------------------------------------------------------------
// 6. Resumen semanal por fecha, lote y modulo (Kevin, 2026-09-29)
// ------------------------------------------------------------------
await p.goto(`${APP}/cosecha`, { waitUntil: 'networkidle' });
await t(2000);
await p.locator('app-cosecha ion-segment-button[value="resumen"]').click();
await t(1500);
const cards = await p.locator('app-cosecha-resumen .card-resumen').allInnerTexts();
const plano = (x) => x.replace(/\s+/g, ' ');
const c02 = plano(cards.find((x) => /Módulo\s*02/.test(x)) ?? '');
const c03 = plano(cards.find((x) => /Módulo\s*03/.test(x)) ?? '');
ok('50 el resumen arma una card por fecha, lote y modulo',
  cards.length === 2 && !!c02 && !!c03, cards.map(plano).join(' || '));
ok('51 la card suma personas, sacos y libras del modulo',
  /2 Personas 4 Sacos 151.5 Total lb/.test(c02) && /1 Personas 1 Sacos 40 Total lb/.test(c03),
  c02 + ' || ' + c03);
ok('52 la barra de pasos no aparece en el resumen',
  (await p.locator('app-cosecha app-barra-pasos').count()) === 0);
const sup = p.locator('app-cosecha-resumen .supervisor').first();
const ws = () => sup.evaluate((e) => getComputedStyle(e).whiteSpace);
const antesWs = await ws();
await sup.click();
await t(200);
ok('53 el supervisor va en una linea y al tocarlo se despliega',
  antesWs === 'nowrap' && (await ws()) === 'normal', `${antesWs} -> ${await ws()}`);
await p.locator('app-cosecha-resumen ion-button.semana-anterior').click();
await t(400);
ok('54 la semana anterior sale vacia',
  (await p.locator('app-cosecha-resumen .card-resumen').count()) === 0);
const botonSig = p.locator('app-cosecha-resumen ion-button.semana-siguiente');
await botonSig.click();
await t(400);
ok('55 al volver a la semana actual reaparecen las cards y no se avanza mas',
  (await p.locator('app-cosecha-resumen .card-resumen').count()) === 2 &&
    (await botonSig.getAttribute('aria-disabled')) === 'true');

ok('22 sin errores de JavaScript en toda la sesion', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLO(S)`);
process.exit(fallos === 0 ? 0 : 1);
