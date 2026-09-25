<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class Tarea extends Public_controller {

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

				$group = $this->ion_auth->get_users_groups()->row()->id;
			
				if ($group != 1 ) {
					$crud->unset_delete();
				}
	
				acceso_exigir('admin_global');
	
				$crud->set_theme('tablestrap4');
				$crud->set_table('z_tarea');
				$crud->set_subject('Tarea');
				$crud->unset_read();
				$crud->unset_clone();
				$crud->unset_jquery();
				//$crud->required_fields('po_name', 'po_date');
				//$crud->columns('po','po_name','po_date','po_status','id_cliente');
				//$crud->display_as('po_name', 'Nombre Proyecto');
	
				$crud->field_type('estado','dropdown',
				array('A' => 'Activo', 'I' => 'Inactivo'));

				$crud->set_relation('cultivos_id','z_cultivo','nombre');

				$crud->display_as('nombre', 'Nombre');
				$crud->display_as('cultivos_id', 'Cultivo');
				$crud->display_as('estado', 'Estado');
				
				//$crud->callback_before_insert(array($this,'ino_generate_po_number'));
	
				$output = $crud->render();
	
				
				$this->load->view('Crud/default',(array)$output);
	
			}catch(Exception $e){
				show_error($e->getMessage().' --- '.$e->getTraceAsString());
			}		
	}


	public function ino_generate_po_number($post_array) 
	{
		$fecha = new DateTime();
 
		$post_array['po'] = "PO-".$fecha->getTimestamp();
 
		return $post_array;
	}

}