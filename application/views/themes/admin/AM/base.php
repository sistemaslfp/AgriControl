<script src="https://ajax.googleapis.com/ajax/libs/jqueryui/1.10.3/jquery-ui.min.js"></script>
<script type="text/javascript" src="<?php echo base_url(); ?>assets/pivottable/pivot.js"></script>
<script type="text/javascript" src="<?php echo base_url(); ?>assets/pivottable/pivot.es.js" crossorigin="anonymous"></script>
<script type="text/javascript" src="<?php echo base_url(); ?>assets/table2CSV/table2CSV.js" crossorigin="anonymous"></script>


<link rel="stylesheet" type="text/css" href="<?php echo base_url(); ?>assets/pivottable/pivot.css">

<div class="form-group row">
    <form action="<?php echo base_url('AM/pivotlabores');?>" method="POST" id="reporteAM" name="miForm" onSubmit="return validateForm()" > 
        <div class="col-md-3 col-sm-3 ">
            <select name="annoReporte" id="selectorAnno" class="select2_single form-control">
                <option value="0">Seleccionar A&ntilde;o</option>
                <?php foreach($annosList as $anno) { ?>
                    <option value="<?php echo $anno->anno?>">A&ntilde;o <?php echo $anno->anno?></option>
                <?php }?>

            </select>
        </div>
        <div class="col-md-3 col-sm-3 ">
            <select name="semanaReporte" id="selectorSemana" class="select2_single form-control">
                <option value="0">Seleccionar Semana</option>
                <?php foreach($semanasList as $semana) { ?>
                    <option value="<?php echo $semana->semana?>">Semana <?php echo $semana->semana?></option>
                <?php }?>
            </select>
        </div>

        <div class="col-md-1 col-sm-1 ">
            <!-- <input type="submit" class="btn btn-primary"  value = '/f0b0 Filtrar' /> -->
            <button type="submit" class="btn btn-primary">
                <i class="fa fa-filter fa-lg"></i> Filtrar
            </button>
            <!-- <button class="btn btn-primary" onclick="exportTableToExcel('printTable')"></button> -->
        </div>

        <div class="col-md-1 col-sm-1 ">
            <button class="btn btn-dark" onclick="exportTableToExcel('printTable')"><i class="fa fa-download"></i> Exportar a Excel</button>
        </div>
    </form>
</div>

<div id="output" style="margin: 20px;"></div>

<?php if($mostrarPivot) { ?>

    <script>
        var utils = $.pivotUtilities;
        var heatmap =  utils.renderers["Heatmap"];
        $.ajax({
            type: 'GET',
            url: '<?php echo base_url('v2/reporteam');?>',
            data: {
                anno: '<?php echo $annoReporte?>',
                semana: '<?php echo $semanaReporte?>'
            },
            success: function (response) {
                $("#output").pivotUI(eval(response), {
                        rows: ["semana", "subtarea"],
                        cols: ["lote"],
                        vals: ["id"], 
                        renderer: heatmap
                }, false, "es");
            }   
        });
        
    </script>

    <script>
        function exportTableToExcel(tableID, filename = ''){
            var downloadLink;
            var dataType = 'application/vnd.ms-excel';
            var tableSelect = document.getElementById(tableID);
            var tableHTML = tableSelect.outerHTML.replace(/ /g, '%20');
            
            // Specify file name
            filename = filename?filename+'.xls':'reporte_am.xls';
            curtime = new Date().toISOString().
            replace(/T/, ' ').replace(/\..+/, '');
            filename = curtime + '__' + filename;
            
            // Create download link element
            downloadLink = document.createElement("a");
            
            document.body.appendChild(downloadLink);
            
            if(navigator.msSaveOrOpenBlob){
                var blob = new Blob(['\ufeff', tableHTML], {
                    type: dataType
                });
                navigator.msSaveOrOpenBlob( blob, filename);
            }else{
                // Create a link to the file
                downloadLink.href = 'data:' + dataType + ', ' + tableHTML;
            
                // Setting the file name
                downloadLink.download = filename;
                
                //triggering the function
                downloadLink.click();
            }
        }
    </script>

    <script>
        document.getElementById("selectorAnno").value = "<?php echo $annoReporte?>";
        document.getElementById("selectorSemana").value = "<?php echo $semanaReporte?>";
    </script>

<?php } ?>

<script>
    function validateForm() {
        var anno = document.forms["miForm"]["annoReporte"].value;
        var semana = document.forms["miForm"]["semanaReporte"].value;
        if (anno === "0") {
            alert("Debe seleccionar el año.");
            return false;
        }
        
        if (semana === "0") {
            alert("Debe seleccionar la semana.");
            return false;
        }
    }
</script>

