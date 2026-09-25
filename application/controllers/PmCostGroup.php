<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class PmCostGroup extends Public_controller {

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

    function index() {
        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        acceso_exigir('admin_global');
        $crud->set_table('tbl_pm_cost_groups');
        $crud->set_subject('Cost Group');
        // $crud->unset_jquery();  
        // $crud->unset_add();
        // $crud->unset_edit();
        $crud->unset_delete();
        $crud->unset_read();

        $output = $crud->render();

        $data_view['title'] = 'Reporte AM';
        $data['listadoFincas'] = $this->fincas_model->getFincasCombobox();
        
        $output->data = $data;
        
        $this->load->view('Crud/default',(array)$output);
    }

}