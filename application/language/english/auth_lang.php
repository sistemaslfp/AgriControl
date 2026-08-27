<?php  if ( ! defined('BASEPATH')) exit('No direct script access allowed');
/**
* Name:  Auth Lang - English
*
* Author: Ben Edmunds
* 		  ben.edmunds@gmail.com
*         @benedmunds
*
* Author: Daniel Davis
*         @ourmaninjapan
*
* Location: https://github.com/benedmunds/CodeIgniter-Ion-Auth
*
* Created:  03.09.2013
*
* Description:  English language file for Ion Auth example views
*
*/

// Errors
$lang['error_csrf'] = 'This form post did not pass our security checks.';

// Login
$lang['login_heading']         = 'Acceso';
$lang['login_subheading']      = 'Inicie sesión con su correo electrónico/nombre de usuario y contraseña a continuación.';
$lang['login_identity_label']  = 'Correo electrónico/nombre de usuario:';
$lang['login_password_label']  = 'Contraseña:';
$lang['login_remember_label']  = 'Recuérdame:';
$lang['login_submit_btn']      = 'Acceso';
$lang['login_forgot_password'] = 'Olvidaste tu contraseña?';

// Index
$lang['index_heading']           = 'Usuarios';
$lang['index_subheading']        = 'A continuación se muestra una lista de los usuarios con acceso a esta aplicación.';
$lang['index_fname_th']          = 'Nombre';
$lang['index_lname_th']          = 'Apellidos';
$lang['index_email_th']          = 'Correo electrónico';
$lang['index_groups_th']         = 'Grupo';
$lang['index_status_th']         = 'Estado';
$lang['index_action_th']         = 'Acción';
$lang['index_active_link']       = 'Activo';
$lang['index_inactive_link']     = 'Inactivo';
$lang['index_create_user_link']  = 'Crear un nuevo usuario';
$lang['index_create_group_link'] = 'Crear un nuevo grupo';

// Deactivate User
$lang['deactivate_heading']                  = 'Desactivar Usuario';
$lang['deactivate_subheading']               = 'Estás seguro de que quieres desactivar al usuario \'%s\'';
$lang['deactivate_confirm_y_label']          = 'Si:';
$lang['deactivate_confirm_n_label']          = 'No:';
$lang['deactivate_submit_btn']               = 'Enviar';
$lang['deactivate_validation_confirm_label'] = 'Confirmación';
$lang['deactivate_validation_user_id_label'] = 'Id usuario';

// Create User
$lang['create_user_heading']                           = 'Crear usuario';
$lang['create_user_subheading']                        = 'Por favor ingrese el usuario\'s información abajo.';
$lang['create_user_fname_label']                       = 'Nombre:';
$lang['create_user_lname_label']                       = 'Apellidos:';
$lang['create_user_company_label']                     = 'Nombre de la empresa:';
$lang['create_user_identity_label']                    = 'Identidad:';
$lang['create_user_email_label']                       = 'Correo electrónico:';
$lang['create_user_phone_label']                       = 'Teléfono:';
$lang['create_user_password_label']                    = 'Contraseña:';
$lang['create_user_password_confirm_label']            = 'Confirmar contraseña:';
$lang['create_user_submit_btn']                        = 'Crear usuario';
$lang['create_user_validation_fname_label']            = 'Nombre';
$lang['create_user_validation_lname_label']            = 'Apellidos';
$lang['create_user_validation_identity_label']         = 'Identidad';
$lang['create_user_validation_email_label']            = 'Dirección correo electrónico';
$lang['create_user_validation_phone_label']            = 'Teléfono';
$lang['create_user_validation_company_label']          = 'Nombre de la empresa';
$lang['create_user_validation_password_label']         = 'Contraseña';
$lang['create_user_validation_password_confirm_label'] = 'Confirmar contraseña';

// Edit User
$lang['edit_user_heading']                           = 'Editar usuario';
$lang['edit_user_subheading']                        = 'Por favor ingrese el usuario\'s información abajo.';
$lang['edit_user_fname_label']                       = 'Nombre:';
$lang['edit_user_lname_label']                       = 'Apellidos:';
$lang['edit_user_company_label']                     = 'Nombre de la empresa:';
$lang['edit_user_email_label']                       = 'Correo electrónico:';
$lang['edit_user_phone_label']                       = 'Teléfono:';
$lang['edit_user_password_label']                    = 'Contraseña: (si cambia la contraseña)';
$lang['edit_user_password_confirm_label']            = 'Confirmar contraseña: (si cambia la contraseña)';
$lang['edit_user_groups_heading']                    = 'Miembro de los grupos';
$lang['edit_user_submit_btn']                        = 'Guardar usuario';
$lang['edit_user_validation_fname_label']            = 'Nombre';
$lang['edit_user_validation_lname_label']            = 'Apellidos';
$lang['edit_user_validation_email_label']            = 'Email';
$lang['edit_user_validation_phone_label']            = 'Teléfono';
$lang['edit_user_validation_company_label']          = 'Nombre empresa';
$lang['edit_user_validation_groups_label']           = 'Grupos';
$lang['edit_user_validation_password_label']         = 'Contraseña';
$lang['edit_user_validation_password_confirm_label'] = 'Confirmar contraseña';

// Create Group
$lang['create_group_title']                  = 'Crear grupo';
$lang['create_group_heading']                = 'Crear grupo';
$lang['create_group_subheading']             = 'Ingresar la siguiente información.';
$lang['create_group_name_label']             = 'Nombre de grupo:';
$lang['create_group_desc_label']             = 'Descripción:';
$lang['create_group_submit_btn']             = 'Crear grupo';
$lang['create_group_validation_name_label']  = 'Nombre de grupo';
$lang['create_group_validation_desc_label']  = 'Descripción';

// Edit Group
$lang['edit_group_title']                  = 'Editar grupo';
$lang['edit_group_saved']                  = 'Grupo guardado';
$lang['edit_group_heading']                = 'Editar grupo';
$lang['edit_group_subheading']             = 'Ingresar la siguiente información.';
$lang['edit_group_name_label']             = 'Nombre de grupo:';
$lang['edit_group_desc_label']             = 'Descripción:';
$lang['edit_group_submit_btn']             = 'Guardar grupo';
$lang['edit_group_validation_name_label']  = 'Nombre de grupo';
$lang['edit_group_validation_desc_label']  = 'Descripción';

// Change Password
$lang['change_password_heading']                               = 'Cambiar contraseña';
$lang['change_password_old_password_label']                    = 'Contraseña anterior:';
$lang['change_password_new_password_label']                    = 'Nueva contraseña (por lo menos %s caracteres de logintud):';
$lang['change_password_new_password_confirm_label']            = 'Confirmar nueva contraseña:';
$lang['change_password_submit_btn']                            = 'Cambiar';
$lang['change_password_validation_old_password_label']         = 'Contraseña anterior';
$lang['change_password_validation_new_password_label']         = 'Nueva contraseña';
$lang['change_password_validation_new_password_confirm_label'] = 'Confirmar nueva contraseña';

// Forgot Password
$lang['forgot_password_heading']                 = 'Has olvidado tu contraseña';
$lang['forgot_password_subheading']              = 'Ingrese su %s para enviarle un correo electrónico parar restablecer su contraseña';
$lang['forgot_password_email_label']             = '%s:';
$lang['forgot_password_submit_btn']              = 'Enviar';
$lang['forgot_password_validation_email_label']  = 'Dirección de correo';
$lang['forgot_password_identity_label']          = 'Identidad';
$lang['forgot_password_email_identity_label']    = 'Email';
$lang['forgot_password_email_not_found']         = 'No existe ese email.';
$lang['forgot_password_identity_not_found']         = 'Número de registro para este usuario.';

// Reset Password
$lang['reset_password_heading']                               = 'Cambiar contraseña';
$lang['reset_password_new_password_label']                    = 'Nueva contraseña (por lo menos %s caracteres de logintud):';
$lang['reset_password_new_password_confirm_label']            = 'Confirmar nueva contraseña:';
$lang['reset_password_submit_btn']                            = 'Cambiar';
$lang['reset_password_validation_new_password_label']         = 'Nueva contraseña';
$lang['reset_password_validation_new_password_confirm_label'] = 'Confirmar nueva contraseña';
