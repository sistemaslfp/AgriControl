<!-- <form method="post" action="">
    <label for="selected_week">Select Week:</label>
    <select name="selected_week">
    <?php foreach ($weeks as $week): ?>
            <option value="<?php echo $week['payment_week']; ?>"><?php echo $week['payment_week']; ?></option>
        <?php endforeach; ?>
    </select>
    <button type="submit">Submit</button>
</form> -->

<h1>Miscellaneous Labor Payments Report Week</h1>
<hr />

<?php if (isset($pivoted_data)): ?>
    <?php
    // Definir los días de la semana
    $days_of_week = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Agrupar datos por subtask_name
    $grouped_data = [];
    foreach ($pivoted_data as $operator) {
        $grouped_data[$operator['subtask_name']][] = $operator;
    }
    ?>

    <?php foreach ($grouped_data as $subtask_name => $operators): ?>
        <?php
        // Inicializar un array para almacenar los totales por fecha
        $date_totals = [];
        // Variable para sumar los totales de las filas
        $grand_total = 0;

        // Obtener las fechas existentes y mapearlas a los días de la semana
        $existing_dates = array_keys(current($operators)['totals']);
        $mapped_dates = [];
        foreach ($existing_dates as $date) {
            $day_of_week = date('l', strtotime($date)); // Obtener el día de la semana
            $mapped_dates[$day_of_week] = $date;
        }

        // Asegurarse de que todos los días estén presentes, incluso si no tienen datos
        foreach ($days_of_week as $day) {
            if (!isset($mapped_dates[$day])) {
                // Si no hay una fecha para este día, calcular la fecha correcta y rellenar con ceros
                $reference_date = reset($mapped_dates); // Tomamos la primera fecha como referencia
                $new_date = date('Y-m-d', strtotime($reference_date . ' ' . $day));
                $mapped_dates[$day] = $new_date; // Insertamos la fecha calculada
                foreach ($operators as &$operator) {
                    $operator['totals'][$new_date] = 0; // Colocamos valor 0 para los días faltantes
                }
            }
        }

        // Asegurarse de que los días estén ordenados de domingo a sábado
        ksort($mapped_dates);
        ?>
        <h3><?php echo $subtask_name; ?></h3>
        <table class="table">
            <thead>
                <tr>
                    <th>Operator Namessss</th>
                    <th>Operator ID</th>
                    <?php foreach ($mapped_dates as $day => $date): ?>
                        <th><?php echo $date . " (" . $day . ")"; ?></th>
                    <?php endforeach; ?>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($operators as $operator): ?>
                    <tr>
                        <td><?php echo $operator['operator_name']; ?></td>
                        <td><?php echo $operator['operator_iddoc']; ?></td>
                        <?php $sumTotal = 0; ?>
                        <?php foreach ($mapped_dates as $day => $date): ?>
                            <td><?php echo number_format($operator['totals'][$date] / 17, 2); ?></td>
                            <?php
                            if (!isset($date_totals[$date])) {
                                $date_totals[$date] = 0;
                            }
                            $date_totals[$date] += $operator['totals'][$date] / 17;
                            $sumTotal += $operator['totals'][$date] / 17;
                            ?>
                        <?php endforeach; ?>
                        <td class="text-right">
                            <span class="badge badge-success">
                                &nbsp;&nbsp;&nbsp;<?php echo number_format($sumTotal, 2); ?>
                            </span>
                        </td>
                    </tr>
                    <?php $grand_total += $sumTotal; ?>
                <?php endforeach; ?>
            </tbody>
            <tfoot>
                <tr>
                    <td><strong>TOTAL</strong></td>
                    <td></td>
                    <?php foreach ($date_totals as $total): ?>
                        <td><strong><?php echo number_format($total, 2); ?></strong></td>
                    <?php endforeach; ?>
                    <td class="text-right">
                        <strong>&nbsp;&nbsp;&nbsp;<?php echo number_format($grand_total, 2); ?></strong>
                    </td>
                </tr>
            </tfoot>
        </table>
        <br>
    <?php endforeach; ?>
<?php endif; ?>


<h3>Worker Deductions Summary</h3>

<form method="post" action="<?= site_url('payment/update_deductions') ?>">
    <table class="table">
        <thead>
            <tr>
                <th>#</th>
                <th>Operator Name</th>
                <th>Operator ID</th>
                <th>Total</th>
                <th>Deduction</th>
                <th>Final Total</th>
                <th>Observation</th>
            </tr>
        </thead>
        <?php $index = 0; ?>
        <tbody>
            <?php foreach ($resume_data as $row): ?>
                <?php $index++; ?>
                <tr>
                    <td><?= $index ?></td>
                    <td><?= $row->operator_name ?></td>
                    <td><?= $row->operator_doc_id ?></td>
                    <td><?= number_format($row->total, 2) ?></td>

                    <!-- Campo de deducción -->
                    <td>
                        <input type="number" name="deductions[<?= $index ?>][deduction]"
                            class="form-control deduction-input" step="0.01"
                            value="<?= number_format($row->deduction, 2) ?>" data-total="<?= $row->total ?>">
                    </td>

                    <!-- Cálculo de total final restando deducción -->
                    <td>
                        <span class="final-total">
                            <?= number_format($row->total - $row->deduction, 2) ?>
                        </span>
                    </td>

                    <!-- Observación -->
                    <td>
                        <input type="text" name="deductions[<?= $index ?>][observation]" class="form-control"
                            value="<?= $row->observation ?>">
                    </td>

                    <input type="hidden" name="deductions[<?= $index ?>][operator_id]" value="<?= $row->operator_id ?>">
                    <input type="hidden" name="deductions[<?= $index ?>][farm_id]" value="<?= $row->farm_id ?>">
                    <input type="hidden" name="deductions[<?= $index ?>][selected_week]" value="<?= $selected_week ?>">
                    <input type="hidden" name="deductions[<?= $index ?>][id]" value="<?= $row->id ?>">
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <button type="submit" class="btn btn-primary">Save Deductions</button>
</form>

<script>
    document.addEventListener("DOMContentLoaded", function () {
        // Función para calcular el total final al cargar la página
        function calculateFinalTotals() {
            const rows = document.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const total = parseFloat(row.querySelector('input.deduction-input').getAttribute('data-total'));
                const deduction = parseFloat(row.querySelector('input.deduction-input').value) || 0;
                const finalTotalElement = row.querySelector('.final-total');
                finalTotalElement.textContent = (total - deduction).toFixed(2);
            });
        }

        // Llamar a la función de cálculo al cargar la página
        calculateFinalTotals();

        // Función para recalcular el total final cuando cambia la deducción
        document.querySelectorAll('.deduction-input').forEach(input => {
            input.addEventListener('input', function () {
                const total = parseFloat(this.getAttribute('data-total'));
                const deduction = parseFloat(this.value) || 0;
                const finalTotalElement = this.closest('tr').querySelector('.final-total');
                finalTotalElement.textContent = (total - deduction).toFixed(2);
            });
        });
    });
</script>


<script>
    // Actualizar el total final al cambiar la deducción
    document.querySelectorAll('input[name*="[deduction]"]').forEach(input => {
        input.addEventListener('input', function () {
            const row = this.closest('tr');
            const total = parseFloat(row.cells[3].textContent); // Actualización: total está en la celda 3
            const deduction = parseFloat(this.value) || 0;
            row.cells[5].querySelector('.final-total').textContent = (total - deduction).toFixed(2);
        });
    });

    document.querySelector('form').addEventListener('submit', function (event) {
        let valid = true;
        document.querySelectorAll('input[name*="[deduction]"]').forEach(input => {
            if (parseFloat(input.value) < 0) {
                valid = false;
                alert('Deduction cannot be negative');
                input.focus();
            }
        });
        if (!valid) event.preventDefault();
    });

    document.querySelectorAll('input[name*="[deduction]"]').forEach(input => {
        input.addEventListener('input', function () {
            const row = this.closest('tr');
            const total = parseFloat(row.cells[3].textContent) || 0;
            const deduction = parseFloat(this.value) || 0;
            const finalTotal = total - deduction;

            if (deduction > total) {
                alert('Deduction cannot exceed the total amount');
                this.value = 0;
            }

            row.cells[5].querySelector('.final-total').textContent = finalTotal.toFixed(2);
        });
    });


</script>