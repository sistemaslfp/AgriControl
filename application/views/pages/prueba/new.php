<div class="container mt-5">
    <h1 class="h3 mb-4"><?php echo $title; ?></h1>
    <div class="card">
        <div class="card-body">
            <form action="<?php echo base_url('Prueba/create'); ?>" method="POST">
                <div class="mb-3">
                    <label for="username" class="form-label">Username</label>
                    <input type="text" class="form-control" id="username" name="username" value="<?php echo set_value('username'); ?>" required>
                    <?php echo form_error('username', '<small class="text-danger">', '</small>'); ?>
                </div>

                <div class="mb-3">
                    <label for="email" class="form-label">Email</label>
                    <input type="email" class="form-control" id="email" name="email" value="<?php echo set_value('email'); ?>" required>
                    <?php echo form_error('email', '<small class="text-danger">', '</small>'); ?>
                </div>

                <button type="submit" class="btn btn-primary">Save</button>
                <a href="<?php echo base_url('Prueba'); ?>" class="btn btn-secondary">Cancel</a>
            </form>
        </div>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>