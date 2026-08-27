<?php

class Postharvest_model extends CI_Model
{
    public function __construct()
    {
        parent::__construct();
    }

    public function createWeightFromAPI($data)
    {

        $this->db->insert('z_postharvest_weight', $data);
        return $this->db->insert_id();

    }

    public function createLotHarvestFromAPI($data)
    {
        if (is_array($data) && !empty($data)) {
            return $this->db->insert_batch('z_postharvest_lotsharvest', $data); // Reemplaza 'table_name' con el nombre de tu tabla
        }

        return 0;
    }

    public function createPredryingFromAPI($data)
    {

        $this->db->insert('z_postharvest_predrying', $data);
        return $this->db->insert_id();

    }

    public function createFermentationFromAPI($data)
    {

        $this->db->insert('z_postharvest_fermentation', $data);
        return $this->db->insert_id();

    }

    public function createSunDryingFromAPI($data)
    {

        $this->db->insert('z_postharvest_sundrying', $data);
        return $this->db->insert_id();

    }

    public function createMachineDryingFromAPI($data)
    {

        $this->db->insert('z_postharvest_machinedrying', $data);
        return $this->db->insert_id();

    }

    public function createResultDataFromAPI($data)
    {
        $this->db->insert('z_postharvest_result', $data);
        return $this->db->insert_id();
    }

    public function createFermentationQualityDataFromAPI($data)
    {
        $this->db->insert('z_postharvest_fermentationquality', $data);
        return $this->db->insert_id();
    }

    public function createDryingQualityDataFromAPI($data)
    {
        $this->db->insert('z_postharvest_dryingquality', $data);
        return $this->db->insert_id();
    }

    public function save_image($data)
    {
        return $this->db->insert('z_postharvest_photos', $data);
    }

    // public function getHarvestLots()
    // {

    //     $this->db->select('lot_date, lot_number, lot_weight');
    //     $this->db->where('lot_number', $finca_id);
    //     $result = $this->db->get('vw_harvest_pending_lots');
    //     $aresult = $result->result_array();
    //     return $aresult;


    // }

    public function get_pending_lots()
    {
        $this->db->select('lot_date, lot_weight', 'id');
        $this->db->from('vw_harvest_pending_lots');
        $this->db->where('(id IS NULL OR id = "")', null, false);
        $this->db->where('lot_date >=', '2024-08-05');

        $query = $this->db->get();
        return $query->result_array();
    }

}



