-- Permite que cada peluquero cambie su propia foto, el fondo de su página y su URL (slug).
-- Pegar y ejecutar en el SQL Editor de Supabase.

alter table employees add column if not exists background_url text;

-- Antes, "staff" solo podía LEER su propia fila de empleado (el dueño era el único que
-- podía escribirla). Ahora se le permite actualizar su propia fila (foto, fondo, slug, etc).
drop policy if exists "staff update own employee" on employees;
create policy "staff update own employee" on employees for update
  using (current_staff_role() = 'staff' and id = current_staff_employee_id())
  with check (current_staff_role() = 'staff' and id = current_staff_employee_id());
