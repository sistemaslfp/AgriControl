<?php if (!defined('BASEPATH'))
    exit('No direct script access allowed');

function getCurrentDateTime()
{
    // Obtener la fecha y hora actual en GMT -5
    $timezone = new DateTimeZone('America/Bogota');
    $currentDateTime = new DateTime('now', $timezone);
    $currentDate = $currentDateTime->format('Y-m-d H:i:s');
    return $currentDate;
}