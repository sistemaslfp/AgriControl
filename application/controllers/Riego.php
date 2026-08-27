<?php if (!defined('BASEPATH'))
	exit('No direct script access allowed');

class Riego extends Public_controller
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

		$this->load->model('fincas_model');

		$this->_init();

	}

	private function _init()
	{

	}

	public function index()
	{
		try {
			$crud = new grocery_CRUD();

			$crud->set_theme('tablestrap4_datefilter');
			$crud->set_table('z_riego');
			$crud->set_subject('Riego');
			// $crud->unset_read();
			$crud->unset_jquery();
			$crud->unset_clone();
			// $crud->unset_edit();
			$crud->unset_delete();

			$crud->columns('fecha', 'finca', 'lote', 'modulo', 'supervisor', 'tiempo_riego', 'volumen_riego', 'observaciones');

			$group = $this->ion_auth->get_users_groups()->row()->id;


			if ($group != 1) {
				$crud->unset_delete();
			}

			if ($group != 1 && $group != 2) {
				// redirect('/', 'refresh');
				$crud->unset_edit();
				$crud->unset_delete();
			}

			$dateFrom = $this->input->get('fechaDesde');
			$dateTo = $this->input->get('fechaHasta');

			$dateFrom = date("Y-m-d", strtotime($dateFrom));
			$dateTo = date("Y-m-d", strtotime($dateTo));

			$dateFrom = strval($dateFrom);
			$dateTo = strval($dateTo);

			$state = $crud->getState();

			if ($state == 'export' || $state == 'print') {

				if ($this->uri->segment(4) === "fechaDesde") {
					$reportDateFrom = $this->uri->segment(5);
					$crud->where('fecha >= "' . $reportDateFrom . '"');
				}

				if ($this->uri->segment(6) === "fechaHasta") {
					$reportDateTo = $this->uri->segment(7);
					$crud->where('fecha <= "' . $reportDateTo . '"');
				}

				if ($this->uri->segment(8) === "id_finca") {
					$reportIdFinca = $this->uri->segment(9);
					$crud->where('finca = "' . $reportIdFinca . '"');
				}

			} else {
				$crud->where('fecha >= "' . $dateFrom . '"');
				$crud->where('fecha <= "' . $dateTo . '"');

				$filtro_finca_pm = $this->input->get('id_finca');
				if (isset($filtro_finca_pm)) {
					if ($filtro_finca_pm > 0) {
						$crud->where('finca', $filtro_finca_pm);
					}
				}
			}

			$crud->set_relation('supervisor', 'z_personal', 'nombre');
			$crud->set_relation('codigo_subtarea', 'z_subtarea', 'nombre_subtarea');
			$crud->set_relation('finca', 'z_finca', 'nombre');
			$crud->set_relation('modulo', 'z_modulo', 'modulo');
			$crud->set_relation('lote', 'z_lote', 'lote');

			$crud->callback_column('tiempo_riego', array($this, 'timeToDecimal'));



			// $crud->display_as('nombre', 'Nombre')
			// ->display_as('ha', 'Hectáreas');

			// $crud->columns('nombre', 'ha');


			$output = $crud->render();

			$data['listadoFincas'] = $this->fincas_model->getFincasCombobox();

			$output->data = $data;


			$this->load->view('Crud/date-range_filter', (array) $output);

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

	public function formatoHora($valor, $fila)
	{
		// Formatear la cadena de texto a un formato de hora
		$hora_formateada = date('H:i', strtotime($valor));

		return $hora_formateada;
	}

	public function timeToDecimal($valor, $fila)
	{
		// Convertir el tiempo en formato "1:30" a decimal "1.5"
		$partes_tiempo = explode(':', $valor);

		if (count($partes_tiempo) == 2) {
			$horas = (int) $partes_tiempo[0];
			$minutos = (int) $partes_tiempo[1];

			$decimal = $horas + ($minutos / 60);

			return number_format($decimal, 2); // Formatear a dos decimales
		}

		return $valor; // Devolver el valor original si el formato no es válido
	}



}