<?php if (!defined('BASEPATH'))
    exit('No direct script access allowed');

class PM extends Public_controller
{

    public function __construct()
    {
        parent::__construct();

        $this->load->library('ion_auth');

        if (!$this->ion_auth->logged_in()) {
            redirect('auth/login');
        }

        $this->load->database();
        $this->load->helper('url');

        $this->load->library('grocery_CRUD');
        $this->load->helper('form');
        $this->load->library('form_validation');
        $this->load->dbutil();
        $this->load->helper('file');
        $this->load->model('pm_model');
        $this->load->model('fincas_model');

        $this->_init();
    }

    private function _init() {}

    public function index()
    {
        try {
        } catch (Exception $e) {
            show_error($e->getMessage() . ' --- ' . $e->getTraceAsString());
        }
    }

    public function reportePagos()
    {
        try {
            $crud = new grocery_CRUD();

            $currentTable = 'vw_lfp_reporte_pm';

            $crud->set_theme('tablestrap4_datefilter');
            // $crud->set_model('pm_model');
            $crud->set_table($currentTable);
            $crud->set_primary_key('cedula');
            $crud->set_subject('PM');
            $crud->unset_jquery();

            $crud->unset_add();
            $crud->unset_edit();
            $crud->unset_delete();
            $crud->unset_read();
            // $crud->unset_export();
            // $crud->unset_print();
            $this->config->load('grocery_crud');
            $this->config->set_item('default_per_page', '1000000');

            $this->load->model("Payment_model");
            // $this->Payment_model->backupAndDeleteDuplicates();

            $crud->columns('fecha', 'nombre_finca', 'nombre_trabajador', 'cedula', 'descripcion_estado', 'nombre_supervisor', 'codigo_labor', 'grupo_labor', 'nombre_labor', 'lote', 'modulo', 'cantidad', 'unidad_labor', 'tarifa', 'total', 'cultivo', 'comentario');
            $crud
                ->display_as('fecha', 'Fecha')
                ->display_as('nombre_supervisor', 'Supervisor')
                ->display_as('nombre_trabajador', 'Trabajador')
                ->display_as('cedula', 'Cédula')
                ->display_as('descripcion_estado', 'Estado')
                ->display_as('nombre_subtarea', 'Subtarea')
                ->display_as('lote', 'Lote')
                ->display_as('codigo_labor', 'Código Labor')
                ->display_as('nombre_labor', 'Labor')
                ->display_as('modulo', 'Módulos')
                ->display_as('cantidad', 'Cantidad')
                ->display_as('unidad_labor', 'Unidad')
                ->display_as('tarifa', 'Tarifa')
                ->display_as('total', 'Total')
                ->display_as('cultivo', 'Cultivo')
                ->display_as('comentario', 'Comentarios');

            $dateFrom = $this->input->get('fechaDesde');
            $dateTo = $this->input->get('fechaHasta');

            $dateFrom = date("Y-m-d", strtotime($dateFrom));
            $dateTo = date("Y-m-d", strtotime($dateTo));

            $dateFrom = strval($dateFrom);
            $dateTo = strval($dateTo);

            // if(!isset($dateFrom) || !isset($dateTo)) {
            //     $query = $this->db->query("SELECT MAX(STR_TO_DATE(fecha, '%Y-%m-%d')) AS maxDate FROM " . $currentTable);
            //     $row = $query->row();
            //     $maxDate = $row->maxDate;

            //     $dateFrom = $maxDate;
            //     $dateTo = $maxDate;
            // }            



            $state = $crud->getState();

            if ($state == 'export' || $state == 'print') {

                if ($this->uri->segment(4) === "fechaDesde") {
                    $reportDateFrom = $this->uri->segment(5);
                    $crud->where('fecha >= "' . $reportDateFrom . '"');
                }

                if ($this->uri->segment(6) === "fechaHasta") {
                    $reportDateTo = $this->uri->segment(7);
                    $crud->where('fecha <= "' . $reportDateTo . '"');
                }

                if ($this->uri->segment(8) === "finca") {
                    $reportIdFinca = $this->uri->segment(9);
                    $crud->where('id_finca = ' . $reportIdFinca);
                }
            } else {
                $crud->where('fecha >= "' . $dateFrom . '"');
                $crud->where('fecha <= "' . $dateTo . '"');

                $filtro_finca_pm = $this->input->get('id_finca');
                if (isset($filtro_finca_pm)) {
                    if ($filtro_finca_pm > 0) {
                        $crud->where('id_finca', $filtro_finca_pm);
                    }
                }
            }

            $crud->set_relation('lote', 'z_lote', 'lote');

            $this->db->select('id, modulo');
            $results = $this->db->get('z_modulo')->result();
            $modulos_multiselect = array();

            foreach ($results as $result) {
                $modulos_multiselect[$result->id] = $result->modulo;
            }

            $crud->field_type('modulo', 'multiselect', $modulos_multiselect);

            acceso_crud($crud, $currentTable, '{t}.id_finca = {f}', 'cedula');

            $output = $crud->render();

            $data['listadoFincas'] = $this->fincas_model->getFincasCombobox();

            $output->data = $data;

            $this->load->view('Crud/pm-report', (array) $output);
        } catch (Exception $e) {
            show_error($e->getMessage() . ' --- ' . $e->getTraceAsString());
        }
    }

    public function editarPM()
    {
        try {
            $crud = new grocery_CRUD($this);

            $crud->set_theme('tablestrap4');
            $crud->set_table('lfp_am');
            $crud->set_subject('PM');

            $crud->unset_add();
            $crud->unset_clone();
            $crud->unset_delete();
            $crud->unset_back_to_list();

            $crud->columns('fecha_proceso', 'finca_id', 'lote_id', 'modulos', 'responsable_cierre_id', 'personal_id', 'cultivo_id', 'subtarea_id', 'cantidad');
            $crud->edit_fields('fecha_proceso', 'finca_id', 'lote_id', 'modulos', 'responsable_cierre_id', 'personal_id', 'cantidad', 'cultivo_id', 'subtarea_id', 'hora_cierre', 'comentario_cierre');
            $this->_pmCamposComunes($crud);

            $crud->required_fields('finca_id', 'lote_id', 'personal_id', 'cantidad', 'cultivo_id', 'subtarea_id', 'hora_cierre');

            acceso_exigir('edita');
            $this->_pmRestringirFinca($crud);
            alerta_validar($crud, array($this, '_pmMotivo'));

            $state = $crud->getState();

            if (in_array($state, array('export', 'print', 'list', 'add'))) {
                redirect('PM/listarPM');
            }

            if ($state == 'edit') {
                $crud->callback_edit_field('fecha_proceso', array($this, '_campoFechaInicio'));
                $crud->callback_edit_field('hora_cierre', array($this, '_campoHoraCierre'));
                $crud->field_type('responsable_cierre_id', 'readonly');
            }

            $crud->callback_before_update(array($this, 'pmAntesDeActualizar'));

            $output = $crud->render();

            $data['listadoFincas'] = $this->fincas_model->getFincasCombobox();

            $output->data = $data;

            $this->load->view('Crud/pm-edit', (array) $output);
        } catch (Exception $e) {
            show_error($e->getMessage() . ' --- ' . $e->getTraceAsString());
        }
    }
    // public function verPM()
    // {
    //     try {
    //         $this->load->library('form_validation');
    //         $crud = new grocery_CRUD($this);

    //         $crud->set_theme('tablestrap4');
    //         // $crud->set_theme('bootstrap-v4');
    //         // $crud->set_model('pm_model');
    //         $crud->set_table('z_tabla_pm');
    //         $crud->set_subject('PM');

    //         // $crud->unset_read();
    //         // $crud->unset_add();
    //         // $crud->unset_jquery();
    //         $crud->unset_clone();
    //         // $crud->unset_edit();
    //         $crud->unset_delete();
    //         $crud->unset_back_to_list();

    //         $crud->columns('numero_registro', 'fecha', 'finca', 'lote', 'modulo', 'responsable', 'trabajador', 'cultivo', 'subtarea');

    //         $crud->edit_fields('numero_registro', 'fecha', 'finca', 'lote', 'modulo', 'responsable', 'trabajador', 'cantidad', 'cultivo', 'subtarea', 'hora_cierre', 'hora_inicio', 'comentario');

    //         // Añadir campos al formulario de creación
    //         $crud->add_fields('numero_registro', 'fecha', 'finca', 'lote', 'modulo', 'responsable', 'trabajador', 'cantidad', 'cultivo', 'subtarea', 'hora_cierre', 'hora_inicio', 'comentario');

    //         $crud->set_relation('finca', 'z_finca', 'nombre');
    //         $crud->set_relation('responsable', 'z_personal', 'nombre');
    //         $crud->set_relation('trabajador', 'z_personal', 'nombre');
    //         $crud->set_relation('cultivo', 'z_cultivo', 'nombre');
    //         $crud->set_primary_key('id', 'vw_util_finca_lotes');
    //         $crud->set_relation('lote', 'vw_util_finca_lotes', '{nombre_finca} - Lote {lote}');
    //         $crud->set_relation('subtarea', 'z_subtarea', 'nombre_subtarea');

    //         $crud->field_type('fecha', 'date');

    //         $crud->callback_before_insert(array($this, 'calculateYearAndWeek'));

    //         $state = $crud->getState();

    //         $dateFrom = $this->input->get('fechaDesde');
    //         $dateTo = $this->input->get('fechaHasta');

    //         $dateFrom = date("Y-m-d", strtotime($dateFrom));
    //         $dateTo = date("Y-m-d", strtotime($dateTo));

    //         $dateFrom = strval($dateFrom);
    //         $dateTo = strval($dateTo);

    //         $group = $this->ion_auth->get_users_groups()->row()->id;

    //         if ($group != 1 && $group != 2) {
    //             redirect('/', 'refresh');
    //             // $crud->unset_edit();
    //         }

    //         if ($group != 1) {
    //             $crud->unset_add();
    //         }

    //         if ($state == 'export' || $state == 'print') {

    //             if ($this->uri->segment(4) === "fechaDesde") {
    //                 $reportDateFrom = $this->uri->segment(5);
    //                 $crud->where('fecha >= "' . $reportDateFrom . '"');
    //             }

    //             if ($this->uri->segment(6) === "fechaHasta") {
    //                 $reportDateTo = $this->uri->segment(7);
    //                 $crud->where('fecha <= "' . $reportDateTo . '"');
    //             }

    //             if ($this->uri->segment(8) === "finca") {
    //                 $reportIdFinca = $this->uri->segment(9);
    //                 $crud->where('finca = ' . $reportIdFinca);
    //             }
    //         } else {
    //             $crud->where('fecha >= "' . $dateFrom . '"');
    //             $crud->where('fecha <= "' . $dateTo . '"');

    //             $filtro_finca_pm = $this->input->get('id_finca');
    //             if (isset($filtro_finca_pm)) {
    //                 if ($filtro_finca_pm > 0) {
    //                     $crud->where('finca', $filtro_finca_pm);
    //                 }
    //             }
    //         }

    //         $required_fields = [];

    //         if ($state == "add") {
    //             $crud->field_type('numero_registro', 'hidden');
    //             // $crud->field_type('hora_cierre', 'time');
    //             // $crud->field_type('fecha', 'date');

    //             // $required_fields = ['fecha', 'finca', 'lote', 'responsable', 'trabajador', 'cantidad', 'cultivo', 'subtarea', 'hora_cierre', 'hora_inicio', 'comentario'];
    //             // $this->form_validation->set_rules('fecha', 'Fecha', 'required');
    //             // $crud->required_fields('finca', 'lote', 'trabajador', 'cantidad', 'cultivo', 'subtarea', 'hora_cierre', 'hora_inicio', 'comentario');
    //             // $crud->set_rules('fecha', 'Fecha de ingreso', 'required');
    //         }

    //         if ($state == "edit") {
    //             $crud->field_type('numero_registro', 'readonly');
    //             $crud->field_type('fecha', 'readonly');
    //             $crud->field_type('responsable', 'readonly');
    //             $crud->field_type('fecha_registro', 'readonly');
    //             $crud->set_rules('fecha', 'Fecha de ingreso', 'required');
    //             // $crud->required_fields('finca', 'lote', 'trabajador', 'cantidad', 'cultivo', 'subtarea', 'hora_cierre', 'hora_inicio');
    //         }

    //         // $this->db->select('id', 'nombre_finca', 'lote');
    //         // $results = $this->db->get('vw_util_finca_lotes')->result();
    //         // $lotsArray = array();

    //         // foreach ($results as $result) {
    //         //     $lotsArray[$result->id] = $result->nombre_finca . ' - ' . $result->lote;
    //         // }

    //         $this->db->select('id_modulo, modulo, nombre_finca, lote');
    //         $results = $this->db->get('vw_util_fincas_lotes_modulos')->result();
    //         $modulos_multiselect = array();

    //         foreach ($results as $result) {
    //             $modulos_multiselect[$result->id_modulo] = $result->nombre_finca . ' - Lote ' . $result->lote . ' - Mód' . $result->modulo;
    //         }

    //         $crud->field_type('modulo', 'multiselect', $modulos_multiselect);

    //         $crud->callback_before_update(array($this, 'validateFarmLot'));
    //         // $crud->callback_before_update(array($this, 'validateModules'));
    //         // $crud->callback_before_insert(array($this, 'validateModules'));

    //         $output = $crud->render();

    //         $data['listadoFincas'] = $this->fincas_model->getFincasCombobox();

    //         $output->data = $data;

    //         $this->load->view('Crud/pm-edit', (array) $output);
    //     } catch (Exception $e) {
    //         show_error($e->getMessage() . ' --- ' . $e->getTraceAsString());
    //     }
    // }

    public function listarPM()
    {
        try {
            $this->load->library('form_validation');
            $crud = new grocery_CRUD($this);

            $crud->set_theme('tablestrap4');
            $crud->set_table('lfp_am');
            $crud->set_subject('PM');

            $crud->unset_read();
            $crud->unset_clone();
            $crud->unset_edit();
            $crud->unset_delete();
            $crud->unset_back_to_list();

            $crud->columns('fecha_proceso', 'finca_id', 'lote_id', 'modulos', 'responsable_cierre_id', 'personal_id', 'cultivo_id', 'subtarea_id', 'cantidad');
            $crud->add_fields('fecha_proceso', 'finca_id', 'lote_id', 'modulos', 'responsable_id', 'personal_id', 'cantidad', 'cultivo_id', 'subtarea_id', 'hora_cierre', 'comentario_cierre',
                'guid', 'cierre_guid', 'responsable_cierre_id', 'origen', 'cierre_origen', 'received_at_server', 'cierre_received_at');
            $this->_pmCamposComunes($crud, !in_array($crud->getState(), array('add', 'insert', 'insert_validation')));

            foreach (array('guid', 'cierre_guid', 'responsable_cierre_id', 'origen', 'cierre_origen', 'received_at_server', 'cierre_received_at') as $campo) {
                $crud->field_type($campo, 'invisible');
            }

            $crud->add_action('Editar', '', 'edit', 'edit', array($this, '_callback_column_edit'));
            $crud->add_action('Ver', '', 'eye', 'eye', array($this, '_callback_column_view'));
            $crud->callback_before_insert(array($this, 'pmAntesDeInsertar'));

            $state = $crud->getState();

            acceso_exigir('edita');
            $this->_pmRestringirFinca($crud);
            alerta_validar($crud, array($this, '_pmMotivo'));

            if (!acceso_puede('maestras')) {
                $crud->unset_add();
            }

            if ($state == 'edit') {
                redirect('PM/listarPM', 'refresh');
            }

            if ($state == 'add') {
                $crud->callback_add_field('fecha_proceso', array($this, '_campoFechaInicio'));
                $crud->callback_add_field('hora_cierre', array($this, '_campoHoraCierre'));
            }

            // Una fila de lfp_am sin cierre es una programacion AM, no un PM.
            $crud->where('cierre_guid IS NOT NULL', null, false);

            if ($state == 'export' || $state == 'print') {
                if ($this->uri->segment(4) === "fechaDesde") {
                    $crud->where('fecha_proceso >=', $this->_fechaSql($this->uri->segment(5)));
                }

                if ($this->uri->segment(6) === "fechaHasta") {
                    $crud->where('fecha_proceso <', $this->_diaSiguiente($this->uri->segment(7)));
                }

                if ($this->uri->segment(8) === "finca") {
                    $crud->where('lfp_am.finca_id', (int) $this->uri->segment(9));
                }
            } else {
                $crud->where('fecha_proceso >=', $this->_fechaSql($this->input->get('fechaDesde')));
                $crud->where('fecha_proceso <', $this->_diaSiguiente($this->input->get('fechaHasta')));

                $filtro_finca_pm = $this->input->get('id_finca');
                if (isset($filtro_finca_pm) && $filtro_finca_pm > 0) {
                    $crud->where('lfp_am.finca_id', (int) $filtro_finca_pm);
                }
            }

            $crud->required_fields('finca_id', 'lote_id', 'responsable_id', 'personal_id', 'cantidad', 'cultivo_id', 'subtarea_id', 'hora_cierre');

            $output = $crud->render();

            $data['listadoFincas'] = $this->fincas_model->getFincasCombobox();

            $output->data = $data;

            $this->load->view('Crud/pm-edit', (array) $output);
        } catch (Exception $e) {
            show_error($e->getMessage() . ' --- ' . $e->getTraceAsString());
        }
    }

    public function _callback_column_edit($value, $row)
    {
        return site_url('PM/editarPM/edit/' . $row->id);
    }

    public function _callback_column_view($value, $row)
    {
        return site_url('PM/editarPM/read/' . $row->id);
    }

    private function _pmRestringirFinca($crud)
    {
        if (acceso_finca() === null) {
            return;
        }

        acceso_crud_finca($crud, 'lfp_am', 'finca_id');
        $crud->set_relation('lote_id', 'vw_util_finca_lotes', '{nombre_finca} - Lote {lote}', 'id IN (' . acceso_lotes_sql() . ')');
    }

    private function _pmCamposComunes($crud, $relacionCierre = true)
    {
        $crud->display_as('fecha_proceso', 'Fecha')
            ->display_as('finca_id', 'Finca')
            ->display_as('lote_id', 'Lote')
            ->display_as('modulos', 'Módulos')
            ->display_as('responsable_id', 'Responsable')
            ->display_as('responsable_cierre_id', 'Responsable')
            ->display_as('personal_id', 'Trabajador')
            ->display_as('cultivo_id', 'Cultivo')
            ->display_as('subtarea_id', 'Subtarea')
            ->display_as('cantidad', 'Cantidad')
            ->display_as('hora_cierre', 'Hora cierre')
            ->display_as('comentario_cierre', 'Comentario');

        $crud->set_relation('finca_id', 'z_finca', 'nombre');
        $crud->set_relation('responsable_id', 'z_personal', 'nombre');
        if ($relacionCierre) {
            $crud->set_relation('responsable_cierre_id', 'z_personal', 'nombre');
        }
        $crud->set_relation('personal_id', 'z_personal', 'nombre');
        $crud->set_relation('cultivo_id', 'z_cultivo', 'nombre');
        $crud->set_primary_key('id', 'vw_util_finca_lotes');
        $crud->set_relation('lote_id', 'vw_util_finca_lotes', '{nombre_finca} - Lote {lote}');
        $crud->set_relation('subtarea_id', 'z_subtarea', 'nombre_subtarea');

        $this->db->select('id_modulo, modulo, nombre_finca, lote');
        if (acceso_finca() !== null) {
            $acceso = acceso_usuario();
            $this->db->where('nombre_finca', $acceso['finca_nombre']);
        }
        $results = $this->db->get('vw_util_fincas_lotes_modulos')->result();
        $modulos_multiselect = array();

        foreach ($results as $result) {
            $modulos_multiselect[$result->id_modulo] = $result->nombre_finca . ' - Lote ' . $result->lote . ' - Mód' . $result->modulo;
        }

        $crud->field_type('modulos', 'multiselect', $modulos_multiselect);
    }

    public function _campoFechaInicio($value, $primary_key = null)
    {
        if ($primary_key === null) {
            $valor = $value ? date('Y-m-d\TH:i', strtotime($value)) : '';
            return '<input type="datetime-local" name="fecha_inicio" value="' . $valor . '" required />';
        }

        // Al editar la fecha no cambia: moverla cambia la semana de pago. Solo la hora.
        return date('Y-m-d', strtotime($value))
            . ' <input type="time" name="hora_inicio" value="' . date('H:i', strtotime($value)) . '" />';
    }

    public function _campoHoraCierre($value, $primary_key = null)
    {
        $valor = $value ? date('Y-m-d\TH:i', strtotime($value)) : '';
        return '<input type="datetime-local" name="hora_cierre" value="' . $valor . '" />';
    }

    // Devuelve el motivo por el que no se puede guardar, o null. Lo usan la
    // validacion (para mostrarlo) y los callbacks (como ultima barrera).
    public function _pmMotivo($post_array, $primary_key = null)
    {
        if ($primary_key === null) {
            $inicio = $this->_datetimeSql(isset($post_array['fecha_inicio']) ? $post_array['fecha_inicio'] : '');
            if ($inicio === null) {
                return 'Falta la fecha y hora de inicio.';
            }
        } else {
            $fila = $this->db->select('fecha_proceso, cierre_guid')->where('id', $primary_key)->get('lfp_am')->row();
            if (!$fila || $fila->cierre_guid === null) {
                return 'Este registro no tiene cierre: no se puede editar como PM.';
            }
            $inicio = $this->_inicioEditado($post_array, $fila->fecha_proceso);
        }

        $cierre = $this->_datetimeSql(isset($post_array['hora_cierre']) ? $post_array['hora_cierre'] : '');

        if ($cierre === null) {
            return 'Falta la fecha y hora de cierre.';
        }

        if ($cierre < $inicio) {
            return 'El cierre (' . substr($cierre, 0, 16) . ') es anterior al inicio (' . substr($inicio, 0, 16) . ').';
        }

        return $this->_loteYModulosMotivo($post_array);
    }

    public function pmAntesDeInsertar($post_array)
    {
        if ($this->_pmMotivo($post_array) !== null) {
            return false;
        }

        $ahora = date('Y-m-d H:i:s');

        $post_array['fecha_proceso'] = $this->_datetimeSql($post_array['fecha_inicio']);
        $post_array['hora_cierre'] = $this->_datetimeSql($post_array['hora_cierre']);
        $post_array['modulos'] = $this->_modulosCsv(isset($post_array['modulos']) ? $post_array['modulos'] : array());
        $post_array['guid'] = $this->generateUUID();
        $post_array['cierre_guid'] = $this->generateUUID();
        $post_array['responsable_cierre_id'] = $post_array['responsable_id'];
        $post_array['origen'] = 'web';
        $post_array['cierre_origen'] = 'web';
        $post_array['received_at_server'] = $ahora;
        $post_array['cierre_received_at'] = $ahora;

        unset($post_array['fecha_inicio']);

        return $post_array;
    }

    public function pmAntesDeActualizar($post_array, $primary_key)
    {
        if ($this->_pmMotivo($post_array, $primary_key) !== null) {
            return false;
        }

        $fila = $this->db->select('fecha_proceso')->where('id', $primary_key)->get('lfp_am')->row();

        $post_array['fecha_proceso'] = $this->_inicioEditado($post_array, $fila->fecha_proceso);
        $post_array['hora_cierre'] = $this->_datetimeSql($post_array['hora_cierre']);
        $post_array['modulos'] = $this->_modulosCsv(isset($post_array['modulos']) ? $post_array['modulos'] : array());
        unset($post_array['hora_inicio']);

        return $post_array;
    }

    // Al editar solo se cambia la hora de inicio; el dia es el del registro.
    private function _inicioEditado($post_array, $fechaProceso)
    {
        $hora = isset($post_array['hora_inicio']) && preg_match('/^\d{2}:\d{2}$/', $post_array['hora_inicio'])
            ? $post_array['hora_inicio']
            : date('H:i', strtotime($fechaProceso));

        return date('Y-m-d', strtotime($fechaProceso)) . ' ' . $hora . ':00';
    }

    private function _loteYModulosMotivo($post_array)
    {
        if (empty($post_array['finca_id'])) {
            return 'Falta elegir la finca.';
        }

        if (empty($post_array['lote_id'])) {
            return 'Falta elegir el lote.';
        }

        $lote = $this->db->where('id', (int) $post_array['lote_id'])
            ->where('finca_id', (int) $post_array['finca_id'])
            ->get('z_lote')->row();

        if (!$lote) {
            return 'El lote elegido no pertenece a la finca elegida.';
        }

        $modulos = isset($post_array['modulos']) && is_array($post_array['modulos']) ? $post_array['modulos'] : array();

        foreach ($modulos as $moduloId) {
            $ok = $this->db->where('id', (int) $moduloId)->where('lote_id', (int) $lote->id)->count_all_results('z_modulo');
            if ($ok == 0) {
                return 'Uno de los modulos elegidos no pertenece al lote ' . $lote->lote . '.';
            }
        }

        return null;
    }

    private function _modulosCsv($modulos)
    {
        if (!is_array($modulos)) {
            $modulos = explode(',', (string) $modulos);
        }

        $ids = array_values(array_unique(array_filter(array_map('intval', $modulos))));
        sort($ids);

        return $ids ? $ids : array();
    }

    private function _datetimeSql($valor)
    {
        $valor = str_replace('T', ' ', trim((string) $valor));
        $ts = strtotime($valor);

        return ($valor === '' || $ts === false) ? null : date('Y-m-d H:i:s', $ts);
    }

    private function _fechaSql($valor)
    {
        return date('Y-m-d', strtotime((string) $valor));
    }

    private function _diaSiguiente($valor)
    {
        return date('Y-m-d', strtotime((string) $valor . ' +1 day'));
    }

    private function generateUUID()
    {
        $b = random_bytes(16);
        $b[6] = chr(ord($b[6]) & 0x0f | 0x40);
        $b[8] = chr(ord($b[8]) & 0x3f | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
    function export($filtro_fecha)
    {
        $file_name = 'reporte_pm' . date('Ymd') . '.csv';
        header("Content-Description: File Transfer");
        header("Content-Disposition: attachment; filename=$file_name");
        header("Content-Type: application/csv;");

        // get data 
        $report_data = $this->pm_model->date_filter($filtro_fecha);

        // file creation 
        $file = fopen('php://output', 'w');

        $header = array("Student Name", "Student Phone");
        fputcsv($file, $header);
        foreach ($report_data->result_array() as $key => $value) {
            fputcsv($file, $value);
        }
        fclose($file);
        exit;
    }

    public function make_name_column_link($value, $row)
    {
        // Aquí creas el enlace con el ID del registro
        return '<a href="' . site_url('PM/editarPM/edit/' . $row->id) . '">' . $value . '</a>';
    }

    public function populate_lote_dropdown($value = '', $primary_key = null)
    {
        return '<select id="lote_dropdown" name="lote"></select>';
    }

    public function get_lotes_by_finca($finca_id)
    {
        $this->db->select('id, lote');
        $this->db->from('z_lote');
        $this->db->where('finca_id', $finca_id);
        $query = $this->db->get();

        $lotes = [];
        foreach ($query->result() as $row) {
            $lotes[$row->id] = $row->lote;
        }

        echo json_encode($lotes);
    }

}
