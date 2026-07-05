-- Permite borrar un servicio aunque ya tenga turnos cargados. Antes la base lo
-- bloqueaba (error 23503) para no dejar turnos "colgados" sin servicio. Ahora, al
-- borrar el servicio, esos turnos ya pasados/futuros se conservan en el historial
-- pero quedan sin servicio asociado (la app muestra "Servicio eliminado").
-- Pegar y ejecutar en el SQL Editor de Supabase.

alter table appointments alter column service_id drop not null;

alter table appointments drop constraint if exists appointments_service_id_fkey;
alter table appointments
  add constraint appointments_service_id_fkey
  foreign key (service_id) references services(id) on delete set null;

-- Nota: los "turnos fijos" (recurring_appointments) ya se borran automáticamente
-- junto con el servicio (on delete cascade, sin cambios acá). La app avisa esto
-- antes de confirmar el borrado si el servicio tiene turnos fijos activos.
