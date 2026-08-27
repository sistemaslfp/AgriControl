<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class Subtarea extends Public_controller {

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
            $crud->set_table('z_subtarea');
            $crud->set_subject('Subtareas');
            $crud->unset_read();
            // $crud->unset_jquery();
            $crud->unset_clone();
          
			$group = $this->ion_auth->get_users_groups()->row()->id;
			
			if ($group != 1 ) {
				$crud->unset_delete();
			}

			if ($group != 1 && $group != 2) {
				redirect('/', 'refresh');
			}

            $crud->display_as('nombre_subtarea', 'Subtarea')
            ->display_as('tarea_id', 'Tarea')
            ->display_as('estado', 'Estado')
            ->display_as('unidad_labor_id', 'Unidad')
            ->display_as('tipo_pago_id', 'Tipo pago')
            ->display_as('tarifa', 'Tarifa')
            ->display_as('documento_soporte', 'Soporte')
            ->display_as('id_finca', 'Finca')
            ->display_as('Comentarios')
            ->display_as('cost_group_id', 'Grupo Costo');

            $crud->columns('nombre_subtarea', 'id_finca', 'cost_group_id', 'tarea_id', 'estado', 'unidad_labor_id', 'tipo_pago_id', 'tarifa');
            $crud->order_by('nombre_subtarea');
            $crud->add_fields('nombre_subtarea', 'id_finca', 'cost_group_id', 'tarea_id', 'estado', 'unidad_labor_id', 'tipo_pago_id', 'tarifa', 'documento_soporte', 'comentarios_cambio');
            $crud->edit_fields('nombre_subtarea', 'id_finca', 'cost_group_id', 'tarea_id', 'estado', 'unidad_labor_id', 'tipo_pago_id', 'tarifa', 'documento_soporte', 'comentarios_cambio');

            $crud->required_fields('nombre_subtarea', 'id_finca', 'cost_group_id', 'tarea_id', 'estado', 'uniad_labor_id', 'tipo_pago_id', 'tarifa');
            
            $crud->set_relation('tarea_id', 'z_tarea', 'nombre');
            $crud->set_relation('id_finca', 'z_finca', 'nombre');

            $crud->field_type('estado','dropdown', array('A' => 'Activo', 'I' => 'Inactivo'));

            $crud->set_relation('unidad_labor_id', 'z_ulabor', 'ulabor_nombre');

            $crud->set_relation('tipo_pago_id', 'z_tipo_pago', 'descripcion');
            $crud->set_relation('cost_group_id', 'tbl_pm_cost_groups', 'cost_group_name');

            $crud->set_field_upload('documento_soporte','assets/uploads/files');

            $crud->callback_before_update(array($this,'grabar_historial_callback'));
            $crud->callback_after_upload(array($this,'copy_callback_after_upload'));

            $output = $crud->render();

            
            $this->load->view('Crud/default',(array)$output);

        }catch(Exception $e){
            show_error($e->getMessage().' --- '.$e->getTraceAsString());
        }		
    }

    public function tipoPago()
    {
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
            $crud->set_table('z_tipo_pago');
            $crud->set_subject('Tipo de pago');
            $crud->unset_read();
            $crud->unset_jquery();
            $crud->unset_clone();

            $crud->display_as('descripcion', 'Descripción');
           

            $output = $crud->render();

            
            $this->load->view('Crud/default',(array)$output);

        }catch(Exception $e){
            show_error($e->getMessage().' --- '.$e->getTraceAsString());
        }	
    }

    public function unidadLabor()
    {
        try{
            $crud = new grocery_CRUD();

            $crud->set_theme('tablestrap4');
            $crud->set_table('z_ulabor');
            $crud->set_subject('Unidad');
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


            $crud->display_as('ulabor_nombre', 'Unidad Labor');
            $output = $crud->render();

            
            $this->load->view('Crud/default',(array)$output);

        }catch(Exception $e){
            show_error($e->getMessage().' --- '.$e->getTraceAsString());
        }	
    }

    function copy_callback_after_upload($uploader_response,$field_info, $files_to_upload) {
        
        $this->load->library('image_moo');
        $file_uploaded = $field_info->upload_path.'/'.$uploader_response[0]->name; 
        $this->image_moo->load($file_uploaded)->resize(1920,1080)->save($field_info->upload_path . '/historia_tarifas/' . $uploader_response[0]->name, true);
       
        return true;
    }

    function grabar_historial_callback($post_array, $primary_key) {
        $tarifa_log = array(
            "fecha_cambio" => date('Y-m-d H:i:s'),
            "tarifa_actual" => $post_array['tarifa'],
            "usuario" => $this->ion_auth->user()->row()->username, 
            "documento_soporte" => $post_array['documento_soporte'], 
            "comentarios_cambio" => $post_array['comentarios_cambio'], 
            "subtarea_id" => $primary_key,
            "tipo_pago_id" => $post_array['tipo_pago_id'],
            "tarea_id" => $post_array['tarea_id'],
            "unidad_labor_id" => $post_array['unidad_labor_id']
        );

        $this->db->insert('z_tarifas_historia', $tarifa_log);

        return true;

    }


}