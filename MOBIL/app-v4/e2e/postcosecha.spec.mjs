/**
 * Pruebas e2e de la pantalla Postcosecha (paso 6 del plan).
 *
 * Lo que verifican, que es lo que no se ve leyendo el codigo:
 *  - el peso del lote NO se teclea: sale de los dias de cosecha elegidos con
 *    el selector de checkbox, y el peso baba se calcula;
 *  - el payload de la partida es {supervisor_id, fecha_inicio, peso_mallas,
 *    cosecha_ids[]} y **no** lleva peso_lote, fecha_cosecha ni lot_code;
 *  - la lista dice EN QUE ETAPA esta cada partida, no cuantas lleva;
 *  - el detalle es una ventana por etapa y **ninguna bloquea a la otra**:
 *    registrar presecado no marca fermentado, y se puede saltear una etapa;
 *  - el corte de grano vive en fermentado y la humedad en el secado al SOL;
 *    el secado a maquina no pide calidad, solo inicio, fin y el tiempo;
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
const ventana = () => p.locator(`${raiz} .ventana-etapa`).first();
const btnEtapa = (clave) => p.locator(`${raiz} ion-button[data-etapa="${clave}"]`);
const flecha = (cual) => p.locator(`ion-button.paso-${cual}`).first();
const esperarModalCerrado = () =>
  p.waitForFunction(() => document.querySelectorAll('ion-modal.show-modal').length === 0,
    { timeout: 5000 });
const cerrarTocandoFuera = async () => {
  await p.mouse.click(8, 8);
  await esperarModalCerrado();
  await t(250);
};
/** Va a la ventana de una etapa por su nombre, con la flecha de pasos. */
async function irAEtapa(nombre) {
  for (let i = 0; i < 6; i++) {
    if ((await ventana().innerText()).trim() === nombre) return true;
    await flecha('siguiente').click();
    await t(500);
  }
  return (await ventana().innerText()).trim() === nombre;
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
ok('02 sin registros lo dice, no deja la lista muda',
  (await p.locator(`${raiz} .banner.info`, { hasText: 'No hay registros' }).count()) === 1);

await boton('Nuevo registro').click();
await t(1500);

// Los dias van en el MISMO selector de checkbox que el resto de la app.
ok('03 los lotes de cosecha se eligen con el selector, no con una lista suelta',
  (await campo('Seleccionar lotes').count()) === 1 &&
    (await campo('Seleccionar lotes').innerText()).includes('Sin elegir'),
  (await campo('Seleccionar lotes').innerText()).replace(/\n/g, ' '));

ok('04 el peso del lote arranca en cero y es de solo lectura',
  (await inputDe('peso-lote').inputValue()) === '0' &&
    (await inputDe('peso-lote').getAttribute('readonly')) !== null,
  await inputDe('peso-lote').inputValue());

await campo('Seleccionar lotes').click();
await t(700);
const casillas = p.locator('ion-modal ion-checkbox');
ok('05 el selector muestra los dias del servidor como casillas',
  (await casillas.count()) === 2, `casillas=${await casillas.count()}`);
ok('06 cada dia muestra su peso y sus sacos',
  (await casillas.first().innerText()).includes('2779.7'),
  (await casillas.first().innerText()).replace(/\n/g, ' '));
await casillas.first().click();
await t(400);
await cerrarTocandoFuera();

ok('07 al elegir un dia el peso del lote se llena solo',
  (await inputDe('peso-lote').inputValue()) === '2779.7',
  await inputDe('peso-lote').inputValue());
ok('08 la tarjeta resume lo elegido sin abrir el selector',
  (await campo('Seleccionar lotes').innerText()).includes('1 día(s)'),
  (await campo('Seleccionar lotes').innerText()).replace(/\n/g, ' '));

await inputDe('peso-mallas').fill('35');
await inputDe('peso-mallas').blur();
await t(400);
ok('09 el peso baba se calcula, no se pide',
  (await inputDe('peso-baba').inputValue()) === '2744.7',
  await inputDe('peso-baba').inputValue());

ok('10 sin supervisor no se puede iniciar', await deshabilitado(boton('Iniciar presecado')));
await campo('Supervisor').click();
await t(500);
await p.locator('ion-modal ion-radio', { hasText: 'HOLGUIN' }).first().click();
await esperarModalCerrado();
await t(400);
ok('11 con supervisor el boton se habilita', !(await deshabilitado(boton('Iniciar presecado'))));

await inputDe('peso-mallas').fill('9999');
await inputDe('peso-mallas').blur();
await t(400);
ok('12 mallas mas pesadas que el lote se bloquean',
  await deshabilitado(boton('Iniciar presecado')) &&
    (await p.locator(`${raiz} .banner.alerta`).innerText()).includes('mallas pesan'),
  (await p.locator(`${raiz} .banner.alerta`).innerText()).slice(0, 60));
await inputDe('peso-mallas').fill('35');
await inputDe('peso-mallas').blur();
await t(400);

await boton('Iniciar presecado').click();
await t(2500);

const recibidos = (await lotes()).flatMap((l) => l.records ?? []);
const proc = recibidos.filter((r) => r.tipo === 'pc_proceso');
ok('13 el registro viaja como pc_proceso', proc.length === 1, `n=${proc.length}`);
const pl = proc[0]?.payload ?? {};
ok('14 el payload lleva las cosechas, no la fecha ni el peso',
  JSON.stringify(pl.cosecha_ids) === '[22,23]' && pl.peso_mallas === 35 && pl.supervisor_id === 26,
  JSON.stringify({ ids: pl.cosecha_ids, mallas: pl.peso_mallas, sup: pl.supervisor_id }));
ok('15 el telefono NO manda peso_lote, fecha_cosecha ni lot_code',
  !('peso_lote' in pl) && !('fecha_cosecha' in pl) && !('lot_code' in pl),
  JSON.stringify(Object.keys(pl)));
ok('16 fecha_inicio viaja ISO-8601 CON offset',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(pl.fecha_inicio), pl.fecha_inicio);

// ------------------------------------------------------------------
// 2. La lista dice EN QUE ETAPA esta, y el numero lo pone el servidor
// ------------------------------------------------------------------
// El pesaje ARRANCA el presecado, como en v3.
const presecado = recibidos.filter(
  (r) => r.tipo === 'pc_etapa' && r.payload.etapa === 'presecado',
);
ok('16b el pesaje arranca el presecado solo', presecado.length === 1, `n=${presecado.length}`);
ok('16c el presecado hereda la fecha de inicio del pesaje',
  presecado[0]?.payload.inicio === pl.fecha_inicio,
  `${presecado[0]?.payload.inicio} vs ${pl.fecha_inicio}`);

const tarjeta = p.locator(`${raiz} .registro`).first();
ok('17 el registro vuelve a la lista', (await p.locator(`${raiz} .registro`).count()) === 1);
ok('18 ya con ACK la tarjeta muestra el lot_code del servidor',
  (await tarjeta.innerText()).includes('2290126'),
  (await tarjeta.innerText()).replace(/\n/g, ' ').slice(0, 60));
ok('19 la lista dice la ETAPA en la que esta, no cuantas lleva',
  (await p.locator(`${raiz} .etapa-actual`).first().innerText()).trim() === 'Presecado',
  await p.locator(`${raiz} .etapa-actual`).first().innerText());
ok('20 el dia consumido ya no se ofrece para otra partida',
  await (async () => {
    const r = await fetch(`${MOCK}/v4/postcosecha_pendientes`).then((x) => x.json());
    return !r.dias.some((d) => d.fecha === '2026-08-17');
  })());

// ------------------------------------------------------------------
// 3. Detalle: una ventana por etapa, ninguna excluyente
// ------------------------------------------------------------------
await tarjeta.click();
await t(1200);
ok('21 el detalle abre con el numero y los pesos',
  (await p.locator(`${raiz} .lot-code`).innerText()).includes('2290126'));
ok('22 abre en la ventana que sigue al presecado ya iniciado',
  (await ventana().innerText()).trim() === 'Fermentado', await ventana().innerText());

// Volver a una etapa registrada muestra SUS DATOS, no un cartel de "ya esta".
await p.locator(`${raiz} ion-button.paso-anterior`).first().click();
await t(600);
ok('23 volver a presecado muestra los datos de la etapa, no un cartel',
  (await ventana().innerText()).trim() === 'Presecado' &&
    (await p.locator(`${raiz} .info-etapa`).count()) === 1 &&
    (await btnEtapa('presecado').count()) === 0);
ok('24 la ficha de la etapa trae su hora de inicio',
  /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(
    await p.locator(`${raiz} .info-inicio`).innerText()),
  await p.locator(`${raiz} .info-inicio`).innerText());

// LA REGRESION QUE REPORTO KEVIN: despues de presecado, fermentado quedaba
// como "registrada" y no se podia entrar.
ok('25 pasar a fermentado sigue siendo posible', await irAEtapa('Fermentado'));
ok('26 fermentado NO figura como registrada por haber hecho presecado',
  (await p.locator(`${raiz} .banner.sin-registrar`).count()) === 1 &&
    (await btnEtapa('fermentado').count()) === 1 &&
    !(await deshabilitado(btnEtapa('fermentado'))),
  (await ventana().innerText()).trim());

// Se SALTEA fermentado a proposito y se va al secado: no debe bloquear nada.
ok('27 se puede saltear una etapa sin registrarla', await irAEtapa('Secado (sol)'));
ok('28 la etapa salteada no deja rastro ni bloquea',
  (await btnEtapa('secado_sol').count()) === 1 &&
    !(await deshabilitado(btnEtapa('secado_sol'))));

await inputDe('etapa-inicio').fill('2026-09-05T08:00');
await inputDe('etapa-inicio').blur();
await t(300);
await btnEtapa('secado_sol').click();
await t(1800);

const etapas = (await lotes()).flatMap((l) => l.records ?? []).filter((r) => r.tipo === 'pc_etapa');
ok('29 solo viajaron las etapas registradas, no la salteada',
  etapas.length === 2 && etapas.map((e) => e.payload.etapa).join(',') === 'presecado,secado_sol',
  etapas.map((e) => e.payload.etapa).join(','));
ok('30 la etapa viaja con el guid de la partida, no con su id',
  etapas[0].payload.proceso_guid === proc[0].guid, etapas[0].payload.proceso_guid);

// ------------------------------------------------------------------
// 4. Calidad: cada secado con sus propias lecturas
// ------------------------------------------------------------------
ok('31 los datos de calidad viven en la ventana de su secado',
  (await p.locator(`${raiz} ion-button[data-humedad="secado_sol"]`).count()) === 1);
await inputDe('humedad-1').fill('7.2');
await inputDe('humedad-2').fill('7.5');
await inputDe('humedad-3').fill('7');
await inputDe('num-granos').fill('400');
await inputDe('granos-vanos').fill('12.5');
await inputDe('granos-vanos').blur();
await t(500);
// promedio (7.2+7.5+7)/3 = 7.23; indice 500/400 = 1.25; vanos 12.5*100/500 = 2.5
ok('31b los tres indicadores del secado se calculan solos',
  (await p.locator(`${raiz} .ind-promedio`).innerText()).includes('7.23') &&
    (await p.locator(`${raiz} .ind-indice`).innerText()).includes('1.25') &&
    (await p.locator(`${raiz} .ind-vanos`).innerText()).includes('2.5'),
  [await p.locator(`${raiz} .ind-promedio`).innerText(),
   await p.locator(`${raiz} .ind-indice`).innerText(),
   await p.locator(`${raiz} .ind-vanos`).innerText()].join(' / '));
await p.locator(`${raiz} ion-button[data-humedad="secado_sol"]`).click();
await t(1800);

// Secado a maquina: sin datos de calidad, solo inicio, fin y el tiempo
// empleado (Kevin, 2026-09-08).
ok('32 el secado a maquina no pide datos de calidad',
  await (async () => {
    await irAEtapa('Secado (máquina)');
    return (await p.locator(`${raiz} .humedad-1`).count()) === 0 &&
      (await p.locator(`${raiz} .registrar-humedad`).count()) === 0;
  })());
ok('32b el secado a maquina muestra el tiempo empleado, en vivo',
  await (async () => {
    await inputDe('etapa-inicio').fill('2026-09-05T08:00');
    await inputDe('etapa-fin').fill('2026-09-06T11:30');
    await inputDe('etapa-fin').blur();
    await t(500);
    return (await p.locator(`${raiz} .ind-duracion`).innerText()).includes('1 d 3 h 30 min');
  })(),
  await p.locator(`${raiz} .ind-duracion`).innerText());
await btnEtapa('secado_maq').click();
await t(1800);
ok('32c registrado, la ficha conserva el tiempo empleado',
  (await p.locator(`${raiz} .info-duracion`).innerText()).includes('1 d 3 h 30 min'),
  await p.locator(`${raiz} .info-duracion`).innerText());

const cs = (await lotes()).flatMap((l) => l.records ?? []).filter((r) => r.tipo === 'pc_calidad_sec');
ok('33 el analisis viaja con su etapa y sus dos indicadores guardables',
  cs.length === 1 && cs[0].payload.etapa === 'secado_sol' && cs[0].payload.humedad_1 === 7.2 &&
    cs[0].payload.granos_muestra === 400 && cs[0].payload.indice_grano_g === 1.25 &&
    cs[0].payload.granos_vacios_pct === 2.5,
  JSON.stringify(cs[0]?.payload ?? {}));
ok('34 la app NO manda el promedio: lo calcula la base',
  !('humedad_promedio' in (cs[0]?.payload ?? {})));

// El corte de grano vive en la ventana de fermentado, aunque la etapa se haya
// salteado: es un analisis de la partida, no de la fila de etapa.
await p.locator(`${raiz} ion-button.paso-anterior`).first().click();
await t(500);
await p.locator(`${raiz} ion-button.paso-anterior`).first().click();
await t(500);
ok('35 el corte de grano esta en la ventana de fermentado',
  (await ventana().innerText()).trim() === 'Fermentado' &&
    (await p.locator(`${raiz} .registrar-grano`).count()) === 1,
  (await ventana().innerText()).trim());
ok('36 el corte todo en ceros no se puede mandar',
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
await t(500);
// (parte * 100) / total, con total = 12: 66.67 / 25 / 8.33
ok('36b el indicador de fermentacion se calcula solo, mientras se teclea',
  (await p.locator(`${raiz} .indicadores .pct-buena`).innerText()).includes('66.67') &&
    (await p.locator(`${raiz} .indicadores .pct-ligera`).innerText()).includes('25') &&
    (await p.locator(`${raiz} .indicadores .pct-violeta`).innerText()).includes('8.33'),
  [await p.locator(`${raiz} .indicadores .pct-buena`).innerText(),
   await p.locator(`${raiz} .indicadores .pct-ligera`).innerText(),
   await p.locator(`${raiz} .indicadores .pct-violeta`).innerText()].join(' / '));

await boton('Registrar corte de grano').click();
await t(1800);
ok('37 registrado el corte, se muestran los conteos con su porcentaje',
  (await p.locator(`${raiz} .registrar-grano`).count()) === 0 &&
    (await p.locator(`${raiz} .info-grano .pct-buena`).innerText()).includes('66.67'),
  await p.locator(`${raiz} .info-grano .pct-buena`).innerText());
const cf = (await lotes()).flatMap((l) => l.records ?? []).filter((r) => r.tipo === 'pc_calidad_ferm');
ok('37b los porcentajes NO viajan: se calculan',
  cf.length === 1 && !('buena_pct' in cf[0].payload) && cf[0].payload.buena === 8,
  JSON.stringify(cf[0]?.payload ?? {}));

// ------------------------------------------------------------------
// 5. El peso final cierra
// ------------------------------------------------------------------
ok('38 la ultima ventana es el peso final', await irAEtapa('Peso final'));
await inputDe('peso-final').fill('980.5');
await inputDe('peso-final').blur();
await t(400);
await boton('Registrar peso y cerrar').click();
await t(2500);
ok('39 cerrado, el registro sale de la lista',
  (await p.locator(`${raiz} .registro`).count()) === 0,
  `tarjetas=${await p.locator(`${raiz} .registro`).count()}`);

const res = (await lotes()).flatMap((l) => l.records ?? []).filter((r) => r.tipo === 'pc_resultado');
ok('40 el cierre viaja como pc_resultado con el peso',
  res.length === 1 && res[0].payload.peso_final === 980.5,
  JSON.stringify(res[0]?.payload ?? {}));
ok('41 nada quedo pendiente ni rechazado',
  await (async () => {
    const c = await p.evaluate(() => window['__lagricontrol'].sync.conteo());
    return c.pendientes === 0 && c.rechazados === 0;
  })());

ok('42 sin errores de JavaScript en toda la sesion', errs.length === 0, errs.join(' | '));

await browser.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} PRUEBA(S) FALLIDA(S)`);
process.exit(fallos === 0 ? 0 : 1);
