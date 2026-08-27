<script>
    // $(document).ready(function () {
    //     var table = $('.display').DataTable({
    //         rowReorder: {
    //             selector: 'td:nth-child(2)'
    //         },
    //         responsive: true
    //     });
    // });

</script>


<div style="padding: 10px">
    <!--PLY-HS00000001 - Filtro de reporte-->
    <div style="display: block;min-height:60px;margin: 10px;">
        <span>Filtros Reporte:</span>
        <form action="" method="get" id="amForm">
            <div style="float:left; display: inline; width:40%; padding-right: 20px;">
                <select name="finca" id="finca" style="width: 100%; float: left; min-height: 35px; padding: 6px 12px">
                    <?php
                    $listadoFincas = $data['listadoFincas'];
                    if (isset($_GET["finca"])) {
                        $IdFinca = $_GET["finca"];
                    }
                    foreach ($listadoFincas as $key => $value) {
                        $selectedAtt = $key == $IdFinca ? "selected" : "";
                        echo '<option value="' . $key . '" ' . $selectedAtt . '>' . $value . '</option>';
                    }
                    ?>
                </select>
            </div>
            <div style="float:left; display: inline; width:10%">
                <div>
                    <input type="text"
                        value="<?php echo (isset($_GET['fechaDesde']) ? $_GET['fechaDesde'] : date('m/d/Y')); ?>"
                        class="form-control has-feedback-left" id="single_cal4" placeholder="Ingrese fecha"
                        aria-describedby="inputSuccess2Status4" name="fechaDesde"
                        style="max-width: 100px; float: left; min-height: 35px; padding: 6px 12px">
                </div>
                <div style="clear:both;"></div>
                <label>Desde</label>
            </div>
            <div style="float:left; display: inline; width:10%">
                <div>
                    <input type="text"
                        value="<?php echo (isset($_GET['fechaHasta']) ? $_GET['fechaHasta'] : date('m/d/Y')); ?>"
                        class="form-control has-feedback-left" id="single_cal5" placeholder="Ingrese fecha"
                        aria-describedby="inputSuccess2Status5" name="fechaHasta"
                        style="max-width: 100px; float: left; min-height: 35px; padding: 6px 12px">
                </div>
                <div style="clear:both;"></div>
                <label>Hasta</label>
            </div>
            <div style="float:left; display: inline; width:10%">
                <button type="submit"
                    style="min-height: 35px; margin: 0 5px; background-color: #1aa4de; color: white; padding: 4px 10px">
                    <i class="fa fa-filter"></i>
                    Filtrar
                </button>

                <!--<input type="submit" value="📑 Filtrar" style="min-height: 35px; margin: 0 5px; background-color: #1aa4de; color: white; padding: 4px 10px"/>-->
            </div>
        </form>
    </div>
    <!-- / PLY-HS00000001 - Filtro de reporte-->

    <?php echo $output; ?>
</div>
<?php foreach ($js_files as $file): ?>
    <script src="<?php echo $file; ?>"></script>
<?php endforeach; ?>


<?php foreach ($css_files as $file): ?>
    <link type="text/css" rel="stylesheet" href="<?php echo $file; ?>" />
<?php endforeach; ?>