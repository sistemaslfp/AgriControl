<?php

class Modulos_model  extends CI_Model  {

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
        $this->db->select('id, estado, lote_id, UPPER(modulo) as modulo');
        $this->db->order_by('modulo');
        $result = $this->db->get('z_modulo');
        $modulos = $result->result_array();
        return $modulos;
    }

    public function get_by_lote($lote_id){
        $this->db->select('id, estado, ha, lote_id, modulo');
        $this->db->where('lote_id', $lote_id);
        $result = $this->db->get('z_modulo');
        $modulos = $result->result_array();
        return $modulos;
    }

    function isValidModule($moduleID, $loteID) {
        $this->db->where('id', $moduleID);
        $this->db->where('lote_id', $loteID);
        $query = $this->db->get('z_modulo');
        
        // Comprueba si se encontró algún registro
        if ($query->num_rows() > 0) {
            return true; // El módulo existe
        } else {
            return false; // El módulo no existe
        }
    }
 
}