<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class MY_Controller extends CI_Controller {

	public function __construct()
	{
		parent::__construct();
		$this->load->library('ion_auth');

		if (!$this->ion_auth->logged_in())
		{
		  redirect('auth/login');
		}

		$this->_init();
		
	}

	private function _init()
	{
	    
		$data_template['username'] = $this->session->userdata('username');
        $data_template['grupo'] = $this->ion_auth->get_users_groups()->row()->id;

		$this->output->set_template('admin/index', $data_template);

		$this->load->js('assets/themes/default/js/jquery-1.9.1.min.js');
		$this->load->js('assets/themes/default/hero_files/bootstrap-transition.js');
		$this->load->js('assets/themes/default/hero_files/bootstrap-collapse.js');
       
	}

}


class Admin_Controller extends MY_Controller {
    function __construct()
    {
        parent::__construct();
        
        if($this->data['user']['group'] !== 'admin')
        {
            show_error('Solo para administradores.');
        }
    }
}


class Public_Controller extends MY_Controller {
    function __construct()
    {
        parent::__construct();
        
        if($this->config->item('site_open') === FALSE)
        {
            show_error('El sistema se encuentra cerrado.');
        }


        // If the user is using a mobile, use a mobile theme
        $this->load->library('user_agent');
        if( $this->agent->is_mobile() )
        {
            /*
             * Use my template library to set a theme for your staff
             *     http://philsturgeon.co.uk/code/codeigniter-template
             */
    		$data_template['username'] = $this->session->userdata('username');
            $data_template['grupo'] = $this->ion_auth->get_users_groups()->row()->id;             
            $this->output->set_template('admin/index_mobile', $data_template);
        }
        
    }
}