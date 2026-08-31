	<img class="wave" src="<?php echo base_url(); ?>/assets/themes/admin/login/img/wave.png">
	<div class="container">
		<div class="img">
			<img src="<?php echo base_url(); ?>/assets/themes/admin/login/img/bellita_logo.png">
		</div>
		<div class="login-content">
			<?php echo form_open("auth/login");?>
                <?php $opts = array(
                'class' => 'input', 
                )?>		
                <?php $opts2 = array(
                'class' => 'input', 
                )?>
                
                <?php $opts3 = array(
                'class' => 'btn'
                )?>  
                
				<img src="<?php echo base_url(); ?>/assets/themes/admin/login/img/avatar.svg">
				<h2 class="title">LIFPRODECSA</h2>
           		<div class="input-div one">
           		   <div class="i">
           		   		<i class="fas fa-user"></i>
           		   </div>
           		   <div class="div">
           		   		<h5>Usuario</h5>
           		   		<?php echo form_input($identity, '', $opts);?>
           		   </div>
           		</div>
           		<div class="input-div pass">
           		   <div class="i"> 
           		    	<i class="fas fa-lock"></i>
           		   </div>
           		   <div class="div">
           		    	<h5>Contrase&ntilde;a</h5>
           		    	<?php echo form_input($password,'', $opts2);?>
            	   </div>
            	</div>
            	<?php echo form_submit('submit', 'Ingresar', $opts3);?>
            	<div id="infoMessage"><?php echo $message;?></div>
            	<p>Desarrollado por Life Food Products.</p>
            <?php echo form_close();?>
        </div>
    </div>
    <script type="text/javascript" src="<?php echo base_url(); ?>/assets/themes/admin/login/js/main.js"></script>
