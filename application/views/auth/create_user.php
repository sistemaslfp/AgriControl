<p class="mb-3"><a href="<?php echo site_url('auth'); ?>" class="btn btn-secondary"><i class="fa fa-arrow-left"></i> Volver a usuarios</a></p>

<h1><?php echo lang('create_user_heading');?></h1>
<p><?php echo lang('create_user_subheading');?></p>

<div id="infoMessage"><?php echo $message;?></div>

<?php echo form_open("auth/create_user");?>

      <?php
      if($identity_column!=='email') {
          echo '<p>';
          echo '<label for="identity">Usuario</label>';
          echo '<br />';
          echo form_error('identity');
          echo form_input($identity);
          echo '</p>';
      }
      ?>

      <p>
            <label for="grupo">Rol</label> <br />
            <?php echo form_dropdown('grupo', $grupos, $grupo_actual, 'id="grupo"');?>
      </p>

      <p>
            <label for="finca_id">Hacienda</label> <br />
            <?php echo form_dropdown('finca_id', $fincas, $finca_actual, 'id="finca_id"');?>
            <br /><small>El rol admin siempre es global. El admin de hacienda necesita una hacienda.</small>
      </p>

      <p>
            <?php echo lang('create_user_email_label', 'email');?> <br />
            <?php echo form_input($email);?>
      </p>

      <p>
            <?php echo lang('create_user_phone_label', 'phone');?> <br />
            <?php echo form_input($phone);?>
      </p>

      <p>
            <?php echo lang('create_user_password_label', 'password');?> <br />
            <?php echo form_input($password);?>
      </p>

      <p>
            <?php echo lang('create_user_password_confirm_label', 'password_confirm');?> <br />
            <?php echo form_input($password_confirm);?>
      </p>


      <p><?php echo form_submit('submit', lang('create_user_submit_btn'));?></p>

<?php echo form_close();?>
