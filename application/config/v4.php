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

// Subtareas que se cierran desde la pantalla de Cosecha. El PM cierra el
// complemento EXACTO de esta lista: con un criterio distinto de cada lado,
// una subtarea puede quedar sin quién la cierre.
//
// El criterio es la UNIDAD, no la tarea: 'Supervisor de cosecha' cuelga de la
// tarea Cosecha y se paga por jornal, no tiene sacos que pesar.
// Decisión de Kevin, 2026-09-05.
//
// Vacío = derivar: subtareas activas cuya unidad esté en cosecha_unidad_ids.
// Hoy son las seis de cacao (81, 89, 98, 109, 115, 123).
$config['cosecha_subtarea_ids'] = array();

// Unidades que mandan a la pantalla de Cosecha. 4 = Libra en z_ulabor.
$config['cosecha_unidad_ids'] = array(4);

// Versión publicada de la app (GET /v4/version y GET /v4/apk). El APK va en
// public/apk/ y NO se versiona. version_code tiene que ser el versionCode del
// build.gradle con que se generó ese APK: la app compara contra el suyo.
$config['app_movil'] = array(
    'version_code' => 4,
    'version_name' => '0.1.35',
    'apk'          => 'lagricontrol-0.1.35.apk',
);
