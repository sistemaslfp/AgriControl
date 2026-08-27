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

            $currentTable = 'vw_reporte_pm';

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
            // $this->load->library('form_validation');
            $crud = new grocery_CRUD($this);

            $crud->set_theme('tablestrap4');
            // $crud->set_theme('bootstrap-v4');
            // $crud->set_model('pm_model');
            $crud->set_table('z_tabla_pm');
            $crud->set_subject('PM');

            // $crud->unset_read();
            $crud->unset_add();
            // $crud->unset_jquery();
            $crud->unset_clone();
            $crud->unset_delete();
            $crud->unset_back_to_list();

            $crud->columns('numero_registro', 'fecha', 'finca', 'lote', 'modulo', 'responsable', 'trabajador', 'cultivo', 'subtarea');

            $crud->edit_fields('numero_registro', 'fecha', 'pm_year', 'pm_week', 'finca', 'lote', 'modulo', 'responsable', 'trabajador', 'cantidad', 'cultivo', 'subtarea', 'hora_inicio', 'hora_cierre', 'comentario');

            // Añadir campos al formulario de creación
            // $crud->add_fields('numero_registro', 'fecha', 'finca', 'lote', 'modulo', 'responsable', 'trabajador', 'cantidad', 'cultivo', 'subtarea', 'hora_cierre', 'hora_inicio', 'comentario');

            $crud->set_relation('finca', 'z_finca', 'nombre');
            $crud->set_relation('responsable', 'z_personal', 'nombre');
            $crud->set_relation('trabajador', 'z_personal', 'nombre');
            $crud->set_relation('cultivo', 'z_cultivo', 'nombre');
            $crud->set_primary_key('id', 'vw_util_finca_lotes');
            $crud->set_relation('lote', 'vw_util_finca_lotes', '{nombre_finca} - Lote {lote}');
            $crud->set_relation('subtarea', 'z_subtarea', 'nombre_subtarea');

            $crud->callback_before_insert(array($this, 'calculateYearAndWeek'));

            $state = $crud->getState();

            $dateFrom = $this->input->get('fechaDesde');
            $dateTo = $this->input->get('fechaHasta');

            $dateFrom = date("Y-m-d", strtotime($dateFrom));
            $dateTo = date("Y-m-d", strtotime($dateTo));

            $dateFrom = strval($dateFrom);
            $dateTo = strval($dateTo);

            $group = $this->ion_auth->get_users_groups()->row()->id;

            $crud->required_fields('finca', 'lote', 'trabajador', 'cantidad', 'cultivo', 'subtarea', 'hora_cierre', 'hora_inicio');

            if ($group != 1 && $group != 2) {
                redirect('/', 'refresh');
                // $crud->unset_edit();
            }

            if ($group != 1) {
                $crud->unset_add();
            }

            if ($state == 'export' || $state == 'print') {
                redirect('PM/listarPM');
            }

            if ($state == "list") {
                redirect('PM/listarPM');
            }

            if ($state == "add") {
                redirect('PM/listarPM');
            }

            if ($state == "edit") {
                $crud->callback_edit_field('hora_inicio', function ($value, $primary_key) {
                    return '<input type="time" name="hora_inicio" value="' . date('H:i', strtotime($value)) . '" />';
                });

                $crud->callback_edit_field('hora_cierre', function ($value, $primary_key) {
                    return '<input type="time" name="hora_cierre" value="' . date('H:i', strtotime($value)) . '" />';
                });

                $crud->field_type('numero_registro', 'readonly');
                $crud->field_type('fecha', 'readonly');
                $crud->field_type('responsable', 'readonly');
                $crud->field_type('fecha_registro', 'readonly');
                $crud->field_type('pm_week', 'readonly');
                $crud->field_type('pm_year', 'readonly');
            }

            $this->db->select('id_modulo, modulo, nombre_finca, lote');
            $results = $this->db->get('vw_util_fincas_lotes_modulos')->result();
            $modulos_multiselect = array();

            foreach ($results as $result) {
                $modulos_multiselect[$result->id_modulo] = $result->nombre_finca . ' - Lote ' . $result->lote . ' - Mód' . $result->modulo;
            }

            $crud->field_type('modulo', 'multiselect', $modulos_multiselect);

            $crud->callback_before_update(array($this, 'validateFarmLot'));
            // $crud->callback_before_update(array($this, 'validateModules'));
            // $crud->callback_before_insert(array($this, 'validateModules'));

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
            $crud->set_table('z_tabla_pm');
            $crud->set_subject('PM');

            $crud->unset_read();
            $crud->unset_clone();
            $crud->unset_edit();
            $crud->unset_delete();
            $crud->unset_back_to_list();

            $crud->columns('numero_registro', 'fecha', 'finca', 'lote', 'modulo', 'responsable', 'trabajador', 'cultivo', 'subtarea');

            // Añadir campos al formulario de creación
            $crud->add_fields('numero_registro', 'fecha', 'pm_year', 'pm_week', 'finca', 'lote', 'modulo', 'responsable', 'trabajador', 'cantidad', 'cultivo', 'subtarea', 'hora_inicio', 'hora_cierre', 'comentario', 'fecha_registro');

            $crud->set_relation('finca', 'z_finca', 'nombre');
            $crud->set_relation('responsable', 'z_personal', 'nombre');
            $crud->set_relation('trabajador', 'z_personal', 'nombre');
            $crud->set_relation('cultivo', 'z_cultivo', 'nombre');
            $crud->set_primary_key('id', 'vw_util_finca_lotes');
            $crud->set_relation('lote', 'vw_util_finca_lotes', '{nombre_finca} - Lote {lote}');
            $crud->set_relation('subtarea', 'z_subtarea', 'nombre_subtarea');

            $crud->field_type('fecha', 'date');
            $crud->field_type('pm_year', 'hidden');
            $crud->field_type('pm_week', 'hidden');
            $crud->field_type('fecha_registro', 'hidden');

            $crud->callback_before_insert(array($this, 'calculateYearAndWeek'));
            $crud->add_action('Editar', '', 'edit', 'edit', array($this, '_callback_column_edit'));
            $crud->add_action('Ver', '', 'eye', 'eye', array($this, '_callback_column_view'));
            $crud->callback_before_update(array($this, 'validateFarmLot'));

            $state = $crud->getState();

            $dateFrom = $this->input->get('fechaDesde');
            $dateTo = $this->input->get('fechaHasta');

            $dateFrom = date("Y-m-d", strtotime($dateFrom));
            $dateTo = date("Y-m-d", strtotime($dateTo));

            $group = $this->ion_auth->get_users_groups()->row()->id;
            $crud->field_type('fecha', 'date');

            if ($group != 1 && $group != 2) {
                redirect('/', 'refresh');
            }

            if ($group != 1) {
                $crud->unset_add();
            }

            if ($state == 'edit') {
                redirect('PM/listarPM', 'refresh');
            }

            if ($state == 'add') {
                $crud->callback_add_field('hora_inicio', function ($value, $primary_key) {
                    return '<input type="time" name="hora_inicio" value="' . date('H:i', strtotime($value)) . '" />';
                });

                $crud->callback_add_field('hora_cierre', function ($value, $primary_key) {
                    return '<input type="time" name="hora_cierre" value="' . date('H:i', strtotime($value)) . '" />';
                });
            }

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
                    $crud->where('finca = ' . $reportIdFinca);
                }
            } else {
                $crud->where('fecha >= "' . $dateFrom . '"');
                $crud->where('fecha <= "' . $dateTo . '"');

                $filtro_finca_pm = $this->input->get('id_finca');
                if (isset($filtro_finca_pm) && $filtro_finca_pm > 0) {
                    $crud->where('finca', $filtro_finca_pm);
                }
            }

            $crud->field_type('numero_registro', 'hidden');

            $crud->required_fields('fecha', 'finca', 'lote', 'responsable', 'trabajador', 'cantidad', 'cultivo', 'subtarea', 'hora_cierre', 'hora_inicio');

            $this->db->select('id_modulo, modulo, nombre_finca, lote');
            $results = $this->db->get('vw_util_fincas_lotes_modulos')->result();
            $modulos_multiselect = array();

            foreach ($results as $result) {
                $modulos_multiselect[$result->id_modulo] = $result->nombre_finca . ' - Lote ' . $result->lote . ' - Mód' . $result->modulo;
            }

            $crud->field_type('modulo', 'multiselect', $modulos_multiselect);

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

    public function calculateYearAndWeek($post_array)
    {
        $fecha = new DateTime($post_array['fecha']);
        $post_array['pm_year'] = $fecha->format('Y');
        $post_array['pm_week'] = $fecha->format('W');

        // Establecer fecha_registro a la fecha y hora actual en GMT-5
        $now = new DateTime('now', new DateTimeZone('America/Guayaquil')); // GMT-5
        $post_array['fecha_registro'] = $now->format('Y-m-d H:i:s');

        // Generar un UUID para numero_registro
        $post_array['numero_registro'] = $this->generateUUID();

        return $post_array;
    }

    private function generateUUID()
    {
        // Generar un UUID v4
        return sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0xffff)
        );
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

    function validateFarmLot($post_array, $primary_key)
    {
        // Obtener los valores de finca_id y lote_id del formulario
        $finca_id = $post_array['finca'];
        $lote_id = $post_array['lote'];

        // Verificar si el lote pertenece a la finca
        $this->db->where('id', $lote_id);
        $this->db->where('finca_id', $finca_id);
        $query = $this->db->get('z_lote');

        if ($query->num_rows() == 0) {
            // Si no se encuentra el lote para la finca dada, retornar un mensaje de error
            $this->form_validation->set_message('validateFarmLot', 'El lote seleccionado no pertenece a la finca.');
            // echo '<script>alert("El lote seleccionado no pertenece a la finca.");</script>';
            error_log('Error en la validación de lote y finca');
            return false;
        }

        $lotId = $post_array['lote'];
        $selectedModules = $post_array['modulo'];

        // Convierte la cadena de módulos seleccionados en un array
        // $modulesArray = explode(',', $selectedModules);

        // Verifica cada módulo
        foreach ($selectedModules as $moduleId) {
            $this->db->where('id', $moduleId);
            $this->db->where('lote_id', $lotId);
            $query = $this->db->get('z_modulo');

            if ($query->num_rows() == 0) {
                return array(
                    'success' => false,
                    'error_message' => 'El campo obligatorio no puede estar vacío. Por favor, complétalo.'
                );
            }
        }

        // Si todo está bien, devuelve los datos sin modificar
        return $post_array;
    }

    function validateModules($post_array, $primary_key)
    {
        $lotId = $post_array['lote'];
        $selectedModules = $post_array['modulo'];

        // Convierte la cadena de módulos seleccionados en un array
        $modulesArray = explode(',', $selectedModules);

        // Verifica cada módulo
        foreach ($modulesArray as $moduleId) {
            $this->db->where('id', $moduleId);
            $this->db->where('lote_id', $lotId);
            $query = $this->db->get('z_modulo');

            if ($query->num_rows() == 0) {
                return false;
            }
        }

        // Si todo está bien, devuelve los datos sin modificar
        return true;
    }
}
