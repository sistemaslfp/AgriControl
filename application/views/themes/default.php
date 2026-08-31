<html lang="en">
	<head>
		<title><?php echo $title; ?></title>
		<meta name="resource-type" content="document" />
		<meta name="robots" content="all, index, follow"/>
		<meta name="googlebot" content="all, index, follow" />
		<title>Ingreso Bellita</title>
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

    <!-- Le styles -->
    <link href="<?php echo base_url(); ?>assets/themes/default/hero_files/bootstrap.css" rel="stylesheet">
    <link href="<?php echo base_url(); ?>assets/themes/default/hero_files/bootstrap-responsive.css" rel="stylesheet">
	<link href="<?php echo base_url(); ?>assets/themes/default/hero_files/custom.css" rel="stylesheet">
	<script src="<?php echo base_url(); ?>assets/themes/default/js/bootstrap.bundle.min.js" crossorigin="anonymous"></script>
	<script src="https://kit.fontawesome.com/6061ddfec3.js" crossorigin="anonymous"></script>
	
   
    <!-- Le HTML5 shim, for IE6-8 support of HTML5 elements -->
    <!--[if lt IE 9]>
      <script src="http://html5shim.googlecode.com/svn/trunk/html5.js"></script>
    <![endif]-->

    <!-- Le fav and touch icons -->
    <link rel="shortcut icon" href="<?php echo base_url(); ?>assets/themes/default/images/favicon.png" type="image/x-icon"/>
	<meta property="og:image" content="<?php echo base_url(); ?>assets/themes/default/images/facebook-thumb.png"/>
	<link rel="image_src" href="<?php echo base_url(); ?>assets/themes/default/images/facebook-thumb.png" />
	<style type="text/css">

	::selection{ background-color: #E13300; color: white; }
	::moz-selection{ background-color: #E13300; color: white; }
	::webkit-selection{ background-color: #E13300; color: white; }

	body {
		background-color: #fff;
		font: 13px/20px normal Helvetica, Arial, sans-serif;
		color: #4F5155;
	}

	a {
		color: #003399;
		background-color: transparent;
		font-weight: normal;
	}

	h1 {
		color: #444;
		background-color: transparent;
		border-bottom: 1px solid #D0D0D0;
		font-size: 19px;
		font-weight: normal;
		margin: 0 0 14px 0;
		padding: 14px 15px 10px 15px;
	}

	code {
		font-family: Consolas, Monaco, Courier New, Courier, monospace;
		font-size: 12px;
		background-color: #f9f9f9;
		border: 1px solid #D0D0D0;
		color: #002166;
		display: block;
		margin: 14px 0 14px 0;
		padding: 12px 10px 12px 10px;
	}

	#body{
		margin: 0 15px 0 15px;
	}

	p.footer{
		text-align: right;
		font-size: 11px;
		border-top: 1px solid #D0D0D0;
		line-height: 32px;
		padding: 0 10px 0 10px;
		margin: 20px 0 0 0;
	}

	#container{
		margin: 10px;
		border: 1px solid #D0D0D0;
		-webkit-box-shadow: 0 0 8px #D0D0D0;
	}

	.wrapper {
		display: flex;
		align-items: stretch;
	}

	/* ---------------------------------------------------
		SIDEBAR STYLE
	----------------------------------------------------- */

	.wrapper {
		display: flex;
		width: 100%;
		align-items: stretch;
	}

	#sidebar {
		min-width: 250px;
		max-width: 250px;
		background: #7386D5;
		color: #fff;
		transition: all 0.3s;
	}

	#sidebar.active {
		margin-left: -250px;
	}

	#sidebar .sidebar-header {
		padding: 20px;
		background: #6d7fcc;
	}

	#sidebar ul.components {
		padding: 20px 0;
		border-bottom: 1px solid #47748b;
	}

	#sidebar ul p {
		color: #fff;
		padding: 10px;
	}

	#sidebar ul li a {
		padding: 10px;
		font-size: 1.1em;
		display: block;
	}

	#sidebar ul li a:hover {
		color: #7386D5;
		background: #fff;
	}

	#sidebar ul li.active>a,
	a[aria-expanded="true"] {
		color: #fff;
		background: #6d7fcc;
	}

	a[data-toggle="collapse"] {
		position: relative;
	}

	.dropdown-toggle::after {
		display: block;
		position: absolute;
		top: 50%;
		right: 20px;
		transform: translateY(-50%);
	}

	ul ul a {
		font-size: 0.9em !important;
		padding-left: 30px !important;
		background: #6d7fcc;
	}

	ul.CTAs {
		padding: 20px;
	}

	ul.CTAs a {
		text-align: center;
		font-size: 0.9em !important;
		display: block;
		border-radius: 5px;
		margin-bottom: 5px;
	}

	a.download {
		background: #fff;
		color: #7386D5;
	}

	a.article,
	a.article:hover {
		background: #6d7fcc !important;
		color: #fff !important;
	}

	ul ul a {
		font-size: 0.9em !important;
		padding-left: 30px !important;
		background: #6d7fcc;
	}

	@media (max-width: 768px) {
		#sidebar {
			margin-left: -250px;
		}
		#sidebar.active {
			margin-left: 0;
		}

		#sidebarCollapse span {
			display: none;
		}
	}

	#primary-nav {
		background-color: skyblue;
	}

	.navbar {
		padding: 15px 10px;
		background: #6d7fcc;
		border: none;
		border-radius: 0;
		/* margin-bottom: 40px; */
		box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.1);
	}

	.navbar-light .navbar-nav .nav-link {
		color: rgba(255, 255, 255, 1);
	}

	.navbar a {
		color: #fff;
	}

	.navbar-btn {
		box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.1);
		outline: none !important;
		border: none;
	}

	.line {
		width: 100%;
		height: 1px;
		border-bottom: 1px dashed #ddd;
		margin: 40px 0;
	}

	.list-unstyled a{
		color: #fff;
		text-decoration: none;
		text-transform: uppercase;
	}

	/* ---------------------------------------------------
    CONTENT STYLE
	----------------------------------------------------- */

	#content {
		width: 100%;
		padding: 0px;
		min-height: 100vh;
		transition: all 0.3s;
	}

	.container-xl, .container-lg, .container-md, .container-sm, .container {
		max-width: 960px;
	}
	</style>

</head>

<body>
<div class="wrapper">
	
        <!-- Sidebar  -->
        <nav id="sidebar">
            <div class="sidebar-header">
				<h3>Bellita</h3>
            </div>

            <ul class="list-unstyled components">
                <p>Men&uacute; de navegaci&oacute;n</p>
                <li class="active">
                    <a href="#homeSubmenu" data-toggle="collapse" aria-expanded="false" class="dropdown-toggle">Reportes</a>
                    <ul class="collapse list-unstyled" id="homeSubmenu">
                        <li>
                            <a href="<?php echo site_url('PM/reportePagos'); ?>#">Reporte de pagos</a>
                        </li>
						<li>
                            <a href="<?php echo site_url('AM'); ?>#">AM</a>
                        </li>
                    </ul>
                </li>
                <li>
                    <a href="#paginaConfiguracion" data-toggle="collapse" aria-expanded="false" class="dropdown-toggle">Configuraci&oacute;n</a>
                    <ul class="collapse list-unstyled" id="paginaConfiguracion">
                        <li>
							<a href="<?php echo site_url('Personal'); ?>">Personal</a>
                        </li>
                        <li>
						<a href="<?php echo site_url('Subtarea'); ?>">Subtareas</a>
                        </li>
						<li>
							<a href="<?php echo site_url('Subtarea/unidadlabor'); ?>">Unidades de labor</a>
                        </li>
                        <li>
						<a href="<?php echo site_url('Finca'); ?>">Fincas</a>
                        </li>
						<li>
						<a href="<?php echo site_url('Lote'); ?>">Lotes</a>
                        </li>
						<li>
						<a href="<?php echo site_url('Modulo'); ?>">M&oacute;dulos</a>
                        </li>
                    </ul>
                </li>			
            </ul>

            <ul class="list-unstyled CTAs">
                <li>
                    <a href="#" class="download" style="color: #6d7fcc;">Descargar APK</a>
                </li>
                <li>
                    <a href="<?php echo site_url('Auth/logout') ?>" class="article">Cerrar sesi&oacute;n</a>
                </li>
            </ul>
        </nav>

			<!-- Page Content  -->
			<div id="content">
			<nav class="navbar navbar-expand-lg navbar-light">
                <div class="container-fluid">

                    <button type="button" id="moverMenuLateral" class="btn btn-light">
                        <!-- <svg class="svg-inline--fa fa-align-left fa-w-14" aria-hidden="true" data-prefix="fas" data-icon="align-left" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" data-fa-i2svg=""><path fill="currentColor" d="M288 44v40c0 8.837-7.163 16-16 16H16c-8.837 0-16-7.163-16-16V44c0-8.837 7.163-16 16-16h256c8.837 0 16 7.163 16 16zM0 172v40c0 8.837 7.163 16 16 16h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16zm16 312h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16zm256-200H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16h256c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16z"></path></svg>-->
						<i class="fas fa-align-left"></i> 
                        <span></span>
                    </button>

                    <button class="btn btn-dark d-inline-block d-lg-none ml-auto collapsed" type="button" data-toggle="collapse" data-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
                        <!-- <svg class="svg-inline--fa fa-align-justify fa-w-14" aria-hidden="true" data-prefix="fas" data-icon="align-justify" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" data-fa-i2svg=""><path fill="currentColor" d="M0 84V44c0-8.837 7.163-16 16-16h416c8.837 0 16 7.163 16 16v40c0 8.837-7.163 16-16 16H16c-8.837 0-16-7.163-16-16zm16 144h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16zm0 256h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16zm0-128h416c8.837 0 16-7.163 16-16v-40c0-8.837-7.163-16-16-16H16c-8.837 0-16 7.163-16 16v40c0 8.837 7.163 16 16 16z"></path></svg> -->
							<i class="fas fa-align-justify"></i>
                    </button>

                    <div class="navbar-collapse collapse" id="navbarSupportedContent" style="">
                        <ul class="nav navbar-nav ml-auto">
                            <li class="nav-item active">
                                <a class="nav-link" href="#">Enlace r&aacute;pido 1</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="#">Enlace r&aacute;pido 2</a>
                            </li>
                            <li class="nav-item">
                                <a class="nav-link" href="#">Enlace r&aacute;pido 3</a>
                            </li>
                        </ul>
                    </div>
                </div>
            </nav>

			<div class="container">
				<?php if($this->load->get_section('text_header') != '') { ?>
				<h1>
				<?php echo $this->load->get_section('text_header');?>
				</h1>
				<h1>sdfasd</h1>
				<?php }?>
				<div class="row">


				<?php echo $output;?>
				<?php echo $this->load->get_section('sidebar'); ?>


			</div>

			<hr/>

			<footer>
				<div class="row">
					<div class="span6 b10">
						Life Food Products
					</div>
				</div>
			</footer>

			</div>
	<!-- /container -->
		</div>

</div>








	<script type="text/javascript">
        $(document).ready(function () {
            $('#moverMenuLateral').on('click', function () {
                $('#sidebar').toggleClass('active');
            });
        });
    </script>
</body></html>
