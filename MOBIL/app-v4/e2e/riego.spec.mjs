/**
 * Pruebas e2e de la pantalla Riego (paso 7 del plan).
 *
 * Riego es una BITACORA, no un cierre (Kevin, 2026-09-03): no lee tareas AM,
 * no elige trabajador y no toca `reg_am`. Lo que verifican, que es lo que no
 * se ve leyendo el codigo:
 *  - la carga es por LOTE con varios modulos de una vez: un parte real son
 *    18-25 filas y una pasada por fila era el formulario de v3;
 *  - el tiempo sale de los seis chips frecuentes (94,6 % de las 9.778 filas de
 *    v3) y viaja en MINUTOS, no como 'HH:MM';
 *  - el volumen es opcional y viaja en 0, como el 99,98 % de la data vieja;
 *  - el payload NO lleva subtarea_id ni captura_guid: columnas que no existen
 *    o que estan muertas;
 *  - repetir (lote, modulo) AVISA pero no bloquea: regar dos veces el mismo
 *    modulo en un dia pasa de verdad;
 *  - cambiar la finca borra lo cargado, porque los lotes son de una finca.
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
const raiz = 'app-riego';
const campo = (texto) => p.locator(`${raiz} ion-item`, { hasText: texto }).first();
const boton = (texto) => p.locator(`${raiz} ion-button`, { hasText: texto }).first();
const deshabilitado = async (loc) => (await loc.getAttribute('aria-disabled')) === 'true';
const chip = (hhmm) => p.locator(`${raiz} ion-button.chip-tiempo`, { hasText: hhmm }).first();
const filas = () => p.locator(`${raiz} ion-item.fila-riego`);
const conteo = () => p.evaluate(() => window['__lagricontrol'].sync.conteo());

const esperarModalCerrado = () =>
  p.waitForFunction(() => document.querySelectorAll('ion-modal.show-modal').length === 0,
    { timeout: 5000 });
const cerrarTocandoFuera = async () => {
  await p.mouse.click(8, 8);
  await esperarModalCerrado();
  await t(250);
};

async function elegirUno(etiqueta, opcion) {
  await campo(etiqueta).click();
  await t(400);
  await p.locator('ion-modal ion-radio', { hasText: opcion }).first().click();
  await esperarModalCerrado();
  await t(300);
}

async function elegirVarios(etiqueta, opciones) {
  await campo(etiqueta).click();
  await t(500);
  for (const o of opciones) {
    await p.locator('ion-modal ion-checkbox', { hasText: o }).first().click();
    await t(250);
  }
  await cerrarTocandoFuera();
}

// ------------------------------------------------------------------
// 0. Configuracion y catalogos
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

const celda = p.locator('button.celda', { hasText: 'Riego' });
ok('00 la celda Riego ya no esta deshabilitada',
  (await celda.count()) === 1 &&
    !(await celda.first().getAttribute('class')).includes('deshabilitada'));

await celda.first().click();
await t(2000);
ok('01 la pantalla abre desde el menu',
  await p.locator('ion-title', { hasText: 'Riego' }).first().isVisible());

// ------------------------------------------------------------------
// 1. El encabezado del registro
// ------------------------------------------------------------------
const textoInicial = await p.locator(`${raiz} ion-content`).innerText();
ok('02 la pantalla NO pide trabajador ni tarea: es una bitacora',
  !textoInicial.includes('Trabajador') && !textoInicial.includes('Subtarea') &&
    !textoInicial.includes('Tarea'),
  textoInicial.replace(/\n/g, ' ').slice(0, 90));

ok('03 sin nada cargado, Guardar esta bloqueado',
  await deshabilitado(boton('Guardar registro')));

await elegirUno('Finca', 'Bellita');
await t(400);
await campo('Supervisor').click();
await t(500);
const opcionesSup = await p.locator('ion-modal ion-radio').allInnerTexts();
ok('04 el supervisor sale del filtro de rol 8, no de todo el personal',
  opcionesSup.length === 1 && opcionesSup[0].includes('HOLGUIN'),
  opcionesSup.join(' | '));
await p.locator('ion-modal ion-radio', { hasText: 'HOLGUIN' }).first().click();
await esperarModalCerrado();
await t(300);

// ------------------------------------------------------------------
// 2. Modulos: solo si el lote los tiene
// ------------------------------------------------------------------
// 'Lote 5' entero, no '5': el detalle del lote 1 dice "12.5 ha" y un hasText
// de '5' matchea ESE primero. La prueba fallaba por el localizador, no por la
// pantalla.
await elegirUno('Lote', 'Lote 5');
await t(300);
ok('05 un lote sin modulos no muestra el campo Modulos',
  (await p.locator(`${raiz} .elegir-modulos`).count()) === 0);

await elegirUno('Lote', 'Lote 1');
await t(300);
ok('06 un lote con modulos si lo muestra',
  (await p.locator(`${raiz} .elegir-modulos`).count()) === 1);

// ------------------------------------------------------------------
// 3. La carga: un lote, varios modulos, un tiempo
// ------------------------------------------------------------------
ok('07 el tiempo arranca en 01:00, que es el mas frecuente de v3',
  (await p.locator(`${raiz} .tiempo-libre input`).inputValue()) === '01:00',
  await p.locator(`${raiz} .tiempo-libre input`).inputValue());

await elegirVarios('Módulos regados', ['Módulo 02', 'Módulo 03']);
await t(300);
ok('08 el boton dice cuantos registros va a crear',
  (await boton('Agregar').innerText()).toLowerCase().includes('2 registros'),
  await boton('Agregar').innerText());

await chip('01:30').click();
await t(300);
await boton('Agregar').click();
await t(600);
ok('09 un lote con dos modulos genera DOS filas de una vez',
  (await filas().count()) === 2, `filas=${await filas().count()}`);
ok('10 las dos filas heredan el tiempo elegido con el chip',
  (await p.locator(`${raiz} .tiempo-fila`).first().innerText()).trim() === '01:30',
  await p.locator(`${raiz} .tiempo-fila`).first().innerText());
ok('11 el total del registro se suma solo',
  (await p.locator(`${raiz} .total-tiempo`).innerText()).includes('03:00'),
  await p.locator(`${raiz} .total-tiempo`).innerText());
ok('12 agregado, los modulos se limpian y el lote NO',
  (await campo('Lote').innerText()).includes('Lote 1') &&
    (await campo('Módulos regados').innerText()).includes('Sin elegir'),
  (await campo('Lote').innerText()).replace(/\n/g, ' '));

// Un lote sin modulos entra como una sola fila, con modulo nulo.
await elegirUno('Lote', 'Administrativos');
await t(300);
await boton('Agregar').click();
await t(600);
ok('13 un lote sin modulos agrega una sola fila',
  (await filas().count()) === 3, `filas=${await filas().count()}`);
ok('14 al lote con nombre no se le antepone "Lote"',
  (await filas().nth(2).innerText()).includes('Administrativos') &&
    !(await filas().nth(2).innerText()).includes('Lote Administrativos'),
  (await filas().nth(2).innerText()).replace(/\n/g, ' ').slice(0, 40));

// ------------------------------------------------------------------
// 4. Editar una fila: tiempo libre, volumen y observaciones
// ------------------------------------------------------------------
await p.locator(`${raiz} ion-button.editar-fila`).first().click();
await t(500);
await p.locator(`${raiz} .tiempo-fila-libre input`).fill('02:20');
await p.locator(`${raiz} .tiempo-fila-libre input`).blur();
await t(400);
await p.locator(`${raiz} .volumen-fila input`).fill('12.5');
await p.locator(`${raiz} .volumen-fila input`).blur();
await t(300);
await p.locator(`${raiz} .obs-fila-input input`).fill('valvula 3 con fuga');
await p.locator(`${raiz} .obs-fila-input input`).blur();
await t(400);
ok('15 el tiempo libre acepta un valor fuera de los seis chips',
  (await p.locator(`${raiz} .tiempo-fila`).first().innerText()).trim() === '02:20',
  await p.locator(`${raiz} .tiempo-fila`).first().innerText());
ok('16 el volumen y las observaciones quedan en la fila',
  (await filas().first().innerText()).includes('12.5') &&
    (await filas().first().innerText()).includes('fuga'),
  (await filas().first().innerText()).replace(/\n/g, ' ').slice(0, 80));

// ------------------------------------------------------------------
// 5. Repetir un modulo AVISA, no bloquea
// ------------------------------------------------------------------
await elegirUno('Lote', 'Lote 1');
await t(300);
await elegirVarios('Módulos regados', ['Módulo 02']);
await t(300);
await boton('Agregar').click();
await t(600);
ok('17 regar dos veces el mismo modulo avisa',
  (await p.locator(`${raiz} .avisos-registro`).count()) === 1 &&
    (await p.locator(`${raiz} .avisos-registro`).innerText()).includes('más de una vez'),
  (await p.locator(`${raiz} .avisos-registro`).innerText()).replace(/\n/g, ' ').slice(0, 70));
ok('18 pero NO bloquea: en el campo se riega dos veces de verdad',
  !(await deshabilitado(boton('Guardar registro'))));

await p.locator(`${raiz} ion-button.quitar-fila`).last().click();
await t(500);
ok('19 quitar la fila repetida saca el aviso',
  (await filas().count()) === 3 && (await p.locator(`${raiz} .avisos-registro`).count()) === 0,
  `filas=${await filas().count()}`);

// ------------------------------------------------------------------
// 6. Cambiar la finca borra lo cargado
// ------------------------------------------------------------------
await elegirUno('Finca', 'Pacaritambo');
await t(600);
ok('20 cambiar la finca borra las filas: los lotes son de una finca',
  (await filas().count()) === 0, `filas=${await filas().count()}`);
ok('21 y tambien saca al supervisor que no es de esa finca',
  (await campo('Supervisor').innerText()).includes('Sin elegir'),
  (await campo('Supervisor').innerText()).replace(/\n/g, ' '));

// ------------------------------------------------------------------
// 7. El registro que se envia
// ------------------------------------------------------------------
await elegirUno('Finca', 'Bellita');
await t(500);
await elegirUno('Supervisor', 'HOLGUIN');
await t(300);
await elegirUno('Lote', 'Lote 1');
await t(300);
await elegirVarios('Módulos regados', ['Módulo 02', 'Módulo 03']);
await t(300);
await chip('00:45').click();
await t(300);
await boton('Agregar').click();
await t(600);
await p.locator(`${raiz} ion-button.editar-fila`).first().click();
await t(500);
await p.locator(`${raiz} .volumen-fila input`).fill('30');
await p.locator(`${raiz} .volumen-fila input`).blur();
await t(400);

await boton('Guardar registro').click();
await t(3500);

const recibidos = (await lotes()).flatMap((l) => l.records ?? []);
const riegos = recibidos.filter((r) => r.tipo === 'riego');
ok('22 cada fila viaja como su propio registro de tipo riego',
  riegos.length === 2, `n=${riegos.length}`);

const pl = riegos.map((r) => r.payload);
ok('23 el tiempo viaja en MINUTOS, no como "HH:MM"',
  pl.every((x) => x.tiempo_riego_min === 45), JSON.stringify(pl.map((x) => x.tiempo_riego_min)));
ok('24 cada fila lleva SU modulo, no una lista',
  JSON.stringify(pl.map((x) => x.modulo_id).sort()) === '[2,3]',
  JSON.stringify(pl.map((x) => x.modulo_id)));
ok('25 el payload no lleva subtarea_id ni captura_guid: no existen para riego',
  pl.every((x) => !('subtarea_id' in x) && !('captura_guid' in x)),
  JSON.stringify(Object.keys(pl[0])));
ok('26 el volumen cargado viaja, y el que no se cargo viaja en 0',
  pl.some((x) => x.volumen_riego === 30) && pl.some((x) => x.volumen_riego === 0),
  JSON.stringify(pl.map((x) => x.volumen_riego)));
ok('27 fecha_proceso viaja ISO-8601 CON offset',
  pl.every((x) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(x.fecha_proceso)),
  pl[0].fecha_proceso);
ok('28 el registro lleva finca, supervisor y lote propios: es su unica fuente',
  pl.every((x) => x.finca_id === 1 && x.supervisor_id === 26 && x.lote_id === 1),
  JSON.stringify({ f: pl[0].finca_id, s: pl[0].supervisor_id, l: pl[0].lote_id }));

const c = await conteo();
ok('29 con ACK del servidor no queda nada pendiente',
  c.pendientes === 0 && c.enviados === 2 && c.rechazados === 0, JSON.stringify(c));

// ------------------------------------------------------------------
// 8. En Registros el registro se lee sin ids
// ------------------------------------------------------------------
await p.goto(`${APP}/registros?vista=enviados`, { waitUntil: 'networkidle' });
await t(2500);
const tarjetas = p.locator('app-registros ion-item.tarjeta-registro');
const textoTarjetas = await tarjetas.first().innerText();
ok('30 la tarjeta dice Riego, el lote con su modulo y el tiempo regado',
  textoTarjetas.includes('Riego') && textoTarjetas.includes('Mód.') &&
    textoTarjetas.includes('00:45 de riego'),
  textoTarjetas.replace(/\n/g, ' ').slice(0, 90));
ok('31 los dos modulos son DOS tarjetas, no una',
  (await tarjetas.count()) === 2, `tarjetas=${await tarjetas.count()}`);
ok('32 la tarjeta nombra al supervisor, que es el unico nombre que hay',
  textoTarjetas.includes('HOLGUIN'), textoTarjetas.replace(/\n/g, ' ').slice(0, 90));

ok('33 sin errores de JavaScript en toda la sesion', errs.length === 0, errs.join(' | '));
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLO(S)`);
await browser.close();
process.exit(fallos === 0 ? 0 : 1);
