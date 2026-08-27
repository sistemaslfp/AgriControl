<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class PersonnelStatus_model extends CI_Model {

    // Obtener un listado de todos los estados
    public function getAllStatuses() {
        $query = $this->db->get('z_personal_estado');
        return $query->result(); // Retorna un array de objetos con todos los estados
    }

    // Obtener un estado por id
    public function getStatusById($id) {
        $query = $this->db->get_where('personnel_status', ['id' => $id]);
        return $query->row(); // Retorna un objeto con el estado o null si no se encuentra
    }

    // Eliminar un estado por id
    public function deleteStatus($id) {
        return $this->db->delete('personnel_status', ['id' => $id]); // Retorna true si la eliminación fue exitosa, false en caso contrario
    }

    // Crear un estado
    public function createStatus($descripcion_estado) {
        $data = [
            'descripcion_estado' => $descripcion_estado
        ];
        return $this->db->insert('personnel_status', $data); // Retorna true si la inserción fue exitosa, false en caso contrario
    }

    // Actualizar un estado por id
    public function updateStatus($id, $descripcion_estado) {
        $data = [
            'descripcion_estado' => $descripcion_estado
        ];
        return $this->db->update('personnel_status', $data, ['id' => $id]); // Retorna true si la actualización fue exitosa, false en caso contrario
    }
}
