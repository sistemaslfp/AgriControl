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

// Ventanas horarias AM/PM. Solo para la app: aviso en pantalla contra la hora
// de proceso. El servidor no las mira (decisión cerrada).
$config['ventanas_horarias'] = array(
    'am' => array('inicio' => '06:00', 'fin' => '12:00'),
    'pm' => array('inicio' => '13:00', 'fin' => '18:00'),
);

// Ventanas de retroactividad en días, por módulo. Solo acotan el selector de
// fecha de la app; el servidor acepta lo que le llegue.
// [CONFIRMAR] Pendiente #1 de MOBIL/00-plan.md: los cinco números son
// propuesta, no decisión de negocio. Ajustar aquí cuando se confirmen.
$config['retroactividad_dias'] = array(
    'am'          => 3,
    'pm'          => 3,
    'cosecha'     => 7,
    'riego'       => 7,
    'postcosecha' => 30,
);

// Tareas cuyos AM NO se cierran desde PM: tienen formulario propio.
//
// Cosecha y Postcosecha piden más datos que una cantidad (los sacos, la
// máquina de estados del lote), así que el PM queda para lo administrativo y
// las tareas puntuales. Decisión de Kevin, 2026-09-03.
//
// Vacío = derivar por el nombre de la tarea: 'POSCOSECHA'/'POSTCOSECHA' para
// la segunda, y 'COSECHA' que no sea de esas para la primera. En la base de
// hoy son la 5 (Cosecha) y la 6 (Poscosecha cacao); se dejan explícitas
// porque un nombre nuevo mal escrito no debería mover una regla de negocio.
$config['tarea_cosecha_ids']    = array(5);
$config['tarea_poscosecha_ids'] = array(6);

// Subtareas visibles en el módulo Cosecha de Cacao.
// Vacío = derivar de las tareas activas cuyo nombre contiene 'COSECHA'.
// Si el negocio quiere una lista fija, poner los ids aquí.
$config['cosecha_subtarea_ids'] = array();
