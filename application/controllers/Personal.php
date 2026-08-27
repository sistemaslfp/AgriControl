<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class Personal extends Public_controller {

	public function __construct()
	{
		parent::__construct();

		$this->load->library('ion_auth');
		$this->load->library('user_agent');

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
			$crud->set_table('z_personal');
			$crud->set_subject('Personal');
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

			$crud->order_by('nombre');
			
			if ($this->agent->is_mobile()) {
			    $crud->set_theme('bootstrap-v4');
			    $crud->columns('nombre');
			    $crud->unset_export();
			    $crud->unset_print();
			    $crud->unset_delete();
			}
			//$crud->required_fields('po_name', 'po_date');
			//$crud->columns('po','po_name','po_date','po_status','id_cliente');
			//$crud->display_as('po_name', 'Nombre Proyecto');
			
			$crud->display_as('nombre', 'Nombre')
			->display_as('cedula', 'Cédula')
			->display_as('rol', 'Rol')
			->display_as('estado', 'Estado')
			->display_as('rol_app', 'Rol APP')
			->display_as('id_finca', 'Finca Asignada')
			->display_as('eregistro', 'Situación');

			// $crud->where('id', 258);

			$crud->set_relation('estado', 'z_personal_estado', 'descripcion_estado');

			$crud->set_relation('rol', 'z_personal_roles', 'rol_descripcion');
			$crud->set_relation('id_finca', 'z_finca', 'nombre');

			$crud->field_type('rol_app','dropdown',
			array('1' => 'Operario', '2' => 'Supervisor','0' => 'No aparece en app móvil'));

			$crud->field_type('eregistro','dropdown',
			array('A' => 'Activo', 'I' => 'Inactivo', 'V' => 'Temporalmente inactivo (vacaciones)'));

			$crud->callback_before_insert(array($this,'ino_to_upper'));

			$output = $crud->render();
			if ($this->agent->is_mobile()) {
                $output->css_files[] = base_url().'assets/themes/admin/hacks/custom.css';
			}
			
			$this->load->view('Crud/default',(array)$output);

		}catch(Exception $e){
			show_error($e->getMessage().' --- '.$e->getTraceAsString());
		}		
	}

	public function roles() {
		try{
			$crud = new grocery_CRUD();

			$group = $this->ion_auth->get_users_groups()->row()->id;
			
			if ($group != 1 ) {
				$crud->unset_delete();
			}

			if ($group != 1 && $group != 2) {
				redirect('/', 'refresh');
			}

			$crud->set_theme('tablestrap4');
			$crud->set_table('z_personal_roles');
			$crud->set_subject('Roles');
			$crud->unset_read();
			$crud->unset_clone();
			$crud->unset_jquery();

			$crud->display_as('rol_descripcion', 'Descripción');

			$output = $crud->render();

			
			$this->load->view('Crud/default',(array)$output);

		}catch(Exception $e){
			show_error($e->getMessage().' --- '.$e->getTraceAsString());
		}		
	}

	public function estado() {
		try{
			$crud = new grocery_CRUD();

			$group = $this->ion_auth->get_users_groups()->row()->id;
			
			if ($group != 1 ) {
				$crud->unset_delete();
			}

			if ($group != 1 && $group != 2) {
				redirect('/', 'refresh');
			}

			$crud->set_theme('tablestrap4');
			$crud->set_table('z_personal_estado');
			$crud->set_subject('Estado');
			$crud->unset_read();
			$crud->unset_clone();
			$crud->unset_jquery();

			$crud->display_as('descripcion_estado', 'Descripción');

			$output = $crud->render();

			
			$this->load->view('Crud/default',(array)$output);

		}catch(Exception $e){
			show_error($e->getMessage().' --- '.$e->getTraceAsString());
		}		
	}

	public function getAllStatuses(){
		
	}

	public function ino_to_upper($post_array) 
	{
		$fecha = new DateTime();
 
		$post_array['nombre'] = strtoupper($post_array['nombre']);
 
		return $post_array;
	}

}