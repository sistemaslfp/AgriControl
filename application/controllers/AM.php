<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class AM extends Public_controller {

	public function __construct()
	{
		parent::__construct();

		$this->load->database();
		$this->load->helper('url');

		$this->load->library('grocery_CRUD');
		$this->load->model('fincas_model');

        $this->_init();
		
	}

    private function _init()
	{

	}

    public function index() {
        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('vw_lfp_reporte_am_base');
        $crud->set_primary_key('operario');
        $crud->set_subject('AM');
        $crud->unset_jquery();  
        $crud->unset_add();
        $crud->unset_edit();
        $crud->unset_delete();
        $crud->unset_read();
        
        $crud->display_as('modulos', 'M&oacute;dulos')
        ->display_as('operario', 'Trabajador');
        
        // Mostrar los nombres de los m��dulos en lugar de sus id
        $this->db->select('id, modulo');
        $results = $this->db->get('z_modulo')->result();
        $modulos_multiselect = array();

        foreach ($results as $result) {
            $modulos_multiselect[$result->id] = $result->modulo;
        }

        $crud->field_type('modulos', 'multiselect', $modulos_multiselect);      
        
        // fin de c��digo para Mostrar los nombres de los m��dulos en lugar de sus id
        
        $crud->columns('fecha', 'hora', 'finca', 'supervisor', 'cultivo', 'lote', 'modulos', 'operario', 'subtarea' );
        
        $filtro_fecha_am = $this->input->get('fechaDesde');

        //echo $this->uri->segment(5, 0);
        if(isset($filtro_fecha_am)) {
            $filtro_fecha_am = date("Y-m-d", strtotime($filtro_fecha_am) );
            $filtro_fecha_am = strval($filtro_fecha_am);
        } else {
            if($this->uri->segment(4) === "fecha") {
                $filtro_fecha_am = $this->uri->segment(5);
            } else {
                $filtro_fecha_am = date("Y-m-d", strtotime($filtro_fecha_am) );
                $filtro_fecha_am = strval($filtro_fecha_am);
                // $crud->where('fecha', $filtro_fecha_am);       
            }
        }
                
        $state = $crud->getState();

        if ($state == 'export' || $state == 'print') {
            
            if ($this->uri->segment(4) === "fechaDesde") {
                $reportDate = $this->uri->segment(5);
                $crud->where('fecha = "' . $reportDate . '"');
            }

            if ($this->uri->segment(8) === "finca") {
                $reportIdFinca = $this->uri->segment(9);
                if ($reportIdFinca > 0) {
                    $crud->where('id_finca', $reportIdFinca );
                }
            }

        } else {

            $crud->where('fecha', $filtro_fecha_am);
            
            $filtro_finca = $this->input->get('id_finca');

            if ($filtro_finca > 0) {
                $crud->where('id_finca', $filtro_finca );
            }

        }

        acceso_crud($crud, 'vw_lfp_reporte_am_base', '{t}.id_finca = {f}', 'operario');

        $output = $crud->render();

        $data_view['title'] = 'Reporte AM';
        $data['listadoFincas'] = $this->fincas_model->getFincasCombobox();
        
        $output->data = $data;
        
        $this->load->view('Crud/farm-date_filter',(array)$output);        
    }

    
    public function pivotLabores() {
        $this->load->model('reporteam_model');

        $annoReporte = $this->input->post('annoReporte');
        $semanaReporte = $this->input->post('semanaReporte');
        $mostrarPivot = true;

        if(empty($annoReporte) || empty($semanaReporte)) {
            $mostrarPivot = false;
        }

        $annosList = $this->reporteam_model->get_annos();
        $semanasList = $this->reporteam_model->get_semanas();

        $view_data['annoReporte'] = $annoReporte;
        $view_data['semanaReporte'] = $semanaReporte;
        $view_data['semanasList'] = $semanasList;
        $view_data['annosList'] = $annosList;
        $view_data['mostrarPivot'] = $mostrarPivot;

        $this->load->view('themes/admin/AM/base', $view_data);

        // $result = $this->reporteam_model->get_am_view(2023,48);

        // echo json_encode($result);
    }

}