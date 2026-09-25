<?php if (! defined('BASEPATH')) exit('No direct script access allowed');

class Lote extends Public_controller
{

	public function __construct()


	{
		parent::__construct();


		$this->load->library('ion_auth');

		if (!$this->ion_auth->logged_in()) {
			redirect('auth/login');
		}

		$this->load->database();
		$this->load->helper('url');

		$this->load->library('grocery_CRUD');

		$this->_init();
	}

	private function _init() {}

	public function index()
	{
		try {
			$crud = new grocery_CRUD();

			$crud->set_theme('tablestrap4');
			$crud->set_table('z_lote');
			$crud->set_subject('Lote');
			$crud->unset_read();
			$crud->unset_jquery();
			$crud->unset_clone();
			//$crud->required_fields('po_name', 'po_date');
			//$crud->columns('po','po_name','po_date','po_status','id_cliente');
			//$crud->display_as('po_name', 'Nombre Proyecto');

			$crud->display_as('lote', 'Lote')
				->display_as('ha', 'Hectáreas')
				->display_as('finca_id', 'Finca')
				->display_as('estado', 'Estado');

			$crud->field_type(
				'estado',
				'dropdown',
				array('1' => 'Activo', '2' => 'Inactivo')
			);

			$crud->set_relation('finca_id', 'z_finca', 'nombre');
			acceso_crud_finca($crud, 'z_lote', 'finca_id');

			$crud->order_by('lote');

			$group = $this->ion_auth->get_users_groups()->row()->id;


			if ($group != 1) {
				$crud->unset_delete();
			}

			acceso_exigir('maestras');

			//$crud->callback_before_insert(array($this,'ino_to_upper'));

			$output = $crud->render();


			$this->load->view('Crud/default', (array)$output);
		} catch (Exception $e) {
			show_error($e->getMessage() . ' --- ' . $e->getTraceAsString());
		}
	}

	public function ino_to_upper($post_array)
	{
		$fecha = new DateTime();

		$post_array['nombre'] = strtoupper($post_array['nombre']);

		return $post_array;
	}
}
