<?php if (!defined('BASEPATH'))
    exit('No direct script access allowed');

class PmPaymentDailyAdjusment extends Public_Controller
{

    public function __construct()
    {
        parent::__construct();

        $this->load->database();
        $this->load->helper('url');
        //$this->load->library('ion_auth');
        $this->load->library('grocery_CRUD');
        $this->load->model('fincas_model');
        $this->load->helper('payment_reports');

        $this->_init();
    }

    private function _init() {}

    public function index() {}
}
