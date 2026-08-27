-- Tabla de sesiones de CodeIgniter.
-- Requerida porque application/config/config.php usa:
--     $config['sess_driver']    = 'database';
--     $config['sess_save_path'] = 'ci_sessions';
-- Sin ella no hay login posible (redirect infinito a auth/login).
--
-- Este archivo lo ejecuta automáticamente el contenedor MySQL local
-- la PRIMERA vez que se crea el volumen. No se corre contra el servidor.
--
-- El IF NOT EXISTS lo hace idempotente: si 01-schema.sql ya trajo la tabla
-- desde el servidor, esta sentencia no hace nada.

USE lfp_prodapp;

CREATE TABLE IF NOT EXISTS ci_sessions (
    id         VARCHAR(128) NOT NULL,
    ip_address VARCHAR(45)  NOT NULL,
    timestamp  INT UNSIGNED DEFAULT 0 NOT NULL,
    data       BLOB         NOT NULL,
    KEY ci_sessions_timestamp (timestamp),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
