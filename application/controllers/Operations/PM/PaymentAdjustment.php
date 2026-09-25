<?php if (!defined('BASEPATH'))
    exit('No direct script access allowed');

/**
 * @property Payment_model $Payment_model
 * @property PersonnelStatus_model $PersonnelStatus_model
 * @property security $security
 * @property edit $edit
 **/
class PaymentAdjustment extends Public_Controller
{
    public function __construct()
    {
        parent::__construct();

        $this->load->database();

        $this->load->model('Payment_model');
        $this->load->helper('url');
        // $this->load->helper('payment_reports');

        $this->load->library('grocery_CRUD');
        $this->load->model('fincas_model');

        acceso_exigir('edita');

        $this->_init();
    }

    private function _init() {}


    /* #region Creación de Ajustes de Pago */
    public function index()
    {
        $this->load->model('PersonnelStatus_model');
        // $data['weeks'] = $this->Payment_model->get_weeks();
        $data['farms'] = $this->Payment_model->getFarms();
        $data['statuses'] = $this->PersonnelStatus_model->getAllStatuses();

        $this->load->view('pages/operations/pm/payment_adjustment/form_filter', $data);
    }

    public function addBonusDiscount()
    {
        $farm = $this->input->get('farm');
        $year = $this->input->get('year');
        $week = $this->input->get('week');
        $status = $this->input->get('status');

        $statusName = $this->Payment_model->getStatusNameById($status);

        // Verificar si ya existe un registro en historial
        if ($this->Payment_model->recordPaymentHistoryExists($year, $week, $farm, $status)) {
            // Si existe, redirigir a listado
            $this->session->set_flashdata('message', 'Ya existe un ajuste de pago para el año / semana / finca / estado seleccionados.');
            redirect('Operations/PM/PaymentAdjustment/listAdjustments');
        } else {
            // Si no existe, continuar normalmente
            $data['payments'] = $this->Payment_model->getFilteredPmRecords($farm, $year, $week, $status);
            $farm_name = $this->Payment_model->get_farm_by_id($farm);
            $data['selected_week'] = $week;
            $data['selected_farm'] = $farm;
            $data['selected_farm_name'] = $farm_name;
            $data['selected_year'] = $year;
            $data['selected_status'] = $status;
            $data['status_name'] = $statusName;

            $this->load->view('pages/operations/pm/payment_adjustment/add_bonus_discount', $data);
        }
    }

    public function saveBonusDiscount()
    {
        $this->load->model('Payment_model');
        $payments = $this->input->post('payments'); // Array de pagos enviados desde la vista

        $currentRecord = null; // Variable para rastrear el pago actual en caso de error
        $farmId = $this->input->post('farm_id_post');
        $selectedWeek = $this->input->post('selected_week_post');
        $selectedYear = $this->input->post('selected_year_post');
        $statusId = $this->input->post('status_id_post');

        // Verificar si se recibieron pagos
        if (empty($payments) || !is_array($payments)) {
            alerta_flash('error', 'No se recibieron datos de pago validos.');
            redirect('Operations/PM/PaymentAdjustment');
            return;
        }

        // Iniciar la transacción para agrupar todos los pagos
        $this->db->trans_start();

        // var_dump($farmId, $selectedWeek, $selectedYear, $statusId, $payments);
        // exit;

        try {
            foreach ($payments as $payment) {
                // Validar que pm_id esté presente y que bonus_discount no sea cero
                if (!isset($payment['pm_id'])) {
                    throw new Exception('Falta el campo "pm_id" en uno de los pagos.');
                }

                if (acceso_finca() !== null) {
                    $payment['farm_id'] = acceso_finca();
                }

                // Asignar farmId y selectedWeek solo una vez, ya que se asume que son iguales para todos los registros
                $farmId = $payment['farm_id'] ?? $farmId;
                $selectedWeek = $payment['pm_week'] ?? $selectedWeek;
                $selectedYear = $payment['pm_year'] ?? $selectedYear;
                $statusId = $payment['status_id'] ?? 1;
                $currentRecord = $payment; // Guardar el registro actual para el caso de excepción

                if (!isset($payment['bonus_discount']) || $payment['bonus_discount'] == 0) {
                    continue; // No insertar si bonus_discount es cero
                }

                // Guardar el pago utilizando el modelo
                $result = $this->Payment_model->saveBonusDiscount($payment);
                if ($result['status'] === 'error') {
                    throw new Exception($result['message']);
                }
            }

            // Completar la transacción
            $this->db->trans_complete();

            // Verificar si la transacción fue exitosa
            if ($this->db->trans_status() === FALSE) {
                throw new Exception('Error en la transacción de base de datos.');
            }

            // Redirigir a la vista con los datos pivotados
            redirect('Operations/PM/PaymentAdjustment/addDeduction?selected_week=' . $selectedWeek . '&farmId=' . $farmId . '&selectedYear=' . $selectedYear . '&statusId=' . $statusId);
            exit;
        } catch (Exception $e) {
            // Rollback de la transacción en caso de error
            $this->db->trans_rollback();

            // Registrar el error y los datos del registro problemático
            log_message('error', 'Error en la transacción: ' . $e->getMessage() . ' Datos del pago: ' . print_r($currentRecord, true));
            // TODO: Redirigir correctamente
            // Mostrar un mensaje de error adecuado al usuario
            alerta_flash('error', 'No se guardaron los ajustes: ' . $e->getMessage());
            redirect('Operations/PM/PaymentAdjustment');
        }
    }

    public function addDeduction()
    {
        //TODO: filtrar también por finca

        // Cargar el modelo
        $this->load->model('Payment_model');

        // Verificar si el usuario ha seleccionado una semana a través de GET
        $selected_week = $this->input->get('selected_week');
        $selected_year = $this->input->get('selectedYear');
        $farmId = $this->input->get('farmId');
        $statusId = $this->input->get('statusId');

        $conversionRate = $this->Payment_model->get_conversion_rate(1);
        $algo = $this->Payment_model->getPaymentBonusDiscountReportByYearWeekFarm($selected_year, $selected_week, $farmId, $statusId);
        $farm_name = $this->Payment_model->get_farm_by_id($farmId);
        $statusName = $this->Payment_model->getStatusNameById($statusId);

        $unique_operators = [];
        $resume_operators = $this->Payment_model->getResumeData($selected_year, $selected_week, $farmId, $statusId);

        // Iterar sobre los datos originales
        foreach ($resume_operators as $row) {
            $operator_id = $row->operator_id;

            // Si el operador ya está en el array, sumar el total
            if (isset($unique_operators[$operator_id])) {
                $unique_operators[$operator_id]->total += $row->total;
            } else {
                // Si no existe, agregarlo
                $unique_operators[$operator_id] = clone $row;
            }
        }

        // Obtener las semanas únicas para el select
        $data['weeks'] = $this->Payment_model->get_unique_weeks();
        $data['resume_data'] = $unique_operators;
        $data['selected_week'] = $selected_week;
        $data['selected_year'] = $selected_year;
        $data['farm_id'] = $farmId;
        $data['status_id'] = $statusId;
        $data['conversionRate'] = $conversionRate;
        $data['pivotDataSource'] = $algo;
        $data['operators_resume'] = $resume_operators;
        $data['farm_name'] = $farm_name;
        $data['status_name'] = $statusName;

        if ($selected_week) {
            // Obtener los datos pivotados para la semana seleccionada
            $data['pivoted_data'] = $this->Payment_model->getDiscountedPivotedPm($selected_year, $selected_week, $farmId, $statusId);
        }

        // Cargar la vista con los datos
        $this->load->view('pages/operations/pm/payment_adjustment/add_deduction.php', $data);
    }

    public function saveDeduction()
    {
        $this->load->model('Payment_model');
        $deductions = $this->input->post('deductions', TRUE);
        $selectedWeek = $this->input->post('selected_week', TRUE);
        $selectedYear = $this->input->post('selected_year', TRUE);
        $farmId = $this->input->post('farm_id', TRUE);
        $statusId = $this->input->post('status_id', TRUE);

        $data = [];

        foreach ($deductions as $deduction) {

            // Filtra deducciones vacías o iguales a 0
            if (!empty($deduction['deduction']) && floatval($deduction['deduction']) > 0) {
                $data[] = [
                    'operator_id' => $deduction['operator_id'],
                    'farm_id' => $farmId,
                    'deduction' => floatval($deduction['deduction']),
                    'observation' => $this->security->xss_clean($deduction['observation']),
                    'pm_week' => $selectedWeek,
                    'pm_year' => $selectedYear,
                    'status_id' => $statusId
                ];
            }
        }


        $result = $this->Payment_model->saveDeductions($data);

        // Redireccionar después de guardar
        redirect('Operations/PM/PaymentAdjustment/showReport?farmId=' . $farmId . '&selectedWeek=' . $selectedWeek . '&selectedYear=' . $selectedYear . '&statusId=' . $statusId);
    }

    public function showReport()
    {
        //TODO: filtrar también por finca

        // Cargar el modelo
        $this->load->model('Payment_model');

        // Verificar si el usuario ha seleccionado una semana a través de GET
        $selected_week = $this->input->get('selectedWeek');
        $selected_year = $this->input->get('selectedYear');
        $farmId = $this->input->get('farmId');
        $statusId = $this->input->get('statusId');

        // TODO: Extraer factor desde la DB
        $conversionRate = $this->Payment_model->get_conversion_rate(1);
        $algo = $this->Payment_model->getPaymentBonusDiscountReportByYearWeekFarm($selected_year, $selected_week, $farmId, $statusId);
        $farm_name = $this->Payment_model->get_farm_by_id($farmId);
        $statusName = $this->Payment_model->getStatusNameById($statusId);

        $unique_operators = [];
        $resume_operators = $this->Payment_model->getResumeData($selected_year, $selected_week, $farmId, $statusId);

        // Iterar sobre los datos originales
        foreach ($resume_operators as $row) {
            $operator_id = $row->operator_id;

            // Si el operador ya está en el array, sumar el total
            if (isset($unique_operators[$operator_id])) {
                $unique_operators[$operator_id]->total += $row->total;
            } else {
                // Si no existe, agregarlo
                $unique_operators[$operator_id] = clone $row;
            }
        }

        // Obtener las semanas únicas para el select
        $data['conversionRate'] = $conversionRate;
        $data['weeks'] = $this->Payment_model->get_unique_weeks();
        $data['resume_data'] = $unique_operators;
        $data['selected_week'] = $selected_week;
        $data['selected_year'] = $selected_year;
        $data['conversionRate'] = $conversionRate;
        $data['pivotDataSource'] = $algo;
        $data['operators_resume'] = $resume_operators;
        $data['farm_name'] = $farm_name;
        $data['status_name'] = $statusName;

        // if ($selected_week) {
        //     // Obtener los datos pivotados para la semana seleccionada
        //     $data['pivoted_data'] = $this->Payment_model->getDiscountedPivotedPm($selected_year, $selected_week, $farmId, $statusId);
        // }

        // Cargar la vista con los datos
        $this->load->view('pages/operations/pm/payment_adjustment/show_report.php', $data);
    }

    public function listAdjustments()
    {
        $crud = new grocery_CRUD();

        $currentTable = 'vwpm_paymentadjustment_historylist';

        $crud->set_theme('tablestrap4');
        $crud->set_table($currentTable);
        $crud->set_primary_key('id');
        $crud->set_subject('PM');

        $crud->unset_add();
        $crud->unset_edit();
        $crud->unset_delete();
        $crud->unset_read();

        // Ajustar las columnas para reflejar los cambios
        $crud->columns('nombre', 'pm_year', 'pm_week', 'descripcion_estado');
        acceso_crud($crud, $currentTable, '{t}.farm_id = {f}');

        // Agregar botón de acción
        $crud->add_action('Ver Reporte', '', '', 'eye', array($this, 'viewDetailsButton'));
        $crud->add_action('Editar Reporte', '', '', 'edit', array($this, 'editButton'));

        // Obtener los datos agrupados
        $this->load->model('Payment_model'); // Asegúrate de cargar el modelo correcto
        $groupedData = $this->Payment_model->getGroupedAdjustments();

        // Pasar los datos agrupados a la vista
        $output = $crud->render();
        $output->data = $groupedData;

        $this->load->view('Crud/default', (array) $output);
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
        // if (!$this->input->is_ajax_request()) {
        //     show_error('Acceso no permitido', 403);
        //     exit;
        // }
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
        // if (!$this->input->is_ajax_request()) {
        //     show_error('Acceso no permitido', 403);
        //     exit;
        // }

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

    /* #endregion */



    /* #region Edición de ajustes de pago */
    public function editBonusDiscount()
    {
        $farm = $this->input->get('farmId');
        $year = $this->input->get('selectedYear');
        $week = $this->input->get('selectedWeek');
        $status = $this->input->get('statusId');

        $data['payments'] = $this->Payment_model->getFilteredPmRecords($farm, $year, $week, $status);
        $farm_name = $this->Payment_model->get_farm_by_id($farm);
        $statusName = $this->Payment_model->getStatusNameById($status);

        $data['selected_week'] = $week;
        $data['selected_farm'] = $farm;
        $data['selected_farm_name'] = $farm_name;
        $data['selected_year'] = $year;
        $data['selected_status'] = $status;
        $data['status_name'] = $statusName;

        $this->load->view('pages/operations/pm/payment_adjustment/edit_bonus_discount', $data);
    }

    public function updateBonusDiscount()
    {

        $this->load->model('Payment_model');
        $selected_week = $this->input->post('selected_week');
        $selected_year = $this->input->post('selected_year');
        $farmId = $this->input->post('farm_id');
        $statusId = $this->input->post('status_id');

        $payments = $this->input->post('payments');
        $this->Payment_model->updateBonusDiscountDB($payments);

        $this->session->set_flashdata('success', 'Ajustes actualizados correctamente.');
        redirect('Operations/PM/PaymentAdjustment/editDeduction' . '?farmId=' . $farmId . '&statusId=' . $statusId . '&selectedYear=' . $selected_year . '&selected_week=' . $selected_week);
    }

    public function editDeduction()
    {
        //TODO: filtrar también por finca

        // Cargar el modelo
        $this->load->model('Payment_model');

        // Verificar si el usuario ha seleccionado una semana a través de GET
        $selected_week = $this->input->get('selected_week');
        $selected_year = $this->input->get('selectedYear');
        $farmId = $this->input->get('farmId');
        $statusId = $this->input->get('statusId');

        // var_dump($selected_year, $selected_week, $farmId, $statusId);
        // return;

        $conversionRate = $this->Payment_model->get_conversion_rate(1);
        $pivotDataSource = $this->Payment_model->getPaymentBonusDiscountReportByYearWeekFarm($selected_year, $selected_week, $farmId, $statusId);
        $farm_name = $this->Payment_model->get_farm_by_id($farmId);
        $statusName = $this->Payment_model->getStatusNameById($statusId);

        $unique_operators = [];
        $resume_operators = $this->Payment_model->getResumeData($selected_year, $selected_week, $farmId, $statusId);

        // Iterar sobre los datos originales
        foreach ($resume_operators as $row) {
            $operator_id = $row->operator_id;

            // Si el operador ya está en el array, sumar el total
            if (isset($unique_operators[$operator_id])) {
                $unique_operators[$operator_id]->total += $row->total;
            } else {
                // Si no existe, agregarlo
                $unique_operators[$operator_id] = clone $row;
            }
        }

        // Obtener las semanas únicas para el select
        $data['weeks'] = $this->Payment_model->get_unique_weeks();
        $data['resume_data'] = $unique_operators;
        $data['selected_week'] = $selected_week;
        $data['selected_year'] = $selected_year;
        $data['farm_id'] = $farmId;
        $data['status_id'] = $statusId;
        $data['conversionRate'] = $conversionRate;
        $data['pivotDataSource'] = $pivotDataSource;
        $data['operators_resume'] = $resume_operators;
        $data['farm_name'] = $farm_name;
        $data['status_name'] = $statusName;

        if ($selected_week) {
            // Obtener los datos pivotados para la semana seleccionada
            $data['pivoted_data'] = $this->Payment_model->getDiscountedPivotedPm($selected_year, $selected_week, $farmId, $statusId);
        }

        // Cargar la vista con los datos
        $this->load->view('pages/operations/pm/payment_adjustment/edit_deduction.php', $data);
    }

    public function updateDeductions()
    {
        $this->load->model('Payment_model');

        $deductions = $this->input->post('deductions', TRUE);
        $selectedWeek = $this->input->post('selected_week', TRUE);
        $selectedYear = $this->input->post('selected_year', TRUE);
        $farmId = $this->input->post('farm_id', TRUE);
        $statusId = $this->input->post('status_id', TRUE);



        $data = [];

        foreach ($deductions as $deduction) {

            // Filtra deducciones vacías o iguales a 0
            if (is_numeric($deduction['deduction'])) {
                $data[] = [
                    'operator_id' => $deduction['operator_id'],
                    'farm_id' => $farmId,
                    'deduction' => floatval($deduction['deduction']),
                    'observation' => $this->security->xss_clean($deduction['observation']),
                    'pm_week' => $selectedWeek,
                    'pm_year' => $selectedYear,
                    'status_id' => $statusId
                ];
            }
        }

        $result = $this->Payment_model->updateDeductions($data);

        // Redireccionar después de guardar
        redirect('Operations/PM/PaymentAdjustment/showReport?farmId=' . $farmId . '&selectedWeek=' . $selectedWeek . '&selectedYear=' . $selectedYear . '&statusId=' . $statusId);
    }

    /* #endregion */


    public function rateConversion()
    {
        $crud = new grocery_CRUD();

        acceso_exigir('admin_global');
        $crud->set_table('tbl_pm_payment_conversionrate');
        $crud->set_subject('Conversion Rate');
        $crud->set_theme('tablestrap4');

        // Mostrar solo las columnas conversion_name y conversion_rate
        $crud->columns('conversion_name', 'conversion_rate');
        $crud->fields('conversion_name', 'conversion_rate');

        // Hacer que las columnas sean obligatorias
        $crud->required_fields('conversion_name', 'conversion_rate');

        // Deshabilitar la opción de agregar y eliminar
        $crud->unset_add();
        $crud->unset_delete();

        // Actualizar la columna updated_at cada vez que se guarde un cambio
        $crud->callback_before_update(array($this, 'update_timestamp'));

        $output = $crud->render();

        $this->load->view('Crud/default', (array) $output);
    }


    /* #region Grocery CRUD Callbacks */
    public function viewDetailsButton($primary_key, $row)
    {
        return site_url('Operations/PM/PaymentAdjustment/showReport?farmId=' .  $row->farm_id . '&selectedWeek=' . $row->pm_week . '&selectedYear=' . $row->pm_year . '&statusId=' . $row->status_id);
    }

    public function editButton($primary_key, $row)
    {
        return site_url('Operations/PM/PaymentAdjustment/editBonusDiscount?farmId=' .  $row->farm_id . '&selectedWeek=' . $row->pm_week . '&selectedYear=' . $row->pm_year . '&statusId=' . $row->status_id);
    }

    private function update_timestamp($post_array, $primary_key)
    {
        $post_array['updated_at'] = date('Y-m-d');
        return $post_array;
    }
    /* #endregion */
}
