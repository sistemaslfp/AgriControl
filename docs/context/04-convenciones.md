# 04 — Convenciones de código

## Esqueleto de un controlador CRUD nuevo

Copia `application/controllers/Finca.php`. Estructura obligatoria:

```php
<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

class MiEntidad extends Public_controller {

    public function __construct()
    {
        parent::__construct();
        $this->load->library('ion_auth');
        if (!$this->ion_auth->logged_in()) { redirect('auth/login'); }
        $this->load->database();
        $this->load->helper('url');
        $this->load->library('grocery_CRUD');
        $this->_init();
    }

    private function _init() { }

    public function index()
    {
        try {
            $crud = new grocery_CRUD();
            $crud->set_theme('tablestrap4');
            $crud->set_table('z_mi_tabla');
            $crud->set_subject('Mi Entidad');
            $crud->unset_read();
            $crud->unset_jquery();     // el layout ya carga jQuery
            $crud->unset_clone();

            $group = $this->ion_auth->get_users_groups()->row()->id;
            if ($group != 1) { $crud->unset_delete(); }
            if ($group != 1 && $group != 2) { redirect('/', 'refresh'); }

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
- `unset_jquery()` — si no, jQuery se carga dos veces y rompe los widgets.
- `try/catch` con `show_error()` alrededor del `render()`.
- Chequeo de grupo antes de exponer delete/edit.

## Grocery CRUD — recetas usadas en este repo

| Necesidad | Cómo |
|---|---|
| Tabla sin PK / vista SQL | `$crud->set_primary_key('col')` |
| Multiselect desde otra tabla | `$crud->field_type('modulos','multiselect',$array)` |
| Normalizar antes de guardar | `callback_before_insert` / `_update` → método `ino_to_upper($post_array)` |
| Columna calculada | `callback_column('col', array($this,'_callback_column_x'))` |
| Detectar exportación | `$state = $crud->getState(); if ($state=='export'\|\|$state=='print')` |
| Filtros propios | leer `$this->input->get('x')` o `$this->uri->segment(n)` y aplicar `$crud->where()` |

Las vistas `Crud/farm-date_filter.php` y `Crud/date-range_filter.php` esperan
`$output->data['listadoFincas']` para pintar el combo.

## Modelos

- Un modelo por entidad: `Xxx_model.php`, clase `Xxx_model extends CI_Model`.
- Query Builder de CI, **no SQL crudo** salvo pivotes (ver `Reporteam_model`,
  `Payment_model`).
- Cargar con `$this->load->model('xxx_model')` (minúsculas) dentro del método
  que lo usa, no en el constructor global.

## Nombres

- Archivos de controlador y modelo: **PascalCase** (`Payment_model.php`).
- Métodos y variables: `snake_case` en código viejo, `camelCase` en el módulo
  de pagos y postcosecha. **Sigue el estilo del archivo que estás tocando**, no
  impongas uno global.
- Etiquetas de UI en español con acentos (`'Cédula'`, `'Módulos'`).

## Helpers disponibles

| Helper | Funciones |
|---|---|
| `datetime_validation_helper` | `isTimeValid`, `isValidDate`, `isValidPickerTime` |
| `getdate_helper` | `getCurrentDateTime` |
| `payment_reports_helper` | `editButton` |

`autoload.php` está **vacío**: todo se carga explícitamente.
