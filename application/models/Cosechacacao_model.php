<?php

class Cosechacacao_model extends CI_Model
{

    function __construct()
    {
        parent::__construct();
        $this->load->database();
        $this->load->model('fincas_model');
        $this->load->model('personal_model');
        $this->load->model('tareas_model');
        $this->load->model('subtareas_model');
        $this->load->model('lotes_model');
    }

    function db_table_exists($table_name = null)
    {
        return $this->db->table_exists($table_name);
    }

    public function get_all()
    {
        $this->db->select('id', 'finca', 'supervisor');
        $result = $this->db->get('z_cosecha_cacao');
        $cosecha = $result->result_array();
        return $cosecha;
    }

    public function createFromAPI($data)
    {
        $this->load->helper('datetime_validation_helper');

        // Extraer IDs de los arrays JSON
        $farm = json_decode($data['finca'], true);
        $data['finca'] = $farm[0]['id'] ?? 0;

        $lot = json_decode($data['lote'], true);
        $data['lote'] = $lot[0]['id'] ?? 0;

        $operator = json_decode($data['trabajador'], true);
        $data['trabajador'] = $operator[0]['id'] ?? 0;

        $subtask = json_decode($data['subtarea'], true);
        $data['subtarea'] = $subtask[0]['id'] ?? 0;

        $supervisor = json_decode($data['supervisor'], true);
        $data['supervisor'] = $supervisor[0]['id'] ?? 0;

        // Convertir módulos a cadena de texto de IDs separados por comas
        $module = json_decode($data['modulo'], true);
        $data['modulo'] = $module[0]['id'] ?? 0;

        // Validaciones

        if ($data['total_sacos'] <= 0) {
            throw new Exception("El total de sacos debe ser mayor que 0. Se ha cancelado la operación. Valor recibido: " . $data['total_sacos']);
        }

        if ($data['total_peso'] <= 0) {
            throw new Exception("El total de peso debe ser mayor que 0. Se ha cancelado la operación. Valor recibido: " . $data['total_peso']);
        }

        if ($data['jornales'] > 1) {
            throw new Exception("La cuenta de jornales no puede ser mayor que 1. Se ha cancelado la operación. Valor recibido: " . $data['jornales']);
        }

        // if (!$this->fincas_model->existsRecord($data['finca'])) {
        //     throw new Exception("La finca indicada no existe. Se ha cancelado la operación.");
        // }

        // if (!$this->lotes_model->isValidLot($data['finca'], $data['lote'])) {
        //     throw new Exception("El lote indicado no existe. Se ha cancelado la operación.");
        // }

        // if (!$this->modulos_model->isValidModule($data['modulo'], $data['lote'])) {
        //     throw new Exception("El módulo no existe en el lote indicado. Se ha cancelado la operación. Valor recibido: " . $data['modulo'] . ' en el lote' . $data['lote']);
        // }

        // if (!$this->personal_model->existsRecord($data['supervisor'])) {
        //     throw new Exception("El supervisor indicado no existe. Se ha cancelado la operación. Valor recibido: " . $data['supervisor']);
        // }

        // if (!$this->personal_model->existsRecord($data['trabajador'])) {
        //     throw new Exception("El trabajador no existe. Se ha cancelado la operación. Valor recibido: " . $data['trabajador']);
        // }

        // if (!$this->subtareas_model->isValidSubtask($data['subtarea'])) {
        //     throw new Exception("La subtarea no existe para la tarea indicada. Se ha cancelado la operación Valor recibido: " . $data['subtarea'] . " en la tarea " . $data['tarea']);
        // }

        // if (!isTimeValid($data['hora'])) {
        //     throw new Exception("La hora de registro no es válida. Debe ser un tiempo válido. Se ha cancelado la operación. Valor recibido: " . $data['hora']);
        // }

        // if (!isValidDate($data['fecha'])) {
        //     throw new Exception("La fecha indicada no es válida. Se ha cancelado la operación. Valor recibido: " . $data['fecha']);
        // }

        // Observaciones opcionales
        $data['observaciones'] = $data['observaciones'] ? $data['observaciones'] : null;

        // Guardar la fecha actual si no se proporciona 'created_at'
        $data['created_at'] = $data['created_at'] ? $data['created_at'] : date('Y-m-d H:i:s');

        // Inserción en la base de datos
        $this->db->insert('z_cosecha_cacao', $data);

        return $this->db->insert_id();
        // return $data;
    }


    // public function createFromAPI($data) {

    //     $this->load->helper('datetime_validation_helper');

    //     if (!$this->fincas_model->existsRecord($data['finca'])) {
    //         throw new Exception("La finca indicada no existe. Se ha cancelado la operación.");
    //     }

    //     if (!$this->lotes_model->isValidLot($data['finca'], $data['lote'])) {
    //         throw new Exception("El lote indicado no existe. Se ha cancelado la operación.");
    //     }

    //     if (!$this->modulos_model->isValidModule($data['modulo'], $data['lote'])) {
    //         throw new Exception("El módulo no existe en el lote indicado. Se ha cancelado la operación. Valor recibido: " . $data['modulo'] . ' en el lote' . $data['lote']);
    //     }

    //     if (!$this->personal_model->existsRecord($data['supervisor'])) {
    //         throw new Exception("El supervisor indicado no existe. Se ha cancelado la operación. Valor recibido: " . $data['supervisor']);
    //     }

    //     if (!$this->personal_model->existsRecord($data['trabajador'])) {
    //         throw new Exception("El trabajador no existe. Se ha cancelado la operación. Valor recibido: " . $data['trabajador']);
    //     }

    //     if (!$this->tareas_model->existsRecord($data['tarea'])) {
    //         throw new Exception("La tarea indicada no existe. Se ha cancelado la operación. Valor recibido: " . $data['tarea']);
    //     }

    //     if (!$this->subtareas_model->isValidSubtask($data['tarea'], $data['subtarea'])) {
    //         throw new Exception("La subtarea no existe para la tarea indicada. Se ha cancelado la operación Valor recibido: " . $data['subtarea'] . " en la tarea " . $data['tarea']);
    //     }

    //     if (!isTimeValid($data['hora'])) {
    //         throw new Exception("La hora de registro no es válida. Debe ser un tiempo válido. Se ha cancelado la operación. Valor recibido: " . $data['hora']);
    //     }

    //     if (!isValidDate($data['fecha'])) {
    //         throw new Exception("La fecha indicada no es válida. Se ha cancelado la operación. Valor recibido: " . $data['fecha']);
    //     }

    //     $totalWeight = 0;

    //     for ($i = 1; $i <= 15; $i++) {

    //         $data['saco' . $i] += 0;

    //         if($data['saco' . $i] < 0) {
    //             throw new Exception("El peso de los sacos no puede ser negativo. Se ha cancelado la operación. Valor recibido: " . $data['saco' .$i]);
    //         }

    //         if(!is_numeric($data['saco' . $i])) {
    //             throw new Exception("El peso de los sacos debe ser un número. Se ha cancelado la operación. Valor recibido: " . $data['saco' . $i]);
    //         }

    //         $totalWeight += $data['saco' . $i];

    //     }

    //     // if ($totalWeight == 0) {
    //     //     throw new Exception("El peso total de todos los sacos no puede ser cero. Se ha cancelado la operación.");
    //     // }

    //     $this->db->insert('z_cosecha_cacao', $data);

    //     return $this->db->insert_id();

    // }



}