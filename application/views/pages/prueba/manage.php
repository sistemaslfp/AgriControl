<div class="container mt-5">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="h3"><?php echo $title; ?></h1>
        <a href="<?php echo base_url('Prueba/create'); ?>" class="btn btn-primary">Add New Prueba</a>
    </div>

    <div class="table-responsive">
        <table class="table table-striped table-bordered">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                <?php if (!empty($result)) : ?>
                    <?php foreach ($result as $index => $item) : ?>
                        <tr>
                            <td><?php echo $index + 1 + $page_uri_segment; ?></td>
                            <td><?php echo htmlspecialchars($item->username); ?></td>
                            <td><?php echo htmlspecialchars($item->email); ?></td>
                            <td>
                                <a href="<?php echo base_url('Prueba/view/' . $item->id); ?>" class="btn btn-info btn-sm">View</a>
                                <a href="<?php echo base_url('Prueba/update/' . $item->id); ?>" class="btn btn-warning btn-sm">Edit</a>
                                <a href="<?php echo base_url('Prueba/soft_delete/' . $item->id); ?>" class="btn btn-danger btn-sm" onclick="return confirm('Are you sure you want to delete this record?');">Delete</a>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                <?php else : ?>
                    <tr>
                        <td colspan="4" class="text-center">No records found</td>
                    </tr>
                <?php endif; ?>
            </tbody>
        </table>
    </div>

    <div class="d-flex justify-content-center">
        <?php echo $pagination; ?>
    </div>
</div>

<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>