<?php

class Personal_model  extends CI_Model  {

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
        $this->db->select('id, id_finca, UPPER(nombre) as nombre, rol, rol_app, eregistro');
        $this->db->where('eregistro', 'A' );
        // $this->db->where('id_finca', 2);
        // $this->db->where('rol', 8);
        $this->db->order_by('nombre');
        $result = $this->db->get('z_personal');
        $personal = $result->result_array();
        return $personal;
    }

    public function get_supervisores(){
        $this->db->select('id, nombre, rol, estado');
        $this->db->where('rol', 8 );
        $result = $this->db->get('z_personal');
        $personal = $result->result_array();
        return $personal;
    }

    public function get_operarios(){
        $this->db->select('id, nombre, rol, estado');
        // $this->db->where('rol', '2');
        $this->db->where_not_in('rol',array('8'));
        $result = $this->db->get('z_personal');
        $personal = $result->result_array();
        return $personal;
    }

    public function create_personal($data) {
        $this->db->insert('z_personal', $data);
    }

    function existsRecord($key)
    {
        $this->db->where('id',$key);
        $query = $this->db->get('z_personal');
        
        if ($query->num_rows() > 0){
            return true;
        }
        else{
            return false;
        }
    }   
 
}