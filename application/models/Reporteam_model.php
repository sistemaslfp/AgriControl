<?php

class Reporteam_model  extends CI_Model  {

    function __construct()
    {
        parent::__construct();
        $this->load->database();
    }

    function db_table_exists($table_name = null)
    {
    	return $this->db->table_exists($table_name);
    }

    function get_am_view($anno, $semana) {
        $this->db->select('*');
        $this->db->where('semana', $semana);
        $this->db->where('anno', $anno);
        $this->db->order_by('subtarea', 'ASC');
        $lotesResult = $this->db->get('vw_lfp_reporte_am')->result();
        return $lotesResult;

    }

    function get_annos() {
        $this->db->select('anno');
        $this->db->distinct();
        $this->db->order_by('anno', 'ASC');
        $annosResult = $this->db->get('vw_lfp_reporte_am')->result();
        return $annosResult;
    }

    function get_semanas() {
        $this->db->select('semana');
        $this->db->distinct();
        $this->db->order_by('semana', 'ASC');
        $semanasResult = $this->db->get('vw_lfp_reporte_am')->result();
        return $semanasResult;
    }

    // Esta función no se está utilizando, se mantiene como código de ejemplo
    // y está pendiente de ser retirada y traspadada al tanque de código

    function get_pivot_base($semana) {
        $this->db->select('lote');
        $this->db->distinct();
        $this->db->where('semana', $semana);
        $this->db->order_by('lote', 'ASC');
        $lotesResult = $this->db->get('vw_lfp_reporte_am')->result();

        $lotes = array();
    
        foreach ($lotesResult as $result) {
            $lotes[] = $result->lote;
        }

        $templateSQL = "COUNT(
            CASE
              WHEN lote = '|LOTE|'
               THEN lote
            END
        ) as 'conteo_|LOTE|'";

        $lotesSQL = implode( ",".PHP_EOL, array_map( function( $lote ) use ( $templateSQL ) {
            return preg_replace( '/\|LOTE\|/', $lote, $templateSQL ) ;
        }, $lotes ) );

        $finalSQL = "SELECT subtarea, 
        $lotesSQL
        FROM vw_lfp_reporte_am
        WHERE semana = $semana
        GROUP BY subtarea
        ;";

        $finalSQL.= PHP_EOL;

        $result = $this->db->query($finalSQL)->result();

        // print_r($finalSQL);

        // return;

        // $filas = array();
    
        // foreach ($result as $res) {
        //     $filas[] = $res->lote;
        // }

        return $result;
    }

}