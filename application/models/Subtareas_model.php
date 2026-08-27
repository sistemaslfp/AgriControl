<?php

class Subtareas_model extends CI_Model
{

    function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    function db_table_exists($table_name = null)
    {
        return $this->db->table_exists($table_name);
    }

    public function get_all()
    {
        $this->db->select('id, UPPER(nombre_subtarea) as nombre_subtarea, unidad_labor_id, id_finca');
        $this->db->order_by('nombre_subtarea');
        $result = $this->db->get('z_subtarea');
        $subtareas = $result->result_array();
        return $subtareas;
    }

    function existsRecord($key)
    {
        $this->db->where('id', $key);
        $query = $this->db->get('z_subtarea');

        if ($query->num_rows() > 0) {
            return true;
        } else {
            return false;
        }
    }

    function isValidSubtask($subtask_id)
    {
        $this->db->where('id', $subtask_id);
        $query = $this->db->get('z_subtarea');

        if ($query->num_rows() > 0) {
            return true;
        } else {
            return false;
        }
    }

}