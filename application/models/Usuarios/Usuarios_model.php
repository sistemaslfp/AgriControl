<?php

class Usuarios_model  extends CI_Model  {

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
        $this->db->select('id, nombre, rol, estado');
        $result = $this->db->get('z_personal');
        $users = $result->result_array();
        return $users;
    }
 
}