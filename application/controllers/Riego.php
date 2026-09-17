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
			$crud->set_table('lfp_riego');
			$crud->set_subject('Riego');
			$crud->unset_jquery();
			$crud->unset_clone();
			$crud->unset_delete();

			$crud->columns('fecha_proceso', 'finca_id', 'lote_id', 'modulo_id', 'supervisor_id', 'tiempo_riego_min', 'volumen_riego', 'observaciones');
			$crud->fields('fecha_proceso', 'finca_id', 'supervisor_id', 'lote_id', 'modulo_id', 'tiempo_riego_min', 'volumen_riego', 'observaciones',
				'guid', 'origen', 'received_at_server');
			$crud->required_fields('finca_id', 'supervisor_id', 'lote_id', 'tiempo_riego_min');

			foreach (array('guid', 'origen', 'received_at_server') as $campo) {
				$crud->field_type($campo, 'invisible');
			}

			$crud->display_as('fecha_proceso', 'Fecha')
				->display_as('finca_id', 'Finca')
				->display_as('lote_id', 'Lote')
				->display_as('modulo_id', 'Módulo')
				->display_as('supervisor_id', 'Supervisor')
				->display_as('tiempo_riego_min', 'Tiempo riego (h)')
				->display_as('volumen_riego', 'Volumen riego')
				->display_as('observaciones', 'Observaciones');

			$group = $this->ion_auth->get_users_groups()->row()->id;

			if ($group != 1 && $group != 2) {
				$crud->unset_edit();
			}

			$state = $crud->getState();

			if ($state == 'export' || $state == 'print') {

				if ($this->uri->segment(4) === "fechaDesde") {
					$crud->where('fecha_proceso >=', $this->_fechaSql($this->uri->segment(5)));
				}

				if ($this->uri->segment(6) === "fechaHasta") {
					$crud->where('fecha_proceso <', $this->_diaSiguiente($this->uri->segment(7)));
				}

				if ($this->uri->segment(8) === "id_finca") {
					$crud->where('lfp_riego.finca_id', (int) $this->uri->segment(9));
				}

			} else {
				// Sin fechas (el enlace del menu) se filtraba desde 1970: traia todo el historico.
				$desde = $this->input->get('fechaDesde') ? $this->input->get('fechaDesde') : date('Y-m-d');
				$hasta = $this->input->get('fechaHasta') ? $this->input->get('fechaHasta') : date('Y-m-d');
				$crud->where('fecha_proceso >=', $this->_fechaSql($desde));
				$crud->where('fecha_proceso <', $this->_diaSiguiente($hasta));

				$filtro_finca_pm = $this->input->get('id_finca');
				if (isset($filtro_finca_pm) && $filtro_finca_pm > 0) {
					$crud->where('lfp_riego.finca_id', (int) $filtro_finca_pm);
				}
			}

			$crud->set_relation('supervisor_id', 'z_personal', 'nombre');
			$crud->set_relation('finca_id', 'z_finca', 'nombre');
			$crud->set_relation('modulo_id', 'z_modulo', 'modulo');
			$crud->set_relation('lote_id', 'z_lote', 'lote');

			$crud->callback_column('tiempo_riego_min', array($this, 'minutosADecimal'));
			$crud->callback_add_field('fecha_proceso', array($this, '_campoFecha'));
			$crud->callback_edit_field('fecha_proceso', array($this, '_campoFecha'));
			$crud->callback_add_field('tiempo_riego_min', array($this, '_campoTiempo'));
			$crud->callback_edit_field('tiempo_riego_min', array($this, '_campoTiempo'));
			$crud->callback_before_insert(array($this, 'riegoAntesDeInsertar'));
			$crud->callback_before_update(array($this, 'riegoAntesDeActualizar'));

			$output = $crud->render();

			$data['listadoFincas'] = $this->fincas_model->getFincasCombobox();

			$output->data = $data;

			$this->load->view('Crud/date-range_filter', (array) $output);

		} catch (Exception $e) {
			show_error($e->getMessage() . ' --- ' . $e->getTraceAsString());
		}

	}

	public function minutosADecimal($valor, $fila)
	{
		return $valor === null || $valor === '' ? '' : number_format($valor / 60, 2);
	}

	public function _campoFecha($value, $primary_key = null)
	{
		$valor = $value ? date('Y-m-d\TH:i', strtotime($value)) : '';
		return '<input type="datetime-local" name="fecha_proceso" value="' . $valor . '" required />';
	}

	// El tiempo se captura como HH:MM, igual que en v3, y se guarda en minutos.
	public function _campoTiempo($value, $primary_key = null)
	{
		$valor = ($value === null || $value === '') ? '' : sprintf('%02d:%02d', intdiv((int) $value, 60), (int) $value % 60);
		return '<input type="time" name="tiempo_riego_min" value="' . $valor . '" required />';
	}

	public function riegoAntesDeInsertar($post_array)
	{
		$post_array = $this->_riegoNormalizar($post_array);

		if ($post_array === false) {
			return false;
		}

		$post_array['guid'] = $this->_uuid();
		$post_array['origen'] = 'web';
		$post_array['received_at_server'] = date('Y-m-d H:i:s');

		return $post_array;
	}

	public function riegoAntesDeActualizar($post_array, $primary_key)
	{
		return $this->_riegoNormalizar($post_array);
	}

	private function _riegoNormalizar($post_array)
	{
		$fecha = strtotime(str_replace('T', ' ', (string) $post_array['fecha_proceso']));

		if (!preg_match('/^(\d{1,2}):(\d{2})$/', (string) $post_array['tiempo_riego_min'], $t) || $fecha === false) {
			return false;
		}

		$lote = $this->db->where('id', (int) $post_array['lote_id'])
			->where('finca_id', (int) $post_array['finca_id'])
			->count_all_results('z_lote');

		if ($lote == 0) {
			return false;
		}

		if (!empty($post_array['modulo_id'])) {
			$modulo = $this->db->where('id', (int) $post_array['modulo_id'])
				->where('lote_id', (int) $post_array['lote_id'])
				->count_all_results('z_modulo');

			if ($modulo == 0) {
				return false;
			}
		}

		$post_array['fecha_proceso'] = date('Y-m-d H:i:s', $fecha);
		$post_array['tiempo_riego_min'] = (int) $t[1] * 60 + (int) $t[2];
		$post_array['volumen_riego'] = ($post_array['volumen_riego'] === '' || $post_array['volumen_riego'] === null) ? 0 : $post_array['volumen_riego'];

		return $post_array;
	}

	private function _uuid()
	{
		$b = random_bytes(16);
		$b[6] = chr(ord($b[6]) & 0x0f | 0x40);
		$b[8] = chr(ord($b[8]) & 0x3f | 0x80);

		return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
	}

	private function _fechaSql($valor)
	{
		return date('Y-m-d', strtotime((string) $valor));
	}

	private function _diaSiguiente($valor)
	{
		return date('Y-m-d', strtotime((string) $valor . ' +1 day'));
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