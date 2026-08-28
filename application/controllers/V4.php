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
    // GET /v4/catalogos — maestros activos, descarga completa
    // -----------------------------------------------------------------
    public function catalogos_get()
    {
        // OJO (verificado 2026-08-28 contra el schema real): la convención de
        // `estado` está MEZCLADA en los catálogos — z_cultivo/z_modulo/z_lote
        // usan '1', pero z_tarea y z_subtarea usan 'A'. Con estado='1' parejo
        // la respuesta traería CERO tareas y subtareas. Por eso el filtro es
        // estado IN ('1','A'). z_personal se filtra por eregistro='A' como V3.
        $db = $this->db;

        $fincas = $db->select('id, nombre, ha')
            ->where_in('estado', array('1', 'A'))
            ->order_by('nombre')
            ->get('z_finca')->result();

        $lotes = $db->select('id, lote, finca_id, ha, tiene_modulos')
            ->where_in('estado', array('1', 'A'))
            ->order_by('finca_id, lote')
            ->get('z_lote')->result();

        $modulos = $db->select('id, modulo, lote_id, ha')
            ->where_in('estado', array('1', 'A'))
            ->order_by('lote_id, modulo')
            ->get('z_modulo')->result();

        $cultivos = $db->select('id, nombre')
            ->where_in('estado', array('1', 'A'))
            ->order_by('nombre')
            ->get('z_cultivo')->result();

        $tareas = $db->select('id, nombre, cultivos_id')
            ->where_in('estado', array('1', 'A'))
            ->order_by('nombre')
            ->get('z_tarea')->result();

        // Alias: el contrato V4 usa `codigo` y `nombre`; las columnas reales
        // son codigo_subtarea / nombre_subtarea.
        $subtareas = $db->select('id, codigo_subtarea AS codigo, nombre_subtarea AS nombre, tarea_id, unidad_labor_id, tipo_pago_id')
            ->where_in('estado', array('1', 'A'))
            ->order_by('nombre_subtarea')
            ->get('z_subtarea')->result();

        $ulabores = $db->select('id, ulabor_nombre AS nombre')
            ->where_in('estado', array('1', 'A'))
            ->order_by('ulabor_nombre')
            ->get('z_ulabor')->result();

        // Personal: se filtra por eregistro = 'A', igual que V3
        // (Personal_model::get_all). z_personal.estado existe pero es NULLable
        // y no es el flag que la operación usa hoy.
        $personal = $db->select("id, UPPER(nombre) AS nombre, id_finca, rol, rol_app", FALSE)
            ->where('eregistro', 'A')
            ->order_by('nombre')
            ->get('z_personal')->result();

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
    // POST /v4/sync — ESBOZO. NO implementado en esta fase.
    // -----------------------------------------------------------------
    // Contrato completo en MOBIL/02-bd-y-api.md §7:
    //   Request:  { device_alias, device_clock_offset, records: [
    //                 { guid, tipo, created_at_device, payload } ] }
    //   Response: HTTP 200 SIEMPRE para el lote, con un resultado por guid:
    //             { server_time, results: [
    //                 { guid, status: created|duplicate|rejected,
    //                   id?, reason?, flags? } ] }
    //
    //   Reglas duras al implementar (paso 3, módulos AM/PM):
    //   - Idempotencia por guid (UNIQUE en cada tabla reg_*): reenviar un
    //     guid existente responde `duplicate` y no inserta nada.
    //   - Transacción POR REGISTRO: un registro malo no arrastra al lote.
    //   - Whitelist de campos por tipo; jamás volcar el POST completo.
    //   - Flags de integridad (I1..I5) recalculados contra
    //     received_at_server; los del cliente se descartan.
    //   - I1 (fecha futura) e I5 (cadena de etapas rota) son los únicos
    //     rechazos duros.
    //
    // Mientras tanto responde 501 SIN `results`: para la app, ningún guid
    // aparece → todo el lote queda PENDIENTE con backoff. Ese es exactamente
    // el comportamiento correcto ante un servidor que aún no sabe recibir.
    public function sync_post()
    {
        $this->response(array(
            'error' => 'POST /v4/sync no implementado todavia. Los registros deben permanecer PENDIENTES en el dispositivo.',
        ), 501);
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
        $rows = $this->db->query(
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
        $rows = $this->db->select('s.id')
            ->from('z_subtarea s')
            ->join('z_tarea t', 't.id = s.tarea_id')
            ->where_in('s.estado', array('1', 'A'))
            ->where_in('t.estado', array('1', 'A'))
            ->like('t.nombre', 'COSECHA')
            ->get()->result_array();
        return array_map('intval', array_column($rows, 'id'));
    }
}
