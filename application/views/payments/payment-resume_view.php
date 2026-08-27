<?php foreach ($grouped_data as $subtask_name => $rows): ?>
    <h3><?php echo $subtask_name; ?></h3>
    <table border="1">
        <thead>
            <tr>
                <th>Operator ID Doc</th>
                <th>Operator Name</th>
                <th>Operation Date</th>
                <th>Subtotal Payment</th>
                <!-- Aquí las columnas dinámicas de fechas -->
                <?php foreach (array_keys(current($rows)['totals']) as $date): ?>
                    <th><?php echo $date; ?></th>
                <?php endforeach; ?>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($rows as $row): ?>
                <tr>
                    <td><?php echo $row['operator_iddoc']; ?></td>
                    <td><?php echo $row['operator_name']; ?></td>
                    <td><?php echo $row['operation_date']; ?></td>
                    <td><?php echo $row['subtotal_payment']; ?></td>
                    <!-- Aquí los valores sumados por fecha -->
                    <?php foreach ($row['totals'] as $date => $total): ?>
                        <td><?php echo $total; ?></td>
                    <?php endforeach; ?>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
    <br>
<?php endforeach; ?>