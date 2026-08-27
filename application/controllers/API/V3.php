<?php
defined('BASEPATH') or exit('No direct script access allowed');

use chriskacerguis\RestServer\RestController;

class V3 extends RestController
{

    function __construct()
    {
        // Construct the parent class
        parent::__construct();
        $this->load->model('modulos_model');
        $this->load->model('fincas_model');
        $this->load->model('lotes_model');
        $this->load->model('personal_model');
        header("Access-Control-Allow-Origin: *");
        // header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
        // header("Access-Control-Allow-Headers: Content-Type");

    }

    public function personal_get()
    {
        $this->load->model('personal_model');
        $users = $this->personal_model->get_all();

        if ($users) {
            $this->response($users, 200);
        } else {
            $this->response(NULL, 404);
        }
    }

    public function close_am_get()
    {
        $this->load->model('am_model');

        $finca_id = $this->get('finca_id');
        $responsable_id = $this->get('responsable_id');
        $personal_id = $this->get('personal_id');

        $result = $this->am_model->close_am($finca_id, $responsable_id, $personal_id);

        if ($finca_id === null) {
            $this->response([
                'status' => false,
                'message' => 'No se ha especificado un parámetro.'
            ], 404);
        }


        if ($result) {
            $this->response([
                'status' => true,
                'message' => 'Actualizado con éxito.'
            ], 200);
        } else {
            $this->response(NULL, 404);
        }
    }

    public function am_valid_time_get()
    {
        $hora_maxima = "23:00:00";
        $hora_actual = date("H:i:s");

        if (time() > strtotime($hora_maxima)) {
            $this->response([
                'status' => false,
                'message' => 'Es demasiado tarde para ingresar un AM.'
            ], 404);
        } else {
            $this->response(null, 200);
        }
    }

    public function pm_valid_time_get()
    {
        $hora_maxima = "23:00:00";
        $hora_actual = date("H:i:s");

        if (time() > strtotime($hora_maxima)) {
            $this->response([
                'status' => false,
                'message' => 'Es demasiado tarde para ingresar un PM.'
            ], 404);
        } else {
            $this->response(null, 200);
        }
    }

    /* #region Sync Functions */

    /**
     * Adds an AM record to the database based on the provided data.
     *
     * @return void
     * @throws Exception if there is an error creating the AM record
     */
    public function addAm_post()
    {
        $personnel = $this->post('personnel');
        $modules = $this->post('modules');
        $timeOperation = $this->post('time');
        $timeStamp = strtotime($timeOperation);

        if ($timeStamp !== false) {
            $time = date('H:i', $timeStamp);
        }

        if ($modules) {
            $moduleNumbers = array_map(function ($module) {
                return $module['id'];
            }, $modules);

            $moduleString = implode(',', $moduleNumbers);

        }

        $this->load->model('am_model');

        try {
            if ($personnel) {
                foreach ($personnel as $person) {
                    $personnel_id = $person['id'];
                    $data = array(
                        'finca' => $this->post('farm')['id'],
                        'responsable_id' => $this->post('supervisor')['id'],
                        'fecha' => $this->post('date'),
                        'hora' => $time,
                        'cultivo_id' => $this->post('crop')['id'],
                        'lote_id' => $this->post('lot')['id'],
                        'modulos' => $moduleString,
                        'personal_id' => $personnel_id,
                        'subtarea_id' => $this->post('subtask')['id']
                    );
                    // Save to BD
                    $id = $this->am_model->create_am($data);
                }
            }

        } catch (Exception $e) {
            log_message('error', $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            $this->response(['status' => false, 'message' => 'Error al crear el registro'], 500);
        }

        if ($id) {
            $this->response(['status' => true, 'message' => 'Am creado con éxito'], 200);
        } else {
            $this->response(['status' => false, 'message' => 'Error al crear el registro'], 500);
        }
    }

    public function addPm_post()
    {

        $modules = $this->post('modules');
        $timeOperation = $this->post('time');
        $timeStamp = strtotime($timeOperation);

        $fecha = date("Y-m-d H:i:s", time());
        $fecha_registro = new DateTime();
        // $hora = date("H:i:s"); 
        $numero_registro = "PM-" . $fecha_registro->getTimestamp();

        if ($timeStamp !== false) {
            $time = date('H:i', $timeStamp);
        }

        if ($modules) {
            $moduleNumbers = array_map(function ($module) {
                return $module['id'];
            }, $modules);

            $moduleString = implode(',', $moduleNumbers);

        }

        $this->load->model('pm_model');

        try {
            $closeTimeString = $this->post('closeTime');
            $startTimeString = $this->post('time');
            $closeTimestamp = strtotime($closeTimeString);
            $startTimestamp = strtotime($startTimeString);
            $horaCierre = date('H:i', $closeTimestamp);
            $horaInicio = date('H:i', $startTimestamp);

            $date = new DateTime($this->post('date'));
            $pm_year = $date->format('Y');
            $pm_week = $date->format('W');

            $data = array(
                'pm_year' => $pm_year, 
                'pm_week' => $pm_week,
                'fecha' => $this->post('date'),
                'finca' => $this->post('farm')['id'],
                'responsable' => $this->post('supervisor')['id'],
                'trabajador' => $this->post('operator')['id'],
                'cantidad' => $this->post('completion') ?? 0,
                'comentario' => $this->post('comments'),
                'cultivo' => $this->post('crop')['id'],
                'hora_cierre' => $horaCierre,
                'hora_inicio' => $horaInicio,
                'lote' => $this->post('lot')['id'],
                'modulo' => $moduleString,
                'subtarea' => $this->post('subtask')['id'],
                'fecha_registro' => $fecha,
                'numero_registro' => $numero_registro
            );

            // Save to BD
            $id = $this->pm_model->create_pm($data);

        } catch (Exception $e) {
            log_message('error', $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            $this->response(['status' => false, 'message' => 'Error al crear el registro'], 500);
        }

        if ($id) {
            $this->response(['status' => true, 'message' => 'Pm creado con éxito'], 200);
        } else {
            $this->response(['status' => false, 'message' => 'Error al crear el registro'], 500);
        }

    }

    /* #endregion */

    public function fincas_pmpendientes_get()
    {
        $this->load->model('am_model');
        $pendientes = $this->am_model->get_fincas_pm_pendientes();
        if ($pendientes) {
            // Set the response and exit
            $this->response($pendientes, 200);
        } else {
            // Set the response and exit
            $this->response([
                'status' => false,
                'message' => 'No se encontraron registros de finca.'
            ], 404);
        }
    }

    public function supervisores_pmpendientes_get()
    {
        $this->load->model('am_model');

        $id = $this->get('finca_id');

        if ($id === null) {
            // Set the response and exit
            $this->response([
                'status' => false,
                'message' => 'No se ha indicado un id de responsable'
            ], 404);
        } else {
            $pendientes = $this->am_model->get_supervisores_pm_pendientes($id);

            if ($pendientes) {
                $this->response($pendientes, 200);
            } else {
                $this->response([
                    'status' => false,
                    'message' => 'No se encontraron operarios'
                ], 404);
            }
        }
    }

    public function operarios_pmpendientes_get()
    {

        $this->load->model('am_model');

        $supervidor_id = $this->get('supervisor_id');
        $finca_id = $this->get('finca_id');

        if ($supervidor_id === null || $finca_id === null) {
            // Set the response and exit
            $this->response([
                'status' => false,
                'message' => 'No se han indicado los parámetros requeridos'
            ], 404);
        } else {
            $pendientes = $this->am_model->get_operarios_pm_pendientes($supervidor_id, $finca_id);

            if ($pendientes) {
                $this->response($pendientes, 200);
            } else {
                $this->response([
                    'status' => false,
                    'message' => 'No se encontraron operarios'
                ], 404);
            }
        }

    }

    public function reporteam_get()
    {
        $semana = $this->get('semana');
        $anno = $this->get('anno');
        $this->load->model('reporteam_model');
        $result = $this->reporteam_model->get_am_view($anno, $semana);
        $this->response($result, 200);
    }

    public function lotes_get()
    {
        $this->load->model('lotes_model');


        $id = $this->get('finca_id');

        if ($id === null) {
            $lotes = $this->lotes_model->get_all();
            if ($lotes) {
                // Set the response and exit
                $this->response($lotes, 200);
            } else {
                // Set the response and exit
                $this->response([
                    'status' => false,
                    'message' => 'No se encontraron lotes'
                ], 404);
            }
        } else {
            $lotes = $this->lotes_model->get_by_finca($id);

            if ($lotes) {
                $this->response($lotes, 200);
            } else {
                $this->response([
                    'status' => false,
                    'message' => 'No se encontraron lotes'
                ], 404);
            }
        }
    }

    public function cultivos_get()
    {
        $this->load->model('cultivos_model');
        $cultivo = $this->cultivos_model->get_all();

        if ($cultivo) {
            $this->response($cultivo, 200);
        } else {
            $this->response(NULL, 404);
        }
    }

    public function fincas_get()
    {
        $this->load->model('fincas_model');
        $fincas = $this->fincas_model->get_all();

        if ($fincas) {
            $this->response($fincas, 200);
        } else {
            $this->response(NULL, 404);
        }
    }

    public function tareas_get()
    {
        $this->load->model('tareas_model');
        $tareas = $this->tareas_model->get_all();

        if ($tareas) {
            $this->response($tareas, 200);
        } else {
            $this->response(NULL, 404);
        }
    }

    public function subtareas_get()
    {
        $this->load->model('subtareas_model');
        $subtareas = $this->subtareas_model->get_all();

        if ($subtareas) {
            $this->response($subtareas, 200);
        } else {
            $this->response(NULL, 404);
        }
    }

    public function supervisores_get()
    {
        $this->load->model('personal_model');
        $users = $this->personal_model->get_all();

        if ($users) {
            $this->response($users, 200);
        } else {
            $this->response(NULL, 404);
        }
    }

    public function modulos_get()
    {
        $this->load->model('modulos_model');

        $lote_id = $this->get('lote_id');

        if ($lote_id === null) {
            $modulos = $this->modulos_model->get_all();
            if ($modulos) {
                // Set the response and exit
                $this->response($modulos, 200);
            } else {
                // Set the response and exit
                $this->response([
                    'status' => false,
                    'message' => 'No se indico ningun id'
                ], 404);
            }
        } else {
            $modulos = $this->modulos_model->get_by_lote($lote_id);

            if ($modulos) {
                $this->response($modulos, 200);
            } else {
                $this->response([
                    'status' => false,
                    'message' => 'No se encontraron modulos'
                ], 404);
            }
        }
    }

    public function ulabores_get()
    {
        $this->load->model('unidad_labor_model');

        $id = $this->get('id');

        if ($id === null) {
            $labores = $this->unidad_labor_model->get_all();

            if ($labores) {
                $this->response($labores, 200);
            } else {
                $this->response([
                    'status' => false,
                    'message' => 'No se encontraron labores'
                ], 404);
            }
        } else {
            $labores = $this->unidad_labor_model->get_labor($id);

            if ($labores) {
                $this->response($labores, 200);
            } else {
                $this->response([
                    'status' => false,
                    'message' => 'No se encontraron labores'
                ], 404);
            }
        }
    }

    public function riego_get()
    {

        $this->load->model('riego_model');

        $riego = $this->riego_model->get_all();

        if ($riego) {
            $this->response($riego, 200);
        } else {
            $this->response([
                'status' => false,
                'message' => 'No se encontraron registros de riego'
            ], 404);
        }

    }

    public function users_get()
    {


        // Users from a data store e.g. database
        $users = [
            ['id' => 0, 'name' => 'John', 'email' => 'john@example.com'],
            ['id' => 1, 'name' => 'Jim', 'email' => 'jim@example.com'],
        ];

        $id = $this->get('id');

        if ($id === null) {
            // Check if the users data store contains users
            if ($users) {
                // Set the response and exit
                $this->response($users, 200);
            } else {
                // Set the response and exit
                $this->response([
                    'status' => false,
                    'message' => 'No users were found'
                ], 404);
            }
        } else {
            if (array_key_exists($id, $users)) {
                $this->response($users[$id], 200);
            } else {
                $this->response([
                    'status' => false,
                    'message' => 'No such user found'
                ], 404);
            }
        }
    }


    public function index_get()
    {
        $this->response([
            'status' => true,
            'message' => "Lifprodecsa Agricontrol API v3"
        ], 200);
    }

    public function index_post()
    {
        $this->response([
            'status' => true,
            'message' => "Lifprodecsa Agricontrol API v3"
        ], 200);
    }

    public function addIrrigation_post()
    {
        $this->load->model('riego_model');


        $data = array(
            'supervisor' => json_encode($this->post('supervisor')),
            'fecha' => $this->post('operationDate'),
            'finca' => json_encode($this->post('farm')),
            'lote' => json_encode($this->post('lot')),
            'modulo' => json_encode($this->post('modules')),
            'tiempo_riego' => $this->post('operationTime'),
            'volumen_riego' => $this->post('irrigationVolume'),
            'observaciones' => $this->post('comments'),
            'created_at' => date('Y-m-d'),
        );

        $supervisor = json_decode($data['supervisor'], true);
        $data['supervisor'] = $supervisor[0]['id'] ?? 0;

        $farm = json_decode($data['finca'], true);
        $data['finca'] = $farm[0]['id'] ?? 0;

        $lot = json_decode($data['lote'], true);
        $data['lote'] = $lot[0]['id'] ?? 0;

        $module = json_decode($data['modulo'], true);
        $data['modulo'] = $module[0]['id'] ?? 0;


        try {
            $id = $this->riego_model->createFromAPI($data);

            if ($id) {
                $this->response([
                    'status' => true,
                    'message' => 'Registro creado con éxito.'
                ], 200);
            } else {
                $this->response(NULL, 500);
            }

        } catch (Exception $e) {
            // log_message( 'error', $e->getMessage( ) . ' in ' . $e->getFile() . ':' . $e->getLine() );
            // on error
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }

    }

    public function addCacaoHarvest_post()
    {

        $this->load->model('cosechacacao_model');

        try {

            $totalWeight = 0;
            $totalBags = 0;

            // $inputData = json_decode($this->input->raw_input_stream, true);

            // if (json_last_error() !== JSON_ERROR_NONE) {
            //     throw new Exception('Error decoding JSON: ' . json_last_error_msg());
            // }

            for ($i = 1; $i <= 15; $i++) {
                $totalWeight += $this->post('saco' . $i);
                $totalBags += $this->post('saco' . $i) > 0 ? 1 : 0;
            }

            // log_message('error', 'Datos finca: ' . $this->post('farm'));
            // log_message('error', 'Datos finca id: ' . $this->post('farm')[0]['id']);

            $data = array(
                'finca' => isset($this->post('farm')[0]['id']) ? $this->post('farm')[0]['id'] : null,
                'lote' => json_encode($this->post('lot')),
                'modulo' => json_encode($this->post('modules')),
                'fecha' => $this->post('operationDate'),
                'hora' => substr($this->post('operationTime'), -8),
                'trabajador' => json_encode($this->post('operator')),
                'subtarea' => json_encode($this->post('subtask')),
                'supervisor' => json_encode($this->post('supervisor')),
                'total_peso' => $this->post('totalPounds'),
                'total_sacos' => 0,
                'jornales' => $this->post('wage_count'),
                'observaciones' => $this->post('comments') ? $this->post('comments') : null,
                'created_at' => $this->post('created_at') ? $this->post('created_at') : date('Y-m-d'),
            );


            for ($i = 1; $i <= 15; $i++) {
                $data['saco' . $i] = $this->post('bags')[$i - 1] ?? 0;
                if ($data['saco' . $i] > 0) {
                    $data['total_sacos'] += 1;
                }
            }

            // log_message('error', 'Datos recibidos: ' . print_r($this->post(), true));

            // $id = $this->cosechacacao_model->createFromAPI($data);
            $response = $this->cosechacacao_model->createFromAPI($data);

            $this->response([
                'status' => true,
                'message' => 'Registro creado con éxito.',
                'data' => $response
            ], 200);

        } catch (Exception $e) {
            log_message('error', $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            log_message('error', '$_POST: ' . print_r($_POST, true));
            // on error
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }

        // 

        // if ($id) {
        //     $this->response([
        //         'status' => true,
        //         'message' => 'Registro creado con éxito.'
        //     ], 200);
        // } else {
        //     $this->response(NULL, 500);
        // }

    }

    public function postHarvestWeight_post()
    {

        try {

            $this->load->model('postharvest_model');

            $inputData = json_decode($this->input->raw_input_stream, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Error decoding JSON: ' . json_last_error_msg());
            }

            $supervisor = isset($inputData['supervisor']) ? $inputData['supervisor'] : null;
            $selectedLotsHarvest = isset($inputData['lots']) ? $inputData['lots'] : [];

            $this->load->helper('getdate');
            $currentDate = getCurrentDateTime();

            $data = array(
                'lot_number' => isset($inputData['postHarvestLot']) ? $inputData['postHarvestLot'] : null,
                'container_weight' => isset($inputData['containerWeight']) ? $inputData['containerWeight'] : null,
                'lot_weight' => isset($inputData['totalWeight']) ? $inputData['totalWeight'] : null,
                'supervisor_id' => isset($supervisor['id']) ? $supervisor['id'] : '',
                'supervisor_name' => isset($supervisor['name']) ? $supervisor['name'] : '',
                'operation_date' => isset($inputData['operationDate']) ? $inputData['operationDate'] : null,
                'comments' => isset($inputData['comments']) ? $inputData['comments'] : '',
                'created_at' => $currentDate
            );

            // Creates weight record
            $response = $this->postharvest_model->createWeightFromAPI($data);

            // Creates lots harvest records
            if (!is_array($selectedLotsHarvest)) {
                $selectedLotsHarvest = [$selectedLotsHarvest];
            }

            // // Recorrer el array de selectedLotsHarvest
            foreach ($selectedLotsHarvest as $lot) {
                // Asegurarse de que $lot sea un array o un objeto
                if (is_array($lot) || is_object($lot)) {
                    // Acceder a las propiedades del lot
                    $id = isset($lot['id']) ? $lot['id'] : null;
                    $name = isset($lot['name']) ? $lot['name'] : null;
                    $weight = isset($lot['weight']) ? $lot['weight'] : null;
                    $date = isset($lot['date']) ? $lot['date'] : null;

                    // Obtener la fecha y hora actual en GMT -5
                    $timezone = new DateTimeZone('America/Bogota');
                    $currentDateTime = new DateTime('now', $timezone);
                    $currentDate = $currentDateTime->format('Y-m-d H:i:s');

                    $insertData[] = [
                        'lot_date' => $date,
                        'created_at' => $currentDate
                    ];
                }
            }

            if (!empty($insertData)) {
                $this->postharvest_model->createLotHarvestFromAPI($insertData);
            }


            $this->response([
                'status' => true,
                'message' => json_encode($response)
            ], 200);

        } catch (Exception $e) {
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    function postHarvestPreDrying_post()
    {

        try {

            $this->load->model('postharvest_model');

            $inputData = json_decode($this->input->raw_input_stream, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Error decoding JSON: ' . json_last_error_msg());
            }

            // $weightData = isset($inputData['weightData']) ? $inputData['weightData'] : [];
            // $preDryingData = isset($inputData['preDryingData']) ? $inputData['preDryingData'] : [];
            $this->load->helper('getdate');
            $currentDate = getCurrentDateTime();

            $data = array(
                'lot_id' => isset($inputData['postHarvestLot']) ? $inputData['postHarvestLot'] : null,
                'start_date' => isset($inputData['startDate']) ? $inputData['startDate'] : null,
                'end_date' => isset($inputData['endDate']) ? $inputData['endDate'] : null,
                'comments' => isset($inputData['comments']) ? $inputData['comments'] : '',
                'created_at' => $currentDate
            );

            $response = $this->postharvest_model->createPredryingFromAPI($data);

            $this->response([
                'status' => true,
                'message' => json_encode($response)
            ], 200);

        } catch (Exception $e) {
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    function postHarvestFermentation_post()
    {
        try {

            $this->load->model('postharvest_model');

            $inputData = json_decode($this->input->raw_input_stream, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Error decoding JSON: ' . json_last_error_msg());
            }

            $this->load->helper('getdate');
            $currentDate = getCurrentDateTime();

            $data = array(
                'lot_id' => isset($inputData['postHarvestLot']) ? $inputData['postHarvestLot'] : null,
                'start_date' => isset($inputData['startDate']) ? $inputData['startDate'] : null,
                'end_date' => isset($inputData['endDate']) ? $inputData['endDate'] : null,
                'comments' => isset($inputData['comments']) ? $inputData['comments'] : '',
                'created_at' => $currentDate
            );

            $response = $this->postharvest_model->createFermentationFromAPI($data);

            $this->response([
                'status' => true,
                'message' => json_encode($response)
            ], 200);

        } catch (Exception $e) {
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    function postHarvestSunDrying_post()
    {
        try {

            $this->load->model('postharvest_model');

            $inputData = json_decode($this->input->raw_input_stream, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Error decoding JSON: ' . json_last_error_msg());
            }

            $this->load->helper('getdate');
            $currentDate = getCurrentDateTime();

            $data = array(
                'lot_id' => isset($inputData['postHarvestLot']) ? $inputData['postHarvestLot'] : null,
                'start_date' => isset($inputData['startDate']) ? $inputData['startDate'] : null,
                'end_date' => isset($inputData['endDate']) ? $inputData['endDate'] : null,
                'comments' => isset($inputData['comments']) ? $inputData['comments'] : '',
                'created_at' => $currentDate
            );

            $response = $this->postharvest_model->createSunDryingFromAPI($data);

            $this->response([
                'status' => true,
                'message' => json_encode($response)
            ], 200);

        } catch (Exception $e) {
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    function postHarvestMachineDrying_post()
    {
        try {

            $this->load->model('postharvest_model');

            $inputData = json_decode($this->input->raw_input_stream, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Error decoding JSON: ' . json_last_error_msg());
            }

            $this->load->helper('getdate');
            $currentDate = getCurrentDateTime();

            $data = array(
                'lot_id' => isset($inputData['postHarvestLot']) ? $inputData['postHarvestLot'] : null,
                'start_date' => isset($inputData['startDate']) ? $inputData['startDate'] : null,
                'end_date' => isset($inputData['endDate']) ? $inputData['endDate'] : null,
                'comments' => isset($inputData['comments']) ? $inputData['comments'] : '',
                'created_at' => $currentDate
            );

            $response = $this->postharvest_model->createMachineDryingFromAPI($data);

            $this->response([
                'status' => true,
                'message' => json_encode($response)
            ], 200);

        } catch (Exception $e) {
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    function postHarvestResults_post()
    {
        try {

            $this->load->model('postharvest_model');

            $inputData = json_decode($this->input->raw_input_stream, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Error decoding JSON: ' . json_last_error_msg());
            }

            $this->load->helper('getdate');
            $currentDate = getCurrentDateTime();

            $data = array(
                'lot_id' => isset($inputData['postHarvestLot']) ? $inputData['postHarvestLot'] : null,
                'weighing_date' => isset($inputData['weighingDate']) ? $inputData['weighingDate'] : null,
                'output_weight' => isset($inputData['outputWeight']) ? $inputData['outputWeight'] : null,
                'comments' => isset($inputData['comments']) ? $inputData['comments'] : '',
                'created_at' => $currentDate
            );

            $response = $this->postharvest_model->createResultDataFromAPI($data);

            $this->response([
                'status' => true,
                'message' => json_encode($response)
            ], 200);

        } catch (Exception $e) {
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    function getPendingPostharvestLots_get()
    {

        try {
            $this->load->model('postharvest_model');
            $postharvest = $this->postharvest_model->get_pending_lots();

            if ($postharvest) {
                $this->response($postharvest, 200);
            } else {
                $this->response(NULL, 404);
            }
        } catch (Exception $e) {
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }
        // try {
        //     $this->load->model('postharvest_model');

        //     $response = $this->postharvest_model->get_pending_lots();

        //     $this->response([
        //         'status' => true,
        //         'message' => json_encode($response)
        //     ], 200);
        // } catch (Exception $e) {
        //     $this->response([
        //         'status' => false,
        //         'message' => $e->getMessage()
        //     ], 500);
        // }


    }

    function postharvestResultData_post()
    {
        try {

            $this->load->model('postharvest_model');

            $inputData = json_decode($this->input->raw_input_stream, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Error decoding JSON: ' . json_last_error_msg());
            }

            $weightData = isset($inputData['weightData']) ? $inputData['weightData'] : [];
            $resultData = isset($inputData['resultData']) ? $inputData['resultData'] : [];

            $this->load->helper('getdate');
            $currentDate = getCurrentDateTime();

            $data = array(
                'lot_id' => isset($weightData['postHarvestLot']) ? $weightData['postHarvestLot'] : null,
                'output_weight' => isset($resultData['outputWeight']) ? $resultData['outputWeight'] : null,
                'weighing_date' => isset($resultData['weighingDate']) ? $resultData['weighingDate'] : null,
                'comments' => isset($resultData['comments']) ? $resultData['comments'] : '',
                'created_at' => $currentDate
            );

            $response = $this->postharvest_model->createResultDataFromAPI($data);

            $this->response([
                'status' => true,
                'message' => json_encode($response)
            ], 200);

        } catch (Exception $e) {
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function postharvestLastLot_get()
    {
        try {

            $this->load->database();

            $query = $this->db->query('
                SELECT 
                    MAX(z_postharvest_weight.lot_number) as last_postharvestLot
                FROM 
                    z_postharvest_weight
            ');

            // Obtener el resultado
            $result = $query->row_array();

            // Devolver el resultado en formato JSON
            // echo json_encode($result);
            $this->response([
                'status' => true,
                'message' => json_encode($result)
            ], 200);

        } catch (Throwable $th) {
            // Manejar excepciones
            $response = array('error' => $th->getMessage());
            echo json_encode($response);
        }
    }

    public function postHarvestFermentationQuality_post()
    {
        try {
            $this->load->model('postharvest_model');

            $inputData = json_decode($this->input->raw_input_stream, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Error decoding JSON: ' . json_last_error_msg());
            }

            $this->load->helper('getdate');
            $currentDate = getCurrentDateTime();

            $data = array(
                'lot_id' => isset($inputData['lotNumber']) ? $inputData['lotNumber'] : null,
                'stage' => isset($inputData['stage']) ? $inputData['stage'] : null,
                'sample_date' => isset($inputData['date']) ? $inputData['date'] : null,
                'good' => isset($inputData['good']) ? $inputData['good'] : null,
                'light' => isset($inputData['light']) ? $inputData['light'] : null,
                'violet' => isset($inputData['violet']) ? $inputData['violet'] : null,
                'good_perc' => isset($inputData['goodPerc']) ? $inputData['goodPerc'] : null,
                'light_perc' => isset($inputData['lightPerc']) ? $inputData['lightPerc'] : null,
                'violet_perc' => isset($inputData['violetPerc']) ? $inputData['violetPerc'] : null,
                'created_at' => $currentDate
            );

            $response = $this->postharvest_model->createFermentationQualityDataFromAPI($data);

            $this->response([
                'status' => true,
                'message' => json_encode($response)
            ], 200);

        } catch (\Throwable $th) {
            throw $th;
        }
    }

    public function postHarvestDryingQuality_post()
    {
        try {
            $this->load->model('postharvest_model');

            $inputData = json_decode($this->input->raw_input_stream, true);

            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new Exception('Error decoding JSON: ' . json_last_error_msg());
            }

            $this->load->helper('getdate');
            $currentDate = getCurrentDateTime();

            $data = array(
                'lot_id' => isset($inputData['lotNumber']) ? $inputData['lotNumber'] : null,
                'stage' => isset($inputData['stage']) ? $inputData['stage'] : null,
                'sample_date' => isset($inputData['date']) ? $inputData['date'] : null,
                'bean_moisture_1' => isset($inputData['cacaoBeanMoisture1']) ? $inputData['cacaoBeanMoisture1'] : null,
                'bean_moisture_2' => isset($inputData['cacaoBeanMoisture2']) ? $inputData['cacaoBeanMoisture2'] : null,
                'bean_moisture_3' => isset($inputData['cacaoBeanMoisture3']) ? $inputData['cacaoBeanMoisture3'] : null,
                'avg_bean_moisture' => isset($inputData['averageCacaoBeanMoisture']) ? $inputData['averageCacaoBeanMoisture'] : null,
                'sample_bean_count' => isset($inputData['sampleCacaoBeanCount']) ? $inputData['sampleCacaoBeanCount'] : null,
                'bean_index_grams' => isset($inputData['cacaoBeanIndexInGrams']) ? $inputData['cacaoBeanIndexInGrams'] : null,
                'percent_empty_beans' => isset($inputData['emptyBeansWeightInGrams']) ? $inputData['emptyBeansWeightInGrams'] : null,
                'created_at' => $currentDate
            );

            $response = $this->postharvest_model->createDryingQualityDataFromAPI($data);

            $this->response([
                'status' => true,
                'message' => json_encode($response)
            ], 200);


        } catch (\Throwable $th) {
            throw $th;
        }
    }

    // public function uploadPicture_post()
    // {
    //     try {

    //         // Verificar si el archivo ha sido enviado
    //         if (!isset($_POST['file']) || empty($_POST['file'])) {
    //             log_message('error', 'Error al subir el archivo desde uploadPicture: ' . print_r($_POST, true));
    //             $this->response([
    //                 'status' => false,
    //                 'message' => 'No se ha enviado ningún archivo.'
    //             ], RestController::HTTP_BAD_REQUEST);
    //             return;
    //         }

    //         $this->load->model('postharvest_model');

    //         // Depuración: Verificar el contenido de $_POST['file']
    //         log_message('info', 'Contenido de $_POST[file]: ' . substr($_POST['file'], 0, 100) . '...'); // Muestra los primeros 100 caracteres para evitar logs largos

    //         // Decodificar los datos base64
    //         $base64Data = $_POST['file'];
    //         $decodedData = base64_decode($base64Data);

    //         if ($base64Data === false) {

    //             $this->response([
    //                 'status' => false,
    //                 'message' => 'No se pudo decodificar el archivo.'
    //             ], RestController::HTTP_BAD_REQUEST);
    //             return;
    //         }

    //         $fileName = uniqid() . '.jpg';

    //         $filePath = FCPATH . 'uploads/' . $fileName;

    //         if (file_put_contents($filePath, $base64Data) === false) {
    //             $this->response([
    //                 'status' => false,
    //                 'message' => 'No se pudo guardar el archivo.'
    //             ], 500);
    //             return;
    //         }

    //         // Guardar el nombre del archivo en la base de datos
    //         $this->postharvest_model->save_image($fileName);

    //         // Responder con éxito
    //         $response = array('message' => 'Archivo subido y nombre guardado con éxito', 'file_name' => $fileName);
    //         $this->response([
    //             'status' => true,
    //             'message' => json_encode($response)
    //         ], 200);
    //     } catch (\Throwable $th) {
    //         // Registrar el error en el log
    //         log_message('error', 'Error al subir el archivo: ' . $th->getMessage());
    //         $this->response([
    //             'status' => false,
    //             'message' => 'Se ha producido un error al procesar la solicitud. ' . $th->getMessage()
    //         ], 500);
    //     }
    // }


    public function uploadPicture2_post()
    {
        try {

            // Verificar si el archivo ha sido enviado
            log_message('error', '$_FILES: ' . print_r($_FILES, true));
            log_message('error', '$_POST: ' . print_r($_POST, true));

            $lotNumber = $this->input->post('lotNumber');
            $stage = urldecode($this->input->post('stage'));
            $pictureOrder = urldecode($this->input->post('pictureOrder'));

            $postdata = file_get_contents("php://input");
            parse_str($postdata, $param);

            if (!isset($_FILES['file']) || $_FILES['file']['error'] != UPLOAD_ERR_OK) {

                log_message('error', 'Error al subir el archivo desde uploadPicture2: ' . print_r($_FILES, true));
                $this->response([
                    'status' => false,
                    'message' => 'No se ha enviado ningún archivo o ha ocurrido un error al cargar el archivo.'
                ], RestController::HTTP_BAD_REQUEST);
                return;
            }

            $this->load->model('postharvest_model');

            // Obtener información del archivo
            $fileTmpPath = $_FILES['file']['tmp_name'];
            $fileName = $_FILES['file']['name'];
            $fileSize = $_FILES['file']['size'];
            $fileType = $_FILES['file']['type'];

            // Crear un nombre de archivo único
            $newFileName = uniqid() . '.' . pathinfo($fileName, PATHINFO_EXTENSION);

            // Guardar el archivo en el sistema de archivos
            $uploadFileDir = FCPATH . 'uploads/';
            $destPath = $uploadFileDir . $newFileName;

            if (move_uploaded_file($fileTmpPath, $destPath)) {

                $this->load->helper('getdate');
                $currentDate = getCurrentDateTime();

                $data = array(
                    'lot_id' => $lotNumber,
                    'stage' => $stage,
                    'picture_name' => $newFileName,
                    'picture_order' => $pictureOrder,
                    'created_at' => $currentDate
                );

                // Guardar el nombre del archivo en la base de datos
                $this->postharvest_model->save_image($data);

                // Responder con éxito
                $response = array('message' => 'Archivo subido y nombre guardado con éxito', 'file_name' => $newFileName);
                $this->response([
                    'status' => true,
                    'message' => json_encode($response)
                ], 200);
            } else {
                $this->response([
                    'status' => false,
                    'message' => 'No se pudo guardar el archivo.'
                ], 500);
            }
        } catch (\Throwable $th) {
            // Registrar el error en el log
            log_message('error', 'Error al subir el archivo: ' . $th->getMessage());
            $this->response([
                'status' => false,
                'message' => 'Se ha producido un error al procesar la solicitud. ' . $th->getMessage()
            ], 500);
        }
    }

    // public function uploadPicture3_post()
    // {
    //     $this->response([
    //         'status' => true,
    //         'message' => 'Archivo subido y nombre guardado con válida'
    //     ], 200);
    // }



    /////////////////////////////////////

    function user_get()
    {
        // respond with information about a user
    }

    function user_put()
    {
        // create a new user and respond with a status/errors
    }

    function user_post()
    {
        // update an existing user and respond with a status/errors
    }

    function user_delete()
    {
        // delete a user and respond with a status/errors
    }

}