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
/** Rechaza (o deja de rechazar) los PM sin resetear el estado del mock. */
const rechazarPm = (on) =>
  fetch(`${MOCK}/mock/rechazar_pm`, { method: 'POST', body: JSON.stringify({ on }) });
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
// El menu tiene UNA celda para las dos mitades: eran dos que abrian la misma
// pantalla, y ademas estaban en `habilitada: false` desde el paso 1 -- grises
// aunque la navegacion ya funcionaba.
ok('00b el menú tiene una sola celda Pendientes / Enviados',
  (await p.locator('button.celda', { hasText: 'Pendientes / Enviados' }).count()) === 1 &&
  (await p.locator('button.celda.deshabilitada', { hasText: 'Pendientes' }).count()) === 0,
  `celdas=${await p.locator('button.celda', { hasText: 'Pendientes / Enviados' }).count()}`);

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
// Módulos va DEBAJO de Lote: es una subdivisión del lote, no algo suelto.
const orden = await p.evaluate(() => {
  const t = [...document.querySelectorAll('app-am ion-item')].map((x) => x.innerText.split('\n')[0].trim());
  return { lote: t.indexOf('Lote'), modulos: t.indexOf('Módulos'), tarea: t.indexOf('Tarea') };
});
ok('05a Módulos va justo debajo de Lote y antes de Tarea',
  orden.modulos === orden.lote + 1 && orden.tarea > orden.modulos, JSON.stringify(orden));
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
// La subtarea 91 cuelga de la misma tarea pero es de la finca 2: trabajando en
// Bellita no tiene que aparecer.
ok('05e la subtarea se filtra también por finca',
  !textoSub.includes('PACARITAMBO'), textoSub.replace(/\n/g, ' ').slice(0, 80));
ok('05d no se muestra el código interno de la subtarea',
  !textoSub.includes('C-01') && !textoSub.includes('M-07'), textoSub.slice(0, 60));
// A PARTIR DE ACA se usa PODA DE FORMACION y no COSECHA CACAO: desde el
// 2026-09-03 el PM no cierra tareas de cosecha, y esta suite prueba
// justamente el cierre por PM. La cascada de arriba sigue verificandose con
// la tarea COSECHA, que es donde importa.
await p.mouse.click(8, 8);
await esperarModalCerrado();
await t(300);
await elegirUno('Tarea', 'MANTENIMIENTO');
await campo('Subtarea').click();
await t(500);
await enModal('ion-radio', 'PODA DE FORMACION').click();
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

await elegirUno('Tarea', 'MANTENIMIENTO');
await elegirUno('Subtarea', 'PODA DE FORMACION');
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
const lotesRevision = await p.locator(`${raiz} .lote-revision`).allInnerTexts();
ok('12b la revisión muestra el lote con sus módulos',
  lotesRevision.some((x) => /Lote 1\s*·\s*Mód\. 02/.test(x)), lotesRevision.join(' | '));

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
  ['captura_guid', 'fecha_proceso', 'finca_id', 'responsable_id', 'cultivo_id', 'lote_id',
   'subtarea_id', 'modulo_ids', 'personal_id'].every((k) => k in pa),
  JSON.stringify(Object.keys(pa)),
);
ok('15 finca, lote y subtarea viajan como enteros', pa.finca_id === 1 && pa.lote_id === 1 && pa.subtarea_id === 90,
  JSON.stringify({ f: pa.finca_id, l: pa.lote_id, s: pa.subtarea_id }));
// Un registro = una persona: personal_id en singular, y nunca vacio.
ok('16 personal_id viaja en singular', typeof pa.personal_id === 'number' && pa.personal_id > 0,
  String(pa.personal_id));
// captura_guid es POR TAREA, no por envio del formulario. Estos dos registros
// son DOS TAREAS distintas del mismo AM (lotes y subtareas distintos), asi que
// tienen que llevar guid DISTINTO. Hasta el 2026-09-02 llevaban el mismo, y
// esta misma prueba lo afirmaba al reves: la pantalla PM y "Enviados" agrupan
// por ese guid, y con uno solo por formulario habrian fundido dos tareas en
// una tarjeta con lotes y subtareas mezclados.
ok('16b dos TAREAS del mismo formulario llevan captura_guid distinto',
  am[0].payload.captura_guid !== am[1].payload.captura_guid &&
    am.every((r) => typeof r.payload.captura_guid === 'string') &&
    !('personal_ids' in pa),
  JSON.stringify(am.map((r) => r.payload.captura_guid)));
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
await elegirUno('Tarea', 'MANTENIMIENTO');
await elegirUno('Subtarea', 'PODA DE FORMACION');
await elegirVarios('Seleccionar personal', ['ALAVA']);
await flecha('siguiente').click();
await t(700);
await boton('Guardar 1 tarea').click();
await t(1200);
const alerta = p.locator('ion-alert');
const hayAlerta = await alerta.isVisible().catch(() => false);
ok('20 bloquea porque la persona ya tiene un AM sin cerrar', hayAlerta);
if (hayAlerta) {
  const texto = await alerta.innerText();
  ok('21 el aviso identifica a la persona y la tarea abierta',
    texto.includes('ALAVA') && texto.includes('Lote'), texto.replace(/\n/g, ' ').slice(0, 120));
  // Bloqueo, no aviso: no hay manera de guardar igual.
  const guardarIgual = await p.locator('ion-alert button', { hasText: 'Guardar igual' }).count();
  await p.locator('ion-alert button', { hasText: 'Entendido' }).click();
  await t(2500);
  recibidos = (await lotes()).flatMap((l) => l.records ?? []);
  const nAm = recibidos.filter((r) => r.tipo === 'am').length;
  ok('22 no ofrece guardar igual y el registro no se manda',
    guardarIgual === 0 && nAm === 2, `botones=${guardarIgual} n=${nAm}`);
}

// ------------------------------------------------------------------
// 6. PM — ya no crea tareas: cierra tareas AM abiertas
// ------------------------------------------------------------------
raiz = 'app-pm';
await p.goto(`${APP}/pm`, { waitUntil: 'networkidle' });
await t(2500);
ok('23 la pantalla PM abre', await p.locator('ion-title', { hasText: 'Reporte PM' }).isVisible());

// DOS asignaciones abiertas en UN trabajo: ALAVA y BRIONES en
// (Lote 1, Mod. 02, PODA DE FORMACION). El tercer AM --el de Lote 5-- lo
// bloqueo la regla de "una persona, un AM abierto" (2026-09-04), asi que
// nunca existio: hasta esa regla esta suite esperaba dos tarjetas.
//
// Se agrupa por el TRABAJO --lote, subtarea y modulos--, no por captura_guid.
// Con el guid salian dos tarjetas IDENTICAS palabra por palabra, porque las
// dos personas se habian cargado como dos tareas distintas del formulario.
// Indistinguibles en pantalla, que es justo lo que esta agrupacion evita.
const tareas = p.locator(`${raiz} ion-item.tarea-am`);
ok('24 la primera pantalla lista los trabajos AM abiertos, agrupados',
  (await tareas.count()) === 1, `tarjetas=${await tareas.count()}`);
ok('24a la tarjeta agrupa a las dos personas del trabajo',
  (await tareas.first().innerText()).includes('2 personas'),
  (await tareas.first().innerText()).replace(/\n/g, ' '));
// Ninguna tarjeta puede repetirse: dos identicas no se pueden distinguir.
const textos = await tareas.allInnerTexts();
ok('24c no hay dos tarjetas iguales',
  new Set(textos).size === textos.length, JSON.stringify(textos));
ok('24b ninguna tarjeta nombra a una persona: el nombre vive en la ventana',
  !(await tareas.first().innerText()).includes('ALAVA'),
  await tareas.first().innerText());
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

// La tarjeta de la tarea con modulo los muestra junto al lote: sin eso, dos
// tareas del mismo lote y la misma subtarea se ven identicas.
const conModulo = p.locator(`${raiz} ion-item.tarea-am`, { hasText: 'Mód.' });
ok('26d la tarjeta muestra el módulo junto al lote',
  (await conModulo.count()) >= 1, `tarjetas con módulo=${await conModulo.count()}`);

// Se apunta al trabajo por lote + modulo, que ahora lo identifica sin
// ambiguedad. Antes se usaba `.first()` sobre "Mód." con dos tarjetas iguales
// detras, y la prueba pasaba o fallaba segun la corrida: eso destapo que el
// orden desempataba por el captura_guid, que es aleatorio.
const tareaConDos = p.locator(`${raiz} ion-item.tarea-am`, { hasText: 'Mód. 02' });
ok('26d-bis el trabajo con módulo se identifica sin ambigüedad',
  (await tareaConDos.count()) === 1, `tarjetas Mód. 02=${await tareaConDos.count()}`);

// Al tocar la tarea se abre la ventana flotante con SU personal.
await tareaConDos.click();
await t(600);
// La ventana lista EXACTAMENTE el personal de esa tarea, no el de las demas.
// Esta tarea la trabaja BRIONES solo; ALAVA esta en otras dos y no tiene por
// que aparecer aca.
// Las DOS personas de ese trabajo, aunque se hayan cargado como dos tareas
// distintas del formulario: es el mismo trabajo y se cierra junto.
ok('26e la ventana lista el personal de ESE trabajo',
  (await p.locator('ion-modal ion-checkbox', { hasText: 'BRIONES' }).count()) === 1 &&
  (await p.locator('ion-modal ion-checkbox', { hasText: 'ALAVA' }).count()) === 1,
  `en la ventana: BRIONES=${await p.locator('ion-modal ion-checkbox', { hasText: 'BRIONES' }).count()}` +
  ` ALAVA=${await p.locator('ion-modal ion-checkbox', { hasText: 'ALAVA' }).count()}`);

// Se elige solo a BRIONES: la seleccion multiple aplica en vivo.
await p.locator('ion-modal ion-checkbox', { hasText: 'BRIONES' }).first().click();
await t(300);
await cerrarTocandoFuera();
await t(700);
ok('26f la tarjeta resume a quién se eligió, sin abrirla',
  (await tareaConDos.innerText()).includes('BRIONES'),
  await tareaConDos.innerText());
await flecha('siguiente').click();
await t(700);

const avance = await p.locator(`${raiz} ion-input`).filter({ hasText: 'Avance' }).first().innerText();
// PODA DE FORMACION se paga por Jornal. Y no puede ser de otra unidad: desde
// el 2026-09-05 lo que se paga por Libra lo cierra Cosecha, no el PM.
ok('27 la unidad de labor viene de la tarea AM', avance.includes('Jornal'), avance);
const sufijo = await p.locator(`${raiz} ion-input .unidad-avance`).first().innerText().catch(() => '');
ok('27b la unidad se ve junto al valor del avance', sufijo.trim() === 'Jornal', sufijo);

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

// El detalle del PM enviado dice en qué unidad es el avance.
await p.goto(`${APP}/registros?vista=enviados`, { waitUntil: 'networkidle' });
await t(1500);
// Con AM y PM en Enviados las categorias arrancan plegadas.
await p.locator('app-registros [data-cat="pm"] ion-item.categoria-registros').click();
await t(500);
await p.locator('app-registros ion-item', { hasText: 'PM ·' }).first().click();
await t(800);
const detallePm = await p.locator('app-detalle-registro').innerText();
ok('34b el detalle del PM muestra el avance con su unidad',
  /Avance\s+3\.5 Jornal/.test(detallePm), detallePm.replace(/\n+/g, ' | ').slice(0, 200));
await p.locator('app-detalle-registro ion-button.boton-cerrar').click();
await t(500);

// La asignación cerrada desaparece de la lista.
await p.goto(`${APP}/menu`, { waitUntil: 'networkidle' });
await t(1200);
await p.goto(`${APP}/pm`, { waitUntil: 'networkidle' });
await t(2500);
// BRIONES se cerro, pero ALAVA sigue abierta en ESE MISMO trabajo: la tarjeta
// no desaparece, se queda con una persona. Es la razon por la que dice
// "por cerrar" y no "personas".
ok('35 la tarjeta no desaparece: queda la persona que falta cerrar',
  (await p.locator(`${raiz} ion-item.tarea-am`).count()) === 1,
  `tarjetas=${await p.locator(`${raiz} ion-item.tarea-am`).count()}`);
await p.locator(`${raiz} ion-item.tarea-am`, { hasText: 'Mód. 02' }).click();
await t(600);
ok('35b la ventana de ese trabajo ya no ofrece a la persona cerrada',
  (await p.locator('ion-modal ion-checkbox', { hasText: 'BRIONES' }).count()) === 0 &&
  (await p.locator('ion-modal ion-checkbox', { hasText: 'ALAVA' }).count()) === 1,
  `BRIONES=${await p.locator('ion-modal ion-checkbox', { hasText: 'BRIONES' }).count()}` +
  ` ALAVA=${await p.locator('ion-modal ion-checkbox', { hasText: 'ALAVA' }).count()}`);
await cerrarTocandoFuera();
await t(400);

// ------------------------------------------------------------------
// 7. Estado final de la cola
// ------------------------------------------------------------------
const c = await conteo();
// 3 = los dos AM del formulario mas el PM que cierra a BRIONES. El AM de
// Lote 5 no cuenta: lo bloqueo la regla de "una persona, un AM abierto".
ok('36 todo lo capturado quedó confirmado por el servidor',
  c.enviados === 3 && c.pendientes === 0 && c.rechazados === 0, JSON.stringify(c));

// ------------------------------------------------------------------
// 7b. Un PM rechazado se corrige en la pantalla PM y se reenvia
// ------------------------------------------------------------------
// El rechazo elegido es el corregible de verdad: "hora_cierre anterior a la
// hora de la tarea AM". Lo que se prueba es el ciclo entero -- rechazo,
// tarjeta con boton, precarga, reenvio -- y que el guid NO cambia.
await rechazarPm(true);
raiz = 'app-pm';
await p.goto(`${APP}/pm`, { waitUntil: 'networkidle' });
await t(2500);
// La pantalla se abre de cero: el encabezado se completa otra vez. Todavia no
// hay valores por defecto guardados en Configuracion (eso es la seccion 8).
await elegirUno('Responsable que cierra', 'HOLGUIN');
await elegirUno('Finca', 'Bellita');
await t(1200);
await p.locator(`${raiz} ion-item.tarea-am`, { hasText: 'Mód. 02' }).click();
await t(600);
await p.locator('ion-modal ion-checkbox', { hasText: 'ALAVA' }).first().click();
await t(300);
await cerrarTocandoFuera();
await t(700);
await flecha('siguiente').click();
await t(700);
await p.evaluate(() => {
  const c = window['ng'].getComponent(document.querySelector('app-pm'));
  c.setCampo(0, 'cantidad', '2');
});
await t(400);
await flecha('siguiente').click();
await t(700);
await boton('Cerrar 1 tarea').click();
await t(3500);

const cRech = await conteo();
ok('39r el PM vuelve RECHAZADO', cRech.rechazados === 1, JSON.stringify(cRech));
const guidRechazado = (await lotes())
  .flatMap((l) => l.records ?? [])
  .filter((r) => r.tipo === 'pm')
  .pop()?.guid;

raiz = 'app-registros';
await p.goto(`${APP}/registros?vista=enviados`, { waitUntil: 'networkidle' });
await t(2000);
const tarjRech = p.locator(`${raiz} ion-item.tarjeta-registro`, { hasText: 'Rechazado' });
ok('40r el rechazado ofrece corregir y descartar',
  (await tarjRech.locator('ion-button.corregir').count()) === 1 &&
    (await tarjRech.locator('ion-button.descartar').count()) === 1,
  `corregir=${await tarjRech.locator('ion-button.corregir').count()}` +
  ` descartar=${await tarjRech.locator('ion-button.descartar').count()}`);

await tarjRech.locator('ion-button.corregir').first().click();
await t(3000);
raiz = 'app-pm';
ok('41r corregir abre el PM con el motivo del rechazo a la vista',
  (await p.locator(`${raiz} .banner.correccion`).innerText()).includes('hora_cierre'),
  await p.locator(`${raiz} .banner.correccion`).innerText().catch(() => 'sin banner'));
const estado = await p.evaluate(() => {
  const c = window['ng'].getComponent(document.querySelector('app-pm'));
  return { n: c.elegidas().length, cantidad: c.elegidas()[0]?.cantidad,
           persona: c.elegidas()[0]?.asignacion?.trabajador, hora: c.horaCierre(),
           finca: c.finca()?.nombre, responsable: c.responsable()?.nombre,
           problemas: c.problemas() };
});
ok('42r la pantalla vuelve con la persona y el avance ya cargados',
  estado.n === 1 && estado.cantidad === '2' && String(estado.persona).includes('ALAVA'),
  JSON.stringify(estado));
// Sin esto, quien venia a corregir una hora aterriza con el encabezado vacio
// y el boton de cerrar deshabilitado.
ok('42br el encabezado se rearma solo: finca, responsable y nada que reclamar',
  String(estado.finca).length > 0 && String(estado.responsable).includes('HOLGUIN') &&
    estado.problemas.length === 0,
  JSON.stringify(estado));

// Se corrige la hora --lo que el servidor reclamaba-- y se reenvia.
await rechazarPm(false);
await p.evaluate(() => {
  const c = window['ng'].getComponent(document.querySelector('app-pm'));
  c.setHoraCierre('18:30');
});
await t(400);
await p.evaluate(() => {
  const c = window['ng'].getComponent(document.querySelector('app-pm'));
  c.irA(c.indiceRevision());
});
await t(600);
await boton('Cerrar 1 tarea').click();
await t(4000);

const cOk = await conteo();
ok('43r tras corregir no queda nada rechazado ni pendiente',
  cOk.rechazados === 0 && cOk.pendientes === 0 && cOk.enviados === 4, JSON.stringify(cOk));
const pmReenviado = (await lotes())
  .flatMap((l) => l.records ?? [])
  .filter((r) => r.tipo === 'pm')
  .pop();
ok('44r el reenvio usa el MISMO guid: el servidor sigue pudiendo deduplicar',
  pmReenviado?.guid === guidRechazado,
  `rechazado=${guidRechazado} reenviado=${pmReenviado?.guid}`);
ok('45r el reenvio lleva la hora corregida',
  String(pmReenviado?.payload?.hora_cierre ?? '').includes('18:30'),
  String(pmReenviado?.payload?.hora_cierre));

// ------------------------------------------------------------------
// 8. Valores por defecto de Configuración
// ------------------------------------------------------------------
raiz = 'app-configuracion';
await p.goto(`${APP}/configuracion`, { waitUntil: 'networkidle' });
await t(2500);
await elegirUno('Finca', 'Pacaritambo');
await elegirUno('Cultivo', 'CACAO');
ok('38 los valores por defecto quedan guardados',
  (await campo('Finca').innerText()).includes('Pacaritambo') &&
    (await campo('Cultivo').innerText()).includes('CACAO'));

raiz = 'app-am';
await p.goto(`${APP}/am`, { waitUntil: 'networkidle' });
await t(2000);
ok('39 la finca por defecto viene pre-elegida en AM',
  (await campo('Finca').innerText()).includes('Pacaritambo'), await campo('Finca').innerText());
await flecha('siguiente').click();
await t(700);
ok('40 el cultivo por defecto viene pre-elegido en la tarea',
  (await campo('Cultivo').innerText()).includes('CACAO'), await campo('Cultivo').innerText());
// Y en Pacaritambo la subtarea de Bellita no existe.
await elegirUno('Lote', 'Lote 1');
await campo('Tarea').click();
await t(600);
const tareasPacari = await p.locator('ion-modal ion-content').first().innerText();
ok('41 en la otra finca solo aparecen sus tareas',
  tareasPacari.includes('COSECHA') && !tareasPacari.includes('MANTENIMIENTO'),
  tareasPacari.replace(/\n/g, ' ').slice(0, 60));
await cerrarTocandoFuera();

raiz = 'app-configuracion';
await p.goto(`${APP}/configuracion`, { waitUntil: 'networkidle' });
await t(2000);
await p.locator(`${raiz} ion-item`, { hasText: 'Finca' }).first()
  .locator('ion-button').click();
await t(800);
ok('42 se puede quitar el valor por defecto',
  (await campo('Finca').innerText()).includes('Se elige en cada registro'),
  await campo('Finca').innerText());

ok('43 sin errores de JavaScript en toda la sesión', errs.length === 0, errs.join(' | ').slice(0, 200));

await browser.close();
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} PRUEBA(S) FALLIDA(S)`);
process.exit(fallos === 0 ? 0 : 1);
