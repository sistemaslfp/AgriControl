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

        $this->load->model('fincas_model');

        $this->_init();

    }

    private function _init()
    {

    }

    public function index()
    {
        $crud = new grocery_CRUD();

        // Cualquier echo antes de render() rompe la exportacion: los headers del archivo ya no salen.
        if (!in_array($crud->getState(), array('export', 'print'))) {
            $this->load->helper('html');
            echo link_tag('assets/hacks.css');
        }

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('vw_lfp_postharvest_rpt');
        $crud->set_primary_key('id');
        $crud->set_subject('Poscosecha');
        $crud->unset_jquery();
        $crud->unset_add();
        $crud->unset_edit();
        $crud->unset_delete();
        // $crud->unset_read();

        // $crud->set_relation('lot_number', 'z_postharvest_predrying', 'start_date');
        // $crud->set_relation('lot_number', 'z_postharvest_predrying', 'end_date');
        $crud->columns('numero_proceso', 'supervisor', 'fi_presecado', 'fecha_pesaje', 'peso', 'peso_mallas', 'peso_fruta_neto', 'dias_presecado', 'dias_fermentado', 'dias_secado_sol', 'dias_secado_maquina', 'fecha_pesaje_final', 'peso_final', 'rendimiento');
        $crud->display_as('numero_proceso', '#Proc.');
        $crud->display_as('fi_presecado', 'Inicio proceso');
        $crud->callback_column('fi_presecado', array($this, '_inicioProcesoColumna'));
        $crud->order_by('fi_presecado', 'desc');

        $this->_filtrarPorInicio($crud);

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
        $output->data = array('listadoFincas' => $this->fincas_model->getFincasCombobox());

        $this->load->view('Crud/date-range_filter', (array) $output);


    }

    public function Master()
    {
        $crud = new grocery_CRUD();

        // Cualquier echo antes de render() rompe la exportacion: los headers del archivo ya no salen.
        if (!in_array($crud->getState(), array('export', 'print'))) {
            $this->load->helper('html');
            echo link_tag('assets/hacks.css');
        }

        //$crud->set_theme('tablestrap4_datefilter');
        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('vw_lfp_postharvest_rpt');
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
        $crud->order_by('fi_presecado', 'desc');

        $this->_filtrarPorInicio($crud);

        $output = $crud->render();
        $output->data = array('listadoFincas' => $this->fincas_model->getFincasCombobox());

        $this->load->view('Crud/date-range_filter', (array) $output);

    }

    // El proceso arranca con el presecado; si no se registro, con el pesaje (la app precarga
    // el inicio del presecado con esa misma fecha). pc_proceso no tiene finca: sale de sus cosechas.
    private function _filtrarPorInicio($crud)
    {
        $state = $crud->getState();

        if ($state == 'export' || $state == 'print') {
            $segmentos = $this->uri->segment_array();
            $valorDe = function ($clave) use ($segmentos) {
                $i = array_search($clave, $segmentos, true);
                return ($i !== false && isset($segmentos[$i + 1])) ? $segmentos[$i + 1] : null;
            };
            $desde = $valorDe('fechaDesde');
            $hasta = $valorDe('fechaHasta');
            $finca = $valorDe('finca');
        } else {
            if (!$this->input->get('fechaDesde') || !$this->input->get('fechaHasta')) {
                $_GET['fechaDesde'] = date('m/d/Y', strtotime('-1 year'));
                $_GET['fechaHasta'] = date('m/d/Y');
            }
            if (!isset($_GET['id_finca'])) {
                $_GET['id_finca'] = 0;
            }
            $desde = $this->input->get('fechaDesde');
            $hasta = $this->input->get('fechaHasta');
            $finca = $this->input->get('id_finca');
        }

        $inicio = 'COALESCE(fi_presecado, fecha_pesaje)';

        if ($desde && strtotime($desde) !== false) {
            $crud->where($inicio . ' >= ' . $this->db->escape(date('Y-m-d', strtotime($desde))), null, false);
        }

        if ($hasta && strtotime($hasta) !== false) {
            $crud->where($inicio . ' < ' . $this->db->escape(date('Y-m-d', strtotime($hasta . ' +1 day'))), null, false);
        }

        if ((int) $finca > 0) {
            $crud->where('EXISTS (SELECT 1 FROM pc_proceso_cosecha pcc'
                . ' JOIN lfp_cosecha c ON c.id = pcc.cosecha_id'
                . ' JOIN lfp_am a ON a.id = c.lfp_am_id'
                . ' WHERE pcc.pc_proceso_id = vw_lfp_postharvest_rpt.id AND a.finca_id = ' . (int) $finca . ')', null, false);
        }
    }

    public function _inicioProcesoColumna($value, $row)
    {
        $fecha = $value ? $value : $row->fecha_pesaje;
        return $fecha ? date('Y-m-d - H:i', strtotime($fecha)) : '';
    }

    public function Predrying()
    {
        $this->_editarEtapa('presecado', 'Presecado');
    }

    public function Fermentation()
    {
        $this->_editarEtapa('fermentado', 'Fermentado');
    }

    public function SunDrying()
    {
        $this->_editarEtapa('secado_sol', 'Secado Sol');
    }

    public function MachineDrying()
    {
        $this->_editarEtapa('secado_maq', 'Secado Máquina');
    }

    public function Results()
    {
        $group = $this->ion_auth->get_users_groups()->row()->id;

        if ($group == 3) {
            redirect('/', 'refresh');
        }

        $crud = $this->_crudEtapa('resultado', 'Resultado');

        $crud->columns('inicio', 'peso_final', 'comentario');

        // Grocery CRUD revienta en "read" con campos que no son columnas: solo se declaran al editar.
        if ($crud->getState() == 'read') {
            $crud->edit_fields('inicio', 'comentario');
        } else {
            $crud->edit_fields('inicio', 'peso_final', 'comentario', 'fin');
            $crud->field_type('fin', 'invisible');
        }

        $crud->display_as('inicio', 'Fecha pesaje');
        $crud->display_as('peso_final', 'Peso Final');
        $crud->display_as('comentario', 'Comentarios');

        $crud->required_fields('inicio');
        $crud->callback_edit_field('inicio', array($this, '_campoInicio'));
        $crud->callback_column('peso_final', array($this, '_pesoFinalColumna'));
        $crud->callback_edit_field('peso_final', array($this, '_pesoFinalCampo'));
        $crud->callback_read_field('peso_final', array($this, '_pesoFinalCampo'));
        $crud->callback_before_update(array($this, 'resultadoAntesDeActualizar'));

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

        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('pc_calidad_fermentacion');
        $crud->set_subject('Calidad Fermentado');
        $crud->unset_jquery();
        $crud->unset_add();
        $crud->unset_delete();

        $crud->columns('pc_proceso_id', 'fecha_muestra', 'buena', 'ligera', 'violeta');
        $crud->edit_fields('pc_proceso_id', 'fecha_muestra', 'buena', 'ligera', 'violeta');
        if ($crud->getState() != 'read') {
            $crud->edit_fields('pc_proceso_id', 'fecha_muestra', 'buena', 'ligera', 'violeta', 'foto1');
        }
        $crud->required_fields('fecha_muestra');
        $crud->field_type('pc_proceso_id', 'readonly');
        $crud->set_relation('pc_proceso_id', 'pc_proceso', 'lot_code');

        $crud->display_as('pc_proceso_id', 'Partida')
            ->display_as('fecha_muestra', 'Fecha muestra')
            ->display_as('buena', 'Buena')
            ->display_as('ligera', 'Ligera')
            ->display_as('violeta', 'Violeta')
            ->display_as('foto1', 'Foto');

        $crud->callback_edit_field('foto1', array($this, 'fotoFermentado'));
        $crud->callback_read_field('foto1', array($this, 'fotoFermentado'));

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

        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('pc_calidad_secado');
        $crud->set_subject('Calidad Secado');
        $crud->unset_add();
        $crud->unset_delete();

        $crud->columns('pc_proceso_id', 'etapa', 'fecha_muestra', 'humedad_promedio', 'granos_muestra', 'indice_grano_g', 'granos_vacios_pct');
        $crud->edit_fields('pc_proceso_id', 'etapa', 'fecha_muestra', 'humedad_1', 'humedad_2', 'humedad_3', 'humedad_promedio', 'granos_muestra', 'indice_grano_g', 'granos_vacios_pct');
        if ($crud->getState() != 'read') {
            $crud->edit_fields('pc_proceso_id', 'etapa', 'fecha_muestra', 'humedad_1', 'humedad_2', 'humedad_3', 'humedad_promedio', 'granos_muestra', 'indice_grano_g', 'granos_vacios_pct', 'foto1', 'foto2', 'foto3');
        }
        $crud->required_fields('fecha_muestra', 'humedad_1', 'humedad_2', 'humedad_3');
        $crud->field_type('pc_proceso_id', 'readonly');
        $crud->field_type('etapa', 'readonly');
        $crud->field_type('humedad_promedio', 'readonly');
        $crud->set_relation('pc_proceso_id', 'pc_proceso', 'lot_code');

        $crud->display_as('pc_proceso_id', 'Partida')
            ->display_as('etapa', 'Etapa')
            ->display_as('fecha_muestra', 'Fecha muestra')
            ->display_as('humedad_1', 'Humedad 1')
            ->display_as('humedad_2', 'Humedad 2')
            ->display_as('humedad_3', 'Humedad 3')
            ->display_as('humedad_promedio', 'Humedad promedio')
            ->display_as('granos_muestra', 'Granos muestra')
            ->display_as('indice_grano_g', 'Índice grano (g)')
            ->display_as('granos_vacios_pct', '% granos vacíos')
            ->display_as('foto1', 'Foto 1')
            ->display_as('foto2', 'Foto 2')
            ->display_as('foto3', 'Foto 3');

        foreach (array(1, 2, 3) as $orden) {
            $crud->callback_edit_field('foto' . $orden, array($this, 'fotoSecado' . $orden));
            $crud->callback_read_field('foto' . $orden, array($this, 'fotoSecado' . $orden));
        }

        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);
    }

    private function _crudEtapa($etapa, $titulo)
    {
        $crud = new grocery_CRUD();

        $crud->set_theme('tablestrap4_datefilter');
        $crud->set_table('pc_etapa');
        $crud->set_subject($titulo);
        $crud->unset_jquery();
        $crud->unset_add();
        $crud->unset_delete();
        $crud->where('etapa', $etapa);

        return $crud;
    }

    private function _editarEtapa($etapa, $titulo)
    {
        $group = $this->ion_auth->get_users_groups()->row()->id;

        if ($group == 3) {
            redirect('/', 'refresh');
        }

        $crud = $this->_crudEtapa($etapa, $titulo);

        $crud->columns('inicio', 'fin', 'comentario');
        $crud->edit_fields('inicio', 'fin', 'comentario');
        $crud->required_fields('inicio', 'fin');

        $crud->display_as('inicio', 'Fecha de inicio');
        $crud->display_as('fin', 'Fecha de fin');
        $crud->display_as('comentario', 'Comentarios');

        $crud->callback_edit_field('inicio', array($this, '_campoInicio'));
        $crud->callback_edit_field('fin', array($this, '_campoFin'));
        $crud->callback_before_update(array($this, 'etapaAntesDeActualizar'));

        $output = $crud->render();

        $this->load->view('Crud/farm-date_filter', (array) $output);
    }

    public function _campoInicio($value, $primary_key = null)
    {
        return $this->_inputFecha('inicio', $value);
    }

    public function _campoFin($value, $primary_key = null)
    {
        return $this->_inputFecha('fin', $value);
    }

    private function _inputFecha($nombre, $value)
    {
        $valor = $value ? date('Y-m-d\TH:i', strtotime($value)) : '';
        return '<input type="datetime-local" name="' . $nombre . '" value="' . $valor . '" required />';
    }

    // Misma regla que V4.php para una etapa: inicio y fin obligatorios, y fin no antes que inicio.
    public function etapaAntesDeActualizar($post_array, $primary_key)
    {
        $inicio = strtotime(str_replace('T', ' ', (string) $post_array['inicio']));
        $fin = strtotime(str_replace('T', ' ', (string) $post_array['fin']));

        if ($inicio === false || $fin === false || $fin < $inicio) {
            return false;
        }

        $post_array['inicio'] = date('Y-m-d H:i:s', $inicio);
        $post_array['fin'] = date('Y-m-d H:i:s', $fin);

        return $post_array;
    }

    public function resultadoAntesDeActualizar($post_array, $primary_key)
    {
        $inicio = strtotime(str_replace('T', ' ', (string) $post_array['inicio']));
        $peso = isset($post_array['peso_final']) ? trim((string) $post_array['peso_final']) : '';

        if ($inicio === false || ($peso !== '' && !is_numeric($peso))) {
            return false;
        }

        $etapa = $this->db->select('pc_proceso_id')->where('id', $primary_key)->where('etapa', 'resultado')->get('pc_etapa')->row();

        if (!$etapa) {
            return false;
        }

        // El peso final vive en pc_proceso, no en la etapa.
        $this->db->where('id', $etapa->pc_proceso_id)->update('pc_proceso', array('peso_final' => $peso === '' ? null : $peso));

        $post_array['inicio'] = date('Y-m-d H:i:s', $inicio);
        $post_array['fin'] = $post_array['inicio'];
        unset($post_array['peso_final']);

        return $post_array;
    }

    public function _pesoFinalColumna($value, $row)
    {
        return $this->_pesoFinal($row->id);
    }

    public function _pesoFinalCampo($value, $primary_key = null)
    {
        return '<input type="number" step="0.001" name="peso_final" value="' . $this->_pesoFinal($primary_key) . '" />';
    }

    private function _pesoFinal($etapaId)
    {
        $fila = $this->db->select('p.peso_final')
            ->from('pc_etapa e')
            ->join('pc_proceso p', 'p.id = e.pc_proceso_id')
            ->where('e.id', $etapaId)
            ->get()->row();

        return $fila ? $fila->peso_final : '';
    }

    public function fotoFermentado($value, $primary_key = null)
    {
        return $this->_enlaceFoto('pc_calidad_fermentacion', $primary_key, 'fermentado', 1);
    }

    public function fotoSecado1($value, $primary_key = null)
    {
        return $this->_enlaceFoto('pc_calidad_secado', $primary_key, null, 1);
    }

    public function fotoSecado2($value, $primary_key = null)
    {
        return $this->_enlaceFoto('pc_calidad_secado', $primary_key, null, 2);
    }

    public function fotoSecado3($value, $primary_key = null)
    {
        return $this->_enlaceFoto('pc_calidad_secado', $primary_key, null, 3);
    }

    private function _enlaceFoto($tabla, $primary_key, $etapa, $orden)
    {
        $calidad = $this->db->where('id', $primary_key)->get($tabla)->row();

        if (!$calidad) {
            return 'Sin Imagen';
        }

        $foto = $this->db->select('archivo')
            ->where('pc_proceso_id', $calidad->pc_proceso_id)
            ->where('etapa', $etapa !== null ? $etapa : $calidad->etapa)
            ->where('orden', $orden)
            ->get('pc_foto')->row();

        if ($foto) {
            return '<a href="' . base_url("uploads/" . $foto->archivo) . '" target="_blank">Ver Imagen</a>';
        }

        return 'Sin Imagen';
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