<?php

class Tareas_model  extends CI_Model  {

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
        $this->db->select('id, UPPER(nombre) as tarea, cultivos_id, estado');
        $this->db->order_by('nombre');
        $result = $this->db->get('z_tarea');
        $tareas = $result->result_array();
        return $tareas;
    }

    function existsRecord($key)
    {
        $this->db->where('id',$key);
        $query = $this->db->get('z_tarea');
        
        if ($query->num_rows() > 0){
            return true;
        }
        else{
            return false;
        }
    }  
 
}