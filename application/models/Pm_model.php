<?php

class Pm_model  extends CI_Model  {

    function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    function db_table_exists($table_name = null)
    {
    	return $this->db->table_exists($table_name);
    }

    public function create_pm($data) {
        
        try
        {
            $response['id'] = $this->db->insert('z_tabla_pm', $data);

            if ($response['id'] > 0 ) {
                
            } else {
                $response['error'] =  $this->db->error(); 
            }

            return $response;
            
        }
        catch( Exception $e )
        {
            log_message( 'error', $e->getMessage( ) . ' in ' . $e->getFile() . ':' . $e->getLine() );
            // on error
        }
    }

    public function date_filter($date) {
        $this->db->select("*");
        $this->db->from("vw_reporte_pm");
        $this->db->where("fecha", $date);
        return $this->db->get();
    }

    
}