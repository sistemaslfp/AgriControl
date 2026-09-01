-- =========================================================================
-- El PM deja de ser un registro suelto: pasa a ser el CIERRE de una
-- asignacion AM concreta.
--
-- Decision de Kevin (2026-09-01): "NO se pueden crear PM, un pm solo es el
-- reflejo de un AM". La app ya no crea tareas en PM; lista las asignaciones
-- AM abiertas de la fecha y solo carga el avance.
--
-- Por que una columna y no fundir PM dentro de reg_am_personal (que fue la
-- otra opcion sobre la mesa): la cola de sincronizacion del telefono es
-- SOLO-INSERCION, idempotente por guid. "El PM rellena los campos que le
-- faltan al AM" es un UPDATE de una fila que puede no existir todavia en el
-- servidor -- el AM puede seguir PENDIENTE en el mismo telefono -- y eso
-- exige ordenar el update despues del insert y darle su propia historia de
-- idempotencia. Con esta columna el PM sigue siendo un INSERT: si el AM no
-- llego, el servidor omite el guid del PM y la cola lo reintenta sola, que es
-- la regla del guid omitido que ya esta probada.
--
-- Ademas no toca la migracion de agosto ya verificada, ni vw_reporte_pago, ni
-- pm_year/pm_week, ni el indice idx_pm_semana.
--
-- NULL permitido a proposito: las filas de agosto entraron por migracion
-- desde z_tabla_pm, donde ese vinculo nunca existio (z_tabla_am.tiene_pm
-- esta en '0' en las 113.410 filas: el cierre de V3 nunca funciono).
-- =========================================================================

ALTER TABLE reg_pm
  ADD COLUMN am_personal_id INT NULL AFTER trabajador_id,
  -- UNIQUE, no KEY: una asignacion AM se cierra UNA sola vez. InnoDB permite
  -- varios NULL en un indice unico, asi que las filas migradas no estorban.
  ADD UNIQUE KEY uq_pm_am_personal (am_personal_id),
  ADD CONSTRAINT fk_pm_am_personal
      FOREIGN KEY (am_personal_id) REFERENCES reg_am_personal(id);
