-- Crea el usuario que aparece como DEFINER de las 22 vistas del dump.
--
-- El export trae vistas con  DEFINER=`bellita`@`%`.  Si ese usuario no existe
-- en el servidor local, MariaDB deja crear la vista pero falla con
-- ERROR 1449 (The user specified as a definer does not exist) la primera vez
-- que la consultas — o sea, al abrir los reportes AM y PM.
--
-- Se ejecuta antes que 01-schema.sql por orden alfabético.
-- Solo aplica al contenedor local. Password irrelevante: nadie se loguea con él.

CREATE USER IF NOT EXISTS 'bellita'@'%' IDENTIFIED BY 'bellita';
GRANT ALL PRIVILEGES ON *.* TO 'bellita'@'%';
FLUSH PRIVILEGES;
