-- Bug: si cancelás un turno (fijo o casual), el horario que ocupaba queda "trabado" —
-- nadie puede volver a reservar exactamente esa misma hora, porque además del exclusion
-- constraint que evita choques reales (appointments_no_overlap, que sí filtra los
-- cancelados) había un unique(employee_id, date, start_time) más viejo que NO filtraba por
-- estado: la fila cancelada sigue "ocupando" ese (empleado, fecha, hora) para la base,
-- aunque ya no bloquee nada en la agenda ni en la web pública.
-- Pegar y ejecutar en el SQL Editor de Supabase.

alter table appointments drop constraint if exists appointments_employee_id_date_start_time_key;
