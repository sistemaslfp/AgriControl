<?php

class Payment_model extends CI_Model
{

    public function __construct()
    {
        parent::__construct();
    }

    public function getAvailableYears($farm_id)
    {
        // Subconsulta para obtener las semanas ya registradas en payment_records con la finca seleccionada
        $this->db->select('DISTINCT (pm_year) AS pm_year')
            ->from('vw_lfp_ajuste_pago')
            ->where('farm_id', $farm_id);

        $this->db->where("pm_week <> 0");
        $this->db->order_by("pm_year", "asc");
        $query = $this->db->get();
        return $query->result_array(); // Retornar el resultado como un array
    }

    public function getAvailableWeeks($farm_id, $year)
    {
        // Subconsulta para obtener las semanas ya registradas en payment_records con la finca seleccionada
        $this->db->select('DISTINCT (pm_week) AS payment_week')
            ->from('vw_lfp_ajuste_pago')
            ->where('farm_id', $farm_id)
            ->where('pm_fecha_proceso >=', ((int) $year - 1) . '-12-25')
            ->where('pm_fecha_proceso <', ((int) $year + 1) . '-01-08')
            ->where('pm_year', $year)
            ->order_by("pm_week", "asc"); // Mover order_by aquí
        $query = $this->db->get();

        return $query->result_array(); // Retornar el resultado como un array
    }

    // vw_lfp_ajuste_pago deriva la semana ISO de fecha_proceso: acotar primero por
    // la fecha deja usar el indice en vez de calcular WEEK() sobre todo lfp_am.
    private function acotarSemana($year, $week)
    {
        $inicio = new DateTime();
        $inicio->setISODate((int) $year, (int) $week);
        $inicio->setTime(0, 0, 0);
        $fin = clone $inicio;
        $fin->modify('+7 days');

        $this->db->where('pm_fecha_proceso >=', $inicio->format('Y-m-d H:i:s'));
        $this->db->where('pm_fecha_proceso <', $fin->format('Y-m-d H:i:s'));
    }

    public function getFilteredPmRecords($farm, $year, $week, $status)
    {

        $this->db->select('
        id,
        pm_year,
        pm_week,
        pm_date,
        farm_id,
        farm_name,
        supervisor_id,
        supervisor_name,
        operator_id,
        operator_name,
        operator_docid,
        operator_status,
        lot,
        modules,
        subtask_id,
        subtask_code,
        subtask_name,
        pm_quantity,
        pm_rate,
        pm_total,
        bonus_discount,
        deduction,
        observation,
        observations
        ');

        $this->db->from('vw_lfp_ajuste_pago');
        $this->acotarSemana($year, $week);
        $this->db->where('farm_id', $farm);
        $this->db->where('pm_year', $year);
        $this->db->where('pm_week', $week);
        $this->db->where('operator_status', $status);
        $this->db->order_by('pm_date', 'asc');
        $query = $this->db->get();
        if ($query === false) {
            return null;
        }

        return $query->result();
    }


    public function getFarms()
    {
        // Obtener semanas desde la vista
        $this->db->select('id, nombre as farm');
        $this->db->from('z_finca');
        $query = $this->db->get();
        return $query->result();
    }

    public function get_farm_by_id($farm_id)
    {
        // Obtener semanas desde la vista
        $this->db->select('nombre as farm');
        $this->db->from('z_finca');
        $this->db->where('id', $farm_id);
        $query = $this->db->get();
        $result = $query->row(); // Obtener una sola fila

        if ($result) {
            return $result->farm; // Retornar el nombre de la finca
        } else {
            return null; // Retornar null si no se encuentra la finca
        }
    }



    public function get_weeks()
    {
        // Obtener semanas desde la vista
        $this->db->select('DISTINCT(weeknumber) AS week');
        $this->db->from('vw_pm_temporaryworkers');
        $this->db->where('weeknumber > "202425"');
        $this->db->where('weeknumber NOT IN (SELECT DISTINCT(payment_week) FROM payment_records)', NULL, FALSE);
        // $this->db->where('operator_id_finca NOT IN (SELECT DISTINCT(payment_week) FROM payment_records)', NULL, FALSE);
        $query = $this->db->get();
        return $query->result();
    }

    public function getUniqueDaysByYearWeekFarm($selected_year, $selected_week, $farmId)
    {
        $this->db->select('DISTINCT(pm_date)');
        $this->db->from('vw_lfp_ajuste_pago');
        $this->acotarSemana($selected_year, $selected_week);
        $this->db->where('pm_week', $selected_week);
        $this->db->where('pm_year', $selected_year);
        $this->db->where('farm_id', $farmId);
        $this->db->order_by('pm_date', 'ASC');
        $query = $this->db->get();
        return $query->result_array(); // Devuelve las fechas en un array
    }

    public function getPaymentBonusDiscountReportByYearWeekFarm($selected_year, $selected_week, $farmId, $statusId)
    {
        $this->db->select('operator_id, operator_docid, operator_name, cost_group_name, pm_date, pm_total, bonus_discount, (pm_total + COALESCE(bonus_discount, 0)) as total_with_discount, deduction, observations, observation');
        $this->db->from('vw_lfp_ajuste_pago');
        $this->acotarSemana($selected_year, $selected_week);
        $this->db->where('pm_week', $selected_week);
        $this->db->where('pm_year', $selected_year);
        $this->db->where('farm_id', $farmId);
        $this->db->where('operator_status', $statusId);
        $this->db->order_by('cost_group_name, operator_name');
        $query = $this->db->get();
        return $query->result_array(); // Devuelve los datos filtrados
    }

    public function getDiscountedPivotedPm($selected_year, $selected_week, $farmId, $statusId)
    {
        // Obtener las fechas únicas de la semana seleccionada
        $unique_dates = $this->getUniqueDaysByYearWeekFarm($selected_year, $selected_week, $farmId);

        // Obtener los datos de la semana seleccionada
        $data = $this->getPaymentBonusDiscountReportByYearWeekFarm($selected_year, $selected_week, $farmId, $statusId);

        // Crear una estructura para pivotar los datos
        $pivoted_data = [];

        foreach ($data as $row) {
            // Inicializar el operador si no existe en el array pivotado
            if (!isset($pivoted_data[$row['operator_docid']])) {
                $pivoted_data[$row['operator_docid']] = [
                    'operator_docid' => $row['operator_docid'],
                    'operator_name' => $row['operator_name'],
                    'cost_group_name' => $row['cost_group_name'],
                    'totals' => array_fill_keys(array_column($unique_dates, 'pm_date'), 0), // Inicializar las fechas a 0
                ];
            }

            // Verificar si la fecha existe en el array antes de sumar
            if (isset($pivoted_data[$row['operator_docid']]['totals'][$row['pm_date']])) {
                $pivoted_data[$row['operator_docid']]['totals'][$row['pm_date']] += $row['total_with_discount'];
            }
        }

        return $pivoted_data; // Retorna los datos pivotados
    }


    /**
     * Obtener las semanas únicas en la vista vw_temporaryworkers_pivot
     *
     * @return array Arreglo con las semanas únicas
     */
    public function get_unique_weeks()
    {
        $this->db->select('DISTINCT(pm_week) AS payment_week');
        $this->db->from('vw_lfp_ajuste_pago');
        $this->db->order_by('payment_week', 'ASC');
        $query = $this->db->get();
        return $query->result_array(); // Devuelve las semanas en un array
    }




    public function saveBonusDiscount($payment)
    {
        // Guardar o actualizar registros de pago
        $data = array(
            'pm_id' => $payment['pm_id'],
            'bonus_discount' => $payment['bonus_discount'],
            'observations' => $payment['observations'],
        );

        $this->db->trans_start(); // Iniciar transacción

        try {
            // Reemplazar el registro en la tabla tbl_pm_payment_daily_adjustment
            $this->db->replace('tbl_pm_payment_daily_adjustment', $data);

            // Preparar datos para tbl_pm_payment_paymenthistory
            $historyData = array(
                'pm_year' => $payment['pm_year'],
                'pm_week' => $payment['pm_week'],
                'farm_id' => $payment['farm_id'],
                'status_id' => $payment['status_id'],
                'bonus_discount' => 1
            );

            // Verificar si ya existe un registro con el mismo año, semana, farm_id y status_id
            $this->db->where('pm_year', $payment['pm_year']);
            $this->db->where('pm_week', $payment['pm_week']);
            $this->db->where('farm_id', $payment['farm_id']);
            $this->db->where('status_id', $payment['status_id']);
            $query = $this->db->get('tbl_pm_payment_paymenthistory');

            if ($query->num_rows() > 0) {
                // Si existe, actualizar el registro
                $historyData['updated_at'] = gmdate('Y-m-d H:i:s', time() - 5 * 3600);
                $this->db->where('pm_year', $payment['pm_year']);
                $this->db->where('pm_week', $payment['pm_week']);
                $this->db->where('farm_id', $payment['farm_id']);
                $this->db->where('status_id', $payment['status_id']);
                $this->db->update('tbl_pm_payment_paymenthistory', $historyData);
            } else {
                // Si no existe, insertar un nuevo registro
                $historyData['created_at'] = gmdate('Y-m-d H:i:s', time() - 5 * 3600);
                $historyData['updated_at'] = gmdate('Y-m-d H:i:s', time() - 5 * 3600);
                $this->db->insert('tbl_pm_payment_paymenthistory', $historyData);
            }

            $this->db->trans_complete(); // Completar transacción

            if ($this->db->trans_status() === FALSE) {
                throw new Exception('Error en la transacción');
            }
        } catch (Exception $e) {
            // Capturar la excepción y devolver un error
            log_message('error', 'Error al guardar el descuento de bonificación: ' . $e->getMessage());
            $this->db->trans_rollback(); // Revertir transacción
            return array('status' => 'error', 'message' => 'Error al guardar el descuento de bonificación.');
        }

        return array('status' => 'success', 'message' => 'Descuento de bonificación guardado exitosamente.');
    }


    /**
     * Obtener resumen de pagos por finca y semana
     *
     * @param int $paymentWeek N mero de semana
     * @param int $farmId ID de la finca
     *
     * @return array
     */
    public function get_resume_data_edit($paymentWeek, $farmId)
    {
        $this->db->where('farm_id', $farmId);
        $this->db->where('payment_week', $paymentWeek);
        $query = $this->db->get('vw_pm_temporaryworkers_resume_edit');

        return $query->result();
    }

    public function getResumeData($paymentYear, $paymentWeek, $farmId, $statusId)
    {
        $this->db->select('farm_id, operator_id, operator_name, operator_docid, SUM(pm_total + COALESCE(bonus_discount,0)) as total, AVG(NULLIF(deduction, 0)) as deduction, MIN(observation) as observation');
        $this->acotarSemana($paymentYear, $paymentWeek);
        $this->db->where('farm_id', $farmId);
        $this->db->where('pm_week', $paymentWeek);
        $this->db->where('pm_year', $paymentYear);
        $this->db->where('operator_status', $statusId);
        $this->db->group_by(['farm_id', 'operator_id', 'operator_name', 'operator_docid']);
        // $this->db->order_by('pm_date', 'asc');
        $query = $this->db->get('vw_lfp_ajuste_pago');

        return $query->result();
    }


    public function saveDeductions($data)
    {
        $table = 'tbl_pm_payment_weekly_deductions';
        $unique_columns = ['pm_year', 'pm_week', 'farm_id', 'operator_id'];

        $this->db->trans_start();

        foreach ($data as $item) {
            // Primero, verifica si el registro ya existe en tbl_pm_payment_weekly_deductions
            $this->db->select('*');
            foreach ($unique_columns as $column) {
                $this->db->where($column, $item[$column]);
            }
            $query = $this->db->get($table);

            if ($query->num_rows() > 0) {
                // El registro ya existe, actualiza los datos
                $update_data = [];
                foreach ($item as $key => $value) {
                    if (!in_array($key, $unique_columns)) {
                        $update_data[$key] = $value;
                    }
                }
                // Añadir la fecha actual GMT-5 para la columna 'updated_at'
                $update_data['updated_at'] = gmdate('Y-m-d H:i:s', time() - 5 * 3600);

                try {
                    foreach ($unique_columns as $column) {
                        $this->db->where($column, $item[$column]);
                    }
                    $this->db->update($table, $update_data);
                } catch (Exception $e) {
                    $this->db->trans_rollback();
                    return array('status' => 'error', 'message' => 'Error al actualizar las deducciones: ' . $e->getMessage());
                }
            } else {
                // El registro no existe, inserta un nuevo registro
                try {
                    $item['created_at'] = gmdate('Y-m-d H:i:s', time() - 5 * 3600);
                    $this->db->insert($table, $item);
                } catch (Exception $e) {
                    $this->db->trans_rollback();
                    return array('status' => 'error', 'message' => 'Error al guardar las deducciones: ' . $e->getMessage());
                }
            }

            // Ahora, maneja la inserción/actualización en tbl_pm_payment_paymenthistory
            $historyData = array(
                'pm_year' => $item['pm_year'],
                'pm_week' => $item['pm_week'],
                'farm_id' => $item['farm_id'],
                'status_id' => $item['status_id'],
                'deduction' => 1, // Establecer deduction a 1
                'updated_at' => gmdate('Y-m-d H:i:s', time() - 5 * 3600)
            );

            // Verificar si ya existe un registro en tbl_pm_payment_paymenthistory
            $this->db->where('pm_year', $item['pm_year']);
            $this->db->where('pm_week', $item['pm_week']);
            $this->db->where('farm_id', $item['farm_id']);
            $this->db->where('status_id', $item['status_id']);
            $query = $this->db->get('tbl_pm_payment_paymenthistory');

            if ($query->num_rows() > 0) {
                // Si existe, actualizar solo deduction y updated_at
                $this->db->where('pm_year', $item['pm_year']);
                $this->db->where('pm_week', $item['pm_week']);
                $this->db->where('farm_id', $item['farm_id']);
                $this->db->where('status_id', $item['status_id']);
                $this->db->update('tbl_pm_payment_paymenthistory', array('deduction' => 1, 'updated_at' => gmdate('Y-m-d H:i:s', time() - 5 * 3600)));
            } else {
                // Si no existe, insertar un nuevo registro
                $historyData['created_at'] = gmdate('Y-m-d H:i:s', time() - 5 * 3600);
                $historyData['updated_at'] = null; // Dejar updated_at nulo
                $this->db->insert('tbl_pm_payment_paymenthistory', $historyData);
            }
        }

        $this->db->trans_commit();

        return array('status' => 'success', 'message' => 'Deducciones guardadas/actualizadas exitosamente.');
    }

    public function recordPaymentHistoryExists($year, $week, $farm, $status)
    {
        $this->db->where('pm_year', $year);
        $this->db->where('pm_week', $week);
        $this->db->where('farm_id', $farm);
        $this->db->where('status_id', $status);
        $query = $this->db->get('tbl_pm_payment_paymenthistory');

        return $query->num_rows() > 0;
    }


    public function get_payment_report_by_week($paymentWeek, $farmId)
    {
        $this->db->where('payment_week', $paymentWeek);
        $this->db->where('operator_id_finca', $farmId);
        $query = $this->db->get('vw_pm_temporaryworkers_weeks');
        return $query->result_array();
    }

    // Obtener los registros desde la vista
    public function get_all_records()
    {
        $query = $this->db->get('vw_pm_temporaryworkers_reports');
        return $query->result();
    }

    public function get_records_by_week($week, $farm)
    {
        $query = $this->db->select('*')
            ->from('vw_pm_temporaryworkers_reports')
            ->where('weeknumber', $week)
            ->where('operator_id_finca', $farm)
            ->get();

        return $query->result();
    }

    // Actualizar el campo bonus_discount y observations
    public function update_payment_record($pm_id, $bonus_discount, $observations)
    {
        $data = array(
            'bonus_discount' => $bonus_discount,
            'observations' => $observations
        );
        $this->db->where('pm_id', $pm_id);
        $this->db->update('payment_records', $data);
    }


    public function getGroupedAdjustments()
    {
        $this->db->select('farm_name, pm_year, pm_week, SUM(bonus_discount) as total_bonus_discount, AVG(deduction) as average_deduction');
        $this->db->group_by(['farm_name', 'pm_year', 'pm_week']);
        // $this->db->having('SUM(bonus_discount) > 0 OR AVG(deduction) > 0');
        $query = $this->db->get('vw_lfp_ajuste_pago');

        return $query->result();
    }

    // Edición


    public function get_bonus_discount_by_week($farm_id, $year, $week)
    {
        $this->db->select('tbl_pm_payment_daily_adjustment.*, operators.name AS operator_name, supervisors.name AS supervisor_name, subtasks.name AS subtask_name');
        $this->db->from('tbl_pm_payment_daily_adjustment');
        $this->db->join('z_personal', 'tbl_pm_payment_daily_adjustment.operator_id = z_personal.id');
        $this->db->join('z_personal', 'tbl_pm_payment_daily_adjustment.supervisor_id = supervisors.id');
        $this->db->join('z_subtarea', 'tbl_pm_payment_daily_adjustment.subtask_id = z_subtarea.id');
        $this->db->where('tbl_pm_payment_daily_adjustment.farm_id', $farm_id);
        $this->db->where('tbl_pm_payment_daily_adjustment.pm_year', $year);
        $this->db->where('tbl_pm_payment_daily_adjustment.pm_week', $week);
        return $this->db->get()->result();
    }

    public function updateBonusDiscountDB($payments)
    {
        foreach ($payments as $payment) {

            // Consulta para verificar si el registro existe en la tabla.
            $query = $this->db->get_where('tbl_pm_payment_daily_adjustment', ['pm_id' => $payment['pm_id']]);
            $result = $query->row();

            if (empty($result)) {
                // El registro no existe, inserta un nuevo registro.
                // Verifica si bonus_discount es un valor numérico y diferente de cero.
                if (!is_numeric($payment['bonus_discount']) || $payment['bonus_discount'] == 0) {
                    continue;
                }
                $this->db->insert('tbl_pm_payment_daily_adjustment', [
                    'pm_id' => $payment['pm_id'],
                    'bonus_discount' => $payment['bonus_discount'],
                    'observations' => $payment['observations'],
                    'created_at' => gmdate('Y-m-d H:i:s', time() - 5 * 3600),
                    'updated_at' => gmdate('Y-m-d H:i:s', time() - 5 * 3600)
                ]);
            } else {
                // El registro existe, actualiza el registro existente.
                $this->db->where('pm_id', $payment['pm_id']);
                $this->db->update('tbl_pm_payment_daily_adjustment', [
                    'bonus_discount' => $payment['bonus_discount'],
                    'observations' => $payment['observations'],
                    'updated_at' => gmdate('Y-m-d H:i:s', time() - 5 * 3600)
                ]);
            }
        }
    }

    public function updateDeductions($data)
    {
        $this->db->trans_start(); // Inicia una transacción.

        foreach ($data as $record) {
            if (isset($record['deduction']) && $record['deduction'] != 0) {
                // Ejecutar inserción o actualización si deduction es diferente de cero.
                $sql = "
                    INSERT INTO tbl_pm_payment_weekly_deductions 
                    (operator_id, farm_id, pm_week, pm_year, deduction, observation, status_id, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE 
                        deduction = VALUES(deduction),
                        observation = VALUES(observation),
                        status_id = VALUES(status_id),
                        updated_at = VALUES(updated_at)
                ";

                $params = [
                    $record['operator_id'],        // Clave única: parte 1
                    $record['farm_id'],            // Clave única: parte 2
                    $record['pm_week'],            // Clave única: parte 3
                    $record['pm_year'],            // Clave única: parte 4
                    $record['deduction'],          // Deducción
                    $record['observation'],        // Observación
                    $record['status_id'],          // ID de estado
                    gmdate('Y-m-d H:i:s', time() - 5 * 3600), // Fecha de creación
                    gmdate('Y-m-d H:i:s', time() - 5 * 3600)  // Fecha de actualización
                ];

                $this->db->query($sql, $params);
            } else {
                // Actualizar registro si ya existe y la deducción es igual a cero.
                $sql = "
                    UPDATE tbl_pm_payment_weekly_deductions 
                    SET 
                        deduction = ?,
                        observation = ?, 
                        status_id = ?, 
                        updated_at = ?
                    WHERE operator_id = ? AND farm_id = ? AND pm_week = ? AND pm_year = ?
                ";

                $params = [
                    $record['deduction'],
                    $record['observation'],        // Observación
                    $record['status_id'],          // ID de estado
                    gmdate('Y-m-d H:i:s', time() - 5 * 3600), // Fecha de actualización
                    $record['operator_id'],        // Clave única: parte 1
                    $record['farm_id'],            // Clave única: parte 2
                    $record['pm_week'],            // Clave única: parte 3
                    $record['pm_year']             // Clave única: parte 4
                ];

                $this->db->query($sql, $params);
            }
        }

        $this->db->trans_complete(); // Finaliza la transacción.

        return $this->db->trans_status(); // Devuelve el estado de la transacción.
    }


    public function get_conversion_rate($id)
    {
        $this->db->select('conversion_rate');
        $this->db->from('tbl_pm_payment_conversionrate');
        $this->db->where('id', $id);
        $query = $this->db->get();

        if ($query->num_rows() == 1) {
            $row = $query->row();
            return (float) $row->conversion_rate;
        } else {
            return 0;
        }
    }


    public function backupAndDeleteDuplicates()
    {
        // Iniciar la transacción
        $this->db->trans_start();

        // Insertar los registros duplicados de los últimos 500 registros en la tabla de respaldo
        $this->db->query("
            INSERT INTO tbl_pm_backuppm (id, numero_registro, fecha, pm_year, pm_week, finca, responsable, trabajador, cantidad, comentario, cultivo, hora_cierre, hora_inicio, lote, modulo, subtarea, fecha_registro)
            SELECT id, numero_registro, fecha, pm_year, pm_week, finca, responsable, trabajador, cantidad, comentario, cultivo, hora_cierre, hora_inicio, lote, modulo, subtarea, fecha_registro
            FROM z_tabla_pm
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT id
                    FROM z_tabla_pm
                    ORDER BY id DESC
                    LIMIT 500
                ) AS last_1000_records
            )
            AND id NOT IN (
                SELECT MIN(id)
                FROM z_tabla_pm
                GROUP BY fecha, trabajador, subtarea, lote
            )
        ");

        // Eliminar los registros duplicados de los últimos 500 registros de la tabla original
        $this->db->query("
            DELETE FROM z_tabla_pm
            WHERE id IN (
                SELECT id
                FROM (
                    SELECT id
                    FROM z_tabla_pm
                    ORDER BY id DESC
                    LIMIT 500
                ) AS last_1000_records
            )
            AND id NOT IN (
                SELECT id
                FROM (
                    SELECT MIN(id) AS id
                    FROM z_tabla_pm
                    GROUP BY fecha, trabajador, subtarea, lote
                ) AS unique_records
            )
        ");

        // Completar la transacción
        $this->db->trans_complete();

        // Verificar el estado de la transacción
        if ($this->db->trans_status() === FALSE) {
            // Si algo salió mal, deshacer la transacción
            $this->db->trans_rollback();
            return FALSE;
        } else {
            // Si todo salió bien, confirmar la transacción
            $this->db->trans_commit();
            return TRUE;
        }
    }


    public function getStatusNameById($id)
    {
        $this->db->select('descripcion_estado');
        $this->db->from('z_personal_estado');
        $this->db->where('id', $id);
        $query = $this->db->get();

        if ($query->num_rows() > 0) {
            $row = $query->row();
            return $row->descripcion_estado;
        } else {
            return 0;
        }
    }
}
