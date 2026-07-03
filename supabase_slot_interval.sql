-- Intervalo de turnos configurable por peluquero. Pegar y ejecutar en el SQL Editor de Supabase.

create table if not exists employee_settings (
  employee_id uuid primary key references employees(id) on delete cascade,
  slot_interval_minutes int not null default 15 check (slot_interval_minutes > 0),
  updated_at timestamptz not null default now()
);

alter table employee_settings enable row level security;

-- Lectura pública: la página de reserva (anónima) necesita este valor para calcular los horarios.
drop policy if exists "public read employee_settings" on employee_settings;
create policy "public read employee_settings" on employee_settings for select using (true);

drop policy if exists "owner full access employee_settings" on employee_settings;
create policy "owner full access employee_settings" on employee_settings for all
  using (current_staff_role() = 'owner') with check (current_staff_role() = 'owner');

drop policy if exists "staff manage own employee_settings" on employee_settings;
create policy "staff manage own employee_settings" on employee_settings for all
  using (current_staff_role() = 'staff' and employee_id = current_staff_employee_id())
  with check (current_staff_role() = 'staff' and employee_id = current_staff_employee_id());

-- Fila por defecto (15 min, el comportamiento actual) para los empleados que ya existen.
insert into employee_settings (employee_id, slot_interval_minutes)
select id, 15 from employees
on conflict (employee_id) do nothing;
