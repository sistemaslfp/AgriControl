<?php

function getFiscalCalendar($year, $start_date = '2024-01-01')
{
    // Convertimos la fecha de inicio a un objeto DateTime
    $startDate = new DateTime($start_date);

    // Ajustamos el inicio al primer domingo de ese año
    if ($startDate->format('N') != 7) {
        $startDate->modify('next sunday');
    }

    // Determinamos si el año tiene 52 o 53 semanas
    $endDate = clone $startDate;
    $endDate->modify('+1 year')->modify('-1 day');

    $weeksInYear = (int) $startDate->format('W') > 51 ? 53 : 52;

    // Iniciamos el calendario con 13 periodos
    $periods = [];
    $currentDate = clone $startDate;

    for ($i = 1; $i <= 13; $i++) {
        // Los primeros dos periodos son de 4 semanas, el tercero es de 5 semanas
        $weeksInPeriod = ($i % 3 == 0) ? 5 : 4;

        // Ajustamos si estamos en un año de 53 semanas
        if ($i == 13 && $weeksInYear == 53) {
            $weeksInPeriod = 5;
        }

        // Calculamos las fechas de inicio y fin de cada periodo
        $periodStart = clone $currentDate;
        $periodEnd = clone $currentDate;
        $periodEnd->modify('+' . ($weeksInPeriod * 7 - 1) . ' days');

        $periods[] = [
            'period' => $i,
            'start_date' => $periodStart->format('Y-m-d'),
            'end_date' => $periodEnd->format('Y-m-d')
        ];

        // Movemos la fecha actual al inicio del siguiente periodo
        $currentDate->modify('+' . ($weeksInPeriod * 7) . ' days');
    }

    return $periods;
}

// Ejemplo de uso
$year = 2020;
$fiscalCalendar = getFiscalCalendar($year, '2019-12-29');

foreach ($fiscalCalendar as $period) {
    echo "Periodo " . $period['period'] . ": desde " . $period['start_date'] . " hasta " . $period['end_date'] . "<br />";
}

?>