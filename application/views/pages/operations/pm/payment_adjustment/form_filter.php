<?php if (isset($farms)): ?>

    <div class="container">
        <h2>Crear nuevo registro - Ajuste de Pagos</h2>
        <form action="<?= site_url('Operations/PM/PaymentAdjustment/addBonusDiscount') ?>" method="get" class="form-container">
            <div class="form-group">
                <label for="farm">Seleccionar Hacienda:</label>
                <select name="farm" id="farm" onchange="updateYears()">
                    <option value="" selected="true" disabled>Seleccionar Hacienda</option>
                    <?php foreach ($farms as $farm): ?>
                        <option value="<?= $farm->id ?>"><?= $farm->farm ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="form-group">
                <label for="year">Seleccionar Año:</label>
                <select name="year" id="year" onchange="updateWeeks()">
                    <option value="" selected="true" disabled>Seleccionar Año</option>
                </select>
            </div>
            <div class="form-group">
                <label for="week">Seleccionar Semana:</label>
                <select name="week" id="week" onchange="checkSelections()">
                    <option value="" selected="true" disabled>Seleccionar Semana</option>
                </select>
            </div>
            <div class="form-group">
                <label for="personnelStatus">Seleccionar Estado:</label>
                <select name="status" id="status" onchange="checkSelections()">
                    <option value="" selected="true" disabled>Seleccionar Estado</option>
                    <?php if (!empty($statuses)): ?>
                        <?php foreach ($statuses as $status): ?>
                            <option value="<?= $status->id ?>"><?= $status->descripcion_estado ?></option>
                        <?php endforeach; ?>
                    <?php else: ?>
                        <option value="" disabled>No hay estados disponibles</option>
                    <?php endif; ?>
                </select>
            </div>
            <div class="form-group">
                <label for="submitBtn"></label>
                <button type="submit" class="btn btn-primary" id="submitBtn" disabled>Filtrar</button>
            </div>
        </form>
    </div>

    <!-- Overlay -->
    <div id="loadingOverlay" style="display: none;">
        <div class="overlay-content">Cargando, espere...</div>
    </div>

    <style>
        #loadingOverlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }

        .overlay-content {
            color: white;
            font-size: 24px;
        }

        .form-container {
            display: flex;
            justify-content: center;
            gap: 20px;
            flex-wrap: wrap;
            max-width: 1200px;
            margin: 0 auto;
            /* Centrar el contenedor */
        }

        .form-group {
            flex: 1 1 200px;
            /* Permite que los elementos crezcan y se distribuyan equitativamente */
            min-width: 150px;
            /* Ancho mínimo de cada columna */
            text-align: center;
            /* Centrar el contenido de cada columna */
        }

        select,
        button {
            width: 100%;
            /* Hacer que los selects y el botón ocupen el ancho completo de su columna */
            padding: 8px;
            font-size: 16px;
        }

        #submitBtn {
            min-height: 4rem;
        }

        @media (max-width: 768px) {
            .form-container {
                gap: 10px;
                /* Reducir el espacio entre los elementos en pantallas más pequeñas */
            }
        }
    </style>

    <!-- Script para cargar las semanas dependiendo de la finca -->
    <script>
        function updateWeeks() {
            const farmSelect = document.getElementById('farm');
            const farmId = farmSelect.value;
            const farmName = farmSelect.options[farmSelect.selectedIndex].text;
            const yearSelect = document.getElementById('year');
            const year = yearSelect.value;


            if (farmId) {
                showLoadingOverlay();

                fetch("<?= site_url('Operations/PM/PaymentAdjustment/getWeeksByFarmYear') ?>", {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            farm_id: farmId,
                            year: year
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        const weekSelect = document.getElementById('week');
                        weekSelect.innerHTML = ''; // Limpiar el select
                        weekSelect.innerHTML = `<option value="" disabled>Select week (${farmName})</option>`; // Opción por defecto con el nombre del farm

                        // Llenar con las semanas disponibles
                        data.forEach(week => {
                            const option = document.createElement('option');
                            option.value = week.payment_week;
                            option.textContent = week.payment_week;
                            weekSelect.appendChild(option);
                        });

                        hideLoadingOverlay();
                        checkSelections(); // Verificar las selecciones después de actualizar las semanas
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        hideLoadingOverlay();
                    });
            }
        }

        function updateYears() {
            const farmSelect = document.getElementById('farm');
            const farmId = farmSelect.value;
            const farmName = farmSelect.options[farmSelect.selectedIndex].text;
            const weekSelect = document.getElementById('week');

            // Vaciar el select de semanas al cambiar la finca
            weekSelect.innerHTML = '<option value="" selected="true" disabled>Select week</option>';

            if (farmId) {
                showLoadingOverlay();

                fetch("<?= site_url('Operations/PM/PaymentAdjustment/getYearsByFarm') ?>", {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            farm_id: farmId
                        })
                    })
                    .then(response => response.json())
                    .then(data => {
                        const yearSelect = document.getElementById('year');
                        yearSelect.innerHTML = ''; // Limpiar el select de años
                        yearSelect.innerHTML = `<option value="" disabled>Select year (${farmName})</option>`; // Opción por defecto con el nombre del farm

                        // Agregar las opciones de año
                        data.forEach(year => {
                            const option = document.createElement('option');
                            option.value = year.pm_year;
                            option.textContent = year.pm_year;
                            yearSelect.appendChild(option);
                        });

                        hideLoadingOverlay();

                        // Si hay un año preseleccionado, lanzar la carga de semanas
                        if (data.length > 0) {
                            yearSelect.selectedIndex = 1; // Seleccionar el primer año automáticamente
                            updateWeeks(); // Llamar a la función de carga de semanas con el año seleccionado
                        }

                        checkSelections(); // Verificar las selecciones después de actualizar los años
                    })
                    .catch(error => {
                        console.error('Error:', error);
                        hideLoadingOverlay();
                    });
            }
        }

        function checkSelections() {
            const farmSelect = document.getElementById('farm');
            const weekSelect = document.getElementById('week');
            const statusSelect = document.getElementById('status');
            const submitBtn = document.getElementById('submitBtn');

            if (farmSelect.value && weekSelect.value && statusSelect.value) {
                submitBtn.disabled = false;
            } else {
                submitBtn.disabled = true;
            }
        }

        function showLoadingOverlay() {
            document.getElementById('loadingOverlay').style.display = 'flex';
        }

        function hideLoadingOverlay() {
            document.getElementById('loadingOverlay').style.display = 'none';
        }
    </script>

<?php endif; ?>