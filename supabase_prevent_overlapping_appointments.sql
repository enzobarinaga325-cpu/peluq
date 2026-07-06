-- Evita que dos turnos del mismo empleado se solapen en el tiempo, incluso cuando tienen
-- duraciones distintas. Hoy el único chequeo es `unique(employee_id, date, start_time)`,
-- que solo detecta el choque cuando ambos turnos arrancan exactamente a la misma hora: si
-- dos clientes reservan casi al mismo tiempo servicios de distinta duración que se pisan
-- (ej. uno de 45min a las 10:00 y otro de 30min a las 10:15), la base los deja pasar a
-- ambos. Este exclusion constraint lo bloquea a nivel de base de datos sin importar la
-- duración de cada servicio ni por dónde entre el insert.
-- Pegar y ejecutar en el SQL Editor de Supabase.

create extension if not exists btree_gist;

alter table appointments
  drop constraint if exists appointments_no_overlap;

alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    employee_id with =,
    tsrange((date + start_time)::timestamp, (date + end_time)::timestamp) with &&
  )
  where (status <> 'cancelado');
