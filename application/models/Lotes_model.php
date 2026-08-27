<?php

class Lotes_model  extends CI_Model  {

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
        $this->db->select('id, finca_id, ha, estado, UPPER(lote) as lote');
        $this->db->order_by('lote');
        $result = $this->db->get('z_lote');
        $lotes = $result->result_array();
        return $lotes;
    }

    public function get_by_finca($finca_id) {
        $this->db->select('id, finca_id, ha, estado, lote');
        $this->db->where('finca_id', $finca_id);
        $result = $this->db->get('z_lote');
        $lotes = $result->result_array();
        return $lotes;       
    }

    function existsRecord($key)
    {
        $this->db->where('id',$key);
        $query = $this->db->get('z_lote');
        
        if ($query->num_rows() > 0){
            return true;
        }
        else{
            return false;
        }
    }  

    function getModules($id) {
        $this->db->where('lote_id', $id);
        $query = $this->db->get('z_modulo');
        return $query;
    }

    function isValidLot($farm_id, $lot_id) {
        $this->db->where('id', $lot_id);
        $this->db->where('finca_id', $farm_id);
        $query = $this->db->get('z_lote');
        
        // Comprueba si se encontró algún registro
        if ($query->num_rows() > 0) {
            return true; // El módulo existe
        } else {
            return false; // El módulo no existe
        } 
    }
    
 
}