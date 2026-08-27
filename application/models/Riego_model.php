<?php

class Riego_model extends CI_Model
{

    function __construct()
    {
        parent::__construct();
        $this->load->database();
        $this->load->model('fincas_model');
        $this->load->model('personal_model');
        $this->load->model('subtareas_model');
        $this->load->model('lotes_model');
        $this->load->model('subtareas_model');
        $this->load->model('modulos_model');
        $this->load->model('tareas_model');
    }

    function db_table_exists($table_name = null)
    {
        return $this->db->table_exists($table_name);
    }

    public function get_all()
    {
        $this->db->select('id, supervisor, tiempo_riego');
        $result = $this->db->get('z_riego');
        $riego = $result->result_array();
        return $riego;
    }

    public function createFromAPI($data)
    {

        $this->load->helper('datetime_validation_helper');

        if (!$this->fincas_model->existsRecord($data['finca'])) {
            throw new Exception("La finca indicada no existe. Se ha cancelado la operación.");
        }

        if (!$this->lotes_model->isValidLot($data['finca'], $data['lote'])) {
            throw new Exception("El lote no existe en la finca indicada. Se ha cancelado la operación.");
        }

        if (!$this->modulos_model->isValidModule($data['modulo'], $data['lote'])) {
            throw new Exception("El módulo no existe en el lote indicado. Se ha cancelado la operación.");
        }

        if (!$this->personal_model->existsRecord($data['supervisor'])) {
            throw new Exception("El supervisor indicado no existe. Se ha cancelado la operación.");
        }

        // if (!$this->tareas_model->existsRecord($data['codigo_tarea'])) {
        //     throw new Exception("La tarea indicada no existe. Se ha cancelado la operación.");
        // }

        // if (!$this->subtareas_model->isValidSubtask($data['codigo_tarea'], $data['codigo_subtarea'])) {
        //     throw new Exception("La subtarea indicada no existe para la tarea suministrada. Se ha cancelado la operación.");
        // }

        if ($data['volumen_riego'] < 0) {
            throw new Exception("El volumen de riego no puede ser negativo. Se ha cancelado la operación.");
        }

        if (!isValidPickerTime($data['tiempo_riego'])) {
            throw new Exception("El tiempo de riego no es válido. Debe ser un tiempo válido. Se ha cancelado la operación.");
        }

        if (!isValidDate($data['fecha'])) {
            throw new Exception("La fecha indicada no es válida. Se ha cancelado la operación. Se recibió: " . $data['fecha']);
        }

        // if (!isTimeValid($data['hora'])) {
        //     throw new Exception("La hora de riego no es válida. Debe ser una hora válida. Se ha cancelado la operación.");
        // }

        $this->db->insert('z_riego', $data);
        return $this->db->insert_id();

    }


}