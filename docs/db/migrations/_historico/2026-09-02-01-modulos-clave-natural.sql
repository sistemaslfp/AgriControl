-- =========================================================================
-- reg_am_modulo / reg_pm_modulo: sacar el id autoincremental.
--
-- Planteo de Kevin (2026-09-02): una tabla hija para los modulos es
-- redundante y desperdicio de recursos, cuando V3 resolvia lo mismo con
-- z_tabla_am.modulos = "2,3".
--
-- La tabla se mantiene -- las razones estan en MOBIL/02-bd-y-api.md, y la
-- corta es que 3.119 filas de z_tabla_am (2,75%) apuntan hoy a modulos que
-- ya no existen en z_modulo, y otras 16 a un modulo de otro lote: un
-- VARCHAR no puede impedir ninguna de las dos cosas.
--
-- Pero el reclamo del costo era correcto y se atiende aca: estas tablas no
-- necesitan un id propio. Nadie las referencia por id, y la pareja
-- (am_id, modulo_id) ya era UNIQUE. Al volverla PRIMARY KEY desaparece un
-- indice entero.
--
-- Medido sobre los datos migrados de agosto: reg_am_modulo pasa de 80 KB a
-- 48 KB con las mismas 505 filas, un 40% menos. Proyectado a la historia
-- completa (~222.000 filas), de unos 34 MB a unos 20 MB.
-- =========================================================================

ALTER TABLE reg_am_modulo DROP FOREIGN KEY fk_amm_am, DROP FOREIGN KEY fk_amm_modulo;
ALTER TABLE reg_am_modulo
  DROP PRIMARY KEY,
  DROP COLUMN id,
  DROP INDEX uq_am_modulo,
  ADD PRIMARY KEY (am_id, modulo_id),
  -- El FK a z_modulo necesita su propio indice; el de am_id lo cubre la PK.
  ADD KEY idx_amm_modulo (modulo_id),
  ADD CONSTRAINT fk_amm_am     FOREIGN KEY (am_id)     REFERENCES reg_am(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_amm_modulo FOREIGN KEY (modulo_id) REFERENCES z_modulo(id);

ALTER TABLE reg_pm_modulo DROP FOREIGN KEY fk_pmm_pm, DROP FOREIGN KEY fk_pmm_modulo;
ALTER TABLE reg_pm_modulo
  DROP PRIMARY KEY,
  DROP COLUMN id,
  DROP INDEX uq_pm_modulo,
  ADD PRIMARY KEY (pm_id, modulo_id),
  ADD KEY idx_pmm_modulo (modulo_id),
  ADD CONSTRAINT fk_pmm_pm     FOREIGN KEY (pm_id)     REFERENCES reg_pm(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_pmm_modulo FOREIGN KEY (modulo_id) REFERENCES z_modulo(id);
