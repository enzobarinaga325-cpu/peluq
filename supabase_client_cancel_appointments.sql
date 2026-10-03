-- Que un cliente pueda ver y cancelar SUS turnos futuros ingresando el celular con el que reservó.
-- El público (anon) no puede leer ni editar la tabla appointments (RLS), así que esto se hace con
-- dos funciones SECURITY DEFINER que verifican el teléfono ellas mismas y devuelven lo mínimo:
-- solo turnos confirmados que todavía no pasaron, sin datos de ningún otro cliente.
-- Cancelar = poner status 'cancelado' (igual que hace el panel), así el horario se libera solo.
-- Pegar y ejecutar en el SQL Editor de Supabase.

-- Compara solo los dígitos y los últimos 10 (código de área + número), así "3382 46-8910",
-- "+54 9 3382 468910" y "3382468910" cuentan como el mismo teléfono. Exige al menos 8 dígitos.
create or replace function phones_match(a text, b text)
returns boolean
language sql
immutable
as $$
  select case
    when length(regexp_replace(coalesce(a, ''), '\D', '', 'g')) < 8
      or length(regexp_replace(coalesce(b, ''), '\D', '', 'g')) < 8 then false
    else right(regexp_replace(a, '\D', '', 'g'), 10) = right(regexp_replace(b, '\D', '', 'g'), 10)
  end
$$;
revoke all on function phones_match(text, text) from public;

create or replace function list_my_appointments(p_phone text)
returns table (
  id uuid,
  date date,
  start_time time,
  service_name text,
  employee_name text,
  is_fixed boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select a.id, a.date, a.start_time, coalesce(s.name, 'Turno'), e.name, a.recurring_id is not null
  from appointments a
  join employees e on e.id = a.employee_id
  left join services s on s.id = a.service_id
  where a.status = 'confirmado'
    and phones_match(a.client_phone, p_phone)
    and (a.date + a.start_time) > (now() at time zone 'America/Argentina/Buenos_Aires')
  order by a.date, a.start_time
  limit 50
$$;

create or replace function cancel_my_appointment(p_id uuid, p_phone text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update appointments
  set status = 'cancelado'
  where id = p_id
    and status = 'confirmado'
    and phones_match(client_phone, p_phone)
    and (date + start_time) > (now() at time zone 'America/Argentina/Buenos_Aires');
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

revoke all on function list_my_appointments(text) from public;
revoke all on function cancel_my_appointment(uuid, text) from public;
grant execute on function list_my_appointments(text) to anon, authenticated;
grant execute on function cancel_my_appointment(uuid, text) to anon, authenticated;
