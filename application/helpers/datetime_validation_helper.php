<?php if (!defined('BASEPATH'))
    exit('No direct script access allowed');

function isTimeValid($timeStr)
{
    $dateObj = DateTime::createFromFormat('d.m.Y H:i:s', "10.10.2010 " . $timeStr);

    if ($dateObj !== false) {
        return true;
    } else {
        return false;
    }
}

function isValidDate(string $date, string $format = 'Y-m-d'): bool
{
    $dateObj = DateTime::createFromFormat($format, $date);
    return $dateObj && $dateObj->format($format) == $date;
}

function isValidPickerTime($cadena)
{
    return preg_match("/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/", $cadena);
}
