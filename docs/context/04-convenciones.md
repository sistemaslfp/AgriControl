# 04 — Convenciones de código

## Esqueleto de un controlador CRUD nuevo

Copia `application/controllers/Lote.php` (catálogo con hacienda). Estructura:

```php
<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class MiEntidad extends Public_controller {

    public function __construct()
    {
        parent::__construct();          // login, helpers acceso/alertas, template
        $this->load->database();
        $this->load->helper('url');
        $this->load->library('grocery_CRUD');
    }

    public function index()
    {
        acceso_exigir('maestras');      // o 'edita' / 'admin_global'
        try {
            $crud = new grocery_CRUD();
            $crud->set_theme('tablestrap4');
            $crud->set_table('z_mi_tabla');
            $crud->set_subject('Mi Entidad');
            $crud->unset_read();
            $crud->unset_jquery();      // el layout ya carga jQuery
            $crud->unset_clone();

            $crud->set_relation('finca_id', 'z_finca', 'nombre');
            acceso_crud_finca($crud, 'z_mi_tabla', 'finca_id');   // filtra por hacienda

            if (!acceso_puede('admin_global')) { $crud->unset_delete(); }

            $crud->display_as('campo', 'Etiqueta');
            $crud->columns('campo1', 'campo2');

            $output = $crud->render();
            $this->load->view('Crud/default', (array)$output);
        } catch (Exception $e) {
            show_error($e->getMessage().' --- '.$e->getTraceAsString());
        }
    }
}
```

Puntos que **no** son opcionales:
- `defined('BASEPATH')` en la primera línea de todo `.php` de `application/`.
- **Permiso con `acceso_exigir()`** y **hacienda con `acceso_crud*()`**. Un
  selector oculto o un menú oculto no protegen nada: se puede escribir el id o
  `?id_finca=` en la URL.
- Tabla sin columna de finca propia: condición SQL con `{t}` y `{f}`, p. ej.
  `acceso_crud($crud, 'z_modulo', '{t}.lote_id IN (SELECT id FROM z_lote WHERE finca_id = {f})')`
  y `acceso_validar_lote($crud, 'lote_id')` para rechazar un lote ajeno en el POST.
  En vistas cuya PK no es `id`, pasar la columna como 4.º argumento.
- `unset_jquery()` — si no, jQuery se carga dos veces y rompe los widgets.
- `try/catch` con `show_error()` alrededor del `render()`.
- Validaciones de negocio con
  `alerta_validar($crud, array($this, '_miMotivo'))`, donde
  `_miMotivo($post, $pk)` devuelve el texto del problema o `null`. Corre en la
  fase de validación, así el usuario ve el motivo. Nunca un `return false`
  mudo en un `callback_before_*`.
- Pantallas de registros: apuntar a `lfp_*`/`pc_*` para editar y a `vw_lfp_*`
  para listar. **Nunca a `z_tabla_*`**.

La lógica vieja `$group != 1 && $group != 2` sigue en varios archivos; en
código nuevo usa `acceso_puede()`.

## Vistas hechas a mano

- Cargan dentro del layout: no llevan `<html>` ni `<head>`.
- Si son un formulario o un detalle, llevan arriba un botón
  `← Volver a …` (`btn btn-secondary`, `fa fa-arrow-left`) a la sección
  general. Grocery CRUD ya trae el suyo.
- Mensajes al usuario con `alerta_flash('exito'|'error', $msg)` +
  `redirect()`.

## Grocery CRUD — recetas usadas en este repo

| Necesidad | Cómo |
|---|---|
| Vista SQL | `$crud->set_primary_key('col')` + `unset_add/edit/delete` |
| Filtro por rango de fechas | `set_theme('tablestrap4_datefilter')` |
| Multiselect desde otra tabla | `$crud->field_type('modulos','multiselect',$array)` |
| Normalizar antes de guardar | `callback_before_insert` / `_update` |
| Columna calculada | `callback_column('col', array($this,'_callback_column_x'))` |
| Detectar exportación | `$state = $crud->getState(); if ($state=='export'\|\|$state=='print')` |
| Filtros propios | `$this->input->get('x')` y `$crud->where()` (la finca ya viene forzada) |

`Crud/farm-date_filter.php` y `Crud/date-range_filter.php` esperan
`$output->data['listadoFincas']` para pintar el combo.

## Base de datos

- `$autoload['libraries']` está vacío: cargar la base explícitamente.
- mysqli devuelve strings: castear si el dato sale como JSON.
- Semana ISO: `WEEK(fecha,3)` en SQL, `format('o')`/`format('W')` en PHP.
- Migración nueva: archivo `docs/db/migrations/0N-nombre.sql`, idempotente,
  sin `DELIMITER` ni `BEGIN…END` (Workbench no los acepta) y con `WHERE` en
  los `UPDATE` (Workbench usa `SQL_SAFE_UPDATES`).

## Modelos

- Un modelo por entidad: `Xxx_model.php`, clase `Xxx_model extends CI_Model`.
- Query Builder de CI, **no SQL crudo** salvo pivotes (`Reporteam_model`,
  `Payment_model`).
- Cargar con `$this->load->model('xxx_model')` dentro del método que lo usa.

## Nombres y textos

- Controladores y modelos en **PascalCase** (`Payment_model.php`).
- `snake_case` en código viejo, `camelCase` en pagos y postcosecha: **sigue el
  estilo del archivo que tocas**.
- Interfaz en español neutro, con acentos (`'Cédula'`, `'Módulos'`). Se dice
  "registro", no "parte".
- Comentarios solo para el **porqué** no obvio; nada de narrar el código.

## Helpers

| Helper | Funciones |
|---|---|
| `acceso_helper` | `acceso_usuario`, `acceso_finca`, `acceso_puede`, `acceso_exigir`, `acceso_forzar_parametros`, `acceso_crud`, `acceso_crud_finca`, `acceso_lotes_sql`, `acceso_validar_lote` |
| `alertas_helper` | `alerta_crud_error`, `alerta_validar`, `alerta_flash`, `alerta_bd_en_escritura` |
| `datetime_validation_helper` | `isTimeValid`, `isValidDate`, `isValidPickerTime` (V3) |
| `getdate_helper` | `getCurrentDateTime` |
| `payment_reports_helper` | `editButton` |

`acceso` y `alertas` los carga `MY_Controller`; el resto se carga a mano.
