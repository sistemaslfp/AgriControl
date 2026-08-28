<?php
defined('BASEPATH') or exit('No direct script access allowed');

/*
| -------------------------------------------------------------------------
| Configuración de la API V4 (app móvil nueva)
| -------------------------------------------------------------------------
| Consumida por application/controllers/V4.php mediante
| $this->config->load('v4', TRUE).
|
| Estos valores viajan en GET /v4/bootstrap: la app los lee del servidor,
| así que cambiar un número aquí NO exige recompilar la app.
| Contrato: MOBIL/02-bd-y-api.md §7 y MOBIL/01-sincronizacion.md.
*/

// Ventanas horarias AM/PM. Solo informativas: el servidor NO rechaza por
// ventana horaria, deja flag `fuera_de_ventana_horaria` (decisión cerrada).
$config['ventanas_horarias'] = array(
    'am' => array('inicio' => '06:00', 'fin' => '12:00'),
    'pm' => array('inicio' => '13:00', 'fin' => '18:00'),
);

// Ventanas de retroactividad en días, por módulo.
// [CONFIRMAR] Pendiente #1 de MOBIL/00-plan.md: los cinco números son
// propuesta, no decisión de negocio. Ajustar aquí cuando se confirmen.
$config['retroactividad_dias'] = array(
    'am'          => 3,
    'pm'          => 3,
    'cosecha'     => 7,
    'riego'       => 7,
    'postcosecha' => 30,
);

// Subtareas visibles en el módulo Cosecha de Cacao.
// Vacío = derivar de las tareas activas cuyo nombre contiene 'COSECHA'.
// Si el negocio quiere una lista fija, poner los ids aquí.
$config['cosecha_subtarea_ids'] = array();
