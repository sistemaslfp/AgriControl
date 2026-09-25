<?php defined('BASEPATH') OR exit('No direct script access allowed');

/*
 * Rol y hacienda del usuario web.
 *   grupo 1 Admin global | 2 Supervisor | 3 Operador (solo lectura) | 4 Admin hacienda
 *   users.finca_id NULL = ve todas las haciendas. El admin (grupo 1) es global siempre.
 */

if (!function_exists('acceso_usuario')) {
	function acceso_usuario($refrescar = false)
	{
		static $cache = null;

		if ($cache !== null && !$refrescar) {
			return $cache;
		}

		$CI =& get_instance();
		$CI->load->library('ion_auth');

		$acceso = array('grupo' => 0, 'finca' => null, 'finca_nombre' => null);

		if ($CI->ion_auth->logged_in()) {
			$usuario = $CI->ion_auth->user()->row();
			$grupo = $CI->ion_auth->get_users_groups()->row();

			$acceso['grupo'] = $grupo ? (int) $grupo->id : 0;

			if ($acceso['grupo'] != 1 && $usuario && isset($usuario->finca_id) && $usuario->finca_id !== null) {
				$acceso['finca'] = (int) $usuario->finca_id;
				$finca = $CI->db->select('nombre')->where('id', $acceso['finca'])->get('z_finca')->row();
				$acceso['finca_nombre'] = $finca ? $finca->nombre : null;
			}
		}

		$acceso['admin_global'] = $acceso['grupo'] == 1;
		$acceso['maestras'] = in_array($acceso['grupo'], array(1, 4));
		$acceso['edita'] = in_array($acceso['grupo'], array(1, 2, 4));

		return $cache = $acceso;
	}
}

if (!function_exists('acceso_finca')) {
	function acceso_finca()
	{
		$acceso = acceso_usuario();
		return $acceso['finca'];
	}
}

if (!function_exists('acceso_puede')) {
	function acceso_puede($permiso)
	{
		$acceso = acceso_usuario();
		return !empty($acceso[$permiso]);
	}
}

if (!function_exists('acceso_exigir')) {
	function acceso_exigir($permiso)
	{
		if (!acceso_puede($permiso)) {
			redirect('/', 'refresh');
		}
	}
}

// Pisa cualquier parametro de finca que llegue por la URL o el formulario:
// ocultar el selector no alcanza, se puede escribir ?id_finca=2 a mano.
if (!function_exists('acceso_forzar_parametros')) {
	function acceso_forzar_parametros()
	{
		$finca = acceso_finca();

		if ($finca === null) {
			return;
		}

		$_GET['id_finca'] = $finca;

		foreach (array('farm', 'farmId', 'farm_id', 'farm_id_post', 'finca_id', 'id_finca') as $clave) {
			if (isset($_GET[$clave])) {
				$_GET[$clave] = $finca;
			}
			if (isset($_POST[$clave])) {
				$_POST[$clave] = $finca;
			}
		}
	}
}

/*
 * Restringe un Grocery CRUD a la hacienda del usuario: filtra el listado y
 * rechaza edit/read/update/delete de un registro ajeno escribiendo el id en la URL.
 * $condicion es SQL con {t} = tabla y {f} = finca, p. ej. '{t}.finca_id = {f}'.
 */
if (!function_exists('acceso_crud')) {
	function acceso_crud($crud, $tabla, $condicion, $pk = 'id')
	{
		$finca = acceso_finca();

		if ($finca === null) {
			return;
		}

		$sql = str_replace(array('{t}', '{f}'), array($tabla, (int) $finca), $condicion);
		$crud->where($sql, null, false);

		$ids = array();
		$state = $crud->getState();

		if (in_array($state, array('edit', 'read', 'clone', 'update', 'update_validation', 'delete', 'success'))) {
			$info = $crud->getStateInfo();
			if (isset($info->primary_key)) {
				$ids[] = $info->primary_key;
			}
		} elseif ($state == 'delete_multiple') {
			$ids = isset($_POST['ids']) ? (array) $_POST['ids'] : array();
		}

		$CI =& get_instance();

		foreach ($ids as $id) {
			$n = $CI->db->where($tabla . '.' . $pk, $id)->where($sql, null, false)->count_all_results($tabla);
			if ($n == 0) {
				show_error('No tiene acceso a este registro.', 403);
			}
		}
	}
}

// Para tablas con columna de finca propia: filtra, deja solo su finca en el
// selector y fija el valor al guardar, venga lo que venga en el POST.
if (!function_exists('acceso_crud_finca')) {
	function acceso_crud_finca($crud, $tabla, $columna)
	{
		$finca = acceso_finca();

		if ($finca === null) {
			return;
		}

		acceso_crud($crud, $tabla, '{t}.' . $columna . ' = {f}');
		$crud->set_relation($columna, 'z_finca', 'nombre', array('id' => $finca));

		if (in_array($crud->getState(), array('insert', 'insert_validation', 'update', 'update_validation'))) {
			$_POST[$columna] = $finca;
		}
	}
}

if (!function_exists('acceso_lotes_sql')) {
	function acceso_lotes_sql()
	{
		return 'SELECT id FROM z_lote WHERE finca_id = ' . (int) acceso_finca();
	}
}

// Rechaza un lote de otra hacienda en el POST (Modulo, Riego, PM).
if (!function_exists('acceso_validar_lote')) {
	function acceso_validar_lote($crud, $campo = 'lote_id')
	{
		$finca = acceso_finca();

		if ($finca === null || !in_array($crud->getState(), array('insert', 'insert_validation', 'update', 'update_validation'))) {
			return;
		}

		$CI =& get_instance();
		$lote = isset($_POST[$campo]) ? (int) $_POST[$campo] : 0;

		if ($CI->db->where('id', $lote)->where('finca_id', $finca)->count_all_results('z_lote') == 0) {
			show_error('El lote no pertenece a su hacienda.', 403);
		}
	}
}
