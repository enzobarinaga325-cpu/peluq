-- Bug real: las políticas de lectura pública (pensadas solo para la página de reserva anónima)
-- no tenían restricción de rol, así que un peluquero logueado TAMBIÉN veía todos los empleados
-- activos (no solo el suyo) a través de esas mismas políticas, aunque las políticas de "staff"
-- estuvieran bien. Esto hacía que el selector de empleado quedara apuntando al primero de la
-- lista en vez de al propio, rompiendo crear/borrar servicios (y cualquier otra cosa "propia").
-- Pegar y ejecutar en el SQL Editor de Supabase.

alter policy "public read active employees" on employees to anon;
alter policy "public read active services" on services to anon;
alter policy "public read schedules" on schedules to anon;
alter policy "public read schedule_exceptions" on schedule_exceptions to anon;
alter policy "public read employee_settings" on employee_settings to anon;
