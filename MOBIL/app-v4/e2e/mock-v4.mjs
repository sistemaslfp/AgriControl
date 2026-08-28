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
    return req.on('end', () => { modo = JSON.parse(b).modo; lotes = []; json(200, { modo }); });
  }
  if (req.url === '/mock/lotes') return json(200, lotes);

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
    fincas: [{ id: 1, nombre: 'Bellita', ha: 250 }],
    lotes: [{ id: 1, lote: '1', finca_id: 1, ha: 12.5, tiene_modulos: true }],
    modulos: [{ id: 2, modulo: '02', lote_id: 1, ha: 3.2 }],
    cultivos: [{ id: 1, nombre: 'CACAO' }],
    tareas: [{ id: 3, nombre: 'COSECHA', cultivos_id: 1 }],
    subtareas: [{ id: 88, codigo: 'C-01', nombre: 'COSECHA CACAO', tarea_id: 3, unidad_labor_id: 4, tipo_pago_id: 1 }],
    ulabores: [{ id: 4, nombre: 'Libra' }],
    personal: [{ id: 214, nombre: 'ALAVA TOMALA ERICKA', id_finca: 1, rol: 2, rol_app: '1' }] });

  if (req.url === '/v4/sync' && req.method === 'POST') {
    let b = ''; req.on('data', (c) => (b += c));
    return req.on('end', () => {
      const { records } = JSON.parse(b);
      lotes.push({ n: records.length, guids: records.map((r) => r.guid),
                   fechas: records.map((r) => r.created_at_device) });
      if (modo === '501') return json(501, { error: 'no implementado' });
      if (modo === 'html200') {
        res.writeHead(200, { ...cors, 'Content-Type': 'text/html' });
        return res.end('<html><body>portal cautivo del wifi</body></html>');
      }
      let rs = records.map((r, i) => (modo === 'rechaza' && i === 0)
        ? { guid: r.guid, status: 'rejected', reason: 'subtarea 88 inactiva' }
        : { guid: r.guid, status: 'created', id: ++contador });
      if (modo === 'parcial') rs = rs.slice(0, Math.floor(rs.length / 2));
      json(200, { server_time: new Date().toISOString(), results: rs });
    });
  }
  json(404, { error: 'not found' });
});

server.listen(8098, () => console.log('mock V4 en :8098'));
