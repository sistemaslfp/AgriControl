<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class Proyectos extends Public_controller {

	public function __construct()
	{
		parent::__construct();

		$this->load->library('ion_auth');

		if (!$this->ion_auth->logged_in())
		{
		  redirect('auth/login');
		}

		$this->load->database();
		$this->load->helper('url');

		$this->load->library('grocery_CRUD');

		$this->_init();
		
	}
	
	private function _init()
	{

	}

}