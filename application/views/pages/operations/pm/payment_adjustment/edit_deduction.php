<STYLE>
    span.payment-adjustmen-filter-value {
        background-color: transparent;
        border-bottom: 2px solid #1abb9c;
        padding: 3px;
        margin: 5px;
    }
</STYLE>

<h3>Reporte de Pago <span class="payment-adjustmen-filter-value">Hacienda: <?= $farm_name ?></span> <span class="payment-adjustmen-filter-value">Año: <?= $selected_year ?></span> <span class="payment-adjustmen-filter-value">Semana: <?= $selected_week ?> </span> <span class="payment-adjustmen-filter-value">Estado: <?= $status_name ?> </span></h3>
<hr />
<form id="report-form" action="<?= site_url('Operations/PM/PaymentAdjustment/updateDeductions') ?>" method="post">
    <div id="pivot-table-container"></div>
    <div id="worker-deductions-summary"></div>

    <input type="hidden" name="farm_id" value="<?= $farm_id ?>">
    <input type="hidden" name="selected_week" value="<?= $selected_week ?>">
    <input type="hidden" name="selected_year" value="<?= $selected_year ?>">
    <input type="hidden" name="farm_id" value="<?= $farm_id ?>">
    <input type="hidden" name="status_id" value="<?= $status_id ?>">

    <div style="margin-top: 20px;">
        <button type="submit" class="btn btn-primary">Guardar Ajustes</button>
    </div>
</form>
<script>
    var pivotDataSource = <?php echo json_encode($pivotDataSource); ?>;
    var conversionRate = <?php echo $conversionRate; ?>;
</script>

<script>
    document.addEventListener('DOMContentLoaded', function() {
        var daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

        var groupedData = pivotDataSource.reduce((acc, operator) => {
            if (!acc[operator.cost_group_name]) {
                acc[operator.cost_group_name] = {};
            }
            if (!acc[operator.cost_group_name][operator.operator_name]) {
                acc[operator.cost_group_name][operator.operator_name] = {
                    operator_docid: operator.operator_docid,
                    dailyTotals: {}, // Suma de valores por fecha
                    total: 0 // Total acumulado
                };
            }

            var dateKey = new Date(operator.pm_date).toISOString().split('T')[0];
            var value = parseFloat(operator.total_with_discount) / conversionRate;

            acc[operator.cost_group_name][operator.operator_name].dailyTotals[dateKey] =
                (acc[operator.cost_group_name][operator.operator_name].dailyTotals[dateKey] || 0) + value;

            acc[operator.cost_group_name][operator.operator_name].total += value;

            return acc;
        }, {});

        function generateTable(groupedData) {
            var container = document.getElementById('pivot-table-container');
            container.innerHTML = '';

            Object.keys(groupedData).forEach(costGroupName => {
                var groupHeader = document.createElement('h3');
                groupHeader.textContent = `${costGroupName}`;
                container.appendChild(groupHeader);

                var operators = groupedData[costGroupName];

                var table = document.createElement('table');
                table.className = 'table';

                var thead = document.createElement('thead');
                var headerRow = document.createElement('tr');
                var subHeaderRow = document.createElement('tr');

                var allDates = Object.values(operators).flatMap(op => Object.keys(op.dailyTotals));
                var uniqueDates = [...new Set(allDates.map(date => new Date(date)))];
                var minDate = new Date(Math.min(...uniqueDates));
                var maxDate = new Date(Math.max(...uniqueDates));

                var calculatedDates = daysOfWeek.map((_, index) => {
                    var date = new Date(minDate);
                    date.setDate(minDate.getDate() + index);
                    return date.toISOString().split('T')[0];
                });

                ['#', 'Nombre Trabajador', 'Cédula', ...daysOfWeek, 'Total'].forEach((text, i) => {
                    var th = document.createElement('th');
                    th.textContent = text;
                    headerRow.appendChild(th);

                    if (i >= 3 && i < 10) {
                        var subTh = document.createElement('th');
                        subTh.textContent = calculatedDates[i - 3];
                        subHeaderRow.appendChild(subTh);
                    } else {
                        var subTh = document.createElement('th');
                        subHeaderRow.appendChild(subTh);
                    }
                });

                thead.appendChild(headerRow);
                thead.appendChild(subHeaderRow);
                table.appendChild(thead);

                var tbody = document.createElement('tbody');
                var grandTotal = 0;
                var weeklyTotals = Array(daysOfWeek.length).fill(0);

                Object.keys(operators).forEach((operatorName, index) => {
                    var operator = operators[operatorName];
                    var row = document.createElement('tr');

                    var rowData = [
                        index + 1,
                        operatorName.toUpperCase(),
                        operator.operator_docid
                    ];

                    var operatorWeeklyTotal = 0;

                    daysOfWeek.forEach((day, dayIndex) => {
                        var date = calculatedDates[dayIndex];
                        var value = operator.dailyTotals[date] || 0;
                        rowData.push(value);
                        operatorWeeklyTotal += value;
                        weeklyTotals[dayIndex] += value;
                    });

                    rowData.push(operatorWeeklyTotal);

                    grandTotal += operatorWeeklyTotal;

                    rowData.forEach((value, i) => {
                        var td = document.createElement('td');
                        td.textContent = typeof value === 'number' ? value.toFixed(2) : value;
                        row.appendChild(td);
                    });

                    tbody.appendChild(row);
                });

                table.appendChild(tbody);

                var tfoot = document.createElement('tfoot');
                var footerRow = document.createElement('tr');

                ['TOTAL', '', '', ...weeklyTotals, grandTotal].forEach((value, i) => {
                    var td = document.createElement('td');
                    td.textContent = typeof value === 'number' ? value.toFixed(2) : value;
                    footerRow.appendChild(td);
                });

                tfoot.appendChild(footerRow);
                table.appendChild(tfoot);

                container.appendChild(table);
            });
        }

        generateTable(groupedData);
    });
</script>

<script>
    var operators_resume = <?php echo json_encode($operators_resume); ?>;
    var conversionRate = <?php echo $conversionRate; ?>;
    console.warn('resultado', operators_resume);

    document.addEventListener('DOMContentLoaded', function() {
        // Generación de tabla de resumen
        function generateWorkerDeductionsSummary(data) {
            const container = document.getElementById('worker-deductions-summary');
            container.innerHTML = '<h3>Resumen Semana</h3>';

            // Crear tabla
            const table = document.createElement('table');
            table.className = 'table';

            // Encabezados de la tabla
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['#', 'Nombre Trabajador', 'Cédula', 'Total', 'Descuento', 'Total', 'Observación'].forEach(text => {
                const th = document.createElement('th');
                th.textContent = text;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Ordenar los operadores alfabéticamente
            const uniqueOperators = {};
            data.forEach(item => {
                console.warn('Operadores: ', item);
                if (!uniqueOperators[item.operator_docid]) {
                    uniqueOperators[item.operator_docid] = {
                        id: item.operator_id,
                        name: item.operator_name,
                        docid: item.operator_docid,
                        total: parseFloat(item.total) || 0,
                        total_with_discount: parseFloat(item.total) || 0,
                        deduction: parseFloat(item.deduction) || 0,
                        observation: item.observation || ''
                    };
                }
            });

            const sortedOperators = Object.values(uniqueOperators).sort((a, b) =>
                a.name.localeCompare(b.name)
            );

            // Cuerpo de la tabla
            const tbody = document.createElement('tbody');
            let totalAmount = 0,
                totalDeduction = 0,
                finalTotal = 0;

            sortedOperators.forEach((operator, index) => {
                const row = document.createElement('tr');

                const total = operator.total_with_discount;
                const deduction = operator.deduction;
                const finalValue = total - deduction;

                // Campos HTML
                const rowData = [
                    index + 1,
                    operator.name.toUpperCase(),
                    operator.docid,
                    total.toFixed(2),
                    `<input type="number" class="form-control deduction-input" step="0.01" value="${deduction}" name="deductions[${operator.id}][deduction]" />`,
                    `<span class="final-total">${finalValue.toFixed(2)}</span>`,
                    `<input type="text" class="form-control observation-input" value="${operator.observation}" name="deductions[${operator.id}][observation]" />
                    <input type="hidden" name="deductions[${operator.id}][operator_id]" value="${operator.id}">
                    <input type="hidden" name="deductions[${operator.id}][farm_id]" value="${operator.farm_id}">
                    <input type="hidden" name="deductions[${operator.id}][selected_week]" value="${operator.selected_week}">
                    <input type="hidden" name="deductions[${operator.id}][selected_year]" value="${operator.selected_year}">`
                ];

                rowData.forEach((cell, i) => {
                    const td = document.createElement('td');
                    td.innerHTML = cell;
                    row.appendChild(td);
                });

                tbody.appendChild(row);

                totalAmount += total;
                totalDeduction += deduction;
                finalTotal += finalValue;
            });

            table.appendChild(tbody);

            // Pie de tabla
            const tfoot = document.createElement('tfoot');
            const footerRow = document.createElement('tr');
            ['TOTAL', '', '', totalAmount.toFixed(2), totalDeduction.toFixed(2), finalTotal.toFixed(2), ''].forEach((text, index) => {
                const td = document.createElement('td');
                td.textContent = index > 3 && typeof text === 'number' ? text.toFixed(2) : text;
                footerRow.appendChild(td);
            });
            tfoot.appendChild(footerRow);
            table.appendChild(tfoot);

            container.appendChild(table);

            // Event listeners para recalcular valores al cambiar deducción
            container.querySelectorAll('.deduction-input').forEach(input => {
                input.addEventListener('input', function() {
                    const row = this.closest('tr');
                    const total = parseFloat(row.cells[3].textContent) || 0;
                    const deduction = parseFloat(this.value) || 0;

                    if (deduction > total) {
                        alert('Deduction cannot exceed the total amount');
                        this.value = 0;
                        return;
                    }

                    const final = total - deduction;
                    row.querySelector('.final-total').textContent = final.toFixed(2);

                    // Recalcular total de columna Final Total
                    const finalTotals = [...tbody.querySelectorAll('.final-total')];
                    const grandTotal = finalTotals.reduce((acc, cell) => acc + parseFloat(cell.textContent), 0);
                    tfoot.rows[0].cells[5].textContent = grandTotal.toFixed(2);

                    // Recalcular total de columna Deduction
                    const deductionInputs = [...container.querySelectorAll('.deduction-input')];
                    const totalDeductions = deductionInputs.reduce((acc, input) => acc + parseFloat(input.value || 0), 0);
                    tfoot.rows[0].cells[4].textContent = totalDeductions.toFixed(2);
                });
            });
        }

        // Llamar a la función para generar el resumen
        generateWorkerDeductionsSummary(operators_resume);
    });
</script>

<script>
    // Actualizar el total final al cambiar la deducción
    document.querySelectorAll('input[name*="[deduction]"]').forEach(input => {
        input.addEventListener('input', function() {
            const row = this.closest('tr');
            const total = parseFloat(row.cells[3].textContent); // Actualización: total está en la celda 3
            const deduction = parseFloat(this.value) || 0;
            row.cells[5].querySelector('.final-total').textContent = (total - deduction).toFixed(2);
        });
    });

    document.querySelector('form').addEventListener('submit', function(event) {
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
        input.addEventListener('input', function() {
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