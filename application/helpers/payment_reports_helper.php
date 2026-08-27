<?php if (!defined('BASEPATH'))
    exit('No direct script access allowed');

if (!function_exists('editButton')) {
    function editButton($primary_key, $row)
    {
        return site_url('Payment/edit_adjusments?farm=' . $row->operator_id_finca . '&week=' . $row->payment_week);
    }
}
