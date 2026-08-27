<?php if (!defined('BASEPATH'))
    exit('No direct script access allowed');

class Postharvest extends Public_controller
{

    public function __construct()
    {
        parent::__construct();

        $this->load->database();
        $this->load->helper('url');

        $this->load->library('grocery_CRUD');

        $this->_init();

    }

    private function _init()
    {

    }

    public function index()
    {
        $this->load->helper('html');
        echo link_tag('assets/hacks.css');

        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('vw_postharvest_rpt_001');
        $crud->set_primary_key('id');
        $crud->set_subject('Poscosecha');
        $crud->unset_jquery();
        $crud->unset_add();
        $crud->unset_edit();
        $crud->unset_delete();
        // $crud->unset_read();

        // $crud->set_relation('lot_number', 'z_postharvest_predrying', 'start_date');
        // $crud->set_relation('lot_number', 'z_postharvest_predrying', 'end_date');
        $crud->columns('numero_proceso', 'supervisor', 'fecha_pesaje', 'peso', 'peso_mallas', 'peso_fruta_neto', 'dias_presecado', 'dias_fermentado', 'dias_secado_sol', 'dias_secado_maquina', 'fecha_pesaje_final', 'peso_final', 'rendimiento');
        $crud->display_as('numero_proceso', '#Proc.');

        $group = $this->ion_auth->get_users_groups()->row()->id;


        if ($group != 3) {
            $crud->add_action('Presecado', '', 'admin/book', 'fa-book', array($this, 'preDryingButton'));
            $crud->add_action('Fermentado', '', 'admin/book', 'fa-book', array($this, 'fermentationButton'));
            $crud->add_action('Secado Sol', '', 'admin/book', 'fa-book', array($this, 'sundryingButton'));
            $crud->add_action('Secado Máq.', '', 'admin/book', 'fa-book', array($this, 'machineDryingButton'));
            $crud->add_action('Resultado', '', 'admin/book', 'fa-book', array($this, 'resultsButton'));

            $crud->add_action('Calidad Fermentado', '', 'admin/book', 'fa-book', array($this, 'fermentationQualityButton'));
            $crud->add_action('Calidad Secado Sol', '', 'admin/book', 'fa-book', array($this, 'sunDryingQualityButton'));
            $crud->add_action('Calidad Secado Máquina', '', 'admin/book', 'fa-book', array($this, 'machineDryingQualityButton'));
        }



        $crud->callback_column('rendimiento', array($this, 'formatPercentage'));


        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);


    }

    public function Master()
    {
        $this->load->helper('html');
        echo link_tag('assets/hacks.css');

        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('vw_postharvest_rpt_001');
        $crud->set_primary_key('id');
        $crud->set_subject('Poscosecha');
        $crud->unset_jquery();
        $crud->unset_add();
        $crud->unset_edit();
        $crud->unset_delete();
        // $crud->unset_read();

        // $crud->set_relation('lot_number', 'z_postharvest_predrying', 'start_date');
        // $crud->set_relation('lot_number', 'z_postharvest_predrying', 'end_date');
        // $crud->columns('numero_proceso', 'supervisor', 'fecha_pesaje', 'peso', 'peso_mallas', 'peso_fruta_neto', 'dias_presecado', 'dias_fermentado', 'dias_secado_sol', 'dias_secado_maquina', 'fecha_pesaje_final', 'peso_final', 'rendimiento');
        $crud->display_as('numero_proceso', '#Proc.');

        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);

    }

    public function Predrying()
    {

        $group = $this->ion_auth->get_users_groups()->row()->id;

        if ($group == 3) {
            redirect('/', 'refresh');
        }

        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('z_postharvest_predrying');
        $crud->set_subject('Presecado');
        $crud->unset_jquery();
        $crud->unset_add();
        // $crud->unset_edit();
        $crud->unset_delete();

        $crud->columns('start_date', 'end_date', 'comments');
        $crud->edit_fields('start_date', 'end_date', 'comments');

        $crud->display_as('start_date', 'Fecha de inicio');
        $crud->display_as('end_date', 'Fecha de fin');
        $crud->display_as('comments', 'Comentarios');

        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);
    }

    public function Fermentation()
    {

        $group = $this->ion_auth->get_users_groups()->row()->id;

        if ($group == 3) {
            redirect('/', 'refresh');
        }

        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('z_postharvest_fermentation');
        $crud->set_subject('Fermentado');
        $crud->unset_jquery();
        $crud->unset_add();
        // $crud->unset_edit();
        $crud->unset_delete();

        $crud->columns('start_date', 'end_date', 'comments');
        $crud->edit_fields('start_date', 'end_date', 'comments');

        $crud->display_as('start_date', 'Fecha de inicio');
        $crud->display_as('end_date', 'Fecha de fin');
        $crud->display_as('comments', 'Comentarios');

        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);
    }

    public function SunDrying()
    {

        $group = $this->ion_auth->get_users_groups()->row()->id;

        if ($group == 3) {
            redirect('/', 'refresh');
        }

        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('z_postharvest_sundrying');
        $crud->set_subject('Secado Sol');
        $crud->unset_jquery();
        $crud->unset_add();
        // $crud->unset_edit();
        $crud->unset_delete();

        $crud->columns('start_date', 'end_date', 'comments');
        $crud->edit_fields('start_date', 'end_date', 'comments');

        $crud->display_as('start_date', 'Fecha de inicio');
        $crud->display_as('end_date', 'Fecha de fin');
        $crud->display_as('comments', 'Comentarios');

        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);
    }

    public function MachineDrying()
    {

        $group = $this->ion_auth->get_users_groups()->row()->id;

        if ($group == 3) {
            redirect('/', 'refresh');
        }

        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('z_postharvest_machinedrying');
        $crud->set_subject('Secado Máquina');
        $crud->unset_jquery();
        $crud->unset_add();
        // $crud->unset_edit();
        $crud->unset_delete();

        $crud->columns('start_date', 'end_date', 'comments');
        $crud->edit_fields('start_date', 'end_date', 'comments');

        $crud->display_as('start_date', 'Fecha de inicio');
        $crud->display_as('end_date', 'Fecha de fin');
        $crud->display_as('comments', 'Comentarios');

        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);
    }

    public function Results()
    {

        $group = $this->ion_auth->get_users_groups()->row()->id;

        if ($group == 3) {
            redirect('/', 'refresh');
        }

        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('z_postharvest_result');
        $crud->set_subject('Resultado');
        $crud->unset_jquery();
        $crud->unset_add();
        // $crud->unset_edit();
        $crud->unset_delete();

        $crud->columns('weighing_date', 'output_weight', 'comments');
        $crud->edit_fields('weighing_date', 'output_weight', 'comments');

        $crud->display_as('weighing_date', 'Fecha pesaje');
        $crud->display_as('output_weight', 'Peso Final');
        $crud->display_as('comments', 'Comentarios');

        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);
    }

    public function FermentationQuality()
    {

        $group = $this->ion_auth->get_users_groups()->row()->id;

        if ($group == 3) {
            redirect('/', 'refresh');
        }

        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('z_postharvest_fermentationquality');
        $crud->set_subject('Calidad Fermentado');
        $crud->unset_jquery();
        $crud->unset_add();
        // $crud->unset_edit();
        $crud->unset_delete();

        $crud->edit_fields('lot_id', 'stage', 'sample_date', 'good', 'light', 'violet', 'good_perc', 'light_perc', 'violet_perc', 'picture1');

        $crud->callback_edit_field('picture1', array($this, 'edit_field_picture1_link'));

        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);
    }

    public function DryingQuality()
    {

        $group = $this->ion_auth->get_users_groups()->row()->id;

        if ($group == 3) {
            redirect('/', 'refresh');
        }

        $crud = new grocery_CRUD();

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('z_postharvest_dryingquality');
        $crud->set_subject('Calidad Secado');
        // $crud->unset_jquery();
        $crud->unset_add();
        // $crud->unset_edit();
        $crud->unset_delete();

        $crud->edit_fields('lot_id', 'stage', 'sample_date', 'bean_moisture1', 'bean_moisture2', 'bean_moisture2', 'bean_moisture3', 'avg_bean_moisture', 'sample_bean_count', 'sample_bean_count', 'bean_index_grams', 'percent_empty_beans', 'picture1', 'picture2', 'picture3');

        $crud->callback_edit_field('picture1', array($this, 'edit_field_picture1_link_drying'));
        $crud->callback_edit_field('picture2', array($this, 'edit_field_picture2_link_drying'));
        $crud->callback_edit_field('picture3', array($this, 'edit_field_picture3_link_drying'));

        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);
    }

    public function callback_picture1_link($value, $row)
    {
        $lot_id = $row->lot_id;
        $picture1 = $this->get_picture1($lot_id);

        if ($picture1) {
            return '<a href="' . base_url("uploads/" . $picture1) . '" target="_blank">Ver Imagen</a>';
        } else {
            return 'Sin Imagen';
        }
    }

    public function edit_field_picture1_link($value, $primary_key)
    {
        // Obtener el lot_id usando el primary_key
        $lot_id = $this->get_lot_id($primary_key);
        $picture1 = $this->get_picture1($lot_id);

        if ($picture1) {
            return '<a href="' . base_url("uploads/" . $picture1) . '" target="_blank">Ver Imagen</a>';
        } else {
            return 'Sin Imagen';
        }
    }

    public function edit_field_picture1_link_drying($value, $primary_key)
    {
        // Obtener el lot_id usando el primary_key
        $lot_id = $this->get_lot_id_drying($primary_key);
        $picture1 = $this->get_picture_sundrying1($lot_id);

        if ($picture1) {
            return '<a href="' . base_url("uploads/" . $picture1) . '" target="_blank">Ver Imagen</a>';
        } else {
            return 'Sin Imagen';
        }
    }

    public function edit_field_picture2_link_drying($value, $primary_key)
    {
        // Obtener el lot_id usando el primary_key
        $lot_id = $this->get_lot_id_drying($primary_key);
        $picture2 = $this->get_picture_sundrying2($lot_id);

        if ($picture2) {
            return '<a href="' . base_url("uploads/" . $picture2) . '" target="_blank">Ver Imagen</a>';
        } else {
            return 'Sin Imagen';
        }
    }

    public function edit_field_picture3_link_drying($value, $primary_key)
    {
        // Obtener el lot_id usando el primary_key
        $lot_id = $this->get_lot_id_drying($primary_key);
        $picture1 = $this->get_picture_sundrying3($lot_id);

        if ($picture1) {
            return '<a href="' . base_url("uploads/" . $picture1) . '" target="_blank">Ver Imagen</a>';
        } else {
            return 'Sin Imagen';
        }
    }

    private function get_picture1($lot_id)
    {
        $this->db->select('picture1');
        $this->db->from('vw_postharvest_photos_fermentation');
        $this->db->where('lot_id', $lot_id);
        $query = $this->db->get();
        $result = $query->row();

        if ($result && !empty($result->picture1)) {
            return $result->picture1;
        } else {
            return null;
        }
    }

    private function get_picture_sundrying1($lot_id)
    {
        $this->db->select('picture1');
        $this->db->from('vw_postharvest_photos_sundrying');
        $this->db->where('lot_id', $lot_id);
        $query = $this->db->get();
        $result = $query->row();

        if ($result && !empty($result->picture1)) {
            return $result->picture1;
        } else {
            return null;
        }
    }

    private function get_picture_sundrying2($lot_id)
    {
        $this->db->select('picture2');
        $this->db->from('vw_postharvest_photos_sundrying');
        $this->db->where('lot_id', $lot_id);
        $query = $this->db->get();
        $result = $query->row();

        if ($result && !empty($result->picture2)) {
            return $result->picture2;
        } else {
            return null;
        }
    }

    private function get_picture_sundrying3($lot_id)
    {
        $this->db->select('picture3');
        $this->db->from('vw_postharvest_photos_sundrying');
        $this->db->where('lot_id', $lot_id);
        $query = $this->db->get();
        $result = $query->row();

        if ($result && !empty($result->picture3)) {
            return $result->picture3;
        } else {
            return null;
        }
    }

    private function get_lot_id($primary_key)
    {
        $this->db->select('lot_id');
        $this->db->from('z_postharvest_fermentationquality'); // Asumiendo que esta es la tabla donde se encuentra el lot_id
        $this->db->where('id', $primary_key); // 'id' es el campo clave primaria en esta tabla
        $query = $this->db->get();
        $result = $query->row();

        if ($result) {
            return $result->lot_id;
        } else {
            return null;
        }
    }

    private function get_lot_id_drying($primary_key)
    {
        $this->db->select('lot_id');
        $this->db->from('z_postharvest_dryingquality'); // Asumiendo que esta es la tabla donde se encuentra el lot_id
        $this->db->where('id', $primary_key); // 'id' es el campo clave primaria en esta tabla
        $query = $this->db->get();
        $result = $query->row();

        if ($result) {
            return $result->lot_id;
        } else {
            return null;
        }
    }

    function formatPercentage($number)
    {
        return number_format($number * 100, 2) . '%';
    }

    function preDryingButton($primary_key, $row)
    {
        if ($row->id_presecado) {
            $group = $this->ion_auth->get_users_groups()->row()->id;


            if ($group == 3) {
                return site_url('Postharvest/Predrying/lot_number/' . $row->id . '/read/' . $row->id_presecado);
            }

            if ($group != 1 && $group != 2) {
                return site_url('Postharvest/Predrying/lot_number/' . $row->id . '/edit/' . $row->id_presecado);
            }

        } else {
            return site_url('Postharvest/#');
        }
    }

    function fermentationButton($primary_key, $row)
    {
        if ($row->id_fermentado) {
            $group = $this->ion_auth->get_users_groups()->row()->id;


            if ($group == 3) {
                return site_url('Postharvest/Fermentation/lot_number/' . $row->id . '/read/' . $row->id_fermentado);
            }

            if ($group != 1 && $group != 2) {
                return site_url('Postharvest/Fermentation/lot_number/' . $row->id . '/edit/' . $row->id_fermentado);
            }

        } else {
            return site_url('Postharvest/#');
        }
    }

    function sundryingButton($primary_key, $row)
    {
        if ($row->id_secado_sol) {
            $group = $this->ion_auth->get_users_groups()->row()->id;


            if ($group == 3) {
                return site_url('Postharvest/SunDrying/lot_number/' . $row->id . '/read/' . $row->id_secado_sol);
            }

            if ($group != 1 && $group != 2) {
                return site_url('Postharvest/SunDrying/lot_number/' . $row->id . '/edit/' . $row->id_secado_sol);
            }

        } else {
            return site_url('Postharvest/#');
        }
    }

    function machineDryingButton($primary_key, $row)
    {
        if ($row->id_secado_maquina) {
            $group = $this->ion_auth->get_users_groups()->row()->id;


            if ($group == 3) {
                return site_url('Postharvest/MachineDrying/lot_number/' . $row->id . '/read/' . $row->id_secado_maquina);
            }

            if ($group != 1 && $group != 2) {
                return site_url('Postharvest/MachineDrying/lot_number/' . $row->id . '/edit/' . $row->id_secado_maquina);
            }

        } else {
            return site_url('Postharvest/#');
        }
    }

    function resultsButton($primary_key, $row)
    {
        if ($row->id_resultados) {
            $group = $this->ion_auth->get_users_groups()->row()->id;


            if ($group == 3) {
                return site_url('Postharvest/Results/lot_number/' . $row->id . '/read/' . $row->id_resultados);
            }

            if ($group != 1 && $group != 2) {
                return site_url('Postharvest/Results/lot_number/' . $row->id . '/edit/' . $row->id_resultados);
            }

        } else {
            return site_url('Postharvest/#');
        }
    }

    function fermentationQualityButton($primary_key, $row)
    {
        if ($row->id_calidad_fermentado) {
            $group = $this->ion_auth->get_users_groups()->row()->id;


            if ($group == 3) {
                return site_url('Postharvest/FermentationQuality/lot_number/' . $row->id . '/read/' . $row->id_calidad_fermentado);
            }

            if ($group != 1 && $group != 2) {
                return site_url('Postharvest/FermentationQuality/lot_number/' . $row->id . '/edit/' . $row->id_calidad_fermentado);
            }

        } else {
            return site_url('Postharvest/#');
        }
    }

    function sunDryingQualityButton($primary_key, $row)
    {
        if ($row->id_calidad_secadosol) {
            return site_url('Postharvest/DryingQuality/lot_number/' . $row->id . '/edit/' . $row->id_calidad_secadosol);
        } else {
            return site_url('Postharvest/#');
        }
    }

    function machineDryingQualityButton($primary_key, $row)
    {
        if ($row->id_calidad_secadomaquina) {
            return site_url('Postharvest/DryingQuality/lot_number/' . $row->id . '/edit/' . $row->id_calidad_secadomaquina);
        } else {
            return site_url('Postharvest/#');
        }
    }

}