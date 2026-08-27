<?php if ($this->session->flashdata('message')): ?>
  <div style="background-color: orange; color: white; padding: 10px; width: 100%; margin: 5px;">
    <?php echo $this->session->flashdata('message'); ?>
  </div>
<?php endif; ?>
<div style="padding: 10px">
  <?php echo $output; ?>
</div>
<?php foreach ($js_files as $file): ?>
  <script src="<?php echo $file; ?>"></script>
<?php endforeach; ?>


<?php
foreach ($css_files as $file): ?>
  <link type="text/css" rel="stylesheet" href="<?php echo $file; ?>" />
<?php endforeach; ?>