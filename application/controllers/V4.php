<?php
defined('BASEPATH') or exit('No direct script access allowed');

use chriskacerguis\RestServer\RestController;

/**
 * API V4 — app móvil nueva (Ionic + Angular, offline-first).
 *
 * Contrato: MOBIL/02-bd-y-api.md §7. Reglas de sincronización y definición
 * del ACK: MOBIL/01-sincronizacion.md.
 *
 * V1.php, V2.php, V3.php y API/V3.php están CONGELADOS: no se tocan.
 * V4 escribe únicamente en tablas reg_* / pc_* (a partir del paso 2 del
 * plan); los catálogos z_* se leen, jamás se escriben desde aquí.
 *
 * Seguridad: pendiente API key por dispositivo (02-bd-y-api.md §8).
 * Activar rest_enable_keys en rest.php es GLOBAL y rompería la app v2.0.5
 * contra V3, así que la autenticación de V4 se resolverá dentro de V4.
 */
class V4 extends RestController
{
    /** @var array Config de application/config/v4.php */
    private $v4cfg;

    public function __construct()
    {
        parent::__construct();

        // NO agregar cabeceras CORS aqui. Con check_cors = true (el valor en
        // application/config/rest.php), RestController::_check_cors() corre
        // dentro de parent::__construct(), arma Access-Control-Allow-Headers
        // desde $config['allowed_cors_headers'] y hace exit() cuando el metodo
        // es OPTIONS. Cualquier header() escrito aqui es codigo muerto para el
        // preflight. Para permitir una cabecera nueva, agregarla a esa lista.
        // CORS solo importa en desarrollo con navegador: la app empaquetada
        // (Capacitor) no hace preflight.

        $this->load->config('v4', TRUE);
        $this->v4cfg = $this->config->item('v4');
    }

    /**
     * mysqli devuelve TODAS las columnas como string. El contrato de
     * /v4/catalogos (02-bd-y-api.md §7) declara números y booleanos, y la app
     * depende de eso: en JavaScript el string "0" es *truthy*, así que un
     * `tiene_modulos` que viaje como "0" marca el lote como si SÍ tuviera
     * módulos. Falla en silencio, no rompe nada visible.
     *
     * Los NULL se dejan como NULL (un `rol` vacío no debe volverse 0).
     */
    private function castRows(array $rows, array $tipos)
    {
        foreach ($rows as $r) {
            foreach ($tipos as $campo => $tipo) {
                if (!isset($r->$campo)) {
                    continue;
                }
                if ($tipo === 'int') {
                    $r->$campo = (int) $r->$campo;
                } elseif ($tipo === 'float') {
                    $r->$campo = (float) $r->$campo;
                } elseif ($tipo === 'bool') {
                    $r->$campo = (bool) (int) $r->$campo;
                }
            }
        }
        return $rows;
    }

    /**
     * Carga la base la primera vez que se la necesita y la devuelve.
     *
     * A propósito NO se carga en el constructor. `$autoload['libraries']`
     * está vacío en este proyecto (los modelos de V3 hacen su propio
     * `load->database()`), así que sin esto `$this->db` no existe y todo
     * método que la use muere con "Undefined property: V4::$db".
     *
     * Cargarla perezosamente además deja GET /v4/hora funcionando aunque
     * MySQL esté caído: es lo que permite que "Probar conexión" distinga
     * "no llego al servidor" de "el servidor responde pero la base no".
     */
    private function requireDb()
    {
        if (!isset($this->db)) {
            $this->load->database();
        }
        return $this->db;
    }

    // -----------------------------------------------------------------
    // GET /v4/hora — hora del servidor, base del clock_offset de la app
    // -----------------------------------------------------------------
    public function hora_get()
    {
        $this->response(array(
            // ISO-8601 con offset (-05:00, tz America/Guayaquil de config.php)
            'server_time'  => date('c'),
            // Epoch en segundos: la app calcula offset = epoch − floor(device_ms/1000)
            // sin depender de ningún parseo de fechas.
            'server_epoch' => time(),
            'timezone'     => date_default_timezone_get(),
        ), 200);
    }

    // -----------------------------------------------------------------
    // GET /v4/bootstrap — parámetros de operación para la app
    // -----------------------------------------------------------------
    public function bootstrap_get()
    {
        $cosecha_ids = $this->subtareas_cosecha($this->requireDb());

        $this->response(array(
            'server_time'          => date('c'),
            'ventanas_horarias'    => $this->v4cfg['ventanas_horarias'],
            'retroactividad_dias'  => $this->v4cfg['retroactividad_dias'],
            'cosecha_subtarea_ids' => $cosecha_ids,
            'catalogos_version'    => $this->catalogos_version(),
        ), 200);
    }

    // -----------------------------------------------------------------
    // GET /v4/postcosecha_pendientes — cosechas que todavia no entraron en
    // ninguna partida, agrupadas por dia, que es como las elige la pantalla.
    //
    // Sin guion en la ruta: CI mapea el segmento de URI al nombre del metodo
    // y `postcosecha-pendientes` no es un identificador PHP valido.
    // -----------------------------------------------------------------
    public function postcosecha_pendientes_get()
    {
        $db    = $this->requireDb();
        $desde = $this->input->get('desde', TRUE);

        $debug_previo = $db->db_debug;
        $db->db_debug = FALSE;
        try {
            $db->select('DATE(am.fecha_proceso) AS fecha, COUNT(*) AS cosechas,
                         SUM(c.total_peso) AS peso, SUM(c.total_sacos) AS sacos,
                         GROUP_CONCAT(c.id ORDER BY c.id) AS ids', FALSE)
               ->from('reg_cosecha c')
               ->join('reg_am am', 'am.id = c.reg_am_id')
               // Una cosecha entra en una sola partida: lo que ya se consumio
               // no se vuelve a ofrecer. Si un dia ya consumido recibe una
               // cosecha nueva, ese dia REAPARECE con el peso que falta --- en
               // v3 se perdia, porque alli se consumia la fecha entera.
               ->where('NOT EXISTS (SELECT 1 FROM pc_proceso_cosecha pc WHERE pc.cosecha_id = c.id)', NULL, FALSE);
            if (is_string($desde) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $desde)) {
                $db->where('DATE(am.fecha_proceso) >=', $desde);
            }
            $q = $db->group_by('DATE(am.fecha_proceso)')->order_by('fecha')->get();
        } catch (Throwable $e) {
            $db->db_debug = $debug_previo;
            log_message('error', 'V4 postcosecha_pendientes: ' . $e->getMessage());
            $this->response(array('error' => 'No se pudo consultar'), 500);
            return;
        }
        $db->db_debug = $debug_previo;
        if ($q === FALSE) {
            $this->response(array('error' => 'No se pudo consultar'), 500);
            return;
        }

        $dias = array();
        foreach ($q->result_array() as $f) {
            $dias[] = array(
                'fecha'       => $f['fecha'],
                'cosechas'    => (int) $f['cosechas'],
                'sacos'       => (int) $f['sacos'],
                'peso'        => (float) $f['peso'],
                'cosecha_ids' => array_map('intval', explode(',', $f['ids'])),
            );
        }
        $this->response(array('server_time' => date('c'), 'dias' => $dias), 200);
    }

    // -----------------------------------------------------------------
    // GET /v4/postcosecha_abiertas — partidas sin peso final, con la ultima
    // etapa registrada. Es la lista "Registros Abiertos" de la pantalla.
    // -----------------------------------------------------------------
    public function postcosecha_abiertas_get()
    {
        $db = $this->requireDb();

        $debug_previo = $db->db_debug;
        $db->db_debug = FALSE;
        try {
            $q = $db->select("p.id, p.guid, p.lot_code, p.fecha_cosecha, p.fecha_inicio,
                              p.peso_lote, p.peso_mallas, p.peso_baba, p.comentario,
                              p.supervisor_id, s.nombre AS supervisor,
                              (SELECT e.etapa FROM pc_etapa e
                                WHERE e.pc_proceso_id = p.id ORDER BY e.orden DESC LIMIT 1) AS etapa,
                              (SELECT COUNT(*) FROM pc_proceso_cosecha x WHERE x.pc_proceso_id = p.id) AS cosechas", FALSE)
                    ->from('pc_proceso p')
                    ->join('z_personal s', 's.id = p.supervisor_id', 'left')
                    ->where('p.peso_final IS NULL', NULL, FALSE)
                    ->order_by('p.fecha_inicio')->get();
        } catch (Throwable $e) {
            $db->db_debug = $debug_previo;
            log_message('error', 'V4 postcosecha_abiertas: ' . $e->getMessage());
            $this->response(array('error' => 'No se pudo consultar'), 500);
            return;
        }
        $db->db_debug = $debug_previo;
        if ($q === FALSE) {
            $this->response(array('error' => 'No se pudo consultar'), 500);
            return;
        }

        // castRows trabaja sobre OBJETOS, no sobre arrays asociativos: con
        // result_array() no castea nada y todo sale como string.
        $filas = $this->castRows($q->result(), array(
            'id' => 'int', 'supervisor_id' => 'int', 'cosechas' => 'int',
            'peso_lote' => 'float', 'peso_mallas' => 'float', 'peso_baba' => 'float',
        ));
        if (empty($filas)) {
            $this->response(array('server_time' => date('c'), 'partidas' => array()), 200);
            return;
        }

        // Los hijos van en TRES consultas y se cosen en PHP, no en una
        // subconsulta por fila: con GROUP_CONCAT alcanzaba para saber que
        // etapas hay, pero la pantalla ahora muestra los datos de la etapa ya
        // registrada y eso son columnas, no nombres.
        $ids = array();
        foreach ($filas as $f) {
            $ids[] = (int) $f->id;
        }
        $etapas   = $this->pc_hijos($db, $ids, 'pc_etapa',
            'pc_proceso_id, etapa, inicio, fin, comentario', 'orden',
            array('pc_proceso_id' => 'int'));
        $cal_ferm = $this->pc_hijos($db, $ids, 'pc_calidad_fermentacion',
            'pc_proceso_id, fecha_muestra, buena, ligera, violeta', 'id',
            array('pc_proceso_id' => 'int', 'buena' => 'int', 'ligera' => 'int', 'violeta' => 'int'));
        $cal_sec  = $this->pc_hijos($db, $ids, 'pc_calidad_secado',
            'pc_proceso_id, etapa, fecha_muestra, humedad_1, humedad_2, humedad_3,
             humedad_promedio, granos_muestra, indice_grano_g, granos_vacios_pct', 'id',
            array('pc_proceso_id' => 'int', 'granos_muestra' => 'int',
                  'humedad_1' => 'float', 'humedad_2' => 'float', 'humedad_3' => 'float',
                  'humedad_promedio' => 'float', 'indice_grano_g' => 'float',
                  'granos_vacios_pct' => 'float'));

        foreach ($filas as $f) {
            $f->etapas     = $this->pc_de($etapas, $f->id);
            $f->cal_secado = $this->pc_de($cal_sec, $f->id);
            $ferm          = $this->pc_de($cal_ferm, $f->id);
            $f->cal_ferm   = empty($ferm) ? NULL : $ferm[0];
        }
        $this->response(array('server_time' => date('c'), 'partidas' => $filas), 200);
    }

    // -----------------------------------------------------------------
    // GET /v4/am_abiertos — asignaciones AM sin cerrar, para la pantalla PM
    // -----------------------------------------------------------------

    /**
     * Una fila por (tarea AM, persona) de esa fecha que todavia no tiene PM.
     *
     * Es lo que la pantalla PM lista: el supervisor elige de aca y solo carga
     * el avance. Sin este endpoint el telefono solo ve lo que capturo el
     * mismo equipo, que es exactamente el agujero que dejaba la regla de
     * "una persona, una tarea AM a la vez".
     *
     * `fecha` es obligatoria y acota la consulta: sin ella esto barre la tabla
     * entera. `finca_id` es opcional.
     *
     * Sin guion en la ruta a proposito: CodeIgniter mapea el segmento de URI
     * al nombre del metodo, y `am-abiertos` no es un identificador PHP valido.
     */
    public function am_abiertos_get()
    {
        $fecha = $this->input->get('fecha', TRUE);
        if (!is_string($fecha) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
            $this->response(array('error' => 'Falta el parametro fecha (YYYY-MM-DD)'), 400);
            return;
        }
        $finca_id = $this->input->get('finca_id', TRUE);
        $finca_id = is_numeric($finca_id) ? (int) $finca_id : NULL;

        // Que pantalla pregunta. Un solo endpoint para las dos, porque la
        // consulta es la misma y lo unico que cambia es que tareas entran.
        //   pm      (por defecto) -> todo MENOS las subtareas que se pesan
        //   cosecha                -> solo las subtareas que se pesan
        $modulo = $this->input->get('modulo', TRUE);
        $modulo = ($modulo === 'cosecha') ? 'cosecha' : 'pm';

        $db = $this->requireDb();

        // db_debug TRUE (el valor fuera de produccion) convierte cualquier
        // error de base en una pagina HTML que se come la respuesta JSON. Y
        // desde PHP 8.1 mysqli ademas LANZA, asi que hace falta el try/catch:
        // sin el, esta consulta responde una traza de CI3 con 200.
        $debug_previo = $db->db_debug;
        $db->db_debug = FALSE;

        try {
            // Se resuelve ANTES de armar la consulta: el query builder de CI3
            // acumula estado en $db y una consulta anidada a mitad de armado
            // se lleva puesto el select/from de esta.
            $cos = $this->subtareas_cosecha($db);

            // OJO con los nombres de columna: z_subtarea guarda el nombre en
            // `nombre_subtarea` y z_ulabor en `ulabor_nombre`, no en `nombre`.
            // z_cultivo si usa `nombre`. La convencion esta mezclada en toda
            // la base; verificado contra el esquema real.
            // `captura_guid` va porque la pantalla PM agrupa por tarea: sin el,
            // las N personas de un mismo formulario se ven como N filas sueltas
            // ordenadas por nombre, y nadie que revise sabe cuales iban juntas.
            // Es NULL en las filas migradas con origen 'mig-pm' (avances sin AM),
            // que no salieron de ningun formulario: la app las trata como grupo
            // de una sola persona.
            $db->select('am.id AS am_personal_id, am.guid AS am_guid, am.id AS am_id,
                         am.captura_guid,
                         am.fecha_proceso, am.finca_id, am.responsable_id,
                         am.cultivo_id, am.lote_id, am.subtarea_id,
                         am.personal_id, per.nombre AS trabajador,
                         l.lote, c.nombre AS cultivo,
                         st.nombre_subtarea AS subtarea,
                         st.unidad_labor_id, u.ulabor_nombre AS unidad_labor,
                         (SELECT GROUP_CONCAT(zm.modulo ORDER BY zm.modulo SEPARATOR ", ")
                            FROM z_modulo zm
                           WHERE FIND_IN_SET(zm.id, am.modulos)) AS modulos', FALSE)
               ->from('reg_am am')
               ->join('z_personal per', 'per.id = am.personal_id')
               ->join('z_lote l', 'l.id = am.lote_id', 'left')
               ->join('z_cultivo c', 'c.id = am.cultivo_id', 'left')
               ->join('z_subtarea st', 'st.id = am.subtarea_id', 'left')
               ->join('z_ulabor u', 'u.id = st.unidad_labor_id', 'left')
               ->where('DATE(am.fecha_proceso)', $fecha)
               // Abierta = todavia sin cierre. Ya no hace falta salir a otra
               // tabla a preguntarlo: el cierre vive en la misma fila.
               ->where('am.cierre_guid IS NULL', NULL, FALSE);
            if ($finca_id !== NULL) {
                $db->where('am.finca_id', $finca_id);
            }
            // Las dos pantallas se reparten la MISMA lista: cosecha las que
            // se pesan, el PM todo el resto.
            if ($modulo === 'cosecha') {
                // Lista vacia -> pantalla vacia: mejor nada que ofrecer cerrar
                // lo que no es suyo.
                $db->where_in('am.subtarea_id', empty($cos) ? array(0) : $cos);
            } elseif (!empty($cos)) {
                $db->where_not_in('am.subtarea_id', $cos);
            }
            $q = $db->order_by('am.fecha_proceso, per.nombre')->get();
        } catch (Throwable $e) {
            $db->db_debug = $debug_previo;
            log_message('error', 'V4 am_abiertos: ' . $e->getMessage());
            $this->response(array('error' => 'No se pudo consultar'), 500);
            return;
        }
        $db->db_debug = $debug_previo;

        if ($q === FALSE) {
            $this->response(array('error' => 'No se pudo consultar'), 500);
            return;
        }

        $filas = $this->castRows($q->result(), array(
            'am_personal_id'  => 'int',
            'am_id'           => 'int',
            'finca_id'        => 'int',
            'responsable_id'  => 'int',
            'cultivo_id'      => 'int',
            'lote_id'         => 'int',
            'subtarea_id'     => 'int',
            'personal_id'     => 'int',
            'unidad_labor_id' => 'int',
        ));

        $this->response(array(
            'server_time'  => date('c'),
            'fecha'        => $fecha,
            'modulo'       => $modulo,
            'asignaciones' => $filas,
        ), 200);
    }

    // -----------------------------------------------------------------
    // GET /v4/catalogos — maestros activos, descarga completa
    // -----------------------------------------------------------------
    public function catalogos_get()
    {
        // OJO (verificado 2026-08-28 contra el schema real): la convención de
        // `estado` está MEZCLADA en los catálogos — z_cultivo/z_modulo/z_lote
        // usan '1', pero z_tarea y z_subtarea usan 'A'. Con estado='1' parejo
        // la respuesta traería CERO tareas y subtareas. Por eso el filtro es
        // estado IN ('1','A'). z_personal se filtra por eregistro='A' como V3.
        $db = $this->requireDb();

        $fincas = $db->select('id, nombre, ha')
            ->where_in('estado', array('1', 'A'))
            ->order_by('nombre')
            ->get('z_finca')->result();
        $fincas = $this->castRows($fincas, array('id' => 'int', 'ha' => 'int'));

        $lotes = $db->select('id, lote, finca_id, ha, tiene_modulos')
            ->where_in('estado', array('1', 'A'))
            ->order_by('finca_id, lote')
            ->get('z_lote')->result();
        $lotes = $this->castRows($lotes, array('id' => 'int', 'finca_id' => 'int', 'ha' => 'float', 'tiene_modulos' => 'bool'));

        $modulos = $db->select('id, modulo, lote_id, ha')
            ->where_in('estado', array('1', 'A'))
            ->order_by('lote_id, modulo')
            ->get('z_modulo')->result();
        $modulos = $this->castRows($modulos, array('id' => 'int', 'lote_id' => 'int', 'ha' => 'float'));

        $cultivos = $db->select('id, nombre')
            ->where_in('estado', array('1', 'A'))
            ->order_by('nombre')
            ->get('z_cultivo')->result();
        $cultivos = $this->castRows($cultivos, array('id' => 'int'));

        $tareas = $db->select('id, nombre, cultivos_id')
            ->where_in('estado', array('1', 'A'))
            ->order_by('nombre')
            ->get('z_tarea')->result();
        $tareas = $this->castRows($tareas, array('id' => 'int', 'cultivos_id' => 'int'));

        // Alias: el contrato V4 usa `codigo` y `nombre`; las columnas reales
        // son codigo_subtarea / nombre_subtarea.
        $subtareas = $db->select('id, codigo_subtarea AS codigo, nombre_subtarea AS nombre, tarea_id, id_finca, unidad_labor_id, tipo_pago_id')
            ->where_in('estado', array('1', 'A'))
            ->order_by('nombre_subtarea')
            ->get('z_subtarea')->result();
        $subtareas = $this->castRows($subtareas, array('id' => 'int', 'tarea_id' => 'int', 'id_finca' => 'int', 'unidad_labor_id' => 'int', 'tipo_pago_id' => 'int'));

        $ulabores = $db->select('id, ulabor_nombre AS nombre')
            ->where_in('estado', array('1', 'A'))
            ->order_by('ulabor_nombre')
            ->get('z_ulabor')->result();
        $ulabores = $this->castRows($ulabores, array('id' => 'int'));

        // Personal: se filtra por eregistro = 'A', igual que V3
        // (Personal_model::get_all). z_personal.estado existe pero es NULLable
        // y no es el flag que la operación usa hoy.
        $personal = $db->select("id, UPPER(nombre) AS nombre, id_finca, rol, rol_app", FALSE)
            ->where('eregistro', 'A')
            ->order_by('nombre')
            ->get('z_personal')->result();
        $personal = $this->castRows($personal, array('id' => 'int', 'id_finca' => 'int', 'rol' => 'int'));

        $this->response(array(
            'version'   => $this->catalogos_version(),
            'fincas'    => $fincas,
            'lotes'     => $lotes,
            'modulos'   => $modulos,
            'cultivos'  => $cultivos,
            'tareas'    => $tareas,
            'subtareas' => $subtareas,
            'ulabores'  => $ulabores,
            'personal'  => $personal,
        ), 200);
    }

    // -----------------------------------------------------------------
    // POST /v4/sync — lote de registros. Idempotente por guid.
    // -----------------------------------------------------------------
    // Contrato: MOBIL/02-bd-y-api.md §7. ACK e invariantes I1..I5:
    // MOBIL/01-sincronizacion.md.
    //
    // El lote SIEMPRE responde 200. El destino de cada registro se decide uno
    // por uno y viaja en `results`:
    //
    //   created   -> insertado. Va el id del servidor.
    //   duplicate -> el guid ya existía. No se inserta nada.
    //   rejected  -> NO se reintenta nunca. Sólo por lo que reenviar no
    //                arregla: payload inválido, catálogo inexistente, I1.
    //
    // Un guid que NO aparece en `results` se queda PENDIENTE en el teléfono y
    // se reintenta. Eso es deliberado y se usa en dos casos: un tipo que
    // todavía no se implementa y los errores de base. Un error de base nunca
    // es `rejected`: reenviar sí lo arregla.
    //
    // Implementados: `am`, `pm`, `cosecha`, `riego` y los cinco de postcosecha.

    /** Tope de registros por lote. Uno más grande se rechaza entero con 413. */
    const SYNC_MAX_RECORDS = 200;

    /** Tipos que se saben recibir. El resto se omite de `results`. */
    private static $SYNC_TIPOS = array('am', 'pm', 'cosecha', 'riego',
        'pc_proceso', 'pc_etapa', 'pc_calidad_ferm', 'pc_calidad_sec', 'pc_resultado');

    /** Las cinco etapas de una partida y su orden. */
    private static $PC_ETAPAS = array(
        'presecado' => 1, 'fermentado' => 2, 'secado_sol' => 3, 'secado_maq' => 4, 'resultado' => 5,
    );

    /** Cache por request de subtareas_cosecha(). */
    private $subtareas_cosecha_cache = NULL;

    public function sync_post()
    {
        $body = json_decode(file_get_contents('php://input'), TRUE);

        if (!is_array($body) || !isset($body['records']) || !is_array($body['records'])) {
            $this->response(array(
                'error' => 'Body invalido: se espera {device_alias, device_clock_offset, records[]}',
            ), 400);
            return;
        }
        if (count($body['records']) > self::SYNC_MAX_RECORDS) {
            $this->response(array(
                'error' => 'Lote demasiado grande: maximo ' . self::SYNC_MAX_RECORDS . ' registros',
            ), 413);
            return;
        }

        // El alias es trazabilidad, no seguridad. El header manda sobre el body.
        $alias = $this->input->get_request_header('X-Device-Alias', TRUE);
        if (!is_string($alias) || $alias === '') {
            $alias = isset($body['device_alias']) ? $body['device_alias'] : NULL;
        }
        $alias = is_string($alias) && trim($alias) !== '' ? substr(trim($alias), 0, 50) : NULL;

        $offset = isset($body['device_clock_offset']) && is_numeric($body['device_clock_offset'])
            ? (int) $body['device_clock_offset'] : NULL;

        $db = $this->requireDb();

        // db_debug viene TRUE fuera de produccion: con eso, una violacion de FK
        // imprime una pagina de error y MATA el request entero, llevandose por
        // delante los registros buenos del lote. Aca se apaga y se restaura.
        $debug_previo = $db->db_debug;
        $db->db_debug = FALSE;

        $ahora   = time();
        $results = array();
        foreach ($body['records'] as $rec) {
            try {
                $r = $this->sync_registro($db, $rec, $alias, $offset, $ahora);
            } catch (Throwable $e) {
                // Ultima red: un registro nunca puede tumbar el lote.
                log_message('error', 'V4 sync: excepcion no prevista: ' . $e->getMessage());
                $r = NULL;
            }
            if ($r !== NULL) {
                $results[] = $r;
            }
        }

        $db->db_debug = $debug_previo;

        $this->response(array(
            'server_time' => date('c', $ahora),
            'results'     => $results,
        ), 200);
    }

    /**
     * Procesa un registro del lote. Devuelve la entrada de `results`, o NULL
     * para dejarlo PENDIENTE (tipo no implementado, guid ilegible, error de base).
     *
     * Transaccion POR REGISTRO: un registro malo no arrastra a los buenos.
     */
    private function sync_registro($db, $rec, $alias, $offset, $ahora)
    {
        if (!is_array($rec)) {
            return NULL;
        }

        $guid = isset($rec['guid']) && is_string($rec['guid']) ? trim($rec['guid']) : '';
        // Sin guid legible no hay forma de acusar recibo de nada.
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $guid)) {
            return NULL;
        }

        $tipo = isset($rec['tipo']) && is_string($rec['tipo']) ? strtolower(trim($rec['tipo'])) : '';
        if (!in_array($tipo, self::$SYNC_TIPOS, TRUE)) {
            return NULL;   // se queda PENDIENTE hasta que exista el tipo
        }

        $res = $this->sync_aplica($db, $rec, $guid, $tipo, $alias, $offset, $ahora);

        // Las marcas se escriben ACA y no adentro: `rejected` hace rollback y
        // se llevaria el INSERT de reg_flag con el.
        if ($res === NULL) {
            $this->reg_flag($db, $tipo, 'error', $guid, NULL,
                'la base no acepto el registro; queda pendiente en el telefono',
                $rec, $alias, $ahora);
        } elseif ($res['status'] === 'rejected') {
            $this->reg_flag($db, $tipo, 'rechazado', $guid, NULL,
                $res['reason'], $rec, $alias, $ahora);
        } else {
            // Un registro puede traer las dos marcas: totales descuadrados y
            // ademas ser un duplicado.
            if (isset($res['_error'])) {
                $this->reg_flag($db, $tipo, 'error', $guid, $res['id'],
                    $res['_error'], $rec, $alias, $ahora);
                unset($res['_error']);
            }
            if (isset($res['_duplicado'])) {
                $this->reg_flag($db, $tipo, 'duplicado', $guid, $res['id'],
                    $res['_duplicado'], $rec, $alias, $ahora);
                unset($res['_duplicado']);
            }
        }
        // `duplicate` NO se marca: es el mismo guid llegando dos veces, o sea
        // la app reintentando porque se perdio el ACK. Es el protocolo
        // funcionando, no un problema.
        return $res;
    }

    private function sync_aplica($db, $rec, $guid, $tipo, $alias, $offset, $ahora)
    {
        // El PM ya no es una tabla: es el cierre de la MISMA fila de reg_am, y
        // su guid vive ahi, en `cierre_guid`. Eso es lo que vuelve al UPDATE
        // tan idempotente como era el INSERT.
        // Un registro = una persona en una tarea. La programacion de la
        // manana y el cierre de la tarde son la MISMA fila de reg_am; lo que
        // cambia es en que columna vive el guid.
        // Idempotencia: el guid ya recibido no se vuelve a aplicar. El id que
        // vuelve es el de reg_am en los tres tipos.
        try {
            $ya = $this->sync_id_publico($db, $tipo, $guid);
        } catch (Throwable $e) {
            return NULL;   // la base no responde: PENDIENTE, no rechazado
        }
        if ($ya !== NULL) {
            $r = array('guid' => $guid, 'status' => 'duplicate', 'id' => $ya);
            // El lot_code viaja tambien en el reenvio: si el primer ACK se
            // perdio, este es el unico camino por el que el telefono se entera
            // del numero que le toco a la partida.
            if ($tipo === 'pc_proceso') {
                $r['lot_code'] = $this->pc_lot_code_de($db, $ya);
            }
            return $r;
        }

        $payload = isset($rec['payload']) && is_array($rec['payload']) ? $rec['payload'] : NULL;
        if ($payload === NULL) {
            return $this->sync_rechazo($guid, 'payload ausente o no es un objeto');
        }

        $cad = $this->sync_fecha(isset($rec['created_at_device']) ? $rec['created_at_device'] : NULL);
        if ($cad === NULL) {
            return $this->sync_rechazo($guid, 'created_at_device ausente o no es ISO-8601');
        }

        // El try/catch NO es decorativo. Desde PHP 8.1 mysqli LANZA
        // mysqli_sql_exception en vez de devolver FALSE, y CI3 no lo sabe:
        // la excepcion sube hasta RestController, que responde una pagina de
        // error y se lleva por delante el lote entero. Con PHP 7.4 (el Docker
        // de desarrollo) mysqli devuelve FALSE y manda el camino de arriba.
        // Hay que sostener los dos, porque no está decidido en qué PHP corre
        // producción (pendiente #5 de 00-plan.md).
        try {
            $db->trans_begin();
            if ($tipo === 'am') {
                $res = $this->sync_am($db, $guid, $payload, $cad, $alias, $offset, $ahora);
            } elseif ($tipo === 'pm') {
                $res = $this->sync_pm($db, $guid, $payload, $cad, $alias, $offset, $ahora);
            } elseif ($tipo === 'cosecha') {
                $res = $this->sync_cosecha($db, $guid, $payload, $cad, $alias, $offset, $ahora);
            } elseif ($tipo === 'riego') {
                $res = $this->sync_riego($db, $guid, $payload, $cad, $alias, $offset, $ahora);
            } elseif ($tipo === 'pc_proceso') {
                $res = $this->sync_pc_proceso($db, $guid, $payload, $cad, $alias, $offset, $ahora);
            } elseif ($tipo === 'pc_etapa') {
                $res = $this->sync_pc_etapa($db, $guid, $payload);
            } elseif ($tipo === 'pc_calidad_ferm') {
                $res = $this->sync_pc_calidad_ferm($db, $guid, $payload);
            } elseif ($tipo === 'pc_calidad_sec') {
                $res = $this->sync_pc_calidad_sec($db, $guid, $payload);
            } else {
                $res = $this->sync_pc_resultado($db, $guid, $payload);
            }
        } catch (Throwable $e) {
            $db->trans_rollback();
            return $this->sync_excepcion($db, $guid, $tipo, $e);
        }

        if ($res === NULL || $res['status'] !== 'created') {
            $db->trans_rollback();
            return $res;   // NULL => PENDIENTE; rejected => no se reintenta
        }
        if ($db->trans_status() === FALSE) {
            $db->trans_rollback();
            return NULL;   // fallo de base: PENDIENTE
        }
        $db->trans_commit();
        return $res;
    }

    /**
     * Una excepcion de base al guardar. Si fue el guid duplicado (1062: dos
     * envios del mismo lote en paralelo) el registro YA existe y corresponde
     * `duplicate`. Cualquier otra cosa deja el registro PENDIENTE: nunca
     * `rejected`, porque reenviar sí lo arregla.
     */
    private function sync_excepcion($db, $guid, $tipo, $e)
    {
        if ((int) $e->getCode() === 1062) {
            try {
                $id = $this->sync_id_publico($db, $tipo, $guid);
                if ($id !== NULL) {
                    return array('guid' => $guid, 'status' => 'duplicate', 'id' => $id);
                }
            } catch (Throwable $e2) {
                // se cae al PENDIENTE de abajo
            }
        }
        log_message('error', 'V4 sync: fallo al guardar ' . $guid . ' (' . $tipo . '): ' . $e->getMessage());
        return NULL;
    }


    // -----------------------------------------------------------------
    // Postcosecha
    // -----------------------------------------------------------------

    /**
     * Arranca una partida: pesaje + las cosechas que la componen.
     *
     * El telefono NO manda peso_lote ni fecha_cosecha ni lot_code: los tres
     * salen de las cosechas enlazadas y los congela el servidor. Una cosecha
     * entra en una sola partida (uq_cosecha_una_sola_vez).
     */
    private function sync_pc_proceso($db, $guid, $p, $cad, $alias, $offset, $ahora)
    {
        $supervisor_id = $this->sync_int($p, 'supervisor_id');
        if ($supervisor_id === NULL) {
            return $this->sync_rechazo($guid, 'falta el supervisor de la partida');
        }
        if (!$this->sync_personal_activo($db, $supervisor_id)) {
            return $this->sync_rechazo($guid,
                'el supervisor ' . $this->sync_nombre($db, 'z_personal', 'nombre', $supervisor_id)
                . ' no existe o esta dado de baja');
        }

        $inicio = $this->sync_fecha(isset($p['fecha_inicio']) ? $p['fecha_inicio'] : NULL);
        if ($inicio === NULL) {
            return $this->sync_rechazo($guid, 'fecha_inicio ausente o no es ISO-8601');
        }
        if ($inicio->getTimestamp() > $ahora + 7200) {
            return $this->sync_rechazo($guid,
                'la fecha de inicio es futura: no se puede registrar una partida que todavia no empezo');
        }

        if (!isset($p['peso_mallas']) || !is_numeric($p['peso_mallas']) || (float) $p['peso_mallas'] < 0) {
            return $this->sync_rechazo($guid, 'peso_mallas ausente o negativo');
        }

        $ids = isset($p['cosecha_ids']) && is_array($p['cosecha_ids']) ? $p['cosecha_ids'] : array();
        $ids = array_values(array_unique(array_map('intval', $ids)));
        if (empty($ids)) {
            return $this->sync_rechazo($guid, 'la partida no lleva ninguna cosecha: elegi al menos un dia');
        }

        // Una consulta contesta las tres preguntas: que existe, de que dia es y
        // cuanto pesa. Lo que falte en el resultado, no existe.
        $q = $db->select('c.id, c.total_peso, DATE(a.fecha_proceso) AS fecha', FALSE)
                ->from('reg_cosecha c')->join('reg_am a', 'a.id = c.reg_am_id')
                ->where_in('c.id', $ids)->get();
        if ($q === FALSE) {
            return NULL;
        }
        $filas = $q->result();
        if (count($filas) !== count($ids)) {
            return $this->sync_rechazo($guid, 'alguna de las cosechas elegidas ya no existe: volve a traer los dias pendientes');
        }

        $tomada = $db->select('cosecha_id')->from('pc_proceso_cosecha')->where_in('cosecha_id', $ids)->limit(1)->get();
        if ($tomada !== FALSE && $tomada->row()) {
            return $this->sync_rechazo($guid,
                'una de las cosechas elegidas ya entro en otra partida: volve a traer los dias pendientes');
        }

        $peso_lote = 0.0;
        $fecha_cosecha = NULL;
        foreach ($filas as $f) {
            $peso_lote += (float) $f->total_peso;
            if ($fecha_cosecha === NULL || $f->fecha < $fecha_cosecha) {
                $fecha_cosecha = $f->fecha;
            }
        }

        $lot_code = $this->pc_lot_code($db, $fecha_cosecha);
        if ($lot_code === NULL) {
            return $this->sync_rechazo($guid,
                'ya hay 99 partidas para la cosecha del ' . $fecha_cosecha . ': el codigo no da para mas');
        }

        $ok = $db->insert('pc_proceso', array(
            'guid'                => $guid,
            'lot_code'            => $lot_code,
            'fecha_cosecha'       => $fecha_cosecha,
            'fecha_inicio'        => $inicio->format('Y-m-d H:i:s'),
            'supervisor_id'       => $supervisor_id,
            'peso_lote'           => $peso_lote,
            'peso_mallas'         => (float) $p['peso_mallas'],
            'comentario'          => $this->sync_texto($p, 'comentario', 255),
            'device_alias'        => $alias,
            'created_at_device'   => $cad->format('Y-m-d H:i:s'),
            'received_at_server'  => date('Y-m-d H:i:s', $ahora),
            'device_clock_offset' => $offset,
            'origen'              => 'app',
        ));
        if ($ok === FALSE) {
            return NULL;
        }
        $id = (int) $db->insert_id();

        foreach ($ids as $cid) {
            if ($db->insert('pc_proceso_cosecha', array('pc_proceso_id' => $id, 'cosecha_id' => $cid)) === FALSE) {
                return NULL;
            }
        }

        return array('guid' => $guid, 'status' => 'created', 'id' => $id, 'lot_code' => $lot_code);
    }

    /**
     * Una etapa de la partida. `resultado` no entra por aca: la cierra
     * `pc_resultado`, que ademas escribe el peso final.
     */
    private function sync_pc_etapa($db, $guid, $p)
    {
        $etapa = isset($p['etapa']) && is_string($p['etapa']) ? trim($p['etapa']) : '';
        if (!isset(self::$PC_ETAPAS[$etapa]) || $etapa === 'resultado') {
            return $this->sync_rechazo($guid,
                'etapa desconocida: son presecado, fermentado, secado_sol y secado_maq');
        }

        $proceso = $this->pc_proceso_de($db, $p);
        if ($proceso === FALSE) { return NULL; }
        if ($proceso === NULL) {
            // La partida todavia no llego: PENDIENTE, la cola reintenta.
            return NULL;
        }
        if ($proceso->peso_final !== NULL) {
            return $this->sync_rechazo($guid,
                'la partida ' . $proceso->lot_code . ' ya se cerro con su peso final');
        }

        $inicio = $this->sync_fecha(isset($p['inicio']) ? $p['inicio'] : NULL);
        if ($inicio === NULL) {
            return $this->sync_rechazo($guid, 'inicio ausente o no es ISO-8601');
        }
        // El fin es OBLIGATORIO desde el 2026-09-08 (Kevin): una etapa se
        // registra cuando termino. La columna sigue admitiendo NULL porque la
        // data migrada de v3 tiene etapas abiertas, pero por /v4/sync ya no
        // entra ninguna mas.
        $fin = $this->sync_fecha(isset($p['fin']) ? $p['fin'] : NULL);
        if ($fin === NULL) {
            return $this->sync_rechazo($guid,
                'fin ausente o no es ISO-8601: una etapa se registra cuando termino');
        }
        if ($fin < $inicio) {
            return $this->sync_rechazo($guid, 'la etapa termina antes de empezar');
        }

        // El UNIQUE (partida, etapa) lo atajaria, pero como 1062 el motivo se
        // pierde y el registro quedaria PENDIENTE reintentando para siempre.
        $ya = $db->select('id')->from('pc_etapa')
                 ->where('pc_proceso_id', (int) $proceso->id)->where('etapa', $etapa)->limit(1)->get();
        if ($ya === FALSE) { return NULL; }
        if ($ya->row()) {
            return $this->sync_rechazo($guid,
                'la etapa ' . $etapa . ' de la partida ' . $proceso->lot_code . ' ya estaba registrada');
        }

        $ok = $db->insert('pc_etapa', array(
            'guid'               => $guid,
            'pc_proceso_id'      => (int) $proceso->id,
            'etapa'              => $etapa,
            'orden'              => self::$PC_ETAPAS[$etapa],
            'inicio'             => $inicio->format('Y-m-d H:i:s'),
            'fin'                => $fin === NULL ? NULL : $fin->format('Y-m-d H:i:s'),
            'comentario'         => $this->sync_texto($p, 'comentario', 255),
            'received_at_server' => date('Y-m-d H:i:s'),
        ));
        return $ok === FALSE ? NULL : array('guid' => $guid, 'status' => 'created', 'id' => (int) $proceso->id);
    }

    /** El corte de grano del fermentado. Uno solo por partida. */
    private function sync_pc_calidad_ferm($db, $guid, $p)
    {
        $proceso = $this->pc_proceso_de($db, $p);
        if ($proceso === FALSE || $proceso === NULL) { return NULL; }

        $fecha = $this->sync_fecha(isset($p['fecha_muestra']) ? $p['fecha_muestra'] : NULL);
        if ($fecha === NULL) {
            return $this->sync_rechazo($guid, 'fecha_muestra ausente o no es ISO-8601');
        }
        $granos = array();
        foreach (array('buena', 'ligera', 'violeta') as $k) {
            if (!isset($p[$k]) || !is_numeric($p[$k]) || (int) $p[$k] < 0) {
                return $this->sync_rechazo($guid, 'el conteo de granos ' . $k . ' falta o es negativo');
            }
            $granos[$k] = (int) $p[$k];
        }
        if (array_sum($granos) === 0) {
            return $this->sync_rechazo($guid, 'el corte de grano no puede ser todo ceros');
        }

        $ya = $db->select('id')->from('pc_calidad_fermentacion')
                 ->where('pc_proceso_id', (int) $proceso->id)->limit(1)->get();
        if ($ya === FALSE) { return NULL; }
        if ($ya->row()) {
            return $this->sync_rechazo($guid,
                'la partida ' . $proceso->lot_code . ' ya tiene su corte de grano de fermentado');
        }

        $ok = $db->insert('pc_calidad_fermentacion', array(
            'guid'               => $guid,
            'pc_proceso_id'      => (int) $proceso->id,
            'fecha_muestra'      => $fecha->format('Y-m-d H:i:s'),
            'buena'              => $granos['buena'],
            'ligera'             => $granos['ligera'],
            'violeta'            => $granos['violeta'],
            'received_at_server' => date('Y-m-d H:i:s'),
        ));
        return $ok === FALSE ? NULL : array('guid' => $guid, 'status' => 'created', 'id' => (int) $proceso->id);
    }

    /** Humedad e indice de grano. Aplica a los DOS secados, uno por etapa. */
    private function sync_pc_calidad_sec($db, $guid, $p)
    {
        $etapa = isset($p['etapa']) && is_string($p['etapa']) ? trim($p['etapa']) : '';
        if ($etapa !== 'secado_sol' && $etapa !== 'secado_maq') {
            return $this->sync_rechazo($guid, 'la calidad de secado va en secado_sol o secado_maq');
        }
        $proceso = $this->pc_proceso_de($db, $p);
        if ($proceso === FALSE || $proceso === NULL) { return NULL; }

        $fecha = $this->sync_fecha(isset($p['fecha_muestra']) ? $p['fecha_muestra'] : NULL);
        if ($fecha === NULL) {
            return $this->sync_rechazo($guid, 'fecha_muestra ausente o no es ISO-8601');
        }
        $h = array();
        foreach (array('humedad_1', 'humedad_2', 'humedad_3') as $k) {
            if (!isset($p[$k]) || !is_numeric($p[$k]) || (float) $p[$k] <= 0) {
                return $this->sync_rechazo($guid, 'falta la lectura ' . $k . ' de humedad');
            }
            $h[$k] = (float) $p[$k];
        }

        $ya = $db->select('id')->from('pc_calidad_secado')
                 ->where('pc_proceso_id', (int) $proceso->id)->where('etapa', $etapa)->limit(1)->get();
        if ($ya === FALSE) { return NULL; }
        if ($ya->row()) {
            return $this->sync_rechazo($guid,
                'la partida ' . $proceso->lot_code . ' ya tiene la calidad de ' . $etapa);
        }

        $ok = $db->insert('pc_calidad_secado', array(
            'guid'               => $guid,
            'pc_proceso_id'      => (int) $proceso->id,
            'etapa'              => $etapa,
            'fecha_muestra'      => $fecha->format('Y-m-d H:i:s'),
            'humedad_1'          => $h['humedad_1'],
            'humedad_2'          => $h['humedad_2'],
            'humedad_3'          => $h['humedad_3'],
            'granos_muestra'     => $this->sync_int($p, 'granos_muestra'),
            'indice_grano_g'     => isset($p['indice_grano_g']) && is_numeric($p['indice_grano_g']) ? (float) $p['indice_grano_g'] : NULL,
            'granos_vacios_pct'  => isset($p['granos_vacios_pct']) && is_numeric($p['granos_vacios_pct']) ? (float) $p['granos_vacios_pct'] : NULL,
            'received_at_server' => date('Y-m-d H:i:s'),
        ));
        return $ok === FALSE ? NULL : array('guid' => $guid, 'status' => 'created', 'id' => (int) $proceso->id);
    }

    /**
     * El peso final CIERRA la partida: escribe `peso_final` y deja la etapa
     * `resultado`. Las dos cosas en la misma transaccion y con el mismo guid,
     * porque para el supervisor es un solo acto.
     */
    private function sync_pc_resultado($db, $guid, $p)
    {
        $proceso = $this->pc_proceso_de($db, $p);
        if ($proceso === FALSE || $proceso === NULL) { return NULL; }

        if (!isset($p['peso_final']) || !is_numeric($p['peso_final']) || (float) $p['peso_final'] <= 0) {
            return $this->sync_rechazo($guid, 'peso_final ausente o no positivo');
        }
        $fecha = $this->sync_fecha(isset($p['fecha']) ? $p['fecha'] : NULL);
        if ($fecha === NULL) {
            return $this->sync_rechazo($guid, 'fecha ausente o no es ISO-8601');
        }

        // `peso_final IS NULL` hace el cierre atomico sin transaccion, igual
        // que `cierre_guid IS NULL` en el PM.
        $db->where('id', (int) $proceso->id)->where('peso_final IS NULL', NULL, FALSE);
        $ok = $db->update('pc_proceso', array('peso_final' => (float) $p['peso_final']));
        if ($ok === FALSE) { return NULL; }
        if ($db->affected_rows() === 0) {
            return $this->sync_rechazo($guid,
                'la partida ' . $proceso->lot_code . ' ya estaba cerrada con su peso final');
        }

        $ok = $db->insert('pc_etapa', array(
            'guid'               => $guid,
            'pc_proceso_id'      => (int) $proceso->id,
            'etapa'              => 'resultado',
            'orden'              => self::$PC_ETAPAS['resultado'],
            'inicio'             => $fecha->format('Y-m-d H:i:s'),
            'fin'                => $fecha->format('Y-m-d H:i:s'),
            'comentario'         => $this->sync_texto($p, 'comentario', 255),
            'received_at_server' => date('Y-m-d H:i:s'),
        ));
        return $ok === FALSE ? NULL : array('guid' => $guid, 'status' => 'created', 'id' => (int) $proceso->id);
    }

    /**
     * La partida a la que apunta un registro hijo, por su guid.
     * FALSE = la base no contesta; NULL = todavia no llego (PENDIENTE).
     */
    private function pc_proceso_de($db, $p)
    {
        $g = isset($p['proceso_guid']) && is_string($p['proceso_guid']) ? trim($p['proceso_guid']) : '';
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $g)) {
            return NULL;
        }
        $q = $db->select('id, lot_code, peso_final')->from('pc_proceso')->where('guid', $g)->limit(1)->get();
        if ($q === FALSE) { return FALSE; }
        $f = $q->row();
        return $f ? $f : NULL;
    }

    /**
     * Los hijos de un conjunto de partidas, en una sola consulta. Devuelve las
     * filas casteadas; `pc_de()` las reparte despues por partida.
     */
    private function pc_hijos($db, $ids, $tabla, $columnas, $orden, $tipos)
    {
        $q = $db->select($columnas, FALSE)->from($tabla)
                ->where_in('pc_proceso_id', empty($ids) ? array(0) : $ids)
                ->order_by($orden)->get();
        return ($q === FALSE) ? array() : $this->castRows($q->result(), $tipos);
    }

    /** Las filas hijas de UNA partida, sin el id del padre repetido adentro. */
    private function pc_de($filas, $id)
    {
        $salida = array();
        foreach ($filas as $f) {
            if ((int) $f->pc_proceso_id === (int) $id) {
                $copia = clone $f;
                unset($copia->pc_proceso_id);
                $salida[] = $copia;
            }
        }
        return $salida;
    }

    /** El lot_code de una partida ya guardada. */
    private function pc_lot_code_de($db, $id)
    {
        $q = $db->select('lot_code')->from('pc_proceso')->where('id', (int) $id)->limit(1)->get();
        $f = ($q === FALSE) ? NULL : $q->row();
        return $f ? $f->lot_code : NULL;
    }

    /**
     * `dddnnaa`: dia juliano de la cosecha, consecutivo del dia y anio en dos
     * digitos. El consecutivo sale de una tabla propia con el truco de
     * LAST_INSERT_ID, que es atomico sin bloquear la tabla.
     * NULL si ese dia ya gasto los 99: nunca envuelve a 00.
     */
    private function pc_lot_code($db, $fecha)
    {
        $t   = strtotime($fecha);
        $ddd = (int) date('z', $t) + 1;
        $aa  = (int) date('y', $t);
        $db->query('INSERT INTO pc_lot_code_seq (julian_day, year_2d, last_seq)
                    VALUES (?, ?, LAST_INSERT_ID(1))
                    ON DUPLICATE KEY UPDATE last_seq = LAST_INSERT_ID(last_seq + 1)', array($ddd, $aa));
        $r  = $db->query('SELECT LAST_INSERT_ID() AS nn')->row();
        $nn = $r ? (int) $r->nn : 0;
        if ($nn < 1 || $nn > 99) {
            return NULL;
        }
        return sprintf('%03d%02d%02d', $ddd, $nn, $aa);
    }

    /**
     * El id que ve el telefono. En AM, PM y cosecha es el de `reg_am`; en
     * postcosecha, el de la partida.
     *
     * No es cosmetico: sin esto un mismo guid devolvia 42 al crearse (el id
     * del AM) y 1 al reenviarse (el id de reg_cosecha), y la app se guardaba
     * el segundo encima del primero.
     */
    private function sync_id_publico($db, $tipo, $guid)
    {
        // En postcosecha el id publico es el de la PARTIDA, por la misma razon
        // que en cosecha es el del AM: el telefono guarda un solo id por
        // registro y tiene que ser el mismo en el alta y en el reenvio.
        if ($tipo === 'pc_proceso') {
            $q = $db->select('id')->from('pc_proceso')->where('guid', $guid)->limit(1)->get();
        } elseif ($tipo === 'pc_etapa' || $tipo === 'pc_resultado') {
            $q = $db->select('pc_proceso_id AS id')->from('pc_etapa')->where('guid', $guid)->limit(1)->get();
        } elseif ($tipo === 'pc_calidad_ferm') {
            $q = $db->select('pc_proceso_id AS id')->from('pc_calidad_fermentacion')->where('guid', $guid)->limit(1)->get();
        } elseif ($tipo === 'pc_calidad_sec') {
            $q = $db->select('pc_proceso_id AS id')->from('pc_calidad_secado')->where('guid', $guid)->limit(1)->get();
        } elseif ($tipo === 'cosecha') {
            $q = $db->select('reg_am_id AS id')->from('reg_cosecha')
                    ->where('guid', $guid)->limit(1)->get();
        } elseif ($tipo === 'riego') {
            // Riego NO cierra nada: su id publico es el suyo propio, no el de
            // ningun AM. Es una bitacora, no un cierre.
            $q = $db->select('id')->from('reg_riego')->where('guid', $guid)->limit(1)->get();
        } elseif ($tipo === 'pm') {
            $q = $db->select('id')->from('reg_am')->where('cierre_guid', $guid)->limit(1)->get();
        } else {
            $q = $db->select('id')->from('reg_am')->where('guid', $guid)->limit(1)->get();
        }
        $f = ($q === FALSE) ? NULL : $q->row();
        return $f ? (int) $f->id : NULL;
    }

    /** Entrada de `results` para un rechazo duro. */
    private function sync_rechazo($guid, $razon)
    {
        return array('guid' => $guid, 'status' => 'rejected', 'reason' => $razon);
    }

    // -----------------------------------------------------------------
    // AM — cabecera + personas + modulos
    // -----------------------------------------------------------------
    private function sync_am($db, $guid, $p, $cad, $alias, $offset, $ahora)
    {
        $fecha = $this->sync_fecha(isset($p['fecha_proceso']) ? $p['fecha_proceso'] : NULL);
        if ($fecha === NULL) {
            return $this->sync_rechazo($guid, 'fecha_proceso ausente o no es ISO-8601');
        }

        // `personal_id` en singular: cada persona es su propio registro, con
        // su propio guid y su propio ACK. La pantalla acumula varias personas
        // y manda N registros; eso es del front, no del modelo.
        $ids = array();
        foreach (array('finca_id', 'responsable_id', 'cultivo_id', 'lote_id', 'subtarea_id', 'personal_id') as $campo) {
            $v = $this->sync_int($p, $campo);
            if ($v === NULL) {
                return $this->sync_rechazo($guid, $campo . ' ausente o no es un entero positivo');
            }
            $ids[$campo] = $v;
        }

        $err = $this->sync_valida_catalogos($db, $ids);
        if ($err !== NULL) {
            return $this->sync_rechazo($guid, $err);
        }
        if (!$this->sync_personal_activo($db, $ids['personal_id'])) {
            return $this->sync_rechazo($guid,
                'el trabajador ' . $this->sync_nombre($db, 'z_personal', 'nombre', $ids['personal_id'])
                . ' no existe o esta dado de baja');
        }

        $modulos = $this->sync_lista_ids($p, 'modulo_ids');
        if ($modulos === NULL) {
            return $this->sync_rechazo($guid, 'modulo_ids debe ser una lista de enteros positivos');
        }
        // Este chequeo es lo que sostiene la integridad de la columna `modulos`
        // ahora que no hay FK: sin el, se puede guardar el modulo de otro lote,
        // que es lo que paso 16 veces en z_tabla_am.
        foreach ($modulos as $mid) {
            if (!$this->sync_modulo_de_lote($db, $mid, $ids['lote_id'])) {
                // Los nombres de modulo se repiten entre lotes --cada lote
                // tiene su "1"-- asi que nombrarlo solo no distingue nada. Lo
                // util es decir de que lote ES, que es lo que hay que corregir.
                return $this->sync_rechazo($guid,
                    $this->sync_motivo_modulo($db, $mid, $ids['lote_id']));
            }
        }

        // El guid de la captura: lo comparten las N personas del mismo
        // formulario. Es lo unico que permite volver a juntarlas despues.
        $captura = isset($p['captura_guid']) && is_string($p['captura_guid'])
            && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', trim($p['captura_guid']))
            ? trim($p['captura_guid']) : NULL;

        // I1: unico rechazo duro por fecha.
        if ($fecha->getTimestamp() > $ahora + 7200) {
            return $this->sync_rechazo($guid,
                'la fecha de proceso es futura: no se puede registrar trabajo que todavia no ocurrio');
        }

        // Una persona no puede tener dos AM abiertos el mismo dia (Kevin,
        // 2026-09-04). Cerrado el primero con el PM, el segundo entra.
        $abierto = $this->sync_am_abierto($db, $guid, $ids['personal_id'], $fecha);
        if ($abierto !== NULL) {
            return $this->sync_rechazo($guid, $abierto);
        }

        $ok = $db->insert('reg_am', array(
            'guid'                => $guid,
            'captura_guid'        => $captura,
            'fecha_proceso'       => $fecha->format('Y-m-d H:i:s'),
            'finca_id'            => $ids['finca_id'],
            'responsable_id'      => $ids['responsable_id'],
            'cultivo_id'          => $ids['cultivo_id'],
            'lote_id'             => $ids['lote_id'],
            'modulos'             => $this->sync_modulos_csv($modulos),
            'subtarea_id'         => $ids['subtarea_id'],
            'personal_id'         => $ids['personal_id'],
            'comentario'          => $this->sync_texto($p, 'comentario', 255),
            'device_alias'        => $alias,
            'created_at_device'   => $cad->format('Y-m-d H:i:s'),
            'received_at_server'  => date('Y-m-d H:i:s', $ahora),
            'device_clock_offset' => $offset,
            'origen'              => 'app',
        ));
        if ($ok === FALSE) {
            return $this->sync_error_insert($db, $guid, 'am');
        }
        $id = (int) $db->insert_id();

        $out = array('guid' => $guid, 'status' => 'created', 'id' => $id);
        $dup = $this->sync_am_duplicado($db, $ids, $fecha, $id);
        if ($dup !== NULL) {
            $out['_duplicado'] = $dup;
        }
        return $out;
    }

    /**
     * Motivo si esa persona ya tiene un AM SIN CERRAR ese dia; NULL si no.
     *
     * Excluye el propio guid: un reenvio del mismo registro tiene que seguir
     * llegando al INSERT para que el 1062 lo devuelva como `duplicate`. Sin
     * eso, perder un ACK convertia el reintento en un rechazo duro.
     */
    private function sync_am_abierto($db, $guid, $personal_id, $fecha)
    {
        $dia = $fecha->format('Y-m-d');
        try {
            $q = $db->select('am.id, s.nombre_subtarea AS subtarea')
                    ->from('reg_am am')
                    ->join('z_subtarea s', 's.id = am.subtarea_id', 'left')
                    ->where('am.personal_id', $personal_id)
                    ->where('am.guid !=', $guid)
                    ->where('am.cierre_guid IS NULL', NULL, FALSE)
                    ->where('am.fecha_proceso >=', $dia . ' 00:00:00')
                    ->where('am.fecha_proceso <=', $dia . ' 23:59:59')
                    ->order_by('am.id', 'ASC')->limit(1)->get();
        } catch (Throwable $e) {
            return NULL;   // detectar no puede tumbar un registro valido
        }
        $f = ($q === FALSE) ? NULL : $q->row();
        if (!$f) {
            return NULL;
        }
        $sub = trim((string) $f->subtarea);
        return 'esa persona ya tiene la tarea AM #' . (int) $f->id . ' sin cerrar del ' . $dia
             . ($sub === '' ? '' : ' (' . $sub . ')')
             . ': cerrala con el PM antes de cargarle otra';
    }

    /**
     * La misma persona en la misma subtarea, finca y dia, otra vez. Se acepta
     * igual: no se bloquea una captura en campo por esto. Solo se marca.
     *
     * Distinta subtarea el mismo dia NO es duplicado: es una reasignacion, y
     * de los 63 pares (fecha, persona) repetidos de agosto 9 lo eran.
     */
    private function sync_am_duplicado($db, $ids, $fecha, $id)
    {
        $dia = $fecha->format('Y-m-d');
        try {
            $q = $db->select('id')->from('reg_am')
                    ->where('personal_id', $ids['personal_id'])
                    ->where('subtarea_id', $ids['subtarea_id'])
                    ->where('finca_id', $ids['finca_id'])
                    ->where('fecha_proceso >=', $dia . ' 00:00:00')
                    ->where('fecha_proceso <=', $dia . ' 23:59:59')
                    ->where('id !=', $id)
                    ->order_by('id', 'ASC')->limit(1)->get();
        } catch (Throwable $e) {
            return NULL;   // detectar no puede tumbar un registro valido
        }
        $fila = ($q === FALSE) ? NULL : $q->row();
        return $fila
            ? ('ya existe el registro #' . (int) $fila->id
               . ' de la misma persona en la misma subtarea el ' . $dia)
            : NULL;
    }

    // -----------------------------------------------------------------
    // PM — CIERRE de una asignacion AM, no un registro suelto
    // -----------------------------------------------------------------

    /**
     * Decision de Kevin (2026-09-01): un PM es el reflejo de un AM. La app ya
     * no crea tareas en PM: elige una asignacion AM abierta y carga el avance.
     *
     * Por eso el payload se reduce a:
     *   am_guid, trabajador_id, cantidad, [hora_cierre], [responsable_id],
     *   [comentario]
     *
     * Todo lo demas -- finca, cultivo, lote, subtarea, modulos, fecha de
     * proceso -- se DERIVA del AM. El telefono no puede contradecirlo, que es
     * justamente el punto: antes podia mandar un PM con un lote distinto al
     * de la programacion de la manana.
     *
     * La regla que hace que esto funcione offline: **si el AM todavia no
     * llego al servidor, se devuelve NULL**. El guid del PM no aparece en
     * `results`, el telefono lo deja PENDIENTE y lo reintenta. Es el mismo
     * mecanismo del guid omitido, sin nada nuevo. Pasa siempre que el AM y su
     * PM viajan en lotes distintos, o cuando el AM quedo trabado por red.
     */
    private function sync_pm($db, $guid, $p, $cad, $alias, $offset, $ahora)
    {
        $am_guid = isset($p['am_guid']) && is_string($p['am_guid']) ? trim($p['am_guid']) : '';
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $am_guid)) {
            // Rechazo duro: reenviar no lo arregla. Un cierre sin programacion
            // no existe.
            return $this->sync_rechazo($guid, 'am_guid ausente o ilegible: el PM cierra una tarea AM');
        }

        $q = $db->select('id, fecha_proceso, responsable_id, personal_id, cierre_guid, subtarea_id')
                ->from('reg_am')->where('guid', $am_guid)->limit(1)->get();
        if ($q === FALSE) {
            return NULL;   // la base no responde: PENDIENTE
        }
        $am = $q->row();
        if (!$am) {
            // La programacion todavia no llego (otro lote, o trabada por red).
            // PENDIENTE: la cola lo reintenta sola cuando entre. Es la misma
            // regla del guid omitido, y es lo que hace que este UPDATE sea tan
            // seguro offline como lo era un INSERT.
            return NULL;
        }

        // Lo que se paga por peso no se cierra desde el PM: ahi la cantidad
        // son los sacos. Rechazo duro -- reenviar no lo arregla.
        if (in_array((int) $am->subtarea_id, $this->subtareas_cosecha($db), TRUE)) {
            return $this->sync_rechazo($guid,
                'la subtarea ' . $this->sync_nombre($db, 'z_subtarea', 'nombre_subtarea', (int) $am->subtarea_id)
                . ' se cierra desde la pantalla de Cosecha, no desde el PM');
        }

        // El trabajador es redundante -- la fila ya sabe de quien es -- pero
        // si viene tiene que coincidir. Es la red que atrapa un am_guid mal
        // copiado antes de escribir el avance en la persona equivocada.
        $trabajador_id = $this->sync_int($p, 'trabajador_id');
        if ($trabajador_id !== NULL && $trabajador_id !== (int) $am->personal_id) {
            return $this->sync_rechazo(
                $guid,
                // Sin el guid: al supervisor no le dice nada y el mensaje se
                // vuelve ilegible. Lo que necesita saber es de quien SI es.
                'esa tarea de la manana no es de '
                . $this->sync_nombre($db, 'z_personal', 'nombre', $trabajador_id)
                . ', es de ' . $this->sync_nombre($db, 'z_personal', 'nombre', (int) $am->personal_id)
            );
        }

        if ($am->cierre_guid !== NULL) {
            // El mismo guid ya se filtro antes (idempotencia). Llegar aca con
            // otro es un segundo cierre de la misma tarea.
            return $this->sync_rechazo(
                $guid,
                'esa tarea de la manana ya fue cerrada'
            );
        }

        if (!isset($p['cantidad']) || !is_numeric($p['cantidad']) || (float) $p['cantidad'] < 0) {
            return $this->sync_rechazo($guid, 'cantidad ausente o negativa');
        }

        // Responsable: quien zanja la tarea. Puede no ser el que la programo.
        $responsable_id = $this->sync_int($p, 'responsable_id');
        if ($responsable_id === NULL) {
            $responsable_id = (int) $am->responsable_id;
        } elseif (!$this->sync_personal_activo($db, $responsable_id)) {
            return $this->sync_rechazo($guid,
                'el responsable ' . $this->sync_nombre($db, 'z_personal', 'nombre', $responsable_id)
                . ' no existe o esta dado de baja');
        }

        // La hora de inicio SALE de la programacion: el cierre no la redefine.
        $inicio = $this->sync_fecha($am->fecha_proceso);
        if ($inicio === NULL) {
            return NULL;
        }

        // hora_cierre es lo unico temporal que aporta el cierre. Sin ella se
        // usa el momento de captura, que es lo que hacia la app vieja -- y por
        // eso todos los tiempos salian en cero.
        $cierre = $this->sync_hora($p, 'hora_cierre', $inicio);
        if ($cierre === NULL) {
            $cierre = clone $cad;
        }
        if ($cierre->getTimestamp() < $inicio->getTimestamp()) {
            return $this->sync_rechazo($guid, 'hora_cierre anterior a la hora de la tarea AM');
        }

        // `cierre_guid IS NULL` dentro del WHERE hace el cierre atomico sin
        // transaccion: si dos equipos cierran la misma tarea a la vez, uno
        // actualiza una fila y el otro cero.
        $ok = $db->set(array(
                'cantidad'                 => (float) $p['cantidad'],
                'hora_cierre'              => $cierre->format('Y-m-d H:i:s'),
                'comentario_cierre'        => $this->sync_texto($p, 'comentario', 255),
                'responsable_cierre_id'    => $responsable_id,
                'cierre_guid'              => $guid,
                'cierre_device_alias'      => $alias,
                'cierre_created_at_device' => $cad->format('Y-m-d H:i:s'),
                'cierre_received_at'       => date('Y-m-d H:i:s', $ahora),
                'cierre_offset'            => $offset,
                'cierre_origen'            => 'app',
            ))
            ->where('id', (int) $am->id)
            ->where('cierre_guid IS NULL', NULL, FALSE)
            ->update('reg_am');
        if ($ok === FALSE) {
            return NULL;   // fallo de base: PENDIENTE, reenviar si lo arregla
        }
        if ($db->affected_rows() === 0) {
            // Alguien gano la carrera entre el SELECT y el UPDATE.
            return $this->sync_rechazo($guid, 'esa tarea de la manana ya fue cerrada');
        }

        // El ano y la semana de pago NO se guardan: se derivan de
        // fecha_proceso en vw_reg_reporte_pago, con WEEK(...,3) que es el ISO.
        // V3 los guardaba calculados con 'Y'.'W' y por eso 181 filas del 29 al
        // 31 de diciembre de 2025 quedaron como (2025, semana 1). Un valor que
        // se deriva no puede quedar mal guardado.
        return array('guid' => $guid, 'status' => 'created', 'id' => (int) $am->id);
    }

    // -----------------------------------------------------------------
    // Helpers de sync
    // -----------------------------------------------------------------

    // -----------------------------------------------------------------
    // COSECHA DE CACAO — CIERRE de una tarea AM, no un registro suelto
    // -----------------------------------------------------------------

    /**
     * Decision de Kevin (2026-09-03): cosecha funciona como el PM. Todas las
     * tareas viven en `reg_am`; cosecha elige una de las que tienen tarea
     * "Cosecha" y le carga el detalle de sacos de esa persona. NO se vuelve a
     * elegir trabajador: la tarea ya lo trae.
     *
     * Por eso el payload se reduce a:
     *   am_guid, sacos[], [hora_cierre], [responsable_id], [trabajador_id],
     *   [observaciones]
     *
     * **La suma de las libras es el avance de la tarea**: este metodo escribe
     * `reg_am.cantidad` con `total_peso`. No es una interpretacion: de 14.466
     * pares (PM de cosecha, fila de z_cosecha_cacao) del mismo dia, trabajador
     * y subtarea, 13.835 tienen `pm.cantidad = total_peso` (95,6 %) y NINGUNO
     * coincide con el conteo de sacos.
     */
    private function sync_cosecha($db, $guid, $p, $cad, $alias, $offset, $ahora)
    {
        $am_guid = isset($p['am_guid']) && is_string($p['am_guid']) ? trim($p['am_guid']) : '';
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $am_guid)) {
            return $this->sync_rechazo($guid,
                'am_guid ausente o ilegible: la cosecha cierra una tarea AM');
        }

        $q = $db->select('id, fecha_proceso, responsable_id, personal_id, cierre_guid, subtarea_id')
                ->from('reg_am')->where('guid', $am_guid)->limit(1)->get();
        if ($q === FALSE) {
            return NULL;
        }
        $am = $q->row();
        if (!$am) {
            // La programacion todavia no llego: PENDIENTE, la cola reintenta.
            return NULL;
        }

        if (!in_array((int) $am->subtarea_id, $this->subtareas_cosecha($db), TRUE)) {
            return $this->sync_rechazo($guid,
                'esa tarea de la manana no se paga por peso: se cierra desde el PM');
        }

        $trabajador_id = $this->sync_int($p, 'trabajador_id');
        if ($trabajador_id !== NULL && $trabajador_id !== (int) $am->personal_id) {
            return $this->sync_rechazo($guid,
                'esa tarea de la manana no es de '
                . $this->sync_nombre($db, 'z_personal', 'nombre', $trabajador_id)
                . ', es de ' . $this->sync_nombre($db, 'z_personal', 'nombre', (int) $am->personal_id));
        }
        if ($am->cierre_guid !== NULL) {
            return $this->sync_rechazo($guid, 'esa tarea de la manana ya fue cerrada');
        }

        $sacos = $this->sync_sacos($p);
        if ($sacos === NULL) {
            return $this->sync_rechazo($guid,
                'sacos debe ser una lista de {numero, libras} con numeros distintos y libras positivas');
        }
        if (empty($sacos)) {
            return $this->sync_rechazo($guid, 'una cosecha sin sacos no es un registro de cosecha');
        }

        $responsable_id = $this->sync_int($p, 'responsable_id');
        if ($responsable_id === NULL) {
            $responsable_id = (int) $am->responsable_id;
        } elseif (!$this->sync_personal_activo($db, $responsable_id)) {
            return $this->sync_rechazo($guid,
                'el responsable ' . $this->sync_nombre($db, 'z_personal', 'nombre', $responsable_id)
                . ' no existe o esta dado de baja');
        }

        $inicio = $this->sync_fecha($am->fecha_proceso);
        if ($inicio === NULL) {
            return NULL;
        }
        $cierre = $this->sync_hora($p, 'hora_cierre', $inicio);
        if ($cierre === NULL) {
            $cierre = clone $cad;
        }
        if ($cierre->getTimestamp() < $inicio->getTimestamp()) {
            return $this->sync_rechazo($guid, 'hora_cierre anterior a la hora de la tarea AM');
        }

        $total_sacos = count($sacos);
        $total_peso  = 0.0;
        foreach ($sacos as $sc) {
            $total_peso += $sc['libras'];
        }
        $total_peso = round($total_peso, 2);

        // El UPDATE va PRIMERO y con `cierre_guid IS NULL` adentro: es lo que
        // hace el cierre atomico sin depender de la transaccion. Si dos
        // equipos cierran la misma tarea a la vez, uno actualiza una fila y el
        // otro cero, y recien entonces se escribe el detalle.
        $ok = $db->set(array(
                'cantidad'                 => $total_peso,
                'hora_cierre'              => $cierre->format('Y-m-d H:i:s'),
                'comentario_cierre'        => $this->sync_texto($p, 'observaciones', 255),
                'responsable_cierre_id'    => $responsable_id,
                'cierre_guid'              => $guid,
                'cierre_device_alias'      => $alias,
                'cierre_created_at_device' => $cad->format('Y-m-d H:i:s'),
                'cierre_received_at'       => date('Y-m-d H:i:s', $ahora),
                'cierre_offset'            => $offset,
                // No 'app': asi el reporte distingue quien cerro la tarea sin
                // salir a buscar si hay fila en reg_cosecha.
                'cierre_origen'            => 'cosecha',
            ))
            ->where('id', (int) $am->id)
            ->where('cierre_guid IS NULL', NULL, FALSE)
            ->update('reg_am');
        if ($ok === FALSE) {
            return NULL;
        }
        if ($db->affected_rows() === 0) {
            return $this->sync_rechazo($guid, 'esa tarea de la manana ya fue cerrada');
        }

        $ok = $db->insert('reg_cosecha', array(
            'guid'                => $guid,
            'reg_am_id'           => (int) $am->id,
            'total_sacos'         => $total_sacos,
            'total_peso'          => $total_peso,
            'observaciones'       => $this->sync_texto($p, 'observaciones', 500),
            'device_alias'        => $alias,
            'created_at_device'   => $cad->format('Y-m-d H:i:s'),
            'received_at_server'  => date('Y-m-d H:i:s', $ahora),
            'device_clock_offset' => $offset,
            'origen'              => 'app',
        ));
        if ($ok === FALSE) {
            return $this->sync_error_insert($db, $guid, 'cosecha');
        }
        $cosecha_id = (int) $db->insert_id();

        foreach ($sacos as $sc) {
            if ($db->insert('reg_cosecha_saco', array(
                    'cosecha_id' => $cosecha_id,
                    'numero'     => $sc['numero'],
                    'libras'     => $sc['libras'],
                )) === FALSE) {
                return $this->sync_error_insert($db, $guid, 'cosecha');
            }
        }

        $out = array('guid' => $guid, 'status' => 'created', 'id' => (int) $am->id);
        $desc = $this->sync_cosecha_descuadre($p, $total_sacos, $total_peso);
        if ($desc !== NULL) {
            $out['_error'] = $desc;
        }
        return $out;
    }

    /** Lista de {numero, libras}. NULL si viene mal, array() si no viene. */
    // -----------------------------------------------------------------
    // RIEGO — bitacora, no cierre
    // -----------------------------------------------------------------

    /**
     * Un parte de riego: cuanta agua fue a que lote y por cuanto tiempo.
     *
     * **No cierra ninguna tarea AM y no toca `reg_am`** (Kevin, 2026-09-03).
     * Las tareas de riego del personal las cierra el PM --sus 7 subtareas son
     * en Jornal--; esto registra el AGUA. Por eso `reg_riego` lleva finca,
     * supervisor, lote y modulo PROPIOS: no es denormalizacion, es su unica
     * fuente de verdad.
     *
     * Sin `subtarea_id` a proposito: en las 9.778 filas de `z_riego`
     * `codigo_tarea` y `codigo_subtarea` valen '0'. Son columnas muertas y no
     * se resucitan (Kevin, 2026-09-08).
     *
     * Tampoco lleva `captura_guid`: la tabla no tiene esa columna y no se
     * inventa una. Las N filas de un parte se reconocen por
     * (fecha, finca, supervisor), que es como se leen los partes de v3.
     */
    private function sync_riego($db, $guid, $p, $cad, $alias, $offset, $ahora)
    {
        $fecha = $this->sync_fecha(isset($p['fecha_proceso']) ? $p['fecha_proceso'] : NULL);
        if ($fecha === NULL) {
            return $this->sync_rechazo($guid, 'fecha_proceso ausente o no es ISO-8601');
        }

        $ids = array();
        foreach (array('finca_id', 'supervisor_id', 'lote_id') as $campo) {
            $v = $this->sync_int($p, $campo);
            if ($v === NULL) {
                return $this->sync_rechazo($guid, $campo . ' ausente o no es un entero positivo');
            }
            $ids[$campo] = $v;
        }

        // No se reusa sync_valida_catalogos(): ese exige subtarea y cultivo,
        // que en riego no existen. Se validan los cuatro que si.
        if (!$this->sync_existe($db, 'z_finca', $ids['finca_id'], "estado IN ('1','A')")) {
            return $this->sync_rechazo($guid, 'la finca '
                . $this->sync_nombre($db, 'z_finca', 'nombre', $ids['finca_id'])
                . ' no existe o esta inactiva');
        }
        if (!$this->sync_personal_activo($db, $ids['supervisor_id'])) {
            return $this->sync_rechazo($guid, 'el supervisor '
                . $this->sync_nombre($db, 'z_personal', 'nombre', $ids['supervisor_id'])
                . ' no existe o esta dado de baja');
        }
        $lote = $db->select('finca_id')->from('z_lote')
                   ->where('id', $ids['lote_id'])->where("estado IN ('1','A')", NULL, FALSE)
                   ->limit(1)->get();
        $lote = ($lote === FALSE) ? NULL : $lote->row();
        if (!$lote) {
            return $this->sync_rechazo($guid, 'el lote '
                . $this->sync_nombre($db, 'z_lote', 'lote', $ids['lote_id'])
                . ' no existe o esta inactivo');
        }
        if ((int) $lote->finca_id !== $ids['finca_id']) {
            return $this->sync_rechazo($guid, 'el lote '
                . $this->sync_nombre($db, 'z_lote', 'lote', $ids['lote_id'])
                . ' no pertenece a la finca '
                . $this->sync_nombre($db, 'z_finca', 'nombre', $ids['finca_id']));
        }

        // El modulo es opcional --hay lotes sin modulos-- pero si viene, tiene
        // que ser DE ESE LOTE: cada lote tiene su propio "1".
        $modulo_id = NULL;
        if (isset($p['modulo_id']) && $p['modulo_id'] !== NULL && $p['modulo_id'] !== '') {
            $modulo_id = $this->sync_int($p, 'modulo_id');
            if ($modulo_id === NULL) {
                return $this->sync_rechazo($guid, 'modulo_id no es un entero positivo');
            }
            if (!$this->sync_modulo_de_lote($db, $modulo_id, $ids['lote_id'])) {
                return $this->sync_rechazo($guid,
                    $this->sync_motivo_modulo($db, $modulo_id, $ids['lote_id']));
            }
        }

        // I1: el unico rechazo duro por fecha, igual que en AM.
        if ($fecha->getTimestamp() > $ahora + 7200) {
            return $this->sync_rechazo($guid,
                'la fecha del riego es futura: no se puede registrar trabajo que todavia no ocurrio');
        }

        // El tiempo ES el dato del parte: sin el no queda nada que registrar.
        // Tope de 24 h porque la columna es SMALLINT y porque un riego de mas
        // de un dia es un error de tipeo (el maximo real de v3 son 4 h).
        $minutos = $this->sync_int($p, 'tiempo_riego_min');
        if ($minutos === NULL || $minutos > 1440) {
            return $this->sync_rechazo($guid,
                'tiempo_riego_min ausente o fuera de rango: son minutos, de 1 a 1440');
        }

        // El volumen es opcional y por defecto 0: en las 9.778 filas de v3
        // solo 2 lo tienen cargado. Se conserva la columna, no se exige.
        $volumen = 0;
        if (isset($p['volumen_riego']) && $p['volumen_riego'] !== NULL && $p['volumen_riego'] !== '') {
            if (!is_numeric($p['volumen_riego']) || (float) $p['volumen_riego'] < 0) {
                return $this->sync_rechazo($guid, 'volumen_riego no es un numero positivo');
            }
            $volumen = (float) $p['volumen_riego'];
        }

        $ok = $db->insert('reg_riego', array(
            'guid'                => $guid,
            'fecha_proceso'       => $fecha->format('Y-m-d H:i:s'),
            'finca_id'            => $ids['finca_id'],
            'supervisor_id'       => $ids['supervisor_id'],
            'lote_id'             => $ids['lote_id'],
            'modulo_id'           => $modulo_id,
            'subtarea_id'         => NULL,
            'tiempo_riego_min'    => $minutos,
            'volumen_riego'       => $volumen,
            'observaciones'       => $this->sync_texto($p, 'observaciones', 500),
            'device_alias'        => $alias,
            'created_at_device'   => $cad->format('Y-m-d H:i:s'),
            'received_at_server'  => date('Y-m-d H:i:s', $ahora),
            'device_clock_offset' => $offset,
            'origen'              => 'app',
        ));
        if ($ok === FALSE) {
            return $this->sync_error_insert($db, $guid, 'riego');
        }
        return array('guid' => $guid, 'status' => 'created', 'id' => (int) $db->insert_id());
    }

    private function sync_sacos($p)
    {
        if (!isset($p['sacos'])) {
            return array();
        }
        if (!is_array($p['sacos'])) {
            return NULL;
        }
        $out = array();
        $vistos = array();
        foreach ($p['sacos'] as $sc) {
            if (!is_array($sc) || !isset($sc['numero'], $sc['libras'])
                || !is_numeric($sc['numero']) || !is_numeric($sc['libras'])) {
                return NULL;
            }
            $n = (int) $sc['numero'];
            $l = round((float) $sc['libras'], 2);
            // Un saco de 0 libras no se pesa: es una celda vacia de la grilla
            // vieja, no un saco. La unicidad la exige uq_saco, pero rechazarlo
            // aca da un motivo legible en vez de un 1062.
            if ($n <= 0 || $l <= 0 || isset($vistos[$n])) {
                return NULL;
            }
            $vistos[$n] = TRUE;
            $out[] = array('numero' => $n, 'libras' => $l);
        }
        return $out;
    }

    /** Los totales del telefono contra los del servidor. Gana el servidor. */
    private function sync_cosecha_descuadre($p, $total_sacos, $total_peso)
    {
        $partes = array();
        if (isset($p['total_sacos']) && is_numeric($p['total_sacos'])
            && (int) $p['total_sacos'] !== $total_sacos) {
            $partes[] = 'sacos ' . (int) $p['total_sacos'] . ' vs ' . $total_sacos;
        }
        if (isset($p['total_peso']) && is_numeric($p['total_peso'])
            && abs(round((float) $p['total_peso'], 2) - $total_peso) > 0.01) {
            $partes[] = 'peso ' . round((float) $p['total_peso'], 2) . ' vs ' . $total_peso;
        }
        return empty($partes)
            ? NULL
            : ('los totales del telefono no cuadran con los sacos (' . implode('; ', $partes) . ')');
    }


    /**
     * Un INSERT que falla puede ser una carrera por el mismo guid (1062, y
     * entonces es `duplicate`) o cualquier otra cosa (y entonces es PENDIENTE,
     * nunca `rejected`: reenviar sí lo arregla).
     */
    private function sync_error_insert($db, $guid, $tipo)
    {
        $e = $db->error();
        if (isset($e['code']) && (int) $e['code'] === 1062) {
            $db->trans_rollback();
            $db->trans_begin();
            $id = $this->sync_id_publico($db, $tipo, $guid);
            if ($id !== NULL) {
                return array('guid' => $guid, 'status' => 'duplicate', 'id' => $id);
            }
        }
        return NULL;
    }

    /**
     * Valida contra los catalogos con los mismos filtros que /v4/catalogos.
     *
     * LOS MOTIVOS SE ESCRIBEN PARA EL SUPERVISOR, NO PARA EL PROGRAMADOR. El
     * texto que vuelve acá es lo único que la pantalla "Registros" le muestra a
     * quien tiene que corregir el registro en el campo, y un
     * "subtarea 88 inactiva" no le dice nada: no conoce los ids, no los ve en
     * ninguna pantalla, y el numero no le indica que tocar.
     *
     * Por eso cada rechazo nombra la cosa: "la subtarea COSECHA DE MAZORCA esta
     * inactiva". El servidor ya tiene el catalogo a mano cuando valida, asi que
     * resolver el nombre cuesta una consulta mas SOLO en el camino de error --
     * el camino feliz no paga nada. El id se conserva entre parentesis para que
     * siga sirviendo de soporte.
     */
    private function sync_valida_catalogos($db, $ids)
    {
        if (!$this->sync_existe($db, 'z_finca', $ids['finca_id'], "estado IN ('1','A')")) {
            return 'la finca ' . $this->sync_nombre($db, 'z_finca', 'nombre', $ids['finca_id'])
                 . ' no existe o esta inactiva';
        }
        if (isset($ids['cultivo_id'])
            && !$this->sync_existe($db, 'z_cultivo', $ids['cultivo_id'], "estado IN ('1','A')")) {
            return 'el cultivo ' . $this->sync_nombre($db, 'z_cultivo', 'nombre', $ids['cultivo_id'])
                 . ' no existe o esta inactivo';
        }
        if (!$this->sync_existe($db, 'z_subtarea', $ids['subtarea_id'], "estado IN ('1','A')")) {
            return 'la subtarea ' . $this->sync_nombre($db, 'z_subtarea', 'nombre_subtarea', $ids['subtarea_id'])
                 . ' no existe o esta inactiva';
        }
        if (isset($ids['responsable_id'])
            && !$this->sync_personal_activo($db, $ids['responsable_id'])) {
            return 'el responsable ' . $this->sync_nombre($db, 'z_personal', 'nombre', $ids['responsable_id'])
                 . ' no existe o esta dado de baja';
        }
        // El lote tiene que ser de la finca declarada: la FK sola no lo ve.
        $lote = $db->select('finca_id')->from('z_lote')
                   ->where('id', $ids['lote_id'])->where("estado IN ('1','A')", NULL, FALSE)
                   ->limit(1)->get();
        $lote = ($lote === FALSE) ? NULL : $lote->row();
        if (!$lote) {
            return 'el lote ' . $this->sync_nombre($db, 'z_lote', 'lote', $ids['lote_id'])
                 . ' no existe o esta inactivo';
        }
        if ((int) $lote->finca_id !== $ids['finca_id']) {
            return 'el lote ' . $this->sync_nombre($db, 'z_lote', 'lote', $ids['lote_id'])
                 . ' no pertenece a la finca '
                 . $this->sync_nombre($db, 'z_finca', 'nombre', $ids['finca_id']);
        }
        return NULL;
    }

    private function sync_existe($db, $tabla, $id, $where_estado)
    {
        $q = $db->select('id')->from($tabla)->where('id', $id)
                ->where($where_estado, NULL, FALSE)->limit(1)->get();
        return ($q !== FALSE) && ($q->row() !== NULL);
    }

    /**
     * Nombre de un registro de catalogo para un mensaje de error.
     *
     * SIN filtro de estado a proposito: se llama justamente cuando la fila no
     * paso el filtro, asi que filtrar otra vez devolveria vacio siempre y el
     * mensaje quedaria peor que con el id.
     *
     * SIN el id entre parentesis: los codigos internos no se muestran (decision
     * cerrada, 00-plan.md). Si de verdad no existe la fila --un id inventado--
     * devuelve `#88`, que al menos dice que se mando algo que no esta; ese caso
     * no es un dato del negocio, es un cliente mandando basura. Nunca devuelve
     * vacio: "la subtarea  no existe" parece un error de la app.
     *
     * `$columna` NO viene de la request: lo fija cada llamador con un literal.
     * Los nombres de columna de los catalogos estan mezclados --`z_subtarea`
     * usa `nombre_subtarea`, `z_lote` usa `lote`, `z_finca` usa `nombre`-- y no
     * hay convencion que adivinar.
     */
    private function sync_nombre($db, $tabla, $columna, $id)
    {
        $id = (int) $id;
        $debug_previo = $db->db_debug;
        $db->db_debug = FALSE;
        try {
            $q = $db->select($columna)->from($tabla)->where('id', $id)->limit(1)->get();
        } catch (Throwable $e) {
            $db->db_debug = $debug_previo;
            return '#' . $id;
        }
        $db->db_debug = $debug_previo;
        $fila = ($q === FALSE) ? NULL : $q->row();
        if (!$fila || !isset($fila->$columna) || trim((string) $fila->$columna) === '') {
            return '#' . $id;
        }
        return trim((string) $fila->$columna);
    }

    /** V3 nunca filtro por `estado` en personal: la señal viva es `eregistro`. */
    private function sync_personal_activo($db, $id)
    {
        $q = $db->select('id')->from('z_personal')->where('id', $id)
                ->where('eregistro', 'A')->limit(1)->get();
        return ($q !== FALSE) && ($q->row() !== NULL);
    }

    /**
     * Motivo legible cuando un modulo no va con el lote declarado.
     *
     * Tres casos distintos que el mensaje unico de antes mezclaba:
     * no existe, existe pero esta inactivo, o existe activo pero es de OTRO
     * lote. El tercero es el unico que el supervisor puede corregir solo, y es
     * el que mas pasa: 16 filas de z_tabla_am lo tienen.
     */
    private function sync_motivo_modulo($db, $modulo_id, $lote_id)
    {
        $lote = $this->sync_nombre($db, 'z_lote', 'lote', $lote_id);

        $debug_previo = $db->db_debug;
        $db->db_debug = FALSE;
        try {
            $q = $db->select('modulo, lote_id, estado')->from('z_modulo')
                    ->where('id', (int) $modulo_id)->limit(1)->get();
        } catch (Throwable $e) {
            $db->db_debug = $debug_previo;
            return 'ese modulo no pertenece al lote ' . $lote;
        }
        $db->db_debug = $debug_previo;
        $m = ($q === FALSE) ? NULL : $q->row();

        if (!$m) {
            return 'ese modulo no existe';
        }
        if (!in_array((string) $m->estado, array('1', 'A'), TRUE)) {
            return 'el modulo ' . trim((string) $m->modulo) . ' del lote ' . $lote
                 . ' esta inactivo';
        }
        return 'el modulo ' . trim((string) $m->modulo) . ' es del lote '
             . $this->sync_nombre($db, 'z_lote', 'lote', (int) $m->lote_id)
             . ', no del lote ' . $lote;
    }

    /** El modulo tiene que pertenecer al lote declarado. La FK no lo verifica. */
    private function sync_modulo_de_lote($db, $modulo_id, $lote_id)
    {
        $q = $db->select('id')->from('z_modulo')->where('id', $modulo_id)
                ->where('lote_id', $lote_id)->where("estado IN ('1','A')", NULL, FALSE)
                ->limit(1)->get();
        return ($q !== FALSE) && ($q->row() !== NULL);
    }

    /**
     * Bitacora de lo que no se pudo guardar bien. Best-effort: si falla, el
     * registro ya se resolvio y no se va a cambiar la respuesta por esto.
     */
    private function reg_flag($db, $origen, $codigo, $guid, $registro_id, $detalle, $rec, $alias, $ahora)
    {
        try {
            $db->insert('reg_flag', array(
                'origen'       => $origen,
                'codigo'       => $codigo,
                'guid'         => $guid,
                'registro_id'  => $registro_id,
                'detalle'      => mb_substr((string) $detalle, 0, 255),
                'payload'      => json_encode($rec, JSON_UNESCAPED_UNICODE),
                'device_alias' => $alias,
                'created_at'   => date('Y-m-d H:i:s', $ahora),
            ));
        } catch (Throwable $e) {
            log_message('error', 'V4 reg_flag: no se pudo marcar ' . $guid . ': ' . $e->getMessage());
        }
    }

    /** ISO-8601 (con o sin offset) -> DateTime. NULL si no se puede leer. */
    private function sync_fecha($valor)
    {
        if (!is_string($valor) || trim($valor) === '') {
            return NULL;
        }
        try {
            return new DateTime(trim($valor));
        } catch (Exception $e) {
            return NULL;
        }
    }

    /** 'HH:MM' o ISO completo -> DateTime, anclado al dia de $fecha. */
    private function sync_hora($p, $campo, $fecha)
    {
        if (!isset($p[$campo]) || !is_string($p[$campo]) || trim($p[$campo]) === '') {
            return NULL;
        }
        $v = trim($p[$campo]);
        if (preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/', $v)) {
            $v = $fecha->format('Y-m-d') . ' ' . $v . ':00';
        }
        return $this->sync_fecha($v);
    }

    /** Entero positivo o NULL. El string "88" vale; "" y 0 no. */
    private function sync_int($p, $campo)
    {
        if (!isset($p[$campo]) || !is_numeric($p[$campo])) {
            return NULL;
        }
        $v = (int) $p[$campo];
        return $v > 0 ? $v : NULL;
    }

    /** Lista de enteros positivos. array() si falta; NULL si viene mal. */
    private function sync_lista_ids($p, $campo)
    {
        if (!isset($p[$campo])) {
            return array();
        }
        if (!is_array($p[$campo])) {
            return NULL;
        }
        $out = array();
        foreach ($p[$campo] as $v) {
            if (!is_numeric($v) || (int) $v <= 0) {
                return NULL;
            }
            $out[] = (int) $v;
        }
        return $out;
    }

    /**
     * La lista de modulos, ordenada y sin repetidos.
     *
     * Ordenada a proposito: asi dos AM con los mismos modulos guardan la misma
     * cadena y se pueden comparar sin parsear. Es la misma forma que dejo la
     * migracion, que usa GROUP_CONCAT ... ORDER BY.
     */
    private function sync_modulos_csv($modulos)
    {
        $ids = array_values(array_unique(array_map('intval', $modulos)));
        if (empty($ids)) {
            return NULL;
        }
        sort($ids, SORT_NUMERIC);
        return implode(',', $ids);
    }

    private function sync_texto($p, $campo, $max)
    {
        if (!isset($p[$campo]) || !is_string($p[$campo])) {
            return NULL;
        }
        $v = trim($p[$campo]);
        return $v === '' ? NULL : substr($v, 0, $max);
    }

    // -----------------------------------------------------------------
    // Helpers privados
    // -----------------------------------------------------------------

    /**
     * Versión de catálogos: hash de CHECKSUM TABLE de los ocho maestros.
     * Cambia si cambia cualquier fila; no exige columnas updated_at.
     */
    private function catalogos_version()
    {
        $rows = $this->requireDb()->query(
            'CHECKSUM TABLE z_finca, z_lote, z_modulo, z_cultivo, z_tarea, z_subtarea, z_ulabor, z_personal'
        )->result_array();
        return md5(json_encode($rows));
    }

    /**
     * Subtareas que se cierran desde la pantalla de Cosecha: las que se pagan
     * por peso. El PM cierra exactamente el complemento de esta lista.
     *
     * Sale de la configuracion; vacia, se deriva por unidad (Libra). Se eligio
     * la unidad y no la tarea porque 'Supervisor de cosecha' cuelga de la
     * tarea Cosecha y se paga por jornal: no tiene sacos que pesar.
     */
    private function subtareas_cosecha($db)
    {
        if ($this->subtareas_cosecha_cache !== NULL) {
            return $this->subtareas_cosecha_cache;
        }

        $ids = isset($this->v4cfg['cosecha_subtarea_ids'])
            ? array_map('intval', (array) $this->v4cfg['cosecha_subtarea_ids'])
            : array();

        if (empty($ids)) {
            $unidades = isset($this->v4cfg['cosecha_unidad_ids'])
                ? array_map('intval', (array) $this->v4cfg['cosecha_unidad_ids'])
                : array();
            if (!empty($unidades)) {
                $q = $db->select('id')->from('z_subtarea')
                        ->where_in('unidad_labor_id', $unidades)
                        ->where_in('estado', array('1', 'A'))
                        ->order_by('id')->get();
                if ($q !== FALSE) {
                    foreach ($q->result() as $f) {
                        $ids[] = (int) $f->id;
                    }
                }
            }
        }

        $this->subtareas_cosecha_cache = $ids;
        return $ids;
    }
}
