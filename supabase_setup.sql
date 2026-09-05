-- Peluquería / turnos: schema completo. Pegar y ejecutar en el SQL Editor de Supabase.

create extension if not exists pgcrypto;

-- ============ TABLAS ============

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  phone text,
  logo_url text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0,
  duration_minutes int not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  active boolean not null default true
);

create table if not exists schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,
  start_time time,
  end_time time,
  unique(employee_id, date)
);

create table if not exists recurring_appointments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  client_name text not null,
  client_phone text not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  start_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  service_id uuid not null references services(id),
  recurring_id uuid references recurring_appointments(id) on delete set null,
  client_name text not null,
  client_phone text not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'confirmado' check (status in ('confirmado','completado','cancelado')),
  price numeric(10,2),
  created_at timestamptz not null default now()
  -- Sin unique(employee_id, date, start_time): un turno cancelado no debe bloquear que
  -- alguien más ocupe ese mismo horario después. El exclusion constraint de más abajo
  -- (appointments_no_overlap, filtrado por status <> 'cancelado') ya evita los choques
  -- reales entre turnos activos, incluyendo el caso de arrancar a la misma hora exacta.
);

create index if not exists idx_appointments_employee_date on appointments (employee_id, date);
create index if not exists idx_services_employee on services (employee_id);
create index if not exists idx_schedules_employee on schedules (employee_id);

-- Evita que dos turnos activos del mismo empleado se solapen en el tiempo, sin importar
-- la duración de cada uno ni si arrancan a la misma hora exacta. Los cancelados no cuentan.
create extension if not exists btree_gist;
alter table appointments drop constraint if exists appointments_no_overlap;
alter table appointments
  add constraint appointments_no_overlap
  exclude using gist (
    employee_id with =,
    tsrange((date + start_time)::timestamp, (date + end_time)::timestamp) with &&
  )
  where (status <> 'cancelado');

-- Vista pública de horarios ocupados, SIN datos del cliente (para calcular disponibilidad sin exponer PII)
create or replace view busy_slots as
  select employee_id, date, start_time, end_time
  from appointments
  where status <> 'cancelado';

-- ============ ROW LEVEL SECURITY ============

alter table employees enable row level security;
alter table services enable row level security;
alter table schedules enable row level security;
alter table schedule_exceptions enable row level security;
alter table recurring_appointments enable row level security;
alter table appointments enable row level security;

-- Lectura pública de lo necesario para reservar
drop policy if exists "public read active employees" on employees;
create policy "public read active employees" on employees for select using (active = true);

drop policy if exists "public read active services" on services;
create policy "public read active services" on services for select using (active = true);

drop policy if exists "public read schedules" on schedules;
create policy "public read schedules" on schedules for select using (true);

drop policy if exists "public read schedule_exceptions" on schedule_exceptions;
create policy "public read schedule_exceptions" on schedule_exceptions for select using (true);

-- El público puede crear un turno (reservar) pero no puede leer/editar turnos ajenos
drop policy if exists "public insert appointments" on appointments;
create policy "public insert appointments" on appointments for insert with check (status = 'confirmado');

-- Todo lo demás (leer/editar/borrar turnos, gestionar empleados/servicios/horarios/fijos)
-- requiere estar autenticado (panel de administración)
drop policy if exists "staff full access employees" on employees;
create policy "staff full access employees" on employees for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "staff full access services" on services;
create policy "staff full access services" on services for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "staff full access schedules" on schedules;
create policy "staff full access schedules" on schedules for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "staff full access schedule_exceptions" on schedule_exceptions;
create policy "staff full access schedule_exceptions" on schedule_exceptions for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "staff full access recurring_appointments" on recurring_appointments;
create policy "staff full access recurring_appointments" on recurring_appointments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "staff read appointments" on appointments;
create policy "staff read appointments" on appointments for select using (auth.role() = 'authenticated');

drop policy if exists "staff update appointments" on appointments;
create policy "staff update appointments" on appointments for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "staff delete appointments" on appointments;
create policy "staff delete appointments" on appointments for delete using (auth.role() = 'authenticated');

drop policy if exists "staff insert appointments" on appointments;
create policy "staff insert appointments" on appointments for insert with check (auth.role() = 'authenticated');

-- ============ STORAGE (logos de cada peluquero) ============

insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

drop policy if exists "public read logos" on storage.objects;
create policy "public read logos" on storage.objects for select using (bucket_id = 'logos');

drop policy if exists "staff upload logos" on storage.objects;
create policy "staff upload logos" on storage.objects for insert with check (bucket_id = 'logos' and auth.role() = 'authenticated');

drop policy if exists "staff update logos" on storage.objects;
create policy "staff update logos" on storage.objects for update using (bucket_id = 'logos' and auth.role() = 'authenticated');

drop policy if exists "staff delete logos" on storage.objects;
create policy "staff delete logos" on storage.objects for delete using (bucket_id = 'logos' and auth.role() = 'authenticated');

-- ============ DATOS DE EJEMPLO ============

insert into employees (slug, name, phone) values
  ('juan', 'Juan Pérez', '5493820000000'),
  ('martina', 'Martina Gómez', '5493820000001')
on conflict (slug) do nothing;

insert into services (employee_id, name, price, duration_minutes)
select id, s.name, s.price, s.duration_minutes
from employees, (values
  ('Corte de pelo', 6000, 30),
  ('Corte + Barba', 9000, 45),
  ('Barba', 4000, 20)
) as s(name, price, duration_minutes)
where employees.slug = 'juan'
on conflict do nothing;

insert into services (employee_id, name, price, duration_minutes)
select id, s.name, s.price, s.duration_minutes
from employees, (values
  ('Corte de pelo', 6500, 30),
  ('Color', 15000, 90)
) as s(name, price, duration_minutes)
where employees.slug = 'martina'
on conflict do nothing;

insert into schedules (employee_id, day_of_week, start_time, end_time)
select id, d, '09:00', '18:00'
from employees, generate_series(1,6) as d
where employees.slug in ('juan','martina')
on conflict do nothing;
