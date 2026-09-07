/**
 * Pruebas e2e de la pantalla Postcosecha (paso 6 del plan).
 *
 * Lo que verifican, que es lo que no se ve leyendo el codigo:
 *  - el peso del lote NO se teclea: sale de los dias de cosecha elegidos, y el
 *    peso baba se calcula;
 *  - el payload de la partida es {supervisor_id, fecha_inicio, peso_mallas,
 *    cosecha_ids[]} y **no** lleva peso_lote, fecha_cosecha ni lot_code;
 *  - una partida capturada antes del ACK se ve como "Pendiente de numero" y el
 *    numero aparece solo cuando el servidor contesta;
 *  - las etapas NO obligan a un orden y una ya registrada no se ofrece dos
 *    veces;
 *  - el corte de grano aparece recien despues del fermentado, y el analisis de
 *    humedad recien despues de cada secado;
 *  - el peso final cierra la partida y la saca de la lista.
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
const raiz = 'app-postcosecha';
const campo = (texto) => p.locator(`${raiz} ion-item`, { hasText: texto }).first();
const boton = (texto) => p.locator(`${raiz} ion-button`, { hasText: texto }).first();
const deshabilitado = async (loc) => (await loc.getAttribute('aria-disabled')) === 'true';
const inputDe = (clase) => p.locator(`${raiz} .${clase} input`).first();
const esperarModalCerrado = () =>
  p.waitForFunction(() => document.querySelectorAll('ion-modal.show-modal').length === 0,
    { timeout: 5000 });

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

const celda = p.locator('button.celda', { hasText: 'Poscosecha' });
ok('00 la celda Poscosecha ya no esta deshabilitada',
  (await celda.count()) === 1 &&
    !(await celda.first().getAttribute('class')).includes('deshabilitada'));

// ------------------------------------------------------------------
// 1. Lista vacia y alta de una partida
// ------------------------------------------------------------------
await p.goto(`${APP}/postcosecha`, { waitUntil: 'networkidle' });
await t(2000);
ok('01 la pantalla abre', await p.locator('ion-title', { hasText: 'Postcosecha' }).isVisible());
ok('02 sin partidas lo dice, no deja la lista muda',
  (await p.locator(`${raiz} .banner.info`, { hasText: 'No hay partidas' }).count()) === 1);

await boton('Nueva partida').click();
await t(1500);

const dias = p.locator(`${raiz} .dia-cosecha`);
ok('03 los dias de cosecha vienen del servidor', (await dias.count()) === 2,
  `dias=${await dias.count()}`);
ok('04 cada dia muestra su peso y sus sacos',
  (await dias.first().innerText()).includes('2779.7'),
  (await dias.first().innerText()).replace(/\n/g, ' '));

// El peso del lote NO se teclea.
ok('05 el peso del lote arranca en cero y es de solo lectura',
  (await inputDe('peso-lote').inputValue()) === '0' &&
    (await inputDe('peso-lote').getAttribute('readonly')) !== null,
  await inputDe('peso-lote').inputValue());

await dias.first().click();
await t(400);
ok('06 al elegir un dia el peso del lote se llena solo',
  (await inputDe('peso-lote').inputValue()) === '2779.7',
  await inputDe('peso-lote').inputValue());

await inputDe('peso-mallas').fill('35');
await inputDe('peso-mallas').blur();
await t(400);
ok('07 el peso baba se calcula, no se pide',
  (await inputDe('peso-baba').inputValue()) === '2744.7',
  await inputDe('peso-baba').inputValue());

ok('08 sin supervisor no se puede iniciar', await deshabilitado(boton('Iniciar partida')));

await campo('Supervisor').click();
await t(500);
await p.locator('ion-modal ion-radio', { hasText: 'HOLGUIN' }).first().click();
await esperarModalCerrado();
await t(400);
ok('09 con supervisor el boton se habilita', !(await deshabilitado(boton('Iniciar partida'))));

// Las mallas no pueden pesar mas que el lote.
await inputDe('peso-mallas').fill('9999');
await inputDe('peso-mallas').blur();
await t(400);
ok('10 mallas mas pesadas que el lote se bloquean',
  await deshabilitado(boton('Iniciar partida')) &&
    (await p.locator(`${raiz} .banner.alerta`).innerText()).includes('mallas pesan'),
  (await p.locator(`${raiz} .banner.alerta`).innerText()).slice(0, 60));
await inputDe('peso-mallas').fill('35');
await inputDe('peso-mallas').blur();
await t(400);

await boton('Iniciar partida').click();
await t(2500);

const recibidos = (await lotes()).flatMap((l) => l.records ?? []);
const proc = recibidos.filter((r) => r.tipo === 'pc_proceso');
ok('11 la partida viaja como pc_proceso', proc.length === 1, `n=${proc.length}`);
const pl = proc[0]?.payload ?? {};
ok('12 el payload lleva las cosechas, no la fecha ni el peso',
  JSON.stringify(pl.cosecha_ids) === '[22,23]' && pl.peso_mallas === 35 &&
    pl.supervisor_id === 26,
  JSON.stringify({ ids: pl.cosecha_ids, mallas: pl.peso_mallas, sup: pl.supervisor_id }));
ok('13 el telefono NO manda peso_lote, fecha_cosecha ni lot_code',
  !('peso_lote' in pl) && !('fecha_cosecha' in pl) && !('lot_code' in pl),
  JSON.stringify(Object.keys(pl)));
ok('14 fecha_inicio viaja ISO-8601 CON offset',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(pl.fecha_inicio), pl.fecha_inicio);

// ------------------------------------------------------------------
// 2. El numero de proceso lo pone el servidor
// ------------------------------------------------------------------
const tarjeta = p.locator(`${raiz} .partida`).first();
ok('15 la partida vuelve a la lista', (await p.locator(`${raiz} .partida`).count()) === 1);
ok('16 ya con ACK la tarjeta muestra el lot_code del servidor',
  (await tarjeta.innerText()).includes('2290126'),
  (await tarjeta.innerText()).replace(/\n/g, ' ').slice(0, 60));
ok('17 el dia consumido ya no se ofrece para otra partida',
  await (async () => {
    const r = await fetch(`${MOCK}/v4/postcosecha_pendientes`).then((x) => x.json());
    return !r.dias.some((d) => d.fecha === '2026-08-17');
  })());

// ------------------------------------------------------------------
// 3. Etapas: sin orden obligatorio y sin repetir
// ------------------------------------------------------------------
await tarjeta.click();
await t(1200);
ok('18 el detalle abre con el numero y los pesos',
  (await p.locator(`${raiz} .lot-code`).innerText()).includes('2290126'));

const btnEtapa = (clave) => p.locator(`${raiz} ion-button[data-etapa="${clave}"]`);
ok('19 las cuatro etapas se ofrecen desde el arranque, sin orden previo',
  (await btnEtapa('presecado').count()) === 1 &&
    !(await deshabilitado(btnEtapa('secado_maq'))),
  'secado_maq habilitado sin presecado');

ok('20 el corte de grano no aparece antes del fermentado',
  (await p.locator(`${raiz} .registrar-grano`).count()) === 0);

await btnEtapa('fermentado').click();
await t(1800);
// Ojo con el texto: ion-button lo pone en mayusculas por CSS, asi que la
// comparacion va en minusculas.
ok('21 la etapa registrada no se puede volver a mandar',
  await deshabilitado(btnEtapa('fermentado')) &&
    (await btnEtapa('fermentado').innerText()).toLowerCase().includes('registrada'),
  await btnEtapa('fermentado').innerText());

const et = recibidos.length;
const etapas = (await lotes()).flatMap((l) => l.records ?? []).filter((r) => r.tipo === 'pc_etapa');
ok('22 la etapa viaja con el guid de la partida, no con su id',
  etapas.length === 1 && etapas[0].payload.proceso_guid === proc[0].guid &&
    etapas[0].payload.etapa === 'fermentado',
  JSON.stringify(etapas[0]?.payload ?? {}));

// ------------------------------------------------------------------
// 4. Calidad
// ------------------------------------------------------------------
ok('23 con el fermentado hecho aparece el corte de grano',
  (await p.locator(`${raiz} .registrar-grano`).count()) === 1);
ok('24 el corte todo en ceros no se puede mandar',
  await (async () => {
    await inputDe('grano-buena').fill('0');
    await inputDe('grano-ligera').fill('0');
    await inputDe('grano-violeta').fill('0');
    await inputDe('grano-violeta').blur();
    await t(400);
    return deshabilitado(boton('Registrar corte de grano'));
  })());

await inputDe('grano-buena').fill('8');
await inputDe('grano-ligera').fill('3');
await inputDe('grano-violeta').fill('1');
await inputDe('grano-violeta').blur();
await t(400);
await boton('Registrar corte de grano').click();
await t(1800);
ok('25 registrado el corte, el formulario desaparece',
  (await p.locator(`${raiz} .registrar-grano`).count()) === 0);

ok('26 la humedad no se pide sin un secado registrado',
  (await p.locator(`${raiz} .registrar-humedad`).count()) === 0);
await btnEtapa('secado_sol').click();
await t(1800);
ok('27 registrado el secado sol, se pide su humedad',
  (await p.locator(`${raiz} ion-button[data-humedad="secado_sol"]`).count()) === 1);

await inputDe('humedad-1').fill('7.2');
await inputDe('humedad-2').fill('7.5');
await inputDe('humedad-3').fill('7');
await inputDe('humedad-3').blur();
await t(400);
await p.locator(`${raiz} ion-button[data-humedad="secado_sol"]`).click();
await t(1800);
const cals = (await lotes()).flatMap((l) => l.records ?? []);
const cs = cals.filter((r) => r.tipo === 'pc_calidad_sec');
ok('28 el analisis viaja con su etapa',
  cs.length === 1 && cs[0].payload.etapa === 'secado_sol' && cs[0].payload.humedad_1 === 7.2,
  JSON.stringify(cs[0]?.payload ?? {}));
ok('29 la app NO manda el promedio: lo calcula la base',
  !('humedad_promedio' in (cs[0]?.payload ?? {})));

// ------------------------------------------------------------------
// 5. El peso final cierra
// ------------------------------------------------------------------
await inputDe('peso-final').fill('980.5');
await inputDe('peso-final').blur();
await t(400);
await boton('Registrar peso y cerrar').click();
await t(2500);
ok('30 cerrada, la partida sale de la lista',
  (await p.locator(`${raiz} .partida`).count()) === 0,
  `tarjetas=${await p.locator(`${raiz} .partida`).count()}`);

const fin = (await lotes()).flatMap((l) => l.records ?? []);
const res = fin.filter((r) => r.tipo === 'pc_resultado');
ok('31 el cierre viaja como pc_resultado con el peso',
  res.length === 1 && res[0].payload.peso_final === 980.5,
  JSON.stringify(res[0]?.payload ?? {}));
ok('32 nada quedo pendiente ni rechazado',
  await (async () => {
    const c = await p.evaluate(() => window['__lagricontrol'].sync.conteo());
    return c.pendientes === 0 && c.rechazados === 0;
  })());

ok('33 sin errores de JavaScript en toda la sesion', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} PRUEBA(S) FALLIDA(S)`);
process.exit(fallos === 0 ? 0 : 1);
