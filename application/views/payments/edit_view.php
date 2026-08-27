<h1>Edit Payment Records</h1>

<form method="post"
    action="<?= site_url('payment/update_adjusments?selected_week=' . $selected_week . '&selected_farm=' . $farmId) ?>">
    <table class="table">
        <thead>
            <tr>
                <th>#</th>
                <th>Operator Name</th>
                <th>Operator ID</th>
                <th>Subtask</th>
                <th>Total</th>
                <th>Bonus/Discount</th>
                <th>Final Total</th>
                <th>Observations</th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($records as $index => $record): ?>
                <tr>
                    <td><?= $index + 1 ?></td>
                    <td><?= $record->operator_name ?></td>
                    <td><?= $record->operator_iddoc ?></td>
                    <td><?= $record->subtask_name ?></td>
                    <td>
                        <span class="total"><?= number_format($record->pm_total, 2) ?></span>
                        <input type="hidden" name="records[<?= $index ?>][total]" value="<?= $record->pm_total ?>">
                    </td>
                    <td>
                        <input type="number" name="records[<?= $index ?>][bonus_discount]"
                            class="form-control bonus_discount" value="<?= $record->bonus_discount ?>" step="0.01">
                    </td>
                    <td>
                        <span class="final_total">0.00</span>
                    </td>
                    <td>
                        <input type="text" name="records[<?= $index ?>][observations]" class="form-control"
                            value="<?= $record->observations ?>">
                    </td>
                    <input type="hidden" name="records[<?= $index ?>][pm_id]" value="<?= $record->id ?>">
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <button type="submit" class="btn btn-primary">Save Changes</button>
</form>

<script>
    // Función para calcular el total final
    function calculateFinalTotal(row) {
        var total = parseFloat(row.querySelector('.total').textContent.replace(/,/g, '')) || 0;
        var bonusDiscount = parseFloat(row.querySelector('.bonus_discount').value) || 0;
        var finalTotal = total + bonusDiscount;

        row.querySelector('.final_total').textContent = finalTotal.toFixed(2);
    }

    // Calcular los totales iniciales al cargar la página
    document.addEventListener('DOMContentLoaded', function () {
        var rows = document.querySelectorAll('tbody tr');
        rows.forEach(function (row) {
            calculateFinalTotal(row);
        });

        // Recalcular cuando se cambie el valor de bonus/discount
        document.querySelectorAll('.bonus_discount').forEach(function (input) {
            input.addEventListener('input', function () {
                var row = input.closest('tr');
                calculateFinalTotal(row);
            });
        });
    });
</script>