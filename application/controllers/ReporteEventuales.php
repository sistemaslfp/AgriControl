<?php if (!defined('BASEPATH'))
    exit('No direct script access allowed');

class ReporteEventuales extends Public_controller
{

    public function __construct()
    {
        parent::__construct();

        $this->load->database();
        $this->load->helper('url');

        $this->load->library('grocery_CRUD');
        // $this->load->model('fincas_model');

        $this->_init();

    }

    private function _init()
    {

    }

    public function index()
    {
        $crud = new grocery_CRUD();
        $crud->set_theme('bootstrap-v4');
        $crud->set_table('vw_pm_rpt_eventuales');
        $crud->set_primary_key('id');

        $output = $crud->render();

        $this->load->view('Crud/default', (array) $output);
    }

}