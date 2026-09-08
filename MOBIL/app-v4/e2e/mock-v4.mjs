/**
 * Servidor V4 simulado para las pruebas e2e. Escucha en :8098.
 *
 * Existe para forzar escenarios que un servidor real no produce a pedido:
 * el portal cautivo que devuelve 200 con HTML, respuestas parciales donde
 * faltan guids, rechazos, y catálogos que revientan a mitad de escritura.
 *
 * POST /mock/modo  {"modo": "..."}  cambia el escenario y resetea la auditoría
 * GET  /mock/lotes                  qué recibió el servidor en cada POST /v4/sync
 */
import http from 'node:http';

let modo = 'ok';   // ok | html200 | rechaza | 501 | parcial | catalogo_dup
let contador = 1000;
let lotes = [];
// Estado que hace que el mock se parezca al servidor de verdad: los AM que ya
// recibio, y las asignaciones que un PM ya cerro. Sin esto no se puede probar
// ni /v4/am_abiertos ni la regla de "el PM espera si su AM no llego".
let amRecibidos = new Map();   // am_guid -> {payload, personas:[ids]}
let cerradas = new Set();      // `${am_guid}|${personal_id}`
// Postcosecha: las partidas creadas por sync y los dias de cosecha que quedan.
// El lot_code lo inventa el mock igual que el servidor: dddnnaa.
let partidas = new Map();      // guid -> { id, lot_code, payload, etapas, calidades }
let diasPendientes = [
  { fecha: '2026-08-17', cosechas: 2, sacos: 9, peso: 2779.7, cosecha_ids: [22, 23] },
  { fecha: '2026-08-20', cosechas: 1, sacos: 3, peso: 303.8, cosecha_ids: [31] },
];

// Espejo minimo de los catalogos, para poder resolver nombres en am_abiertos.
const NOMBRES = { 214: 'ALAVA TOMALA ERICKA', 301: 'BRIONES MERO JUAN',
                  26: 'HOLGUIN LUIS ALBERTO', 27: 'MENDOZA CARLOS RUBEN',
                  400: 'PACARI PEREZ ANA' };
const SUBTAREAS = { 88: 'COSECHA CACAO', 90: 'PODA DE FORMACION', 91: 'COSECHA EN PACARITAMBO' };
// Que modulo cierra cada subtarea. El criterio real es la unidad: lo que se
// paga por Libra lo cierra Cosecha, el resto el PM (Kevin, 2026-09-05).
const UNIDAD_DE_SUBTAREA = { 88: 4, 90: 2, 91: 4 };   // 4 Libra, 2 Jornal
const MODULO_DE_SUBTAREA = { 88: 'cosecha', 90: 'pm', 91: 'cosecha' };
const LOTES = { 1: '1', 5: '5', 6: 'Administrativos' };
const MODULOS = { 2: '02' };

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Device-Alias',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const json = (c, b) => { res.writeHead(c, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };

  if (req.url === '/mock/modo' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => (b += c));
    return req.on('end', () => {
      modo = JSON.parse(b).modo; lotes = [];
      amRecibidos = new Map(); cerradas = new Set();
      json(200, { modo });
    });
  }
  if (req.url === '/mock/lotes') return json(200, lotes);

  // GET /v4/am_abiertos?fecha=&finca_id=
  // Una fila por (tarea AM, persona) que todavia no cerro nadie.
  if (req.url.startsWith('/v4/am_abiertos')) {
    const u = new URL(req.url, 'http://x');
    const fecha = u.searchParams.get('fecha');
    if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return json(400, { error: 'Falta el parametro fecha (YYYY-MM-DD)' });
    }
    const modulo = u.searchParams.get('modulo') === 'cosecha' ? 'cosecha' : 'pm';
    const asignaciones = [];
    let n = 1;
    for (const [guid, am] of amRecibidos) {
      if (!String(am.payload.fecha_proceso).startsWith(fecha)) continue;
      // Un registro = una persona: el AM ya trae personal_id en singular.
      const suyo = MODULO_DE_SUBTAREA[am.payload.subtarea_id] ?? 'pm';
      if (modulo === 'cosecha' ? suyo !== 'cosecha' : suyo !== 'pm') continue;
      for (const pid of [am.payload.personal_id]) {
        if (!pid || cerradas.has(`${guid}|${pid}`)) continue;
        asignaciones.push({
          am_personal_id: n++, am_guid: guid, am_id: am.id,
          captura_guid: am.payload.captura_guid ?? null,
          fecha_proceso: am.payload.fecha_proceso,
          finca_id: am.payload.finca_id, responsable_id: am.payload.responsable_id,
          cultivo_id: am.payload.cultivo_id, lote_id: am.payload.lote_id,
          subtarea_id: am.payload.subtarea_id,
          personal_id: pid, trabajador: NOMBRES[pid] ?? `#${pid}`,
          lote: LOTES[am.payload.lote_id] ?? String(am.payload.lote_id),
          cultivo: 'CACAO',
          subtarea: SUBTAREAS[am.payload.subtarea_id] ?? 'Subtarea',
          modulos: (am.payload.modulo_ids ?? []).map((x) => MODULOS[x] ?? x).join(', ') || null,
          unidad_labor_id: UNIDAD_DE_SUBTAREA[am.payload.subtarea_id] ?? 2,
          unidad_labor: (UNIDAD_DE_SUBTAREA[am.payload.subtarea_id] ?? 2) === 4 ? 'Libra' : 'Jornal',
        });
      }
    }
    return json(200, { server_time: new Date().toISOString(), fecha, modulo, asignaciones });
  }

  if (req.url === '/v4/hora') return json(200, {
    server_time: new Date().toISOString(),
    server_epoch: Math.floor(Date.now() / 1000) + 7,   // desfase artificial
    timezone: 'America/Guayaquil' });

  if (req.url === '/v4/bootstrap') return json(200, {
    server_time: new Date().toISOString(),
    ventanas_horarias: { am: { inicio: '06:00', fin: '12:00' }, pm: { inicio: '13:00', fin: '18:00' } },
    retroactividad_dias: { am: 3, pm: 3, cosecha: 7, riego: 7, postcosecha: 30 },
    cosecha_subtarea_ids: [88], catalogos_version: 'mock-1' });

  // catálogo válido en forma pero con PK duplicada: revienta a mitad de la
  // transacción de escritura, que es justo lo que el ROLLBACK debe cubrir.
  if (req.url === '/v4/catalogos' && modo === 'catalogo_dup') return json(200, {
    version: 'mock-roto',
    fincas: [{ id: 9, nombre: 'FincaNueva', ha: 1 }],
    personal: [{ id: 999, nombre: 'X', id_finca: 9, rol: 1, rol_app: '1' }],
    lotes: [{ id: 1, lote: 'A', finca_id: 9, ha: 1, tiene_modulos: false },
            { id: 1, lote: 'B', finca_id: 9, ha: 2, tiene_modulos: false }],
    modulos: [], cultivos: [{ id: 1, nombre: 'C' }], tareas: [{ id: 3, nombre: 'T', cultivos_id: 1 }],
    subtareas: [{ id: 88, codigo: 'C', nombre: 'S', tarea_id: 3, unidad_labor_id: 4, tipo_pago_id: 1 }],
    ulabores: [{ id: 4, nombre: 'L' }] });

  if (req.url === '/v4/catalogos') return json(200, {
    version: 'mock-1',
    // DOS fincas, como en produccion: con una sola la app la preselecciona y
    // nunca se ejerce el camino de elegir responsable ANTES que la finca.
    fincas: [{ id: 1, nombre: 'Bellita', ha: 250 },
             { id: 2, nombre: 'Pacaritambo', ha: 90 }],
    // Deliberadamente desordenados y con un lote con NOMBRE: la app tiene que
    // mostrarlos 1, 5, Administrativos — y sin anteponerle "Lote" al nombre.
    lotes: [{ id: 6, lote: 'Administrativos', finca_id: 1, ha: 1.0, tiene_modulos: false },
            { id: 5, lote: '5', finca_id: 1, ha: 8.0, tiene_modulos: false },
            { id: 1, lote: '1', finca_id: 1, ha: 12.5, tiene_modulos: true },
            { id: 20, lote: '1', finca_id: 2, ha: 25.1, tiene_modulos: false }],
    modulos: [{ id: 2, modulo: '02', lote_id: 1, ha: 3.2 }],
    cultivos: [{ id: 1, nombre: 'CACAO' }],
    tareas: [{ id: 3, nombre: 'COSECHA', cultivos_id: 1 },
             { id: 4, nombre: 'MANTENIMIENTO', cultivos_id: 1 }],
    // id_finca: cada finca tiene su propio juego de subtareas (78 en Bellita,
    // 21 en Pacaritambo en los datos reales). La 91 es de la finca 2 y NO
    // tiene que aparecer trabajando en Bellita.
    subtareas: [{ id: 88, codigo: 'C-01', nombre: 'COSECHA CACAO', tarea_id: 3, id_finca: 1, unidad_labor_id: 4, tipo_pago_id: 1 },
                { id: 90, codigo: 'M-07', nombre: 'PODA DE FORMACION', tarea_id: 4, id_finca: 1, unidad_labor_id: 2, tipo_pago_id: 2 },
                { id: 91, codigo: 'C-09', nombre: 'COSECHA EN PACARITAMBO', tarea_id: 3, id_finca: 2, unidad_labor_id: 4, tipo_pago_id: 1 }],
    ulabores: [{ id: 4, nombre: 'Libra' }, { id: 2, nombre: 'Jornal' }],
    // rol 8 = responsable de campo. Es el filtro del selector de Responsable:
    // HOLGUIN tiene que aparecer ahi y los dos operarios NO.
    personal: [{ id: 214, nombre: 'ALAVA TOMALA ERICKA', id_finca: 1, rol: 13, rol_app: '1' },
               { id: 301, nombre: 'BRIONES MERO JUAN', id_finca: 1, rol: 13, rol_app: '1' },
               { id: 26, nombre: 'HOLGUIN LUIS ALBERTO', id_finca: 1, rol: 8, rol_app: '2' },
               { id: 400, nombre: 'PACARI PEREZ ANA', id_finca: 2, rol: 13, rol_app: '1' },
               { id: 27, nombre: 'MENDOZA CARLOS RUBEN', id_finca: 2, rol: 8, rol_app: '2' }] });

  if (req.url.startsWith('/v4/postcosecha_pendientes')) {
    const tomadas = new Set([...partidas.values()].flatMap((p) => p.payload.cosecha_ids ?? []));
    return json(200, {
      server_time: new Date().toISOString(),
      dias: diasPendientes
        .map((d) => ({ ...d, cosecha_ids: d.cosecha_ids.filter((i) => !tomadas.has(i)) }))
        .filter((d) => d.cosecha_ids.length > 0),
    });
  }

  if (req.url.startsWith('/v4/postcosecha_abiertas')) {
    return json(200, {
      server_time: new Date().toISOString(),
      partidas: [...partidas.values()]
        .filter((p) => !p.cerrada)
        .map((p) => ({
          id: p.id, guid: p.guid, lot_code: p.lot_code,
          fecha_cosecha: p.fecha_cosecha, fecha_inicio: p.payload.fecha_inicio,
          peso_lote: p.peso_lote, peso_mallas: Number(p.payload.peso_mallas),
          peso_baba: Math.round((p.peso_lote - Number(p.payload.peso_mallas)) * 100) / 100,
          comentario: p.payload.comentario ?? null,
          supervisor_id: p.payload.supervisor_id, supervisor: NOMBRES[p.payload.supervisor_id] ?? null,
          etapa: p.etapas.length ? p.etapas[p.etapas.length - 1].etapa : null,
          etapas: p.etapas,
          cal_ferm: p.calFerm,
          cal_secado: p.calSec,
          cosechas: (p.payload.cosecha_ids ?? []).length,
        })),
    });
  }

  if (req.url === '/v4/sync' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => (b += c));
    return req.on('end', () => {
      const { records } = JSON.parse(b);
      lotes.push({ n: records.length, guids: records.map((r) => r.guid),
                   fechas: records.map((r) => r.created_at_device),
                   // Los registros completos: las pruebas de AM/PM verifican
                   // el payload exacto contra lo que espera sync_am/sync_pm.
                   records });
      if (modo === '501') return json(501, { error: 'no implementado' });
      if (modo === 'html200') {
        res.writeHead(200, { ...cors, 'Content-Type': 'text/html' });
        return res.end('<html><body>portal cautivo del wifi</body></html>');
      }
      let rs = [];
      for (const [i, r] of records.entries()) {
        if (modo === 'rechaza' && i === 0) {
          // El texto imita al del servidor real: nombres, sin ids ni jerga.
          // Verificado con curl contra V4.php el 2026-09-02.
          rs.push({ guid: r.guid, status: 'rejected',
                    reason: 'la subtarea COSECHA CACAO no existe o esta inactiva' });
          continue;
        }
        if (r.tipo === 'pm' || r.tipo === 'cosecha') {
          // Un PM cierra un AM. Si el AM todavia no llego, el guid se OMITE de
          // results: el telefono lo deja PENDIENTE y lo reintenta. Es la misma
          // regla del servidor de verdad.
          const am = r.payload?.am_guid ? amRecibidos.get(r.payload.am_guid) : null;
          if (!am) continue;
          const suyo = MODULO_DE_SUBTAREA[am.payload.subtarea_id] ?? 'pm';
          if (r.tipo === 'cosecha' && suyo !== 'cosecha') {
            rs.push({ guid: r.guid, status: 'rejected',
                      reason: 'esa tarea de la manana no es de cosecha: se cierra desde el PM' });
            continue;
          }
          if (r.tipo === 'pm' && suyo === 'cosecha') {
            rs.push({ guid: r.guid, status: 'rejected',
                      reason: 'esa tarea es de Cosecha y se cierra desde su propia pantalla, no desde el PM' });
            continue;
          }
          const k = `${r.payload.am_guid}|${am.payload.personal_id}`;
          if (cerradas.has(k)) {
            rs.push({ guid: r.guid, status: 'rejected', reason: 'esa asignacion AM ya fue cerrada' });
            continue;
          }
          cerradas.add(k);
          // El id que vuelve es SIEMPRE el del AM, tambien en cosecha.
          rs.push({ guid: r.guid, status: 'created', id: am.id });
          continue;
        }
        if (r.tipo === 'pc_proceso') {
          const p = r.payload ?? {};
          const dia = diasPendientes.find((d) => (p.cosecha_ids ?? []).some((i) => d.cosecha_ids.includes(i)));
          const id = ++contador;
          // El consecutivo por dia, como pc_lot_code_seq.
          const ddd = String(Math.floor((new Date(dia.fecha) - new Date(dia.fecha.slice(0, 4) + '-01-01')) / 86400000) + 1).padStart(3, '0');
          const nn = String([...partidas.values()].filter((x) => x.fecha_cosecha === dia.fecha).length + 1).padStart(2, '0');
          partidas.set(r.guid, {
            id, guid: r.guid, lot_code: `${ddd}${nn}${dia.fecha.slice(2, 4)}`,
            fecha_cosecha: dia.fecha, peso_lote: dia.peso, payload: p,
            etapas: [], calFerm: null, calSec: [], cerrada: false,
          });
          rs.push({ guid: r.guid, status: 'created', id, lot_code: partidas.get(r.guid).lot_code });
          continue;
        }
        if (r.tipo === 'pc_etapa' || r.tipo === 'pc_calidad_ferm'
            || r.tipo === 'pc_calidad_sec' || r.tipo === 'pc_resultado') {
          // Sin la partida el guid se OMITE: la cola reintenta. Misma regla
          // que el PM sin su AM.
          const part = partidas.get(r.payload?.proceso_guid);
          if (!part) continue;
          if (r.tipo === 'pc_etapa') {
            if (part.etapas.some((e) => e.etapa === r.payload.etapa)) {
              rs.push({ guid: r.guid, status: 'rejected',
                        reason: `la etapa ${r.payload.etapa} de la partida ${part.lot_code} ya estaba registrada` });
              continue;
            }
            part.etapas.push({ etapa: r.payload.etapa, inicio: r.payload.inicio,
                               fin: r.payload.fin ?? null, comentario: r.payload.comentario || null });
          } else if (r.tipo === 'pc_calidad_ferm') {
            part.calFerm = { fecha_muestra: r.payload.fecha_muestra, buena: r.payload.buena,
                             ligera: r.payload.ligera, violeta: r.payload.violeta };
          } else if (r.tipo === 'pc_calidad_sec') {
            const q = r.payload;
            // `humedad_promedio` es columna generada en la base real: el mock
            // la calcula para devolver lo mismo que devolveria el servidor.
            part.calSec.push({
              etapa: q.etapa, fecha_muestra: q.fecha_muestra,
              humedad_1: q.humedad_1, humedad_2: q.humedad_2, humedad_3: q.humedad_3,
              humedad_promedio: Math.round(((q.humedad_1 + q.humedad_2 + q.humedad_3) / 3) * 1000) / 1000,
              granos_muestra: q.granos_muestra ?? null,
              indice_grano_g: q.indice_grano_g ?? null,
              granos_vacios_pct: q.granos_vacios_pct ?? null,
            });
          } else {
            part.cerrada = true;
          }
          rs.push({ guid: r.guid, status: 'created', id: part.id });
          continue;
        }
        const id = ++contador;
        if (r.tipo === 'am') amRecibidos.set(r.guid, { id, payload: r.payload ?? {} });
        rs.push({ guid: r.guid, status: 'created', id });
      }
      if (modo === 'parcial') rs = rs.slice(0, Math.floor(rs.length / 2));
      json(200, { server_time: new Date().toISOString(), results: rs });
    });
  }
  json(404, { error: 'not found' });
});

server.listen(8098, () => console.log('mock V4 en :8098'));
