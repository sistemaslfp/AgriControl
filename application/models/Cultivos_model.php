<?php

class Cultivos_model  extends CI_Model  {

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
        $this->db->select('id, estado, UPPER(nombre) as nombre');
        $this->db->order_by('nombre');
        $result = $this->db->get('z_cultivo');
        $cultivos = $result->result_array();
        return $cultivos;
    }
 
}