<?php

class Am_model  extends CI_Model  {

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
        $this->db->select('*');
        $result = $this->db->get('z_tabla_am');
        $am = $result->result_array();
        return $am;
    }

    public function create_am($data) {
        try
        {
            $this->db->insert('z_tabla_am', $data);
            return $this->db->insert_id();
        }
        catch( Exception $e )
        {
            log_message('Hubo un error alguna vez');
            log_message( 'error', $e->getMessage( ) . ' in ' . $e->getFile() . ':' . $e->getLine() );
            // on error
        }
        
    }

    public function close_am($finca_id, $responsable_id, $trabajador_id) {
        $fecha = date('Y-m-d');
        $data = array (
            'tiene_pm' => '1'
        );

        $this->db->where('finca', $finca_id);
        $this->db->where('responsable_id', $responsable_id);
        $this->db->where('personal_id', $trabajador_id);
        $this->db->where('fecha', $fecha);
        $this->db->update('z_tabla_am', $data);

        if ($this->db->trans_status() === FALSE)
        {
            return false;
        }

        return true;
    }

    public function get_fincas_pm_pendientes() {
        $fecha = date('Y-m-d');
        $query = $this->db
            ->select('f.id, f.nombre, am.fecha')
            ->join('z_finca f', 'am.finca = f.id')
            ->where('am.tiene_pm', '0')
            ->where('am.fecha', $fecha)
            ->group_by(array('f.id', 'f.nombre', 'am.fecha'))
            ->get('z_tabla_am am');

        $result = $query ? $query->result() : [];
        return $result;
    } 

    public function get_supervisores_pm_pendientes($finca_id) {
        $fecha = date('Y-m-d');
        $query = $this->db
            ->select('s.id, s.nombre, am.fecha')
            ->join('z_personal s', 'am.responsable_id = s.id')
            ->where('am.tiene_pm', '0')
            ->where('am.fecha', $fecha)
            ->where('am.finca', $finca_id)
            ->group_by(array('s.id', 's.nombre', 'am.fecha'))
            ->get('z_tabla_am am');

        $result = $query ? $query->result() : [];
        return $result;

    } 

    public function get_operarios_pm_pendientes($supervisor_id, $finca_id) {
        $fecha = date('Y-m-d');
        $query = $this->db
            ->select('o.id, o.nombre, am.fecha')
            ->join('z_personal o', 'am.personal_id = o.id')
            ->where('am.tiene_pm', '0')
            ->where('am.fecha', $fecha)
            ->where('am.responsable_id', $supervisor_id)
            ->where('am.finca', $finca_id)
            ->group_by(array('o.id', 'o.nombre', 'am.fecha'))
            ->get('z_tabla_am am');

        $result = $query ? $query->result() : [];
        return $result;

    } 
}