<h1><?php echo lang('edit_user_heading');?></h1>
<p><?php echo lang('edit_user_subheading');?></p>

<div id="infoMessage"><?php echo $message;?></div>

<?php echo form_open(uri_string());?>

      <p>
            <label>Usuario</label> <br />
            <strong><?php echo htmlspecialchars($user->username, ENT_QUOTES, 'UTF-8');?></strong>
      </p>

      <p>
            <?php echo lang('edit_user_phone_label', 'phone');?> <br />
            <?php echo form_input($phone);?>
      </p>

      <p>
            <?php echo lang('edit_user_password_label', 'password');?> <br />
            <?php echo form_input($password);?>
      </p>

      <p>
            <?php echo lang('edit_user_password_confirm_label', 'password_confirm');?><br />
            <?php echo form_input($password_confirm);?>
      </p>

      <?php if ($this->ion_auth->is_admin()): ?>

      <p>
            <label for="grupo">Rol</label> <br />
            <?php echo form_dropdown('grupo', $grupos, $grupo_actual, 'id="grupo"');?>
      </p>

      <p>
            <label for="finca_id">Hacienda</label> <br />
            <?php echo form_dropdown('finca_id', $fincas, $finca_actual, 'id="finca_id"');?>
            <br /><small>El rol admin siempre es global. El admin de hacienda necesita una hacienda.</small>
      </p>

      <?php endif ?>

      <?php echo form_hidden('id', $user->id);?>
      <?php echo form_hidden($csrf); ?>

      <p><?php echo form_submit('submit', lang('edit_user_submit_btn'));?></p>

<?php echo form_close();?>
