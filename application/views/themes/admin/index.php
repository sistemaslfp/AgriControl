<!DOCTYPE html>
<html lang="en">

<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title><?php echo $title; ?></title>
  <meta name="resource-type" content="document" />
  <meta name="robots" content="all, index, follow" />
  <meta name="googlebot" content="all, index, follow" />
  <?php
  /** -- Copy from here -- */
  if (!empty($meta))
    foreach ($meta as $name => $content) {
      echo "\n\t\t";
  ?>
    <meta name="<?php echo $name; ?>" content="<?php echo $content; ?>" /><?php
                                                                        }
                                                                      echo "\n";

                                                                      if (!empty($canonical)) {
                                                                        echo "\n\t\t";
                                                                          ?>
    <link rel="canonical" href="<?php echo $canonical ?>" /><?php

                                                                      }
                                                                      echo "\n\t";

                                                                      foreach ($css as $file) {
                                                                        echo "\n\t\t";
                                                            ?>
    <link rel="stylesheet" href="<?php echo $file; ?>" type="text/css" /><?php
                                                                        }
                                                                        echo "\n\t";

                                                                        foreach ($js as $file) {
                                                                          echo "\n\t\t";
                                                                          ?>
    <script src="<?php echo $file; ?>"></script><?php
                                                                        }
                                                                        echo "\n\t";

                                                                        /** -- to here -- */
                                                ?>

  <!-- jQuery -->
  <!-- <script src="<?php echo base_url(); ?>assets/themes/admin/vendors/jquery/dist/jquery.min.js"></script> -->

  <!-- <script src="https://kit.fontawesome.com/6061ddfec3.js" crossorigin="anonymous"></script> -->

  <!-- Bootstrap -->
  <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/bootstrap/dist/css/bootstrap.min.css"
    rel="stylesheet">
  <!-- Font Awesome -->
  <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/font-awesome/css/font-awesome.min.css"
    rel="stylesheet">
  <!-- NProgress -->
  <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/nprogress/nprogress.css" rel="stylesheet">
  <!-- iCheck -->
  <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/iCheck/skins/flat/green.css" rel="stylesheet">

  <!-- bootstrap-progressbar -->
  <link
    href="<?php echo base_url(); ?>assets/themes/admin/vendors/bootstrap-progressbar/css/bootstrap-progressbar-3.3.4.min.css"
    rel="stylesheet">

  <!-- bootstrap-daterangepicker -->
  <link href="<?php echo base_url(); ?>assets/themes/admin/vendors/bootstrap-daterangepicker/daterangepicker.css"
    rel="stylesheet">

  <!-- Custom Theme Style -->
  <link href="<?php echo base_url(); ?>assets/themes/admin/build/css/custom.min.css" rel="stylesheet">
  <script>
    $(document).ready(function() {
      $('.ui-pnotify-text').remove();
    });
  </script>

  <link rel="icon" href="<?php echo base_url(); ?>/assets/themes/admin/favicon.ico" type="image/x-icon">
</head>

<body class="nav-md">
  <div class="container body">
    <div class="main_container">
      <div class="col-md-3 left_col">
        <div class="left_col scroll-view">
          <div class="navbar nav_title" style="border: 0;">
            <a href="<?php echo base_url(); ?>" class="site_title"><i class="fa fa-leaf"></i>
              <span>LIFPRODECSA</span></a>
          </div>

          <div class="clearfix"></div>

          <!-- menu profile quick info -->
          <div class="profile clearfix">
            <div class="profile_pic">
              <img src="<?php echo base_url(); ?>assets/uploads/avatars/<?= $data_template['username'] ?>.png" alt="..."
                class="img-circle profile_img">
            </div>
            <div class="profile_info">
              <span>Bienvenido,</span>
              <h2><?= $data_template['username'] ?></h2>
            </div>
          </div>
          <!-- /menu profile quick info -->

          <br />

          <!-- sidebar menu -->
          <div id="sidebar-menu" class="main_menu_side hidden-print main_menu">
            <div class="menu_section">
              <h3>Reportes</h3>
              <ul class="nav side-menu">
                <li><a><i class="fa fa-dashboard"></i> Tablero de control <span class="fa fa-chevron-down"></span></a>
                  <ul class="nav child_menu">
                    <li><a href="<?php echo site_url('PM/reportePagos') ?>">Reporte de pago</a></li>
                    <?php if ($data_template['grupo'] < 3) { ?>
                      <li><a href="<?php echo site_url('PM/editarPM') ?>">-- 📝 Editar reportes de pago</a></li>
                      <li><a href="<?php echo site_url('Operations/PM/PaymentAdjustment') ?>">-- 💲 Registrar Ajustes de pago</a></li>
                      <li><a href="<?php echo site_url('Operations/PM/PaymentAdjustment/listAdjustments') ?>">-- 📄 Ver Ajustes de pago</a></li>
                    <?php } ?>
                    <li><a href="<?php echo site_url('AM') ?>">Reporte de labores </a></li>
                    <li><a href="<?php echo base_url('AM/pivotlabores'); ?>">-- Pivot labores </a></li>
                    <li><a href="<?php echo site_url('Historiatarifas') ?>">Historial de Tarifas</a></li>
                    <li><a href="<?php echo site_url('Cosechacacao') ?>">Reporte de Cosecha</a></li>
                    <li><a href="<?php echo base_url('Cosechacacao/Resumen'); ?>">-- Resumen Jornales</a></li>
                    <li><a href="<?php echo site_url('Riego') ?>">Reporte de Riego</a></li>
                    <li><a href="<?php echo site_url('Postharvest') ?>">Datos Poscosecha</a></li>
                    <li><a href="<?php echo site_url('Postharvest/Master') ?>">-- Reporte Maestro</a></li>
                  </ul>
                </li>
              </ul>
            </div>
            <?php if ($data_template['grupo'] < 3) { ?>
              <div class="menu_section">
                <h3>Maestros</h3>
                <ul class="nav side-menu">
                  <li><a><i class="fa fa-table"></i> Tablas maestras <span class="fa fa-chevron-down"></span></a>
                    <ul class="nav child_menu">
                      <li><a href="<?php echo site_url('Personal') ?>">Personal </a></li>
                      <li><a href="<?php echo site_url('Personal/roles') ?>">---Roles </a></li>
                      <li><a href="<?php echo site_url('Personal/estado') ?>">---Estado </a></li>
                      <li><a href="<?php echo site_url('Tarea') ?>">Tareas </a></li>
                      <li><a href="<?php echo site_url('Subtarea') ?>">Subtareas </a></li>
                      <li><a href="<?php echo site_url('PmCostGroup') ?>">---Grupos de costo</a></li>
                      <li><a href="<?php echo site_url('Subtarea/tipoPago') ?>">---Tipo de Pago</a></li>
                      <li><a href="<?php echo site_url('Subtarea/unidadlabor') ?>">---Unidades de labor</a></li>
                      <li><a href="<?php echo site_url('Finca') ?>">Fincas</a></li>
                      <li><a href="<?php echo site_url('Lote') ?>">Lotes</a></li>
                      <li><a href="<?php echo site_url('Modulo') ?>">M&oacute;dulos</a></li>
                      <li><a href="<?php echo site_url('Cultivos') ?>">Cultivos</a></li>
                      <li><a href="<?php echo site_url('Operations/PM/PaymentAdjustment/rateConversion') ?>">Factor Conversión Pagos</a></li>
                    </ul>
                  </li>
                </ul>
              </div>
            <?php } ?>

            <?php if ($data_template['grupo'] == 1) { ?>
              <div class="menu_section">
                <h3>Administrador</h3>
                <ul class="nav side-menu">
                  <li><a><i class="fa fa-wrench"></i> Configuraci&oacute;n <span class="fa fa-chevron-down"></span></a>
                    <ul class="nav child_menu">
                      <li><a href="<?php echo site_url('Auth') ?>">Usuarios </a></li>
                    </ul>
                  </li>
                </ul>
              </div>
            <?php } ?>
          </div>
          <!-- /sidebar menu -->

          <!-- /menu footer buttons -->
          <div class="sidebar-footer hidden-small">
            Agricontrol - LIFPRODECSA v1.2
          </div>
          <!--<div class="sidebar-footer hidden-small">
                <a data-toggle="tooltip" data-placement="top" title="Configuraci&oacute;n">
                  <span class="glyphicon glyphicon-cog" aria-hidden="true"></span>
                </a>
                <a data-toggle="tooltip" data-placement="top" title="Pendiente">
                  <span class="glyphicon glyphicon-fullscreen" aria-hidden="true"></span>
                </a>
                <a data-toggle="tooltip" data-placement="top" title="Bloquear">
                  <span class="glyphicon glyphicon-eye-close" aria-hidden="true"></span>
                </a>
                <a data-toggle="tooltip" data-placement="top" title="Cerrar sesi&oacute;n" href="<?php echo base_url('Auth/logout'); ?>">
                  <span class="glyphicon glyphicon-off" aria-hidden="true"></span>
                </a>
              </div>-->
          <!-- /menu footer buttons -->
        </div>
      </div>

      <!-- top navigation -->
      <div class="top_nav">
        <div class="nav_menu">
          <nav>
            <div class="nav toggle">
              <a id="menu_toggle"><i class="fa fa-bars"></i></a>
            </div>
            <ul class="nav navbar-nav navbar-right">
              <li class="">
                <a href="javascript:;" class="user-profile dropdown-toggle" data-toggle="dropdown"
                  aria-expanded="false">
                  <img src="<?php echo base_url(); ?>/assets/uploads/avatars/<?= $data_template['username'] ?>.png"
                    alt=""><?= $data_template['username'] ?>
                  <span class=" fa fa-angle-down"></span>
                </a>
                <ul class="dropdown-menu dropdown-usermenu pull-right">
                  <!--<li><a href="javascript:;"> Perfil</a></li>
                      <li>
                        <a href="javascript:;">
                          <span class="badge bg-red pull-right">50%</span>
                          <span>Configuración</span>
                        </a>
                      </li>-->
                  <!-- <li><a href="javascript:;">Help</a></li> -->
                  <li><a href="<?php echo base_url('Auth/logout'); ?>"><i class="fa fa-sign-out pull-right"></i> Cerrar
                      sesión</a></li>
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>
      <!-- /top navigation -->

      <!-- page content -->
      <div class="right_col" role="main">
        <?php echo $output; ?>
      </div>
      <!-- /page content -->

      <!-- footer content -->
      <footer>
        <div class="clearfix"></div>
        <div class="pull-right">
          Life Food Products
        </div>
        <div class="clearfix"></div>
      </footer>
      <!-- /footer content -->
    </div>
  </div>


  <!-- Bootstrap -->
  <script src="<?php echo base_url(); ?>assets/themes/admin/vendors/bootstrap/dist/js/bootstrap.min.js"></script>
  <!-- FastClick -->
  <script src="<?php echo base_url(); ?>assets/themes/admin/vendors/fastclick/lib/fastclick.js"></script>
  <!-- NProgress -->
  <script src="<?php echo base_url(); ?>assets/themes/admin/vendors/nprogress/nprogress.js"></script>
  <!-- bootstrap-progressbar -->
  <script
    src="<?php echo base_url(); ?>assets/themes/admin/vendors/bootstrap-progressbar/bootstrap-progressbar.min.js"></script>
  <!-- iCheck -->
  <script src="<?php echo base_url(); ?>assets/themes/admin/vendors/iCheck/icheck.min.js"></script>
  <!-- Skycons -->
  <script src="<?php echo base_url(); ?>assets/themes/admin/vendors/skycons/skycons.js"></script>

  <!-- DateJS -->
  <script src="<?php echo base_url(); ?>assets/themes/admin/vendors/DateJS/build/date.js"></script>

  <!-- bootstrap-daterangepicker -->
  <script src="<?php echo base_url(); ?>assets/themes/admin/vendors/moment/min/moment.min.js"></script>
  <script
    src="<?php echo base_url(); ?>assets/themes/admin/vendors/bootstrap-daterangepicker/daterangepicker.js"></script>

  <!-- Custom Theme Scripts -->
  <script src="<?php echo base_url(); ?>assets/themes/admin/build/js/custom.min.js"></script>

</body>

</html>