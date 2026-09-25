<?php defined('BASEPATH') OR exit('No direct script access allowed');

/*
 * Mensajes de error que el usuario tiene que VER.
 *
 * Grocery CRUD solo muestra un motivo si llega en la fase de validacion (JSON
 * con error_message). Un callback_before_* que devuelve false termina en un
 * "error al guardar" generico, y un show_error() en una peticion ajax no se ve:
 * la pantalla queda igual, sin decir que fallo.
 */

if (!function_exists('alerta_crud_error')) {
	function alerta_crud_error($crud, $mensaje, $codigo = 403)
	{
		$state = $crud->getState();
		$html = '<p>' . htmlspecialchars($mensaje, ENT_QUOTES, 'UTF-8') . '</p>';

		if (in_array($state, array('insert_validation', 'update_validation', 'insert', 'update', 'delete', 'delete_multiple'))) {
			@ob_end_clean();
			header('Content-Type: application/json; charset=utf-8');
			echo json_encode(array('success' => false, 'error_message' => $html, 'error_fields' => new stdClass()));
			exit;
		}

		show_error($mensaje, $codigo);
	}
}

// $motivo recibe ($post, $primary_key) y devuelve el texto del problema o null.
// Se corre en la fase de validacion, antes de que el callback_before_* lo rechace a ciegas.
if (!function_exists('alerta_validar')) {
	function alerta_validar($crud, $motivo)
	{
		$state = $crud->getState();

		if (!in_array($state, array('insert_validation', 'update_validation'))) {
			return;
		}

		$pk = null;
		if ($state == 'update_validation') {
			$info = $crud->getStateInfo();
			$pk = isset($info->primary_key) ? $info->primary_key : null;
		}

		$problema = call_user_func($motivo, $_POST, $pk);

		if ($problema) {
			alerta_crud_error($crud, $problema, 400);
		}
	}
}

// Para pantallas que no son Grocery CRUD: el layout lo muestra en la siguiente pagina.
if (!function_exists('alerta_flash')) {
	function alerta_flash($tipo, $mensaje)
	{
		$CI =& get_instance();
		$CI->load->library('session');
		$CI->session->set_flashdata($tipo === 'exito' ? 'alerta_exito' : 'alerta_error', $mensaje);
	}
}

// En una escritura de Grocery CRUD, un error de base (FK, duplicado) con db_debug
// encendido devuelve una pagina HTML que la pantalla no sabe mostrar. Apagado,
// GC recibe false y muestra su mensaje de error.
if (!function_exists('alerta_bd_en_escritura')) {
	function alerta_bd_en_escritura()
	{
		$CI =& get_instance();
		$segmentos = $CI->uri->segment_array();

		if (!array_intersect(array('insert', 'update', 'delete', 'delete_multiple'), $segmentos)) {
			return;
		}

		if (function_exists('mysqli_report')) {
			mysqli_report(MYSQLI_REPORT_OFF);
		}

		if (isset($CI->db)) {
			$CI->db->db_debug = FALSE;
		}
	}
}
