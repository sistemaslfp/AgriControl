<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class Modulo extends Public_controller {

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
			$crud->set_table('z_modulo');
			$crud->set_subject('Modulo');
			$crud->unset_read();
			$crud->unset_jquery();
			$crud->unset_clone();
			//$crud->required_fields('po_name', 'po_date');
			//$crud->columns('po','po_name','po_date','po_status','id_cliente');
			//$crud->display_as('po_name', 'Nombre Proyecto');

			$crud->field_type('estado','dropdown',
			array('1' => 'Activo', '2' => 'Inactivo'));

			$crud->display_as('modulo', 'Módulo')
			->display_as('ha', 'Hectárea')
			->display_as('lote_id', 'Lote')
			->display_as('estado', 'Estado');

			$crud->set_relation('lote_id','z_lote', 'lote');
			
			// BORRAR UN MODULO NO SE PERMITE, NI SIQUIERA AL ADMIN.
			//
			// Antes solo se le quitaba al grupo != 1, y el resultado esta en
			// los datos: 3.119 filas de z_tabla_am (2,75%) apuntan a modulos
			// que ya no existen -- se borraron y la columna `modulos`, que es
			// texto separado por comas, no tenia como impedirlo. Lo mismo vale
			// ahora para lfp_am.modulos.
			//
			// La baja se hace con `estado` = Inactivo, que ya existe en esta
			// misma pantalla: el modulo desaparece de los catalogos que sirve
			// /v4/catalogos y de los selectores de la app, pero los registros
			// historicos siguen apuntando a algo.
			$crud->unset_delete();

			acceso_exigir('maestras');

			if (acceso_finca() !== null) {
				acceso_crud($crud, 'z_modulo', '{t}.lote_id IN (SELECT id FROM z_lote WHERE finca_id = {f})');
				$crud->set_relation('lote_id', 'z_lote', 'lote', array('finca_id' => acceso_finca()));
				acceso_validar_lote($crud, 'lote_id');
			}

			
			//$crud->callback_before_insert(array($this,'ino_to_upper'));

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