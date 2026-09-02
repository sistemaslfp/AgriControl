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
        $cosecha_ids = $this->v4cfg['cosecha_subtarea_ids'];
        if (empty($cosecha_ids)) {
            $cosecha_ids = $this->get_cosecha_subtarea_ids();
        }

        $this->response(array(
            'server_time'          => date('c'),
            'ventanas_horarias'    => $this->v4cfg['ventanas_horarias'],
            'retroactividad_dias'  => $this->v4cfg['retroactividad_dias'],
            'cosecha_subtarea_ids' => $cosecha_ids,
            'catalogos_version'    => $this->catalogos_version(),
        ), 200);
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

        $db = $this->requireDb();

        // db_debug TRUE (el valor fuera de produccion) convierte cualquier
        // error de base en una pagina HTML que se come la respuesta JSON. Y
        // desde PHP 8.1 mysqli ademas LANZA, asi que hace falta el try/catch:
        // sin el, esta consulta responde una traza de CI3 con 200.
        $debug_previo = $db->db_debug;
        $db->db_debug = FALSE;

        try {
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
            'server_time' => date('c'),
            'fecha'       => $fecha,
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
    // se reintenta. Eso es deliberado y se usa en dos casos: los tipos que
    // este paso todavía no implementa (cosecha, riego, postcosecha) y los
    // errores de base. Un error de base nunca es `rejected`: reenviar sí lo
    // arregla.
    //
    // Paso 3 implementa `am` y `pm`. Los demás tipos se omiten en silencio.

    /** Tope de registros por lote. Uno más grande se rechaza entero con 413. */
    const SYNC_MAX_RECORDS = 200;

    /** Tipos que este paso sabe recibir. El resto se omite de `results`. */
    private static $SYNC_TIPOS = array('am', 'pm');

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
        // El PM ya no es una tabla: es el cierre de la MISMA fila de reg_am, y
        // su guid vive ahi, en `cierre_guid`. Eso es lo que vuelve al UPDATE
        // tan idempotente como era el INSERT.
        // Un registro = una persona en una tarea. La programacion de la
        // manana y el cierre de la tarde son la MISMA fila de reg_am; lo que
        // cambia es en que columna vive el guid.
        $tabla    = 'reg_am';
        $col_guid = ($tipo === 'am') ? 'guid' : 'cierre_guid';

        // Idempotencia: el guid ya recibido no se vuelve a aplicar.
        try {
            $ya = $db->select('id')->from($tabla)->where($col_guid, $guid)->limit(1)->get();
        } catch (Throwable $e) {
            return NULL;   // la base no responde: PENDIENTE, no rechazado
        }
        if ($ya === FALSE) {
            return NULL;
        }
        $fila = $ya->row();
        if ($fila) {
            return array('guid' => $guid, 'status' => 'duplicate', 'id' => (int) $fila->id);
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
            $res = ($tipo === 'am')
                ? $this->sync_am($db, $guid, $payload, $cad, $alias, $offset, $ahora)
                : $this->sync_pm($db, $guid, $payload, $cad, $alias, $offset, $ahora);
        } catch (Throwable $e) {
            $db->trans_rollback();
            return $this->sync_excepcion($db, $guid, $tabla, $e);
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
    private function sync_excepcion($db, $guid, $tabla, $e)
    {
        if ((int) $e->getCode() === 1062) {
            try {
                $q = $db->select('id')->from($tabla)->where('guid', $guid)->limit(1)->get();
                $fila = ($q === FALSE) ? NULL : $q->row();
                if ($fila) {
                    return array('guid' => $guid, 'status' => 'duplicate', 'id' => (int) $fila->id);
                }
            } catch (Throwable $e2) {
                // se cae al PENDIENTE de abajo
            }
        }
        log_message('error', 'V4 sync: fallo al guardar ' . $guid . ' en ' . $tabla . ': ' . $e->getMessage());
        return NULL;
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
            return $this->sync_rechazo($guid, 'personal ' . $ids['personal_id'] . ' inexistente o inactivo');
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
                return $this->sync_rechazo($guid, 'modulo ' . $mid . ' inexistente, inactivo o no pertenece al lote ' . $ids['lote_id']);
            }
        }

        // El guid de la captura: lo comparten las N personas del mismo
        // formulario. Es lo unico que permite volver a juntarlas despues.
        $captura = isset($p['captura_guid']) && is_string($p['captura_guid'])
            && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', trim($p['captura_guid']))
            ? trim($p['captura_guid']) : NULL;

        // I1: unico rechazo duro por fecha.
        if ($fecha->getTimestamp() > $ahora + 7200) {
            return $this->sync_rechazo($guid, 'fecha_proceso en el futuro (I1)');
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
            return $this->sync_error_insert($db, $guid, 'reg_am');
        }
        $id = (int) $db->insert_id();

        $flags = $this->sync_flags($fecha, $cad, $ahora, 'am');
        $this->sync_guarda_flags($db, 'reg_am', $id, $guid, $flags, $ahora);

        $out = array('guid' => $guid, 'status' => 'created', 'id' => $id);
        if (!empty($flags)) {
            $out['flags'] = $flags;
        }
        return $out;
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

        $q = $db->select('id, fecha_proceso, responsable_id, personal_id, cierre_guid')
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

        // El trabajador es redundante -- la fila ya sabe de quien es -- pero
        // si viene tiene que coincidir. Es la red que atrapa un am_guid mal
        // copiado antes de escribir el avance en la persona equivocada.
        $trabajador_id = $this->sync_int($p, 'trabajador_id');
        if ($trabajador_id !== NULL && $trabajador_id !== (int) $am->personal_id) {
            return $this->sync_rechazo(
                $guid,
                'la tarea AM ' . $am_guid . ' no es del trabajador ' . $trabajador_id
            );
        }

        if ($am->cierre_guid !== NULL) {
            // El mismo guid ya se filtro antes (idempotencia). Llegar aca con
            // otro es un segundo cierre de la misma tarea.
            return $this->sync_rechazo(
                $guid,
                'esa tarea AM ya fue cerrada por el PM ' . $am->cierre_guid
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
            return $this->sync_rechazo($guid, 'responsable ' . $responsable_id . ' inexistente o inactivo');
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
            return $this->sync_rechazo($guid, 'esa tarea AM ya fue cerrada');
        }

        // El ano y la semana de pago NO se guardan: se derivan de
        // fecha_proceso en vw_reg_reporte_pago, con WEEK(...,3) que es el ISO.
        // V3 los guardaba calculados con 'Y'.'W' y por eso 181 filas del 29 al
        // 31 de diciembre de 2025 quedaron como (2025, semana 1). Un valor que
        // se deriva no puede quedar mal guardado.
        $flags = $this->sync_flags($cierre, $cad, $ahora, 'pm');
        $this->sync_guarda_flags($db, 'reg_am', (int) $am->id, $guid, $flags, $ahora);

        $out = array('guid' => $guid, 'status' => 'created', 'id' => (int) $am->id);
        if (!empty($flags)) {
            $out['flags'] = $flags;
        }
        return $out;
    }

    // -----------------------------------------------------------------
    // Helpers de sync
    // -----------------------------------------------------------------

    /**
     * Un INSERT que falla puede ser una carrera por el mismo guid (1062, y
     * entonces es `duplicate`) o cualquier otra cosa (y entonces es PENDIENTE,
     * nunca `rejected`: reenviar sí lo arregla).
     */
    private function sync_error_insert($db, $guid, $tabla)
    {
        $e = $db->error();
        if (isset($e['code']) && (int) $e['code'] === 1062) {
            $db->trans_rollback();
            $db->trans_begin();
            $fila = $db->select('id')->from($tabla)->where('guid', $guid)->limit(1)->get();
            $fila = ($fila === FALSE) ? NULL : $fila->row();
            if ($fila) {
                return array('guid' => $guid, 'status' => 'duplicate', 'id' => (int) $fila->id);
            }
        }
        return NULL;
    }

    /** Valida contra los catalogos con los mismos filtros que /v4/catalogos. */
    private function sync_valida_catalogos($db, $ids)
    {
        if (!$this->sync_existe($db, 'z_finca', $ids['finca_id'], "estado IN ('1','A')")) {
            return 'finca ' . $ids['finca_id'] . ' inexistente o inactiva';
        }
        if (!$this->sync_existe($db, 'z_cultivo', $ids['cultivo_id'], "estado IN ('1','A')")) {
            return 'cultivo ' . $ids['cultivo_id'] . ' inexistente o inactivo';
        }
        if (!$this->sync_existe($db, 'z_subtarea', $ids['subtarea_id'], "estado IN ('1','A')")) {
            return 'subtarea ' . $ids['subtarea_id'] . ' inexistente o inactiva';
        }
        if (!$this->sync_personal_activo($db, $ids['responsable_id'])) {
            return 'responsable ' . $ids['responsable_id'] . ' inexistente o inactivo';
        }
        // El lote tiene que ser de la finca declarada: la FK sola no lo ve.
        $lote = $db->select('finca_id')->from('z_lote')
                   ->where('id', $ids['lote_id'])->where("estado IN ('1','A')", NULL, FALSE)
                   ->limit(1)->get();
        $lote = ($lote === FALSE) ? NULL : $lote->row();
        if (!$lote) {
            return 'lote ' . $ids['lote_id'] . ' inexistente o inactivo';
        }
        if ((int) $lote->finca_id !== $ids['finca_id']) {
            return 'el lote ' . $ids['lote_id'] . ' no pertenece a la finca ' . $ids['finca_id'];
        }
        return NULL;
    }

    private function sync_existe($db, $tabla, $id, $where_estado)
    {
        $q = $db->select('id')->from($tabla)->where('id', $id)
                ->where($where_estado, NULL, FALSE)->limit(1)->get();
        return ($q !== FALSE) && ($q->row() !== NULL);
    }

    /** V3 nunca filtro por `estado` en personal: la señal viva es `eregistro`. */
    private function sync_personal_activo($db, $id)
    {
        $q = $db->select('id')->from('z_personal')->where('id', $id)
                ->where('eregistro', 'A')->limit(1)->get();
        return ($q !== FALSE) && ($q->row() !== NULL);
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
     * Invariantes blandas: aceptan el registro y dejan bandera.
     * I1 (rechazo duro) se evalua antes de llegar aca.
     */
    private function sync_flags($fecha, $cad, $ahora, $tipo)
    {
        $flags = array();

        // I2 — reloj del telefono adelantado mas de 5 min.
        if ($cad->getTimestamp() > $ahora + 300) {
            $flags[] = 'reloj_adelantado';
        }
        // I3 — se fecho hacia adelante en el telefono.
        if ($fecha->getTimestamp() > $cad->getTimestamp() + 7200) {
            $flags[] = 'fecha_futura_local';
        }
        // I4 — retroactivo mas alla de la ventana del modulo.
        $dias = isset($this->v4cfg['retroactividad_dias'][$tipo])
            ? (int) $this->v4cfg['retroactividad_dias'][$tipo] : 0;
        if ($cad->getTimestamp() - $fecha->getTimestamp() > $dias * 86400) {
            $flags[] = 'retroactivo_excedido';
        }
        // Ventana horaria: el servidor NO rechaza por esto (decision cerrada,
        // 01-sincronizacion.md). Sólo lo mide, y contra la hora de PROCESO,
        // nunca contra la hora de envio.
        if (isset($this->v4cfg['ventanas_horarias'][$tipo])) {
            $v = $this->v4cfg['ventanas_horarias'][$tipo];
            $h = $fecha->format('H:i');
            if ($h < $v['inicio'] || $h > $v['fin']) {
                $flags[] = 'fuera_de_ventana_horaria';
            }
        }
        return $flags;
    }

    private function sync_guarda_flags($db, $tabla, $id, $guid, $flags, $ahora)
    {
        foreach ($flags as $codigo) {
            $db->insert('reg_flag', array(
                'tabla'       => $tabla,
                'registro_id' => $id,
                'guid'        => $guid,
                'codigo'      => $codigo,
                'detalle'     => NULL,
                'estado'      => '0',
                'created_at'  => date('Y-m-d H:i:s', $ahora),
            ));
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
     * Ids de subtareas activas cuyas tareas activas contienen 'COSECHA'.
     * Se usa solo si $config['cosecha_subtarea_ids'] está vacío.
     */
    private function get_cosecha_subtarea_ids()
    {
        $rows = $this->requireDb()->select('s.id')
            ->from('z_subtarea s')
            ->join('z_tarea t', 't.id = s.tarea_id')
            ->where_in('s.estado', array('1', 'A'))
            ->where_in('t.estado', array('1', 'A'))
            ->like('t.nombre', 'COSECHA')
            ->get()->result_array();
        return array_map('intval', array_column($rows, 'id'));
    }
}
