<?php

class Unidad_labor_model  extends CI_Model  {

    function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    function db_table_exists($table_name = null)
    {
    	return $this->db->table_exists($table_name);
    }

    public function get_all(){
        $this->db->select('id, UPPER(ulabor_nombre) as ulabor_nombre');
        $this->db->order_by('ulabor_nombre');
        $result = $this->db->get('z_ulabor');
        $ulabor = $result->result_array();
        return $ulabor;
    }

    public function get_labor($subtarea_id){

        // $this->db->select('id, ulabor_nombre');
        // $this->db->where('id', $id);
        // $result = $this->db->get('z_ulabor');
        // $ulabor = $result->result_array();
        // return $ulabor;

        $fecha = date('Y-m-d');
        $query = $this->db
            ->select('s.unidad_labor_id, u.ulabor_nombre')
            ->join('z_ulabor u', 's.unidad_labor_id = u.id')
            ->where('s.id', $subtarea_id)
            ->get('z_subtarea s');

            $result = $query ? $query->result() : [];
            return $result;
    }

}