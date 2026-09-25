-- Usuarios web por hacienda (2026-09-25).
-- users.finca_id NULL = ve todas las haciendas. El admin (grupo 1) es global siempre.
-- Grupos: 1 admin | 2 Supervisor (edita registros, sin maestras) | 3 Operador (solo lectura)
--         4 Admin hacienda (maestras de su hacienda: Personal, Subtareas, Lotes, Modulos).
-- Idempotente.

USE lfp_prodapp;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS finca_id INT(11) NULL AFTER company,
  ADD CONSTRAINT fk_users_finca FOREIGN KEY IF NOT EXISTS (finca_id) REFERENCES z_finca (id);

-- Los usuarios actuales supervisor/operador son de Bellita; el admin queda global.
UPDATE users SET finca_id = 1 WHERE id IN (2, 3) AND finca_id IS NULL;

UPDATE `groups` SET name = 'Supervisor', description = 'Edita registros de su hacienda' WHERE id = 2;
UPDATE `groups` SET name = 'Operador',   description = 'Solo lectura de su hacienda'   WHERE id = 3;
INSERT INTO `groups` (id, name, description)
SELECT 4, 'Admin hacienda', 'Tablas maestras de su hacienda'
 WHERE NOT EXISTS (SELECT 1 FROM `groups` WHERE id = 4);
