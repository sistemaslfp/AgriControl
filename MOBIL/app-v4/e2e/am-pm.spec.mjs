/**
 * Pruebas e2e de las pantallas AM y PM (MOBIL/03-pantallas.md).
 *
 * Lo que verifican, que es exactamente lo que no se puede comprobar leyendo
 * el código:
 *  - el payload que sale por POST /v4/sync es el que espera sync_am/sync_pm
 *    de application/controllers/V4.php, campo por campo;
 *  - una tarea = un guid = una fila (un AM de N tareas manda N registros);
 *  - no se puede guardar un AM sin personal (regla dura de Kevin);
 *  - no se puede guardar con la misma persona en dos tareas del formulario;
 *  - el aviso de "AM abierto" aparece al reasignar a alguien sin PM;
 *  - el PM manda el trabajador POR TAREA y no manda pm_year/pm_week.
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

// PW_CHROMIUM permite apuntar a un Chromium ya instalado (contenedor de CI,
// entornos sin descarga de navegadores). Vacío = el que trae Playwright.
const browser = await chromium.launch({
  args: ['--no-sandbox'],
  ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}),
});
const p = await browser.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

const t = (ms) => p.waitForTimeout(ms);

/**
 * Ionic deja las páginas anteriores montadas en el ion-router-outlet, así que
 * TODO locator de página se ancla a la raíz del componente activo. Sin esto,
 * un ion-item de Configuración compite con uno de AM.
 */
let raiz = 'app-am';
const campo = (texto) => p.locator(`${raiz} ion-item`, { hasText: texto }).first();
const enModal = (sel, texto) => p.locator(`ion-modal ${sel}`, { hasText: texto }).first();
const flecha = (cual) => p.locator(`${raiz} ion-button.paso-${cual}`);
const boton = (texto) => p.locator(`${raiz} ion-button`, { hasText: texto }).first();
const conteo = () => p.evaluate(() => window['__lagricontrol'].sync.conteo());

/**
 * `isDisabled()` de Playwright solo entiende controles nativos: un ion-button
 * deshabilitado le parece habilitado. Ionic marca el host con aria-disabled,
 * que es lo que además lee un lector de pantalla.
 */
const deshabilitado = async (loc) => (await loc.getAttribute('aria-disabled')) === 'true';

/**
 * Espera a que el modal se haya ido de verdad.
 *
 * Ionic deja el `ion-modal` en el DOM y solo le saca la clase `show-modal`;
 * mientras esta la animacion de cierre sigue interceptando los toques, y el
 * siguiente click de la pagina se cuelga 30 s. Un `waitForTimeout` fijo
 * alcanza a veces y a veces no: por eso se espera la condicion.
 */
const esperarModalCerrado = () =>
  p.waitForFunction(() => document.querySelectorAll('ion-modal.show-modal').length === 0, {
    timeout: 5000,
  });

/**
 * El modal del selector es flotante y se cierra tocando fuera.
 *
 * Hay que ESPERAR a que se vaya: Ionic deja el `ion-modal` en el DOM y solo
 * le saca la clase `show-modal`, y mientras tanto sigue interceptando los
 * toques. Sin esta espera, el siguiente click de la pagina se cuelga 30 s.
 */
const cerrarTocandoFuera = async () => {
  // Un click de raton en una esquina, fuera de la ventana: es literalmente
  // "tocar afuera". Hacer .click() sobre el <ion-backdrop> NO dispara el
  // cierre — Ionic escucha el gesto, no el click del elemento.
  await p.mouse.click(8, 8);
  await esperarModalCerrado();
  await t(400);
};

/** Selector simple: un toque en la opción cierra el modal. */
async function elegirUno(etiqueta, opcion) {
  await campo(etiqueta).click();
  await t(400);
  await enModal('ion-radio', opcion).click();
  await esperarModalCerrado();
  await t(250);
}

/** Selector múltiple: se marcan las opciones y se confirma con "Listo". */
async function elegirVarios(etiqueta, opciones) {
  await campo(etiqueta).click();
  await t(500);
  for (const o of opciones) {
    await enModal('ion-checkbox', o).click();
    await t(150);
  }
  await p.locator('ion-modal ion-button', { hasText: 'Listo' }).first().click();
  await esperarModalCerrado();
  await t(250);
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
ok('00 catálogos descargados', await p.locator('button.celda', { hasText: 'AM' }).first().isVisible());

// ------------------------------------------------------------------
// 1. AM — encabezado
// ------------------------------------------------------------------
await p.locator('button.celda', { hasText: 'AM' }).first().click();
await t(1500);
ok('01 la pantalla AM abre desde el menú', await p.locator('ion-title', { hasText: 'Reporte AM' }).isVisible());

// Con dos fincas hay que elegirla; con una sola vendría preseleccionada.
ok('02 con dos fincas la finca no viene preseleccionada',
  (await campo('Finca').innerText()).includes('Sin elegir'), await campo('Finca').innerText());
await elegirUno('Finca', 'Bellita');

// El selector de Responsable filtra por rol = 8: los operarios no aparecen.
await campo('Responsable').click();
await t(600);
const textoResp = await p.locator('ion-modal ion-content').first().innerText();
ok('03 el responsable se filtra por rol 8 y por finca',
  textoResp.includes('HOLGUIN') && !textoResp.includes('ALAVA TOMALA') &&
    !textoResp.includes('MENDOZA'),
  textoResp.replace(/\n/g, ' ').slice(0, 80));
ok('03b con seis responsables no se muestra el buscador',
  (await p.locator('ion-modal ion-searchbar').count()) === 0);
ok('03c el selector es una ventana flotante, no pantalla completa',
  (await p.locator('ion-modal.selector-flotante').count()) > 0);
// El contenido tiene que LLENAR la ventana: sin la clase ion-page el
// componente medía 56 px y quedaba media ventana en blanco.
const cajas = await p.evaluate(() => {
  const h = (el) => (el ? Math.round(el.getBoundingClientRect().height) : 0);
  const modal = document.querySelector('ion-modal.selector-flotante');
  return {
    ventana: h(modal?.shadowRoot?.querySelector('.modal-wrapper')),
    contenido: h(document.querySelector('app-selector')),
  };
});
ok('03e el contenido llena la ventana flotante',
  cajas.contenido > 0 && Math.abs(cajas.ventana - cajas.contenido) <= 2, JSON.stringify(cajas));
// Dos responsables: la ventana tiene que medir lo que miden dos filas mas el
// encabezado, no un porcentaje fijo de la pantalla.
ok('03f con pocas opciones la ventana mide lo que mide el contenido',
  cajas.ventana >= 150 && cajas.ventana <= 175, JSON.stringify(cajas));
await enModal('ion-radio', 'HOLGUIN').click();
await t(600);
ok('03d responsable elegido', (await campo('Responsable').innerText()).includes('HOLGUIN'));

// ------------------------------------------------------------------
// 2. AM — tarea 1, y la regla dura del personal
// ------------------------------------------------------------------
await flecha('siguiente').click();
await t(700);
ok('04 la barra de pasos avanza a Tarea 1',
  (await p.locator(`${raiz} .paso`).innerText()) === '2 / 3');

await elegirUno('Cultivo', 'CACAO');

// Orden de los lotes: primero los numéricos por valor, después los que tienen
// nombre. Y a los que tienen nombre NO se les antepone "Lote".
await campo('Lote').click();
await t(600);
// Solo la primera linea: la segunda es el detalle ("12.5 ha").
const opcLote = (await p.locator('ion-modal ion-radio').allInnerTexts())
  .map((x) => x.trim().split('\n')[0].trim());
ok('04b los lotes van primero numéricos y después los de nombre',
  JSON.stringify(opcLote) === JSON.stringify(['Lote 1', 'Lote 5', 'Administrativos']),
  JSON.stringify(opcLote));
ok('04c a un lote con nombre no se le antepone "Lote"',
  !opcLote.some((x) => x.startsWith('Lote Admin')), JSON.stringify(opcLote));
await enModal('ion-radio', 'Lote 1').click();
await t(600);
// tiene_modulos = true: el campo Módulos solo aparece para este lote.
ok('05 Módulos aparece solo si el lote tiene módulos', await campo('Módulos').isVisible());
await elegirVarios('Módulos', ['Módulo 02']);

// Cascada Cultivo -> Tarea -> Subtarea: la subtarea esta apagada hasta que
// haya tarea, y despues solo muestra las de ESA tarea.
ok('05b la subtarea está bloqueada sin tarea', await deshabilitado(campo('Subtarea')));
await elegirUno('Tarea', 'COSECHA');
await campo('Subtarea').click();
await t(600);
const textoSub = await p.locator('ion-modal ion-content').first().innerText();
ok('05c la subtarea se filtra por la tarea elegida',
  textoSub.includes('COSECHA CACAO') && !textoSub.includes('PODA DE FORMACION'),
  textoSub.replace(/\n/g, ' ').slice(0, 80));
ok('05d no se muestra el código interno de la subtarea',
  !textoSub.includes('C-01') && !textoSub.includes('M-07'), textoSub.slice(0, 60));
await enModal('ion-radio', 'COSECHA CACAO').click();
await t(600);

let problemas = await p.locator(`${raiz} .banner.alerta`).first().innerText();
ok(
  '06 sin personal la tarea se marca como incompleta',
  problemas.includes('Sin personal'),
  problemas.slice(0, 80),
);

await flecha('siguiente').click();
await t(700);
ok('07 sin personal el botón de guardar está deshabilitado',
  await deshabilitado(boton('Guardar 1 tarea')));

// ------------------------------------------------------------------
// 3. AM — persona repetida entre tareas: bloqueo duro
// ------------------------------------------------------------------
await flecha('anterior').click();
await t(700);
await elegirVarios('Seleccionar personal', ['ALAVA']);
await flecha('siguiente').click();
await t(700);
ok('08 con una persona el guardado se habilita',
  !(await deshabilitado(boton('Guardar 1 tarea'))));

await p.locator(`${raiz} ion-header ion-buttons[slot="end"] ion-button`).click();
await t(800);
ok('09 la tarea nueva precarga cultivo y lote', (await campo('Lote').innerText()).includes('Lote 1'));
ok(
  '10 la tarea nueva NO arrastra el personal',
  (await campo('Seleccionar personal').innerText()).includes('0 persona'),
);

await elegirUno('Tarea', 'COSECHA');
await elegirUno('Subtarea', 'COSECHA CACAO');
await elegirVarios('Módulos', ['Módulo 02']);
await elegirVarios('Seleccionar personal', ['ALAVA']);
await flecha('siguiente').click();
await t(700);
problemas = await p.locator(`${raiz} .banner.alerta`).first().innerText();
ok(
  '11 la misma persona en dos tareas bloquea el guardado',
  problemas.includes('más de una tarea') && (await deshabilitado(boton('Guardar 2 tarea'))),
  problemas.slice(0, 90),
);

// Se corrige poniendo a otra persona en la tarea 2.
await flecha('anterior').click();
await t(700);
await campo('Seleccionar personal').click();
await t(500);
await enModal('ion-checkbox', 'ALAVA').click();
await enModal('ion-checkbox', 'BRIONES').click();
// Se cierra tocando FUERA, no con "Listo": en modo múltiple cada toque ya
// aplicó, así que cerrar así no pierde nada.
await cerrarTocandoFuera();
ok('11b cerrar tocando fuera conserva la selección múltiple',
  (await campo('Seleccionar personal').innerText()).includes('1 persona'),
  await campo('Seleccionar personal').innerText());
await flecha('siguiente').click();
await t(700);
ok(
  '12 corregida la repetición, el guardado se habilita',
  !(await deshabilitado(boton('Guardar 2 tarea'))),
);

// ------------------------------------------------------------------
// 4. AM — guardar: un guid por tarea, payload exacto
// ------------------------------------------------------------------
await boton('Guardar 2 tarea').click();
await t(3000);

let recibidos = (await lotes()).flatMap((l) => l.records ?? []);
const am = recibidos.filter((r) => r.tipo === 'am');
ok('13 dos tareas AM = dos registros con guid propio', am.length === 2 && am[0].guid !== am[1].guid,
  `n=${am.length}`);

const pa = am[0]?.payload ?? {};
ok(
  '14 el payload AM trae los campos que exige sync_am',
  ['fecha_proceso', 'finca_id', 'responsable_id', 'cultivo_id', 'lote_id', 'subtarea_id',
   'modulo_ids', 'personal_ids'].every((k) => k in pa),
  JSON.stringify(Object.keys(pa)),
);
ok('15 finca, lote y subtarea viajan como enteros', pa.finca_id === 1 && pa.lote_id === 1 && pa.subtarea_id === 88,
  JSON.stringify({ f: pa.finca_id, l: pa.lote_id, s: pa.subtarea_id }));
ok('16 personal_ids nunca viaja vacío', Array.isArray(pa.personal_ids) && pa.personal_ids.length > 0,
  JSON.stringify(pa.personal_ids));
ok('17 modulo_ids trae el módulo del lote', JSON.stringify(pa.modulo_ids) === '[2]', JSON.stringify(pa.modulo_ids));
// sync_fecha() hace new DateTime($valor): sin offset lo interpreta en la zona
// del SERVIDOR y corre la hora de proceso sin que nadie lo note.
ok('18 fecha_proceso viaja ISO-8601 CON offset',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(pa.fecha_proceso), pa.fecha_proceso);
ok('19 la app no manda flags ni ids que calcula el servidor',
  !('flags' in pa) && !('id' in pa) && !('lot_code' in pa));

// ------------------------------------------------------------------
// 5. AM — aviso de persona con AM abierto (sin PM que lo cierre)
// ------------------------------------------------------------------
await t(1200);
await p.goto(`${APP}/am`, { waitUntil: 'networkidle' });
await t(1800);
await elegirUno('Finca', 'Bellita');
await elegirUno('Responsable', 'HOLGUIN');
await flecha('siguiente').click();
await t(600);
await elegirUno('Cultivo', 'CACAO');
await elegirUno('Lote', 'Lote 5');
await elegirUno('Tarea', 'COSECHA');
await elegirUno('Subtarea', 'COSECHA CACAO');
await elegirVarios('Seleccionar personal', ['ALAVA']);
await flecha('siguiente').click();
await t(700);
await boton('Guardar 1 tarea').click();
await t(1200);
const alerta = p.locator('ion-alert');
const hayAlerta = await alerta.isVisible().catch(() => false);
ok('20 avisa que la persona ya tiene un AM sin cerrar', hayAlerta);
if (hayAlerta) {
  const texto = await alerta.innerText();
  ok('21 el aviso identifica a la persona y la tarea abierta',
    texto.includes('ALAVA') && texto.includes('Lote'), texto.replace(/\n/g, ' ').slice(0, 120));
  // Es aviso, no bloqueo: el responsable decide.
  await p.locator('ion-alert button', { hasText: 'Guardar igual' }).click();
  await t(2500);
  recibidos = (await lotes()).flatMap((l) => l.records ?? []);
  ok('22 confirmando, el registro se guarda igual',
    recibidos.filter((r) => r.tipo === 'am').length === 3,
    `n=${recibidos.filter((r) => r.tipo === 'am').length}`);
}

// ------------------------------------------------------------------
// 6. PM — ya no crea tareas: cierra tareas AM abiertas
// ------------------------------------------------------------------
raiz = 'app-pm';
await p.goto(`${APP}/pm`, { waitUntil: 'networkidle' });
await t(2500);
ok('23 la pantalla PM abre', await p.locator('ion-title', { hasText: 'Reporte PM' }).isVisible());

// Tres asignaciones quedaron abiertas: ALAVA en dos AM (lote 1 y lote 5) y
// BRIONES en uno. El PM no ofrece crear nada: solo esa lista.
const filas = p.locator(`${raiz} ion-checkbox`);
ok('24 la primera pantalla lista las tareas AM abiertas',
  (await filas.count()) === 3, `filas=${await filas.count()}`);
ok('25 no existe ninguna forma de crear una tarea desde PM',
  (await p.locator(`${raiz} ion-item`, { hasText: 'Cultivo' }).count()) === 0 &&
  (await p.locator(`${raiz} ion-item`, { hasText: 'Subtarea' }).count()) === 0);

// Se elige el responsable ANTES que la finca: no se puede perder al fijarla.
await elegirUno('Responsable que cierra', 'HOLGUIN');
await elegirUno('Finca', 'Bellita');
ok('26 elegir el responsable antes que la finca no lo borra',
  (await campo('Responsable que cierra').innerText()).includes('HOLGUIN'),
  await campo('Responsable que cierra').innerText());

// Reabrir el selector y tocar la opción YA elegida tiene que cerrar igual.
await elegirUno('Responsable que cierra', 'HOLGUIN');
ok('26b tocar la opción ya elegida cierra la ventana',
  (await campo('Responsable que cierra').innerText()).includes('HOLGUIN'));

// Pero un responsable de OTRA finca sí se limpia, y se dice por qué.
await elegirUno('Finca', 'Pacaritambo');
ok('26c un responsable ajeno a la finca sí se limpia',
  (await campo('Responsable que cierra').innerText()).includes('Sin elegir'),
  await campo('Responsable que cierra').innerText());
await elegirUno('Finca', 'Bellita');
await elegirUno('Responsable que cierra', 'HOLGUIN');
await t(1500);

ok('26d la lista muestra el módulo junto al lote',
  (await p.locator(`${raiz} ion-checkbox`, { hasText: 'BRIONES' }).first().innerText()).includes('Mód.'),
  await p.locator(`${raiz} ion-checkbox`, { hasText: 'BRIONES' }).first().innerText());

// Se cierra la de BRIONES.
await p.locator(`${raiz} ion-checkbox`, { hasText: 'BRIONES' }).first().click();
await t(700);
await flecha('siguiente').click();
await t(700);

const avance = await p.locator(`${raiz} ion-input`).filter({ hasText: 'Avance' }).first().innerText();
ok('27 la unidad de labor viene de la tarea AM', avance.includes('Libra'), avance);

await p.evaluate(() => {
  const c = window['ng'].getComponent(document.querySelector('app-pm'));
  c.setCampo(0, 'cantidad', '3.5');
});
await t(500);
await flecha('siguiente').click();
await t(700);
ok('28 con el avance cargado se habilita el cierre',
  !(await deshabilitado(boton('Cerrar 1 tarea'))));
await boton('Cerrar 1 tarea').click();
await t(3000);

recibidos = (await lotes()).flatMap((l) => l.records ?? []);
const pm = recibidos.filter((r) => r.tipo === 'pm');
const pp = pm[0]?.payload ?? {};
ok('29 el cierre viaja como registro tipo pm', pm.length === 1, `n=${pm.length}`);
ok('30 el payload PM apunta al AM que cierra',
  typeof pp.am_guid === 'string' && pp.trabajador_id === 301,
  JSON.stringify({ am: pp.am_guid, w: pp.trabajador_id }));
ok('31 cantidad viaja numérica, no string',
  typeof pp.cantidad === 'number' && pp.cantidad === 3.5, `${typeof pp.cantidad} ${pp.cantidad}`);
ok('32 hora_cierre viaja ISO con offset',
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(pp.hora_cierre), pp.hora_cierre);
// Todo esto lo DERIVA el servidor del AM: si lo mandara el teléfono, podría
// contradecir la programación de la mañana.
ok('33 la app no manda lote, subtarea, cultivo ni finca en el PM',
  !('lote_id' in pp) && !('subtarea_id' in pp) && !('cultivo_id' in pp) && !('finca_id' in pp),
  JSON.stringify(Object.keys(pp)));
// V3 calcula pm_year con 'Y' y guardó 181 filas de diciembre de 2025 como
// (2025, semana 1). En V4 lo calcula el servidor con 'o'. La app NO lo manda.
ok('34 la app no manda pm_year ni pm_week', !('pm_year' in pp) && !('pm_week' in pp));

// La asignación cerrada desaparece de la lista.
await p.goto(`${APP}/menu`, { waitUntil: 'networkidle' });
await t(1200);
await p.goto(`${APP}/pm`, { waitUntil: 'networkidle' });
await t(2500);
ok('35 la tarea cerrada ya no aparece entre las abiertas',
  (await p.locator(`${raiz} ion-checkbox`).count()) === 2,
  `filas=${await p.locator(`${raiz} ion-checkbox`).count()}`);

// ------------------------------------------------------------------
// 7. Estado final de la cola
// ------------------------------------------------------------------
const c = await conteo();
ok('36 todo lo capturado quedó confirmado por el servidor',
  c.enviados === 4 && c.pendientes === 0 && c.rechazados === 0, JSON.stringify(c));
ok('37 sin errores de JavaScript en toda la sesión', errs.length === 0, errs.join(' | ').slice(0, 200));

await browser.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} PRUEBA(S) FALLIDA(S)`);
process.exit(fallos === 0 ? 0 : 1);
