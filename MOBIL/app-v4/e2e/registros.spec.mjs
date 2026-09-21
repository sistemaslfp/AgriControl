/**
 * Pruebas e2e de la pantalla Registros — Pendientes / Enviados
 * (paso 4 del plan; MOBIL/03-pantallas.md).
 *
 * Lo que verifican, que es lo que no se puede comprobar leyendo el codigo:
 *  - los TRES estados tienen tres indicadores distintos, y el motivo del
 *    rechazo se lee sin abrir nada (correccion del "reloj de arena" unico de
 *    la app vieja);
 *  - las tarjetas agrupan por TAREA, no una por persona;
 *  - un PENDIENTE se puede descartar y deja asiento en sync_audit;
 *  - un ENVIADO o un RECHAZADO NO ofrecen descartar: solo se descarta lo que
 *    nunca llego al servidor;
 *  - el boton de la barra FUERZA el envio de la cola, no solo recarga;
 *  - `captura_guid` es por TAREA: un AM de dos tareas manda dos guid distintos
 *    (estuvo mal hasta el 2026-09-02, era uno por envio del formulario).
 *
 * Requiere: build de desarrollo servido en :8099 y mock-v4.mjs en :8098.
 * Ver README.md de esta carpeta.
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

const raiz = 'app-registros';
const tarjetas = () => p.locator(`${raiz} ion-item.tarjeta-registro`);
const conteo = () => p.evaluate(() => window['__lagricontrol'].sync.conteo());

/** Lee sync_audit por el hook de desarrollo, para probar el asiento. */
const auditoria = () =>
  p.evaluate(() => window['__lagricontrol'].sync.auditoriaReciente(100));

/**
 * Encola registros directamente por el servicio, sin pasar por las pantallas
 * de captura. Esta suite prueba la pantalla de LISTADO: armar los registros a
 * mano deja escenarios que por la UI costarian tres minutos cada uno.
 */
const encolar = (tipo, payload) =>
  p.evaluate(
    ([tp, pl]) => window['__lagricontrol'].sync.enqueue(tp, pl),
    [tipo, payload],
  );

// ------------------------------------------------------------------
// 0. Configuracion
// ------------------------------------------------------------------
await modo('ok');
await p.goto(`${APP}/configuracion`, { waitUntil: 'networkidle' });
await t(2500);
await p.locator('ion-input[placeholder="https://servidor.com/v4"] input').fill(`${MOCK}/v4`);
await p.locator('ion-input[placeholder="TABLET-BELLITA-02"] input').fill('tablet-e2e');
// El "Guardar" NO es decorativo: sin el, la URL no se persiste, no bajan los
// catalogos y la cola tampoco tiene a donde enviar. Se paga con la tarjeta
// mostrando "#301" y con enviados=0, que parecen dos bugs distintos.
await p.getByText('Guardar', { exact: true }).click();
await t(1800);

// Sin catalogos la tarjeta no puede resolver lote, subtarea ni nombres, y
// muestra "#301" y "Sin datos de catalogo" -- que es el comportamiento
// correcto, pero no es lo que esta suite quiere probar.
await p.goto(`${APP}/menu`, { waitUntil: 'networkidle' });
await t(1500);
await p.locator('button.celda', { hasText: 'Actualizar Maestros' }).click();
await t(3000);
ok('00 catálogos descargados', await p.locator('button.celda', { hasText: 'AM' }).first().isVisible());

// ------------------------------------------------------------------
// 1. La pantalla abre desde las DOS entradas del menu
// ------------------------------------------------------------------
await p.goto(`${APP}/registros?vista=pendientes`, { waitUntil: 'networkidle' });
await t(1500);
ok('01 la pantalla Registros abre', await p.locator('ion-title', { hasText: 'Registros' }).isVisible());
// El estado del segmento se lee del componente, no del DOM: `aria-selected` y
// `ng-reflect-*` no estan en un build sin debug, y una prueba que los mire pasa
// o falla segun como se compilo, no segun lo que hace la pantalla.
const vistaActiva = () =>
  p.evaluate(() => window['ng'].getComponent(document.querySelector('app-registros')).vista());
ok('02 entra en la pestaña que pide el menú', (await vistaActiva()) === 'pendientes',
  await vistaActiva());

await p.goto(`${APP}/registros?vista=enviados`, { waitUntil: 'networkidle' });
await t(1500);
ok('03 la otra entrada del menú abre la misma pantalla en Enviados',
  (await vistaActiva()) === 'enviados', await vistaActiva());

// ------------------------------------------------------------------
// 2. Pendientes: agrupa por tarea y muestra el estado
// ------------------------------------------------------------------
// Sin servidor no hay envio: la cola queda PENDIENTE y se puede mirar.
await modo('501');

// Una tarea con DOS personas (mismo captura_guid) y otra tarea con una.
const capturaA = '11111111-1111-4111-8111-111111111111';
const capturaB = '22222222-2222-4222-8222-222222222222';
const base = {
  fecha_proceso: '2026-09-02T07:30:00-05:00',
  finca_id: 1,
  responsable_id: 26,
  cultivo_id: 1,
  comentario: '',
};
await encolar('am', { ...base, captura_guid: capturaA, lote_id: 1, subtarea_id: 88, modulo_ids: [2], personal_id: 214 });
await encolar('am', { ...base, captura_guid: capturaA, lote_id: 1, subtarea_id: 88, modulo_ids: [2], personal_id: 301 });
await encolar('am', { ...base, captura_guid: capturaB, lote_id: 5, subtarea_id: 90, modulo_ids: [], personal_id: 400 });
await t(2500);

await p.goto(`${APP}/registros?vista=pendientes`, { waitUntil: 'networkidle' });
await t(2000);
ok('04 tres registros de dos tareas dan DOS tarjetas',
  (await tarjetas().count()) === 2, `tarjetas=${await tarjetas().count()}`);

const conDos = p.locator(`${raiz} ion-item.tarjeta-registro`, { hasText: '2 registros' });
ok('05 la tarjeta de la tarea con dos personas lo dice',
  (await conDos.count()) === 1, `con "2 registros"=${await conDos.count()}`);
const textoConDos = await conDos.first().innerText();
ok('06 la tarjeta resuelve lote y subtarea contra los catálogos',
  textoConDos.includes('Lote 1') && textoConDos.includes('COSECHA CACAO'), textoConDos);
// nombreLote() ya antepone "Lote" a los numericos; volver a anteponerlo daba
// "Lote Lote 1", y en un lote con nombre daria "Lote Administrativos".
ok('06b el nombre del lote no lleva "Lote" dos veces',
  !textoConDos.includes('Lote Lote'), textoConDos);
ok('07 el estado PENDIENTE se dice con palabras, no solo con un ícono',
  (await conDos.first().innerText()).includes('Pendiente'));
// El UUID NO va en la tarjeta: no le dice nada a quien mira la lista. Sigue
// siendo la unica forma de rastrear un registro entre telefono y servidor, asi
// que su lugar es Detalle Registro.
ok('08 la tarjeta no muestra el UUID',
  !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(textoConDos),
  textoConDos);
// La TAREA da el contexto que la subtarea sola no tiene.
ok('08b la tarjeta muestra Tarea / Subtarea, no solo la subtarea',
  textoConDos.includes('/') && textoConDos.includes('COSECHA CACAO'), textoConDos);
// Nada de codigos: ni ids de personal ni "#301".
ok('08c la tarjeta nombra a las personas, no las numera',
  !textoConDos.includes('#') && /[A-ZÁÉÍÓÚÑ]{3,}/.test(textoConDos), textoConDos);
ok('08d la tarjeta muestra el módulo junto al lote',
  textoConDos.includes('Mód.'), textoConDos);

// ------------------------------------------------------------------
// 2a. Detalle Registro: el payload campo por campo, con el UUID
// ------------------------------------------------------------------
const detalleAbierto = () =>
  p.evaluate(() =>
    window['ng'].getComponent(document.querySelector('app-registros')).detalleTarjeta() !== null);

await conDos.first().click();
await t(600);
ok('08h tocar la tarjeta abre Detalle Registro', await detalleAbierto());
const detalle = p.locator('app-detalle-registro');
const textoDetalle = await detalle.innerText();
ok('08i el detalle SI muestra el UUID de cada registro (la tarjeta no)',
  (textoDetalle.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g) ?? []).length >= 2,
  textoDetalle.slice(0, 300));
ok('08j el detalle separa un bloque por persona de la tarjeta',
  textoDetalle.includes('Registro 1 de 2') && textoDetalle.includes('Registro 2 de 2'),
  textoDetalle.slice(0, 300));
ok('08k el detalle NO muestra ningún id ni guid del payload (Kevin, 2026-09-09)',
  !/Finca id|Cultivo id|Subtarea id|Trabajador id|Responsable id|Captura guid|Am guid|Modulo ids?|Personal id|Lote id|Id en el servidor/i.test(textoDetalle),
  textoDetalle.slice(0, 400));
ok('08k2 el detalle SI muestra los campos que no son id, tal cual viajan',
  textoDetalle.includes('Fecha del proceso'), textoDetalle.slice(0, 400));
await p.locator('app-detalle-registro ion-button.boton-cerrar').click();
await t(500);
ok('08l "Cerrar" cierra Detalle Registro', !(await detalleAbierto()));

// Descartar tiene su propio click: no debe abrir Detalle Registro de paso.
await conDos.locator('ion-button.descartar').click();
await t(500);
ok('08m el botón de descartar no abre Detalle Registro', !(await detalleAbierto()));
await p.locator('ion-alert button', { hasText: 'Cancelar' }).click();
await t(500);

// El contador del segmento y el chip salen de la MISMA fuente: si discrepan,
// uno de los dos miente. Paso: el segmento decia ENVIADOS (0) con 3 rechazados,
// porque sumaba solo `enviados` e ignoraba `rechazados`.
const segPend = await p.locator(`${raiz} ion-segment-button[value="pendientes"]`).innerText();
const segEnv = await p.locator(`${raiz} ion-segment-button[value="enviados"]`).innerText();
ok('08g el contador de la pestaña coincide con lo que hay en la lista',
  segPend.includes('(3)') && segEnv.includes('(0)'), `${segPend} | ${segEnv}`);

// --- el chip: un modulo, lo que le falta subir ---
const chips = p.locator(`${raiz} ion-chip.chip-modulo`);
ok('08e hay un chip por módulo con pendientes, no uno por registro',
  (await chips.count()) === 1, `chips=${await chips.count()}`);
const textoChip = await chips.first().innerText();
// El chip es un PENDIENTE, no una estadistica: una sola cuenta y sin "0/3".
ok('08f el chip lleva sólo lo que falta subir, sin la cuenta de enviados',
  /AM\s*3/.test(textoChip.replace(/\n/g, ' ')) && !textoChip.includes('/'), textoChip);

// ------------------------------------------------------------------
// 3. Descartar un PENDIENTE
// ------------------------------------------------------------------
const antes = (await conteo()).pendientes;
// La tarjeta de DOS personas, no la primera de la lista: lo que se prueba es
// que descartar se lleva los N registros de la tarjeta, no uno.
await conDos.locator('ion-button.descartar').click();
await t(700);
ok('09 descartar pide confirmación nombrando la tarea, no un guid',
  (await p.locator('ion-alert').innerText()).includes('Lote'),
  (await p.locator('ion-alert').innerText()).slice(0, 90));
await p.locator('ion-alert button', { hasText: 'Descartar' }).click();
await t(1500);

const despues = (await conteo()).pendientes;
ok('10 descartar saca de la cola los registros de esa tarjeta',
  despues === antes - 2, `antes=${antes} despues=${despues}`);
ok('11 la tarjeta desaparece de la lista',
  (await tarjetas().count()) === 1, `tarjetas=${await tarjetas().count()}`);

const audit = await auditoria();
const descartes = audit.filter((a) => a.evento === 'DESCARTE_PENDIENTE');
ok('12 cada descarte deja asiento en sync_audit',
  descartes.length === 2, `asientos=${descartes.length}`);
ok('13 el asiento guarda el payload entero, no solo el guid',
  descartes.length > 0 && String(descartes[0].detalle).includes('subtarea_id'),
  descartes.length > 0 ? String(descartes[0].detalle).slice(0, 70) : 'sin asientos');

// ------------------------------------------------------------------
// 4. El botón de la barra FUERZA el envío
// ------------------------------------------------------------------
await modo('ok');
await p.locator(`${raiz} ion-button.sincronizar`).click();
await t(3000);
const c = await conteo();
ok('14 el botón de la barra envía la cola, no sólo recarga la lista',
  c.pendientes === 0 && c.enviados >= 1, JSON.stringify(c));
ok('15 vaciada la cola, Pendientes lo dice en vez de quedar en blanco',
  (await p.locator(`${raiz} .sin-registros`).innerText()).includes('llegó al servidor'),
  await p.locator(`${raiz} .sin-registros`).innerText());
// LO QUE PIDIO KEVIN (2026-09-08): subido al servidor, el chip se va. Antes
// quedaba como "AM 0/3" y habia que leer un cero para saber que no pedia nada.
ok('15b enviado todo, el chip del módulo desaparece',
  (await chips.count()) === 0, `chips=${await chips.count()}`);

// ------------------------------------------------------------------
// 5. Enviados y rechazados
// ------------------------------------------------------------------
await p.locator(`${raiz} ion-segment-button[value="enviados"]`).click();
await t(1500);
ok('16 lo enviado aparece en la otra pestaña',
  (await tarjetas().count()) >= 1, `tarjetas=${await tarjetas().count()}`);
ok('17 un ENVIADO no ofrece descartar: ya está en el servidor',
  (await p.locator(`${raiz} ion-item.tarjeta-registro ion-button.descartar`).count()) === 0);
ok('17b la pestaña Enviados no muestra chips: ahí no falta subir nada',
  (await chips.count()) === 0, `chips=${await chips.count()}`);

// Un rechazo real, con su motivo.
await modo('rechaza');
await encolar('am', { ...base, captura_guid: '33333333-3333-4333-8333-333333333333',
  lote_id: 1, subtarea_id: 88, modulo_ids: [2], personal_id: 214 });
await t(1000);
await p.evaluate(() => window['__lagricontrol'].sync.flush('e2e', true));
await t(3000);
await p.goto(`${APP}/registros?vista=enviados`, { waitUntil: 'networkidle' });
await t(2000);

const rechazada = p.locator(`${raiz} ion-item.tarjeta-registro`, { hasText: 'Rechazado' });
ok('18 un rechazo aparece como RECHAZADO, no como pendiente',
  (await rechazada.count()) === 1, `rechazadas=${await rechazada.count()}`);
// El motivo se lee sin abrir nada Y sin ids: el servidor los reescribio con
// nombres (V4.php sync_nombre), asi que "subtarea 88 inactiva" ya no existe.
const textoRechazo = await rechazada.first().innerText();
ok('19 el motivo del rechazo se lee sin abrir nada',
  textoRechazo.includes('COSECHA CACAO') && textoRechazo.includes('inactiva'), textoRechazo);
// Se mira SOLO la linea del motivo: la tarjeta entera trae "Mód. 02" y una
// fecha, que son datos del negocio y no ids. Apuntar a la tarjeta completa
// hacia fallar esto por el nombre de un modulo.
const soloMotivo = await rechazada.first().locator('.motivo-rechazo').innerText();
ok('19b el motivo no trae ids ni jerga',
  !/\bsubtarea \d+\b/.test(soloMotivo) && !soloMotivo.includes('I1') &&
    !soloMotivo.includes('_id'),
  soloMotivo);
// Kevin, 2026-09-21: un rechazado SI se puede sacar de la cola. El servidor no
// lo aplico, asi que descartarlo no deja nada a medias --y si el motivo no se
// arregla editando, es lo unico que se puede hacer con el.
ok('20 un RECHAZADO ofrece descartar',
  (await rechazada.first().locator('ion-button.descartar').count()) === 1);
// Este rechazo es de un AM, y la precarga por ahora solo existe en PM: sin
// pantalla a donde ir, no se ofrece corregir.
ok('20c un rechazo de un tipo sin pantalla de correccion no ofrece corregir',
  (await rechazada.first().locator('ion-button.corregir').count()) === 0);

// Un rechazado cuenta del lado de Enviados --es donde esta-- pero se dice
// aparte: es el unico estado que necesita que alguien haga algo, y esconderlo
// dentro de "enviados" lo vuelve invisible.
const segEnv2 = await p.locator(`${raiz} ion-segment-button[value="enviados"]`).innerText();
// Ionic pone el segmento en MAYUSCULAS por CSS, y innerText devuelve el texto
// ya transformado: comparar sensible a mayusculas falla por el estilo, no por
// el contenido.
ok('20b el rechazado cuenta en Enviados y además se dice aparte',
  segEnv2.toLowerCase().includes('rechazado'), segEnv2);

// ------------------------------------------------------------------
// 6. Las personas de UNA MISMA tarea sí comparten tarjeta
// ------------------------------------------------------------------
// (Que dos TAREAS distintas lleven guid distinto se prueba en am-pm.spec.mjs
//  16b, que es donde hay un formulario real de dos tareas.)
await modo('501');
const capturaC = '44444444-4444-4444-8444-444444444444';
for (const pid of [214, 301, 400]) {
  await encolar('am', { ...base, captura_guid: capturaC, lote_id: 5, subtarea_id: 90,
    modulo_ids: [], personal_id: pid });
}
await t(2000);
await p.goto(`${APP}/registros?vista=pendientes`, { waitUntil: 'networkidle' });
await t(2000);
const tresPersonas = p.locator(`${raiz} ion-item.tarjeta-registro`, { hasText: '3 registros' });
ok('21 tres personas de la misma tarea son UNA tarjeta',
  (await tresPersonas.count()) === 1 && (await tarjetas().count()) === 1,
  `con "3 registros"=${await tresPersonas.count()} total=${await tarjetas().count()}`);
ok('21b la tarjeta resume a las personas sin listarlas todas',
  (await tresPersonas.first().innerText()).includes('más'),
  await tresPersonas.first().innerText());

// ------------------------------------------------------------------
ok('22 sin errores de JavaScript en toda la sesión', errs.length === 0, errs.join(' | '));
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLO(S)`);
await browser.close();
process.exit(fallos === 0 ? 0 : 1);
