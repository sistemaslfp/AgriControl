<?php
defined('BASEPATH') OR exit('No direct script access allowed');

/*
 * Overrides de entorno de DESARROLLO.
 *
 * CodeIgniter hace require() de este archivo DESPUÉS de config/config.php
 * (ver system/core/Common.php::get_config), así que aquí solo se redefinen
 * las claves que cambian. $config ya viene poblado.
 *
 * IMPORTANTE: ENVIRONMENT está hardcodeado a 'development' en public/index.php,
 * por lo que este archivo se carga en CUALQUIER máquina. Por eso el override
 * es condicional: sin la variable APP_BASE_URL, no cambia nada.
 */

if ($base_url = getenv('APP_BASE_URL')) {
    $config['base_url'] = $base_url;
}
