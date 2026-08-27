<!DOCTYPE html>
<html lang="en">

    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <title><?php echo $title; ?></title>
        <meta name="resource-type" content="document" />
        <meta name="robots" content="all, index, follow"/>
        <meta name="googlebot" content="all, index, follow" />
        <?php
        /** -- Copy from here -- */
        if(!empty($meta))
        foreach($meta as $name=>$content){
          echo "\n\t\t";
          ?><meta name="<?php echo $name; ?>" content="<?php echo $content; ?>" /><?php
            }
        echo "\n";

        if(!empty($canonical))
        {
          echo "\n\t\t";
          ?><link rel="canonical" href="<?php echo $canonical?>" /><?php

        }
        echo "\n\t";

        foreach($css as $file){
          echo "\n\t\t";
          ?><link rel="stylesheet" href="<?php echo $file; ?>" type="text/css" /><?php
        } echo "\n\t";

        foreach($js as $file){
            echo "\n\t\t";
            ?><script src="<?php echo $file; ?>"></script><?php
        } echo "\n\t";

        /** -- to here -- */
      ?>
        
        <!-- Bootstrap -->
        <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/bootstrap/dist/css/bootstrap.min.css" rel="stylesheet">
        <!-- Font Awesome -->
        <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/font-awesome/css/font-awesome.min.css" rel="stylesheet">
        <!-- NProgress -->
        <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/nprogress/nprogress.css" rel="stylesheet">
        <!-- iCheck -->
        <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/iCheck/skins/flat/green.css" rel="stylesheet">
      
        <!-- bootstrap-progressbar -->
        <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/bootstrap-progressbar/css/bootstrap-progressbar-3.3.4.min.css" rel="stylesheet">

        <!-- bootstrap-daterangepicker -->
        <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/bootstrap-daterangepicker/daterangepicker.css" rel="stylesheet">

        <script>
          $(document).ready(function (){
            $('.ui-pnotify-text').remove();
          });
        </script>

        <link rel="icon" href="<?php echo base_url(); ?>/assets/themes/admin/favicon.ico" type="image/x-icon">
    </head>
    <body>
          <div style="text-align:center; margin: 4rem;"><a href="<?php echo base_url(); ?>/Auth/logout" style="font-size:4rem; font-weight: bold;">Cerrar sesi&oacute;n</a></div>
          <!-- page content -->
          <div class="right_col" role="main">
            <?php echo $output;?>
          </div>
          <!-- /page content -->        
    </body>
</html>