<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class Finca extends Public_controller {

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

	public function index() 
	{
			try{
				$crud = new grocery_CRUD();
	
				$crud->set_theme('tablestrap4');
				$crud->set_table('z_finca');
				$crud->set_subject('Finca');
				$crud->unset_read();
				$crud->unset_jquery();
				$crud->unset_clone();

				$group = $this->ion_auth->get_users_groups()->row()->id;
				
				
			if ($group != 1 ) {
				$crud->unset_delete();
			}

			if ($group != 1 && $group != 2) {
				redirect('/', 'refresh');
			}
	

				$crud->display_as('nombre', 'Nombre')
				->display_as('ha', 'Hectáreas');

				$crud->columns('nombre', 'ha');


				$output = $crud->render();
	
				
				$this->load->view('Crud/default',(array)$output);
	
			}catch(Exception $e){
				show_error($e->getMessage().' --- '.$e->getTraceAsString());
			}		
	}




	public function ino_to_upper($post_array) 
	{
		$fecha = new DateTime();
 
		$post_array['nombre'] = strtoupper($post_array['nombre']);
 
		return $post_array;
	}

}