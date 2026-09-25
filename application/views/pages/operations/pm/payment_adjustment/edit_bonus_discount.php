<STYLE>
    span.payment-adjustmen-filter-value {
        background-color: transparent;
        border-bottom: 2px solid #1abb9c;
        padding: 3px;
        margin: 5px;
    }
</STYLE>

<p class="mb-3"><a href="<?php echo site_url('Operations/PM/PaymentAdjustment/listAdjustments'); ?>" class="btn btn-secondary"><i class="fa fa-arrow-left"></i> Volver al listado de ajustes</a></p>

<h3>Reporte de Pago <span class="payment-adjustmen-filter-value">Hacienda: <?= $selected_farm_name ?></span> <span class="payment-adjustmen-filter-value">Año: <?= $selected_year ?></span> <span class="payment-adjustmen-filter-value">Semana: <?= $selected_week ?> </span> <span class="payment-adjustmen-filter-value">Estado: <?= $status_name ?></span></h3>
<hr />
<?php if ($this->session->flashdata('error')): ?>
    <div class="alert alert-danger">
        <?php echo $this->session->flashdata('error'); ?>
    </div>
<?php endif; ?>

<?php if (isset($payments)): ?>
    <?php if ($payments != null): ?>
        <form
            action="<?= site_url('Operations/PM/PaymentAdjustment/updateBonusDiscount') ?>"
            method="post">
            <table class="table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Fecha</th>
                        <th>Cédula</th>
                        <th>Nombre Trabajador</th>
                        <th>Supervisor</th>
                        <th>Subtarea</th>
                        <th>Lote</th>
                        <th>Módulos</th>
                        <th>Cantidad</th>
                        <th>Tarifa</th>
                        <th>Total</th>
                        <th>Bono/Descuento</th>
                        <th>Total</th>
                        <th>Observaciones</th>
                    </tr>
                </thead>
                <tbody>
                    <?php $grandTotal = 0; ?>
                    <?php foreach ($payments as $index => $payment): ?>
                        <?php $grandTotal += $payment->pm_total; ?>
                        <tr>
                            <td><?= $index + 1 ?></td>
                            <td><?= $payment->pm_date ?></td>
                            <td><?= $payment->operator_docid ?></td>
                            <td><?= strtoupper($payment->operator_name) ?></td>
                            <td><?= strtoupper($payment->supervisor_name) ?></td>
                            <td><?= $payment->subtask_name ?></td>
                            <td><?= $payment->lot ?></td>
                            <td><?= $payment->modules ?></td>
                            <td><?= number_format($payment->pm_quantity, 2) ?></td>
                            <td><?= number_format($payment->pm_rate, 2) ?></td>
                            <td><span class="pm_total"><?= number_format($payment->pm_total, 2) ?></span></td>

                            <td>
                                <input type="number" name="payments[<?= $index ?>][bonus_discount]" step="0.01" value="<?= $payment->bonus_discount ?>"
                                    class="form-control bonus-discount" data-total="<?= $payment->pm_total ?>">
                            </td>

                            <td>
                                <span class="final-total"><?= number_format($payment->pm_total, 2) ?></span>
                            </td>

                            <td>
                                <input type="text" name="payments[<?= $index ?>][observations]" class="form-control" value="<?= $payment->observations ?>">
                            </td>
                            <input type="hidden" name="payments[<?= $index ?>][pm_id]" value="<?= $payment->id ?>">
                            <input type="hidden" name="payments[<?= $index ?>][pm_week]" value="<?= $selected_week ?>">
                            <input type="hidden" name="payments[<?= $index ?>][pm_year]" value="<?= $selected_year ?>">
                            <input type="hidden" name="payments[<?= $index ?>][farm_id]" value="<?= $payment->farm_id ?>">
                            <input type="hidden" name="payments[<?= $index ?>][status_id]" value="<?= $selected_status ?>">
                        </tr>
                    <?php endforeach; ?>
                </tbody>
                <tfoot>
                    <tr>
                        <td colspan="12" class="text-right"><strong>Total:</strong></td>
                        <td colspan="2"><span id="grand-final-total"><?= number_format($grandTotal, 2) ?></span></td>
                    </tr>
                </tfoot>
            </table>
            <input type="hidden" name="selected_year" value="<?= $selected_year ?>">
            <input type="hidden" name="selected_week" value="<?= $selected_week ?>">
            <input type="hidden" name="farm_id" value="<?= $selected_farm ?>">
            <input type="hidden" name="status_id" value="<?= $selected_status ?>">
            <button type="submit" class="btn btn-success btn-lg">Guardar Ajustes</button>
        </form>
    <?php else: ?>
        <h2>No se encontraron registros.</h2>
    <?php endif ?>

    <!-- Script para el calculo del total de bonos y descuentos -->
    <script>
        $(document).ready(function() {
            function updateGrandTotal() {
                let grandTotal = 0;
                $('.final-total').each(function() {
                    grandTotal += parseFloat($(this).text());
                });
                $('#grand-final-total').text(grandTotal.toFixed(2));
            }

            // Calculate Total and apply to Final Total when input changes
            $('.bonus-discount').on('input', function() {
                var total = parseFloat($(this).data('total'));
                var bonusDiscount = parseFloat($(this).val());
                var finalTotal = total + (bonusDiscount || 0);

                $(this).parent().next().children('.final-total').text(finalTotal.toFixed(2));
                updateGrandTotal();
            });

            // Calculate Final Total on page load
            $('.bonus-discount').each(function() {
                var total = parseFloat($(this).data('total'));
                var bonusDiscount = parseFloat($(this).val());
                var finalTotal = total + (bonusDiscount || 0);

                $(this).parent().next().children('.final-total').text(finalTotal.toFixed(2));
            });

            // Update Grand Total on page load
            updateGrandTotal();
        });
    </script>

<?php endif; ?>