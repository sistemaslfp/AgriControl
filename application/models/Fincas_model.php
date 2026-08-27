<?php

class Fincas_model  extends CI_Model  {

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
        $this->db->select('id, nombre, ha');
        $result = $this->db->get('z_finca');
        $fincas = $result->result_array();
        return $fincas;
    }
    
    function getFincasCombobox()
    {
        $query = $this->db->get('z_finca');
        $result = $query->result();

        $finca_id = array('0');
        $finca_nombre = array('-TODAS LAS FINCAS-');
        
        for ($i = 0; $i < count($result); $i++)
        {
            array_push($finca_id, $result[$i]->id);
            array_push($finca_nombre, $result[$i]->nombre);
        }
        return array_combine($finca_id, $finca_nombre);
    }    

    function existsRecord($key)
    {
        $this->db->where('id',$key);
        $query = $this->db->get('z_finca');
        
        if ($query->num_rows() > 0){
            return true;
        }
        else{
            return false;
        }
    }    
 
}