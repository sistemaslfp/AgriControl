<?php if (!defined('BASEPATH'))
    exit('No direct script access allowed');

/**
 * @property Payment_model $Payment_model
 * @property PersonnelStatus_model $PersonnelStatus_model
 * @property security $security
 * @property edit $edit
 **/
class Payment extends Public_Controller
{

    public function __construct()
    {
        parent::__construct();

        $this->load->database();

        $this->load->model('Payment_model');
        $this->load->helper('url');
        $this->load->helper('payment_reports');

        //$this->load->library('ion_auth');
        $this->load->library('grocery_CRUD');
        $this->load->model('fincas_model');

        acceso_exigir('edita');

        $this->_init();
    }

    private function _init() {}

    /**
     * ; function to load payment and personnel status data and render the payment filter view.
     *
     * This function loads the necessary models to retrieve data related to payment weeks, farms, 
     * and personnel statuses. It then passes this data to the payment filter view for rendering.
     *
     * @return void
     */
    public function index()
    {
        $this->load->model('Payment_model');
        $this->load->model('PersonnelStatus_model');
        // $data['weeks'] = $this->Payment_model->get_weeks();
        $data['farms'] = $this->Payment_model->get_farms();
        $data['statuses'] = $this->PersonnelStatus_model->getAllStatuses();

        $this->load->view('pages/operational/pm/payment/payment_filter', $data);
    }

    /**
     * GetWeeksByFarmYear function to retrieve available weeks for a specific farm and year.
     *
     * This function loads the Payment_model to access the data. It processes the input request 
     * to extract the farm ID and year, retrieves the available weeks for the specified farm and year, 
     * and returns the data in JSON format.
     *
     * @return void
     */
    public function getWeeksByFarmYear()
    {
        // Cargar el modelo
        $this->load->model('Payment_model');

        // Obtener los datos de la solicitud
        $input = json_decode(trim(file_get_contents('php://input')), true);
        $farm_id = $input['farm_id'];
        $year = $input['year'];

        // Obtener las semanas disponibles
        $weeks = $this->Payment_model->getAvailableWeeks($farm_id, $year);


        // Retornar las semanas en formato JSON
        echo json_encode($weeks);
        exit;
        // echo '<pre>';
        // print_r($weeks); // Mostrar lo que está devolviendo la consulta
        // echo '</pre>';
    }

    /**
     * GetYearsByFarm function to retrieve available years for a specific farm.
     *
     * This function loads the Payment_model to access the data. It processes the input request 
     * to extract the farm ID, retrieves the available years for the specified farm, 
     * and returns the data in JSON format.
     *
     * @return void
     */
    public function getYearsByFarm()
    {
        // Cargar el modelo
        $this->load->model('Payment_model');

        // Obtener los datos de la solicitud
        $input = json_decode(trim(file_get_contents('php://input')), true);
        $farm_id = $input['farm_id'];

        $years = $this->Payment_model->getAvailableYears($farm_id);


        // Retornar las semanas en formato JSON
        echo json_encode($years);
        exit;
        // echo '<pre>';
        // print_r($weeks); // Mostrar lo que está devolviendo la consulta
        // echo '</pre>';
    }

    /**
     * GetFilteredPmRecords function to retrieve filtered payment records based on farm, year, week, and status.
     *
     * This function processes GET request parameters to extract the farm, year, week, and status. 
     * It then retrieves the filtered payment records from the Payment_model and the farm name based on the farm ID.
     * The retrieved data is passed to the payment filter view for rendering.
     *
     * @return void
     */
    public function getFilteredPmRecords()
    {
        $farm = $this->input->get('farm');
        $year = $this->input->get('year');
        $week = $this->input->get('week');
        $status = $this->input->get('status');

        $data['payments'] = $this->Payment_model->getFilteredPmRecords($farm, $year, $week, $status);
        $farm_name = $this->Payment_model->get_farm_by_id($farm);
        $data['selected_week'] = $week;
        $data['selected_farm'] = $farm_name;
        $data['selected_year'] = $year;
        $this->load->view('pages/Operational/pm/payment/payment_filter', $data);
    }

    /**
     * Creates new payment adjustments and saves them to the database.
     * 
     * This method processes an array of payments submitted via a POST request,
     * validating that each payment contains a required 'pm_id' and a non-zero 
     * 'bonus_discount'. Only payments with a non-zero 'bonus_discount' are saved.
     * 
     * All database operations are wrapped in a transaction to ensure atomicity, 
     * meaning that either all records are saved successfully, or none are in 
     * case of an error. If an error occurs, the transaction is rolled back 
     * and an appropriate error message is displayed.
     * 
     * @throws Exception If 'pm_id' is missing or if any database error occurs.
     * @return void Redirects to 'payment/show_pivoted_data' upon success or displays an error message.
     */
    public function createNewAdjustment()
    {
        $this->load->model('Payment_model');
        $payments = $this->input->post('payments'); // Array de pagos enviados desde la vista

        // Verificar si se recibieron pagos
        if (empty($payments) || !is_array($payments)) {
            show_error('No se recibieron datos de pago válidos.', 400);
            return;
        }

        // Iniciar la transacción para agrupar todos los pagos
        $this->db->trans_start();

        $currentRecord = null; // Variable para rastrear el pago actual en caso de error
        $farmId = "";
        $selectedWeek = 0;
        $selectedYear = 0;

        try {
            foreach ($payments as $payment) {
                // Validar que pm_id esté presente y que bonus_discount no sea cero
                if (!isset($payment['pm_id'])) {
                    throw new Exception('Falta el campo "pm_id" en uno de los pagos.');
                }

                if (!isset($payment['bonus_discount']) || $payment['bonus_discount'] == 0) {
                    continue; // No insertar si bonus_discount es cero
                }

                // Asignar farmId y selectedWeek solo una vez, ya que se asume que son iguales para todos los registros
                $farmId = $payment['farm_id'] ?? $farmId;
                $selectedWeek = $payment['pm_week'] ?? $selectedWeek;
                $selectedYear = $payment['pm_year'] ?? $selectedYear;
                $currentRecord = $payment; // Guardar el registro actual para el caso de excepción

                // Guardar el pago utilizando el modelo
                $this->Payment_model->save_payment($payment);
            }

            // Completar la transacción
            $this->db->trans_complete();

            // Verificar si la transacción fue exitosa
            if ($this->db->trans_status() === FALSE) {
                throw new Exception('Error en la transacción de base de datos.');
            }

            // Redirigir a la vista con los datos pivotados
            redirect('Operational/PM/payment/show_pivoted_data?selected_week=' . $selectedWeek . '&farmId=' . $farmId . '&selectedYear=' . $selectedYear);
            exit;
        } catch (Exception $e) {
            // Rollback de la transacción en caso de error
            $this->db->trans_rollback();

            // Registrar el error y los datos del registro problemático
            log_message('error', 'Error en la transacción: ' . $e->getMessage() . ' Datos del pago: ' . print_r($currentRecord, true));

            // Mostrar un mensaje de error adecuado al usuario
            show_error('Ha ocurrido un error en la transacción: ' . $e->getMessage(), 500);
        }
    }



    public function show_pivoted_data()
    {
        //TODO: filtrar también por finca

        // Cargar el modelo
        $this->load->model('Payment_model');

        // Verificar si el usuario ha seleccionado una semana a través de GET
        $selected_week = $this->input->get('selected_week');
        $farmId = $this->input->get('farmId');

        // Obtener las semanas únicas para el select
        $data['weeks'] = $this->Payment_model->get_unique_weeks();
        $data['resume_data'] = $this->Payment_model->get_resume_data($selected_week, $farmId);
        $data['selected_week'] = $selected_week;

        if ($selected_week) {
            // Obtener los datos pivotados para la semana seleccionada
            $data['pivoted_data'] = $this->Payment_model->pivot_data($selected_week, $farmId);
        }

        // Cargar la vista con los datos
        $this->load->view('pages/operational/pm/payment/pivot_resume.php', $data);
    }

    public function edit_pivoted_data()
    {
        // Cargar el modelo
        $this->load->model('Payment_model');

        // Verificar si el usuario ha seleccionado una semana a través de GET
        $selected_week = $this->input->get('selected_week');
        $farmId = $this->input->get('farmId');

        // Obtener las semanas únicas para el select
        // $data['weeks'] = $this->Payment_model->get_unique_weeks();
        $data['resume_data'] = $this->Payment_model->get_resume_data_edit($selected_week, $farmId);
        $data['selected_week'] = $selected_week;

        if ($selected_week) {
            // Obtener los datos pivotados para la semana seleccionada
            $data['pivoted_data'] = $this->Payment_model->pivot_data($selected_week, $farmId);
        }

        // Cargar la vista con los datos
        $this->load->view('payments/payment2edit_view', $data);
    }

    /**
     * Guarda las deducciones de los trabajadores en la base de datos.
     *
     * Recibe las deducciones del formulario y las guarda en la base de datos.
     * Luego redirige a la vista de inicio.
     *
     * @return void
     */
    public function save_deductions()
    {
        $this->load->model('Payment_model');
        $deductions = $this->input->post('deductions', TRUE);
        $selectedWeek = $this->input->get('selected_week', TRUE);

        foreach ($deductions as $deduction) {
            $data[] = [
                'operator_id' => $deduction['operator_id'],
                'farm_id' => $deduction['farm_id'],
                'deduction' => floatval($deduction['deduction']),
                'observation' => $this->security->xss_clean($deduction['observation']),
                'created_at' => date('Y-m-d H:i:s'),
                'payment_week' => $deduction['selected_week']
            ];

            // Inserta los datos en la tabla correspondiente
        }
        $this->Payment_model->save_deductions($data);
        // Redireccionar después de guardar
        redirect('Operational/PM/payment/list_adjusments');
    }

    public function update_deductions()
    {
        $this->load->model('Payment_model');
        $deductions = $this->input->post('deductions', TRUE); // XSS Clean
        foreach ($deductions as $deduction) {
            $data[] = [
                'operator_id' => $deduction['operator_id'],
                'farm_id' => $deduction['farm_id'],
                'deduction' => floatval($deduction['deduction']),
                'observation' => $this->security->xss_clean($deduction['observation']),
                'created_at' => date('Y-m-d H:i:s'),
                'payment_week' => $deduction['selected_week'],
                'id' => $deduction['id']
            ];
        }
        // var_dump($data);
        // exit;
        // Inserta los datos en la tabla correspondiente
        $this->Payment_model->update_deductions($data);
        redirect('Operational/PM/payment/list_adjusments');
    }



    public function update_deduction($id)
    {
        // Validar los datos
        $this->form_validation->set_rules('deduction', 'Deduction', 'required|numeric');
        $this->form_validation->set_rules('observation', 'Observation', 'trim');

        if ($this->form_validation->run() === FALSE) {
            // Si la validación falla, recargar la vista de edición
            // $this->edit($id);
        } else {
            // Obtener los datos del formulario
            $data = [
                'deduction' => $this->input->post('deduction'),
                'observation' => $this->input->post('observation')
            ];

            // Actualizar el registro en la base de datos
            $this->load->model('Payment_model');
            $this->Payment_model->update_deductions($data);

            // Redireccionar a la pantalla de listado o mostrar un mensaje de éxito
            redirect('Operational/PM/payment/success');
        }
    }







    /**
     * Muestra la vista de listado de pagos
     *
     * @return void
     */
    public function list_adjusments()
    {
        $crud = new grocery_CRUD();

        $currentTable = 'vw_pm_temporaryworkers_weeks';

        $crud->set_theme('tablestrap4');
        // $crud->set_model('pm_model');
        $crud->set_table($currentTable);
        $crud->set_primary_key('payment_week');
        $crud->set_subject('PM');
        // $crud->unset_jquery();

        $crud->unset_add();
        $crud->unset_edit();
        $crud->unset_delete();
        $crud->unset_read();

        $crud->set_relation('operator_id_finca', 'z_finca', 'nombre');

        // $crud->add_action('Edit Report', '', 'admin/book', 'fa-book', array($this, 'editButton'));
        $crud->add_action('Edit Report', '', 'admin/book', 'fa-book', 'editButton');

        $output = $crud->render();

        $data['listadoFincas'] = '';

        $output->data = $data;

        $this->load->view('Crud/default', (array) $output);
    }



    /**
     * Muestra la vista de edición de pagos
     *
     * Recibe dos parámetros GET:
     * - farm: Identificador de la finca
     * - week: Número de semana
     *
     * Carga el modelo Payment_model y utiliza su método get_records_by_week
     * para obtener los datos de la vista vw_pm_temporaryworkers_reports,
     * luego pasa los datos a la vista edit_view
     *
     * @return void
     */
    public function edit_adjusments()
    {

        // Cargar el modelo que accede a la vista
        $this->load->model('Payment_model');

        $farm = $this->input->get('farm', TRUE);
        $week = $this->input->get('week', TRUE);

        // Obtener los datos de la vista vw_pm_temporaryworkers_reports
        $data['records'] = $this->Payment_model->get_records_by_week($week, $farm);
        $data['farmId'] = $farm;
        $data['selected_week'] = $week;

        // Cargar la vista de edición
        $this->load->view('payments/edit_view', $data);
    }

    /**
     * Actualiza los registros de pagos enviados desde la vista de edición
     *
     * Recibe los registros de pagos actualizados en el POST, y los
     * actualiza en la base de datos mediante el método update_payment_record
     * del modelo Payment_model. Luego redirige de vuelta a la vista de
     * edición pasando los parámetros selected_farm y selected_week como
     * parámetros GET.
     *
     * @return void
     */
    public function update_adjusments()
    {
        // Obtener datos del POST
        $updated_data = $this->input->post('records');

        // Cargar el modelo
        $this->load->model('Payment_model');

        $farmId = $this->input->get('selected_farm', TRUE);
        $selected_week = $this->input->get('selected_week', TRUE);

        // Actualizar cada registro
        foreach ($updated_data as $record) {
            $this->Payment_model->update_payment_record($record['pm_id'], $record['bonus_discount'], $record['observations']);
        }

        // Redirigir de vuelta a la vista de edición
        redirect('Operational/PM/payment/edit_pivoted_data?farmId=' . $farmId . '&selected_week=' . $selected_week);
    }
}
