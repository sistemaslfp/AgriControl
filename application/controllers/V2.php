<?php
defined('BASEPATH') or exit('No direct script access allowed');

use chriskacerguis\RestServer\RestController;

class V2 extends RestController
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
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE");

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

    public function addPm_post()
    {
        $this->load->model('pm_model');

        $fecha = date("Y-m-d H:i:s", time());
        $fecha_registro = new DateTime();
        // $hora = date("H:i:s"); 
        $numero_registro = "PM-" . $fecha_registro->getTimestamp();

        $date = new DateTime($this->post('fecha'));
        $pm_year = $date->format('Y');
        $pm_week = $date->format('W');

        if (null !== ($this->post('trabajador')) && null !== ($this->post('subtarea')) && null !== ($this->post('responsable'))) {
            $data01 = array(
                'fecha' => $this->post('fecha'),
                'pm_year' => $pm_year,
                'pm_week' => $pm_week,
                'finca' => $this->post('finca'),
                'responsable' => $this->post('responsable'),
                'trabajador' => $this->post('trabajador'),
                'cantidad' => $this->post('cantidad'),
                'comentario' => $this->post('comentario'),
                'cultivo' => $this->post('cultivo'),
                'hora_cierre' => $this->post('hora_cierre'),
                'hora_inicio' => $this->post('hora_inicio'),
                'lote' => $this->post('lote'),
                'modulo' => implode(', ', (array) $this->post('modulos')),
                'subtarea' => $this->post('subtarea'),
                'fecha_registro' => $fecha,
                'numero_registro' => $numero_registro
            );

            try {
                $response = $this->pm_model->create_pm($data01);
                if ($response['id'] > 0) {
                    $this->response([
                        'status' => true,
                        'message' => 'PM creado con éxito.'
                    ], 200);
                } else {
                    $this->response([
                        'status' => false,
                        'message' => 'Error al registrar los datos del PM.' . print_r($response['error'])
                    ], 500);
                }
            } catch (Exception $e) {
                log_message('error', $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
                $this->response([
                    'status' => false,
                    'message' => 'Error inesperado: ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine()
                ], 500);
            }

        } else {
            $this->response([
                'status' => false,
                'message' => 'No se han ingresado todos los datos.'
            ], 500);
        }

        // if (null !== ($this->post('trabajador')) && null !== ($this->post('T2Subtarea')) && null !== ($this->post('responsable'))) {
        //     $data01 = array( 
        //         'finca' => $this->post('finca'),
        //         'responsable' => $this->post('responsable'),
        //         'trabajador' => $this->post('trabajador'),
        //         'area_ejecutada' => $this->post('T2AreaEjecutada'),
        //         'cantidad' => $this->post('T2Cantidad'),
        //         'comentario' => $this->post('T2Comentario'),
        //         'cultivo' => $this->post('T2Cultivo'),
        //         'hora_cierre' => $this->post('T2HoraCierre'),
        //         'hora_inicio' => $this->post('T2HoraInicio'),
        //         'lote' => $this->post('T2Lote'),
        //         'modulo' => implode(', ', (array) $this->post('T2Modulo')),
        //         'subtarea' => $this->post('T2Subtarea'),
        //         'fecha_registro' => $fecha,
        //         'numero_registro' => $numero_registro
        //     );

        //     $this->pm_model->create_pm($data01);

        // }

        // if (null !== ($this->post('trabajador')) && null !== ($this->post('T3Subtarea')) && null !== ($this->post('responsable'))) {
        //     $data01 = array( 
        //         'finca' => $this->post('finca'),
        //         'responsable' => $this->post('responsable'),
        //         'trabajador' => $this->post('trabajador'),
        //         'area_ejecutada' => $this->post('T3AreaEjecutada'),
        //         'cantidad' => $this->post('T3Cantidad'),
        //         'comentario' => $this->post('T3Comentario'),
        //         'cultivo' => $this->post('T3Cultivo'),
        //         'hora_cierre' => $this->post('T3HoraCierre'),
        //         'hora_inicio' => $this->post('T3HoraInicio'),
        //         'lote' => $this->post('T3Lote'),
        //         'modulo' => implode(', ', (array) $this->post('T3Modulo')),
        //         'subtarea' => $this->post('T3Subtarea'),
        //         'fecha_registro' => $fecha,
        //         'numero_registro' => $numero_registro
        //     );

        //     $this->pm_model->create_pm($data01);

        // }

        // if (null !== ($this->post('trabajador')) && null !== ($this->post('T4Subtarea')) && null !== ($this->post('responsable'))) {
        //     $data01 = array( 
        //         'finca' => $this->post('finca'),
        //         'responsable' => $this->post('responsable'),
        //         'trabajador' => $this->post('trabajador'),
        //         'area_ejecutada' => $this->post('T4AreaEjecutada'),
        //         'cantidad' => $this->post('T4Cantidad'),
        //         'comentario' => $this->post('T4Comentario'),
        //         'cultivo' => $this->post('T4Cultivo'),
        //         'hora_cierre' => $this->post('T4HoraCierre'),
        //         'hora_inicio' => $this->post('T4HoraInicio'),
        //         'lote' => $this->post('T4Lote'),
        //         'modulo' => implode(', ', (array) $this->post('T4Modulo')),
        //         'subtarea' => $this->post('T4Subtarea'),
        //         'fecha_registro' => $fecha,
        //         'numero_registro' => $numero_registro
        //     );

        //     $this->pm_model->create_pm($data01);

        // }

        // if (null !== ($this->post('trabajador')) && null !== ($this->post('T5Subtarea')) && null !== ($this->post('responsable'))) {
        //     $data01 = array( 
        //         'finca' => $this->post('finca'),
        //         'responsable' => $this->post('responsable'),
        //         'trabajador' => $this->post('trabajador'),
        //         'area_ejecutada' => $this->post('T5AreaEjecutada'),
        //         'cantidad' => $this->post('T5Cantidad'),
        //         'comentario' => $this->post('T5Comentario'),
        //         'cultivo' => $this->post('T5Cultivo'),
        //         'hora_cierre' => $this->post('T5HoraCierre'),
        //         'hora_inicio' => $this->post('T5HoraInicio'),
        //         'lote' => $this->post('T5Lote'),
        //         'modulo' => implode(', ', (array) $this->post('T5Modulo')),
        //         'subtarea' => $this->post('T5Subtarea'),
        //         'fecha_registro' => $fecha,
        //         'numero_registro' => $numero_registro
        //     );

        //     $this->pm_model->create_pm($data01);

        // }

        // if (null !== ($this->post('trabajador')) && null !== ($this->post('T6Subtarea')) && null !== ($this->post('responsable'))) {
        //     $data01 = array( 
        //         'finca' => $this->post('finca'),
        //         'responsable' => $this->post('responsable'),
        //         'trabajador' => $this->post('trabajador'),
        //         'area_ejecutada' => $this->post('T6AreaEjecutada'),
        //         'cantidad' => $this->post('T6Cantidad'),
        //         'comentario' => $this->post('T6Comentario'),
        //         'cultivo' => $this->post('T6Cultivo'),
        //         'hora_cierre' => $this->post('T6HoraCierre'),
        //         'hora_inicio' => $this->post('T6HoraInicio'),
        //         'lote' => $this->post('T6Lote'),
        //         'modulo' => implode(', ', (array) $this->post('T6Modulo')),
        //         'subtarea' => $this->post('T6Subtarea'),
        //         'fecha_registro' => $fecha,
        //         'numero_registro' => $numero_registro
        //     );

        //     $this->pm_model->create_pm($data01);

        // }

        // if (null !== ($this->post('trabajador')) && null !== ($this->post('T7Subtarea')) && null !== ($this->post('responsable'))) {
        //     $data01 = array( 
        //         'finca' => $this->post('finca'),
        //         'responsable' => $this->post('responsable'),
        //         'trabajador' => $this->post('trabajador'),
        //         'area_ejecutada' => $this->post('T7AreaEjecutada'),
        //         'cantidad' => $this->post('T7Cantidad'),
        //         'comentario' => $this->post('T7Comentario'),
        //         'cultivo' => $this->post('T7Cultivo'),
        //         'hora_cierre' => $this->post('T7HoraCierre'),
        //         'hora_inicio' => $this->post('T7HoraInicio'),
        //         'lote' => $this->post('T7Lote'),
        //         'modulo' => implode(', ', (array) $this->post('T7Modulo')),
        //         'subtarea' => $this->post('T7Subtarea'),
        //         'fecha_registro' => $fecha,
        //         'numero_registro' => $numero_registro
        //     );

        //     $this->pm_model->create_pm($data01);

        // }

        // if (null !== ($this->post('trabajador')) && null !== ($this->post('T8Subtarea')) && null !== ($this->post('responsable'))) {
        //     $data01 = array( 
        //         'finca' => $this->post('finca'),
        //         'responsable' => $this->post('responsable'),
        //         'trabajador' => $this->post('trabajador'),
        //         'area_ejecutada' => $this->post('T8AreaEjecutada'),
        //         'cantidad' => $this->post('T8Cantidad'),
        //         'comentario' => $this->post('T8Comentario'),
        //         'cultivo' => $this->post('T8Cultivo'),
        //         'hora_cierre' => $this->post('T8HoraCierre'),
        //         'hora_inicio' => $this->post('T8HoraInicio'),
        //         'lote' => $this->post('T8Lote'),
        //         'modulo' => implode(', ', (array) $this->post('T8Modulo')),
        //         'subtarea' => $this->post('T8Subtarea'),
        //         'fecha_registro' => $fecha,
        //         'numero_registro' => $numero_registro
        //     );

        //     $this->pm_model->create_pm($data01);

        // }

        // if (null !== ($this->post('trabajador')) && null !== ($this->post('T9Subtarea')) && null !== ($this->post('responsable'))) {
        //     $data01 = array( 
        //         'finca' => $this->post('finca'),
        //         'responsable' => $this->post('responsable'),
        //         'trabajador' => $this->post('trabajador'),
        //         'area_ejecutada' => $this->post('T9AreaEjecutada'),
        //         'cantidad' => $this->post('T9Cantidad'),
        //         'comentario' => $this->post('T9Comentario'),
        //         'cultivo' => $this->post('T9Cultivo'),
        //         'hora_cierre' => $this->post('T9HoraCierre'),
        //         'hora_inicio' => $this->post('T9HoraInicio'),
        //         'lote' => $this->post('T9Lote'),
        //         'modulo' => implode(', ', (array) $this->post('T9Modulo')),
        //         'subtarea' => $this->post('T9Subtarea'),
        //         'fecha_registro' => $fecha,
        //         'numero_registro' => $numero_registro
        //     );

        //     $this->pm_model->create_pm($data01);

        // }

        // if (null !== ($this->post('trabajador')) && null !== ($this->post('T10Subtarea')) && null !== ($this->post('responsable'))) {
        //     $data01 = array( 
        //         'finca' => $this->post('finca'),
        //         'responsable' => $this->post('responsable'),
        //         'trabajador' => $this->post('trabajador'),
        //         'area_ejecutada' => $this->post('T10AreaEjecutada'),
        //         'cantidad' => $this->post('T10Cantidad'),
        //         'comentario' => $this->post('T10Comentario'),
        //         'cultivo' => $this->post('T10Cultivo'),
        //         'hora_cierre' => $this->post('T10HoraCierre'),
        //         'hora_inicio' => $this->post('T10HoraInicio'),
        //         'lote' => $this->post('T10Lote'),
        //         'modulo' => implode(', ', (array) $this->post('T10Modulo')),
        //         'subtarea' => $this->post('T10Subtarea'),
        //         'fecha_registro' => $fecha,
        //         'numero_registro' => $numero_registro
        //     );

        //     $this->pm_model->create_pm($data01);

        // }

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

    public function addAm_post()
    {
        $data = array(
            'finca' => $this->post('finca'),
            'responsable_id' => $this->post('responsable'),
            'fecha' => $this->post('fecha'),
            'hora' => $this->post('hora'),
            'cultivo_id' => $this->post('cultivo'),
            'lote_id' => $this->post('lote'),
            'modulos' => implode(', ', (array) $this->post('modulos')),
            'personal_id' => $this->post('personal'),
            'subtarea_id' => $this->post('subtarea')
        );

        $this->load->model('am_model');

        try {
            $id = $this->am_model->create_am($data);
        } catch (Exception $e) {
            log_message('error', $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine());
            // on error
        }

        if ($id) {
            $this->response([
                'status' => true,
                'message' => 'Am creado con éxito.'
            ], 200);
        } else {
            $this->response(NULL, 500);
        }

    }

    public function am_post()
    {
        $this->load->model('am_model');
        // echo implode(', ', $this->post('T2Modulo'));
        // // var_dump($this->post('T2Modulo'));
        // return;

        $fecha = date('Y-m-d');
        $hora = date("H:i:s");

        $T1Personal = implode(', ', (array) $this->post('T1Personal'));
        $T2Personal = implode(', ', (array) $this->post('T2Personal'));
        $T3Personal = implode(', ', (array) $this->post('T3Personal'));
        $T4Personal = implode(', ', (array) $this->post('T4Personal'));
        $T5Personal = implode(', ', (array) $this->post('T5Personal'));
        $T6Personal = implode(', ', (array) $this->post('T6Personal'));
        $T7Personal = implode(', ', (array) $this->post('T7Personal'));
        $T8Personal = implode(', ', (array) $this->post('T8Personal'));
        $T9personal = implode(', ', (array) $this->post('T9Personal'));
        $T10Personal = implode(', ', (array) $this->post('T10Personal'));

        if (is_array($this->post('T1Personal'))) {
            foreach ($this->post('T1Personal') as $field) {
                $data = array(
                    'finca' => $this->post('finca'),
                    'responsable_id' => $this->post('responsable'),
                    'fecha' => $fecha,
                    'hora' => $hora,
                    'cultivo_id' => $this->post('T1Cultivo'),
                    'lote_id' => $this->post('T1Lote'),
                    'modulos' => implode(', ', (array) $this->post('T1Modulo')),
                    'personal_id' => $field,
                    'subtarea_id' => $this->post('T1Subtarea'),
                );
                $id = $this->am_model->create_am($data);
            }
        }

        if (is_array($this->post('T2Personal'))) {
            foreach ($this->post('T2Personal') as $field) {
                $data = array(
                    'finca' => $this->post('finca'),
                    'responsable_id' => $this->post('responsable'),
                    'fecha' => $fecha,
                    'hora' => $hora,
                    'cultivo_id' => $this->post('T2Cultivo'),
                    'lote_id' => $this->post('T2Lote'),
                    'modulos' => implode(', ', (array) $this->post('T2Modulo')),
                    'personal_id' => $field,
                    'subtarea_id' => $this->post('T2Subtarea'),
                );
                $id = $this->am_model->create_am($data);
            }
        }

        if (is_array($this->post('T3Personal'))) {
            foreach ($this->post('T3Personal') as $field) {
                $data = array(
                    'finca' => $this->post('finca'),
                    'responsable_id' => $this->post('responsable'),
                    'fecha' => $fecha,
                    'hora' => $hora,
                    'cultivo_id' => $this->post('T3Cultivo'),
                    'lote_id' => $this->post('T3Lote'),
                    'modulos' => implode(', ', (array) $this->post('T3Modulo')),
                    'personal_id' => $field,
                    'subtarea_id' => $this->post('T3Subtarea'),
                );
                $id = $this->am_model->create_am($data);
            }
        }

        if (is_array($this->post('T4Personal'))) {
            foreach ($this->post('T4Personal') as $field) {
                $data = array(
                    'finca' => $this->post('finca'),
                    'responsable_id' => $this->post('responsable'),
                    'fecha' => $fecha,
                    'hora' => $hora,
                    'cultivo_id' => $this->post('T4Cultivo'),
                    'lote_id' => $this->post('T4Lote'),
                    'modulos' => implode(', ', (array) $this->post('T4Modulo')),
                    'personal_id' => $field,
                    'subtarea_id' => $this->post('T4Subtarea'),
                );
                $id = $this->am_model->create_am($data);
            }
        }

        if (is_array($this->post('T5Personal'))) {
            foreach ($this->post('T5Personal') as $field) {
                $data = array(
                    'finca' => $this->post('finca'),
                    'responsable_id' => $this->post('responsable'),
                    'fecha' => $fecha,
                    'hora' => $hora,
                    'cultivo_id' => $this->post('T5Cultivo'),
                    'lote_id' => $this->post('T5Lote'),
                    'modulos' => implode(', ', (array) $this->post('T5Modulo')),
                    'personal_id' => $field,
                    'subtarea_id' => $this->post('T5Subtarea'),
                );
                $id = $this->am_model->create_am($data);
            }
        }

        if (is_array($this->post('T6Personal'))) {
            foreach ($this->post('T6Personal') as $field) {
                $data = array(
                    'finca' => $this->post('finca'),
                    'responsable_id' => $this->post('responsable'),
                    'fecha' => $fecha,
                    'hora' => $hora,
                    'cultivo_id' => $this->post('T6Cultivo'),
                    'lote_id' => $this->post('T6Lote'),
                    'modulos' => implode(', ', (array) $this->post('T6Modulo')),
                    'personal_id' => $field,
                    'subtarea_id' => $this->post('T6Subtarea'),
                );
                $id = $this->am_model->create_am($data);
            }
        }

        if (is_array($this->post('T7Personal'))) {
            foreach ($this->post('T7Personal') as $field) {
                $data = array(
                    'finca' => $this->post('finca'),
                    'responsable_id' => $this->post('responsable'),
                    'fecha' => $fecha,
                    'hora' => $hora,
                    'cultivo_id' => $this->post('T7Cultivo'),
                    'lote_id' => $this->post('T7Lote'),
                    'modulos' => implode(', ', (array) $this->post('T7Modulo')),
                    'personal_id' => $field,
                    'subtarea_id' => $this->post('T7Subtarea'),
                );
                $id = $this->am_model->create_am($data);
            }
        }

        if (is_array($this->post('T8Personal'))) {
            foreach ($this->post('T8Personal') as $field) {
                $data = array(
                    'finca' => $this->post('finca'),
                    'responsable_id' => $this->post('responsable'),
                    'fecha' => $fecha,
                    'hora' => $hora,
                    'cultivo_id' => $this->post('T8Cultivo'),
                    'lote_id' => $this->post('T8Lote'),
                    'modulos' => implode(', ', (array) $this->post('T8Modulo')),
                    'personal_id' => $field,
                    'subtarea_id' => $this->post('T8Subtarea'),
                );
                $id = $this->am_model->create_am($data);
            }
        }

        if (is_array($this->post('T9Personal'))) {
            foreach ($this->post('T9Personal') as $field) {
                $data = array(
                    'finca' => $this->post('finca'),
                    'responsable_id' => $this->post('responsable'),
                    'fecha' => $fecha,
                    'hora' => $hora,
                    'personal_id' => $field,
                    'cultivo_id' => $this->post('T9Cultivo'),
                    'lote_id' => $this->post('T9Lote'),
                    'modulos' => implode(', ', (array) $this->post('T9Modulo')),
                    'personal_id' => implode(', ', (array) $this->post('T9Personal')),
                    'subtarea_id' => $this->post('T9Subtarea'),
                );
                $id = $this->am_model->create_am($data);
            }
        }

        if (is_array($this->post('T10Personal'))) {
            foreach ($this->post('T10Personal') as $field) {
                $data = array(
                    'finca' => $this->post('finca'),
                    'responsable_id' => $this->post('responsable'),
                    'fecha' => $fecha,
                    'hora' => $hora,
                    'cultivo_id' => $this->post('T10Cultivo'),
                    'lote_id' => $this->post('T10Lote'),
                    'modulos' => implode(', ', (array) $this->post('T10Modulo')),
                    'personal_id' => $field,
                    'subtarea_id' => $this->post('T10Subtarea'),
                );
                $id = $this->am_model->create_am($data);
            }
        }
    }

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
        $this->response("Bellita API v2", 200);
    }


    public function addIrrigation_post()
    {
        $this->load->model('riego_model');


        $data = array(
            'supervisor' => $this->post('supervisor'),
            'fecha' => $this->post('fecha'),
            'finca' => $this->post('finca'),
            'lote' => $this->post('lote'),
            'modulo' => $this->post('modulo'),
            'tiempo_riego' => $this->post('tiempo_riego'),
            'volumen_riego' => $this->post('volumen'),
            'observaciones' => $this->post('observaciones'),
            'created_at' => date('Y-m-d')
        );

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

        $totalWeight = 0;
        $totalBags = 0;

        for ($i = 1; $i <= 15; $i++) {
            $totalWeight += $this->post('saco' . $i);
            $totalBags += $this->post('saco' . $i) > 0 ? 1 : 0;
        }

        $data = array(
            'supervisor' => $this->post('supervisor_id'),
            'fecha' => $this->post('fecha'),
            'hora' => $this->post('hora'),
            'finca' => $this->post('finca_id'),
            'tarea' => $this->post('tarea_id'),
            'subtarea' => $this->post('subtarea_id'),
            'trabajador' => $this->post('trabajador_id'),
            'lote' => $this->post('lote_id'),
            'modulo' => $this->post('modulo_id'),
            'jornales' => $this->post('jornales'),
            'saco1' => $this->post('saco1'),
            'saco2' => $this->post('saco2'),
            'saco3' => $this->post('saco3'),
            'saco4' => $this->post('saco4'),
            'saco5' => $this->post('saco5'),
            'saco6' => $this->post('saco6'),
            'saco7' => $this->post('saco7'),
            'saco8' => $this->post('saco8'),
            'saco9' => $this->post('saco9'),
            'saco10' => $this->post('saco10'),
            'saco11' => $this->post('saco11'),
            'saco12' => $this->post('saco12'),
            'saco13' => $this->post('saco13'),
            'saco14' => $this->post('saco14'),
            'saco15' => $this->post('saco15'),
            'total_peso' => $totalWeight,
            'total_sacos' => $totalBags,
            'observaciones' => $this->post('observaciones') ? $this->post('observaciones') : null,
            'created_at' => date('Y-m-d')
        );

        try {
            $id = $this->cosechacacao_model->createFromAPI($data);
        } catch (Exception $e) {
            // log_message( 'error', $e->getMessage( ) . ' in ' . $e->getFile() . ':' . $e->getLine() );
            // on error
            $this->response([
                'status' => false,
                'message' => $e->getMessage()
            ], 500);
        }

        if ($id) {
            $this->response([
                'status' => true,
                'message' => 'Registro creado con éxito.'
            ], 200);
        } else {
            $this->response(NULL, 500);
        }

    }

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