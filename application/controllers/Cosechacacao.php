<?php if (!defined('BASEPATH'))
	exit('No direct script access allowed');

class Cosechacacao extends Public_controller
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

			// Cosecha en V4 es el cierre de una tarea AM con sus sacos en una tabla hija:
			// la pantalla es de solo lectura y el detalle de sacos va en su propia vista.
			$crud->set_theme('tablestrap4_datefilter');
			$crud->set_table('vw_lfp_cosecha');
			$crud->set_primary_key('id');
			$crud->set_subject('Cosecha de Cacao');
			$crud->unset_jquery();
			$crud->unset_clone();
			$crud->unset_add();
			$crud->unset_edit();
			$crud->unset_delete();
			$crud->unset_read();

			$crud->columns(
				'nombre1',
				'finca',
				'lote',
				'modulo',
				'fecha',
				'hora_cierre',
				'tarea',
				'nombre_subtarea',
				'nombre',
				'total_peso',
				'total_sacos',
				'peso_promedio_saco',
				'observaciones'
			);

			$crud->display_as('nombre1', 'Supervisor')
				->display_as('finca', 'Finca')
				->display_as('lote', 'Lote')
				->display_as('modulo', 'Módulo')
				->display_as('fecha', 'Fecha')
				->display_as('hora_cierre', 'Hora')
				->display_as('tarea', 'Tarea')
				->display_as('nombre_subtarea', 'Subtarea')
				->display_as('nombre', 'Trabajador')
				->display_as('total_peso', 'Total')
				->display_as('total_sacos', 'Sacos')
				->display_as('peso_promedio_saco', 'Promedio saco')
				->display_as('observaciones', 'Observaciones');

			$crud->add_action('Sacos', '', '', 'list', array($this, '_sacosButton'));
			$crud->callback_column('fecha', array($this, '_soloFecha'));

			$state = $crud->getState();

			if ($state == 'export' || $state == 'print') {

				if ($this->uri->segment(4) === "fechaDesde") {
					$crud->where('fecha >=', $this->_fechaSql($this->uri->segment(5)));
				}

				if ($this->uri->segment(6) === "fechaHasta") {
					$crud->where('fecha <', $this->_diaSiguiente($this->uri->segment(7)));
				}

				if ($this->uri->segment(8) === "id_finca") {
					$crud->where('finca_id', (int) $this->uri->segment(9));
				}

			} else {
				$dateFrom = $this->input->get('fechaDesde');
				$dateTo = $this->input->get('fechaHasta');

				$crud->where('fecha >=', isset($dateFrom) ? $this->_fechaSql($dateFrom) : date('Y-m-d'));
				$crud->where('fecha <', isset($dateTo) ? $this->_diaSiguiente($dateTo) : $this->_diaSiguiente(date('Y-m-d')));

				$filtro_finca_pm = $this->input->get('id_finca');
				if (isset($filtro_finca_pm) && $filtro_finca_pm > 0) {
					$crud->where('finca_id', (int) $filtro_finca_pm);
				}
			}

			acceso_crud($crud, 'vw_lfp_cosecha', '{t}.finca_id = {f}');

			$output = $crud->render();

			$data['listadoFincas'] = $this->fincas_model->getFincasCombobox();

			$output->data = $data;

			$this->load->view('Crud/date-range_filter', (array) $output);

		} catch (Exception $e) {
			show_error($e->getMessage() . ' --- ' . $e->getTraceAsString());
		}
	}

	public function sacos()
	{
		try {
			$crud = new grocery_CRUD();

			$crud->set_theme('tablestrap4');
			$crud->set_table('vw_lfp_cosecha_saco');
			$crud->set_primary_key('id');
			$crud->set_subject('Sacos');
			$crud->unset_add();
			$crud->unset_edit();
			$crud->unset_delete();
			$crud->unset_read();
			$crud->unset_clone();

			$crud->columns('fecha', 'finca', 'lote', 'nombre_subtarea', 'nombre', 'numero', 'libras');
			$crud->display_as('fecha', 'Fecha')
				->display_as('finca', 'Finca')
				->display_as('lote', 'Lote')
				->display_as('nombre_subtarea', 'Subtarea')
				->display_as('nombre', 'Trabajador')
				->display_as('numero', 'Saco')
				->display_as('libras', 'Libras');

			$crud->callback_column('fecha', array($this, '_soloFecha'));
			$crud->where('cosecha_id', (int) $this->input->get('cosecha_id'));
			acceso_crud($crud, 'vw_lfp_cosecha_saco', '{t}.lfp_am_id IN (SELECT id FROM lfp_am WHERE finca_id = {f})');
			$crud->order_by('numero', 'asc');

			$output = $crud->render();

			$this->load->view('Crud/default', (array) $output);

		} catch (Exception $e) {
			show_error($e->getMessage() . ' --- ' . $e->getTraceAsString());
		}
	}

	public function _sacosButton($primary_key, $row)
	{
		return site_url('Cosechacacao/sacos') . '?cosecha_id=' . $row->id;
	}

	public function resumen()
	{
		try {

			/* #region CRUD basic configuration */
			$crud = new grocery_CRUD();

			$currentTable = 'vw_lfp_cosecha_resumen';

			$crud->set_theme('tablestrap4_datefilter');
			$crud->set_table($currentTable);
			$crud->set_primary_key('id');
			$crud->set_subject('Cosecha de Cacao');
			// $crud->unset_read();
			$crud->unset_jquery();
			$crud->unset_clone();
			$crud->unset_edit();
			$crud->unset_delete();


			$crud->columns(
				'fecha',
				'supervisor',
				'finca',
				'lote',
				'modulos',
				'tarea',
				'subtarea',
				'jornales',
				'total_peso',
				'total_sacos'
			);

			$crud->set_relation('supervisor', 'z_personal', 'nombre');
			$crud->set_relation('tarea', 'z_tarea', 'nombre');
			$crud->set_relation('subtarea', 'z_subtarea', 'nombre_subtarea');
			$crud->set_relation('finca', 'z_finca', 'nombre');
			// // $crud->set_relation('trabajador', 'z_personal', 'nombre');

			$crud->set_relation('lote', 'z_lote', 'lote');
			// $crud->set_relation('modulo', 'z_modulo', 'modulo');


			// $crud->display_as('nombre', 'Nombre')
			// ->display_as('ha', 'Hectáreas');

			// $crud->columns('nombre', 'ha');

			/* #endregion */

			/* #region Permissions Control */
			$group = $this->ion_auth->get_users_groups()->row()->id;

			if ($group != 1) {
				$crud->unset_delete();
			}

			if ($group != 1 && $group != 2) {
				// redirect('/', 'refresh');

				$crud->unset_add();
				$crud->unset_edit();
				$crud->unset_delete();
			}
			/* #endregion */

			/* #region date filter*/
			$dateFrom = $this->input->get('fechaDesde');
			$dateTo = $this->input->get('fechaHasta');

			isset($dateFrom) ? $dateFrom = date("Y-m-d", strtotime($dateFrom)) : $dateFrom = date("Y-m-d");
			isset($dateFrom) ? $dateTo = date("Y-m-d", strtotime($dateTo)) : $dateTo = date("Y-m-d");

			$dateFrom = strval($dateFrom);
			$dateTo = strval($dateTo);

			/* #endregion */

			/* #region Print & Export filter */
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

				if ($this->uri->segment(8) === "finca") {
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
			/* #endregion */

			// $crud->callback_column('jornales', array($this, '_sumWageColumn_callback'));

			acceso_crud($crud, $currentTable, '{t}.finca = {f}');

			$output = $crud->render();

			$data['listadoFincas'] = $this->fincas_model->getFincasCombobox();

			$output->data = $data;

			$this->load->view('Crud/date-range_filter', (array) $output);

		} catch (Exception $e) {
			show_error($e->getMessage() . ' --- ' . $e->getTraceAsString());
		}
	}

	public function _soloFecha($value, $row)
	{
		return substr((string) $value, 0, 10);
	}

	private function _fechaSql($valor)
	{
		return date('Y-m-d', strtotime((string) $valor));
	}

	private function _diaSiguiente($valor)
	{
		return date('Y-m-d', strtotime((string) $valor . ' +1 day'));
	}

}