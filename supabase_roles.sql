-- Roles: dueño (ve/edita todo) vs peluquero (solo lo suyo). Pegar y ejecutar en el SQL Editor de Supabase.

create table if not exists staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  employee_id uuid references employees(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now()
);

alter table staff_profiles enable row level security;

-- Cada usuario puede leer solo su propia fila (para saber su propio rol/empleado).
-- A propósito NO hay política de insert/update/delete para clientes: asignar roles
-- solo se hace a mano desde el SQL Editor (evita que un peluquero se auto-asigne "owner").
drop policy if exists "self read own profile" on staff_profiles;
create policy "self read own profile" on staff_profiles for select using (auth.uid() = user_id);

create or replace function current_staff_role() returns text
language sql stable security definer set search_path = public as $$
  select role from staff_profiles where user_id = auth.uid()
$$;

create or replace function current_staff_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select employee_id from staff_profiles where user_id = auth.uid()
$$;

-- ============ EMPLOYEES: solo el dueño gestiona el listado de empleados ============
drop policy if exists "staff full access employees" on employees;
drop policy if exists "owner full access employees" on employees;
create policy "owner full access employees" on employees for all
  using (current_staff_role() = 'owner') with check (current_staff_role() = 'owner');

drop policy if exists "staff read own employee" on employees;
create policy "staff read own employee" on employees for select
  using (current_staff_role() = 'staff' and id = current_staff_employee_id());

-- ============ SERVICES: dueño gestiona todo, peluquero solo los suyos ============
drop policy if exists "staff full access services" on services;
drop policy if exists "owner full access services" on services;
create policy "owner full access services" on services for all
  using (current_staff_role() = 'owner') with check (current_staff_role() = 'owner');

drop policy if exists "staff manage own services" on services;
create policy "staff manage own services" on services for all
  using (current_staff_role() = 'staff' and employee_id = current_staff_employee_id())
  with check (current_staff_role() = 'staff' and employee_id = current_staff_employee_id());

-- ============ SCHEDULES ============
drop policy if exists "staff full access schedules" on schedules;
drop policy if exists "owner full access schedules" on schedules;
create policy "owner full access schedules" on schedules for all
  using (current_staff_role() = 'owner') with check (current_staff_role() = 'owner');

drop policy if exists "staff manage own schedules" on schedules;
create policy "staff manage own schedules" on schedules for all
  using (current_staff_role() = 'staff' and employee_id = current_staff_employee_id())
  with check (current_staff_role() = 'staff' and employee_id = current_staff_employee_id());

-- ============ SCHEDULE EXCEPTIONS ============
drop policy if exists "staff full access schedule_exceptions" on schedule_exceptions;
drop policy if exists "owner full access schedule_exceptions" on schedule_exceptions;
create policy "owner full access schedule_exceptions" on schedule_exceptions for all
  using (current_staff_role() = 'owner') with check (current_staff_role() = 'owner');

drop policy if exists "staff manage own schedule_exceptions" on schedule_exceptions;
create policy "staff manage own schedule_exceptions" on schedule_exceptions for all
  using (current_staff_role() = 'staff' and employee_id = current_staff_employee_id())
  with check (current_staff_role() = 'staff' and employee_id = current_staff_employee_id());

-- ============ RECURRING APPOINTMENTS (turnos fijos) ============
drop policy if exists "staff full access recurring_appointments" on recurring_appointments;
drop policy if exists "owner full access recurring_appointments" on recurring_appointments;
create policy "owner full access recurring_appointments" on recurring_appointments for all
  using (current_staff_role() = 'owner') with check (current_staff_role() = 'owner');

drop policy if exists "staff manage own recurring_appointments" on recurring_appointments;
create policy "staff manage own recurring_appointments" on recurring_appointments for all
  using (current_staff_role() = 'staff' and employee_id = current_staff_employee_id())
  with check (current_staff_role() = 'staff' and employee_id = current_staff_employee_id());

-- ============ APPOINTMENTS ============
drop policy if exists "staff read appointments" on appointments;
drop policy if exists "owner read appointments" on appointments;
create policy "owner read appointments" on appointments for select using (current_staff_role() = 'owner');

drop policy if exists "staff read own appointments" on appointments;
create policy "staff read own appointments" on appointments for select
  using (current_staff_role() = 'staff' and employee_id = current_staff_employee_id());

drop policy if exists "staff update appointments" on appointments;
drop policy if exists "owner update appointments" on appointments;
create policy "owner update appointments" on appointments for update
  using (current_staff_role() = 'owner') with check (current_staff_role() = 'owner');

drop policy if exists "staff update own appointments" on appointments;
create policy "staff update own appointments" on appointments for update
  using (current_staff_role() = 'staff' and employee_id = current_staff_employee_id())
  with check (current_staff_role() = 'staff' and employee_id = current_staff_employee_id());

drop policy if exists "staff delete appointments" on appointments;
drop policy if exists "owner delete appointments" on appointments;
create policy "owner delete appointments" on appointments for delete using (current_staff_role() = 'owner');

drop policy if exists "staff delete own appointments" on appointments;
create policy "staff delete own appointments" on appointments for delete
  using (current_staff_role() = 'staff' and employee_id = current_staff_employee_id());

drop policy if exists "staff insert appointments" on appointments;
drop policy if exists "owner insert appointments" on appointments;
create policy "owner insert appointments" on appointments for insert with check (current_staff_role() = 'owner');

drop policy if exists "staff insert own appointments" on appointments;
create policy "staff insert own appointments" on appointments for insert
  with check (current_staff_role() = 'staff' and employee_id = current_staff_employee_id());

-- ============ IMPORTANTE: asigná tu propio usuario como "owner" ============
-- Reemplazá TU_EMAIL@ejemplo.com por el email con el que creaste tu usuario admin.
-- Si no hacés este paso, tu propio login se queda sin acceso a nada (ninguna política
-- de owner ni de staff va a matchear un usuario sin fila en staff_profiles).
insert into staff_profiles (user_id, role, employee_id)
select id, 'owner', null from auth.users where email = 'barderos2811@gmail.com'
on conflict (user_id) do update set role = 'owner', employee_id = null;
