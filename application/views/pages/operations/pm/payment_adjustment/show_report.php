<STYLE>
    span.payment-adjustmen-filter-value {
        background-color: transparent;
        border-bottom: 2px solid #1abb9c;
        padding: 3px;
        margin: 5px;
    }
</STYLE>
<div id="report-container">
    <h3>Reporte de Pago <span class="payment-adjustmen-filter-value">Hacienda: <?= $farm_name ?></span> <span class="payment-adjustmen-filter-value">Año: <?= $selected_year ?></span> <span class="payment-adjustmen-filter-value">Semana: <?= $selected_week ?> </span> <span class="payment-adjustmen-filter-value">Estado: <?= $status_name ?></span></h3>
    <hr />
    <div id="pivot-table-container"></div>
    <div id="worker-deductions-summary"></div>


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
                            (index + 1).toFixed(0),
                            operatorName.toUpperCase(),
                            "'" + operator.operator_docid
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
                    if (!uniqueOperators[item.operator_docid]) {
                        uniqueOperators[item.operator_docid] = {
                            id: item.operator_id,
                            name: item.operator_name,
                            docid: item.operator_docid,
                            total: parseFloat(item.pm_total) || 0,
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
                        (index + 1).toFixed(0),
                        operator.name.toUpperCase(),
                        "'" + operator.docid,
                        total.toFixed(2),
                        `<span class="">${deduction.toFixed(2)}</span>`,
                        `<span class="final-total">${finalValue.toFixed(2)}</span>`,
                        `<span class="">${operator.observation}</span>`
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


    <!-- Sección de firmas -->
    <table class="table-signatures" style="width: 100%; margin-top: 8rem; text-align: center; border-collapse: collapse;">
        <tr>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
        <tr>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
        <tr>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
        <tr>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
        <tr>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
        <tr>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
            <td></td>
        </tr>
        <tr>
            <td style="padding: 1rem;">
                <p>_________________________</p>
                <p><strong>Elaborado</strong></p>
                <p>Gonzalo Ugarte</p>
                <p>Administrador de Campo</p>
            </td>
            <td></td>
            <td style="padding: 1rem;">
                <p>_________________________</p>
                <p><strong>Revisado</strong></p>
                <p>Ing. Andrea Armas</p>
                <p>Jefe RRHH</p>
            </td>
            <td></td>
            <td></td>
            <td style="padding: 1rem;">
                <p>_________________________</p>
                <p><strong>Aprobado</strong></p>
                <p>Alberto Sánchez</p>
                <p>Gerente Administrativo</p>
            </td>
        </tr>
    </table>
</div>

<!-- <div class="d-flex justify-content-between mt-4">
    <button id="btn-download-excel" class="btn btn-secondary">Print Report</button>
    <a id="btn-back-to-list" href="<?= site_url('Operations/PM/PaymentAdjustment/listAdjustments') ?>" class="btn btn-primary">Back to List</a>
</div> -->

<div class="d-flex justify-content-between mt-4">
    <button id="btn-download-excel" class="btn btn-success">Descargar Excel</button>
    <!-- <button id="btn-download-pdf" class="btn btn-warning">Download PDF</button> -->
    <a id="btn-back-to-list" href="<?= site_url('Operations/PM/PaymentAdjustment/listAdjustments') ?>" class="btn btn-primary">Volver al listado</a>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js"></script>
<script>
    document.getElementById('btn-download-excel').addEventListener('click', function() {
        const container = document.getElementById('report-container').outerHTML;

        const blob = new Blob([`
        <html xmlns:o="urn:schemas-microsoft-com:office:office" 
              xmlns:x="urn:schemas-microsoft-com:office:excel" 
              xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="UTF-8">
                <!--[if gte mso 9]>
                <xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
                    <x:Name>Sheet1</x:Name>
                    <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
                </x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml>
                <![endif]-->
            </head>
            <body>${container}</body>
        </html>`], {
            type: "application/vnd.ms-excel;charset=utf-8;"
        });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "LaborPaymentsReport.xls";
        link.click();
    });

    document.getElementById('btn-download-pdf').addEventListener('click', function() {
        const element = document.getElementById('report-container'); // Selecciona el contenido del reporte

        // Configuración de html2pdf
        const options = {
            margin: 0.5, // Márgenes más pequeños
            filename: 'LaborPaymentsReport.pdf',
            image: {
                type: 'jpeg',
                quality: 0.98
            },
            html2canvas: {
                scale: 2,
                useCORS: true,
                scrollX: 0,
                scrollY: 0
            }, // Escalado para mayor calidad
            jsPDF: {
                unit: 'in',
                format: 'a4',
                orientation: 'landscape'
            } // Horizontal
        };


        // Generar el PDF
        html2pdf().set(options).from(element).save();
    });
</script>