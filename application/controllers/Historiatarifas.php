<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class Historiatarifas extends Public_controller {

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
            $crud->set_table('z_tarifas_historia');
            $crud->set_subject('Historial de tarifas');
            $crud->unset_jquery();
            $crud->unset_add();
            $crud->unset_delete();
            $crud->unset_edit();

            $crud->columns('fecha_cambio', 'tarifa_actual', 'subtarea_id','tipo_pago_id','documento_soporte');
            $crud->fields('fecha_cambio', 'tarifa_actual', 'subtarea_id','tipo_pago_id','documento_soporte');

            $crud->set_relation('subtarea_id', 'z_subtarea', 'nombre_subtarea');

            // $crud->field_type('estado','dropdown', array('A' => 'Activo', 'I' => 'Inactivo'));

            $crud->set_relation('unidad_labor_id', 'z_ulabor', 'ulabor_nombre');

            $crud->set_relation('tarea_id', 'z_tarea', 'nombre');

            $crud->set_relation('tipo_pago_id', 'z_tipo_pago', 'descripcion');

            $crud->set_field_upload('documento_soporte','assets/uploads/files/historia_tarifas');

            $crud->display_as('fecha_cambio', 'Fecha')
            ->display_as('tarifa_actual', 'Tarifa')
            ->display_as('usuario', 'Usuario')
            ->display_as('documento_soporte', 'Documento')
            ->display_as('comentarios_cambio', 'Comentarios')
            ->display_as('subtarea_id', 'Subtarea')
            ->display_as('tarea_id', 'Tarea')
            ->display_as('tipo_pago_id', 'Tipo Pago')
            ->display_as('unidad_labor_id', 'Unidad Labor');

           

            $crud->callback_before_update(array($this,'grabar_historial_callback'));

            acceso_crud($crud, 'z_tarifas_historia', '{t}.subtarea_id IN (SELECT id FROM z_subtarea WHERE id_finca = {f})');

            $output = $crud->render();

            
            $this->load->view('Crud/default',(array)$output);

        }catch(Exception $e){
            show_error($e->getMessage().' --- '.$e->getTraceAsString());
        }		
    }



}