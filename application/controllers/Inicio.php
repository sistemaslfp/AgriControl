<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class Inicio extends Public_controller {

	function __construct()
	{
		parent::__construct();
		$this->load->library('ion_auth');
		$this->load->library('user_agent');

		if (!$this->ion_auth->logged_in())
		{
		  redirect('auth/login');
		}

		$this->load->helper('url');

		$this->_init();
	}

	private function _init()
	{

	}

	public function index()
	{
		// $this->load->view('Blog/home');
		if ($this->agent->is_mobile() && acceso_puede('maestras')) {
		    redirect('Personal'); 
		} else {
		    redirect('PM/reportePagos'); 
		}
		

	}

	public function logout()
	{
		$logout = $this->ion_auth->logout();
		$this->session->set_flashdata('message', $this->ion_auth->messages());
		redirect('auth/login', 'refresh');
	}
	
	
    
}