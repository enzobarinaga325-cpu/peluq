import { supabase } from "./supabase";
import { addDaysStr, todayStr } from "./format";
import { dayOfWeekFor, addMinutesToTime } from "./availability";
import type { RecurringAppointment, Service } from "./types";

// Mismo horizonte que la página pública de reserva (BookingPage: maxDate = hoy + 60 días),
// para que un turno fijo bloquee su horario en la agenda pública tan lejos como un cliente
// pueda llegar a reservar, sin depender de que alguien entre a "Turnos fijos" y apriete un botón.
const HORIZON_DAYS = 60;

export const RECURRING_VISIBILITY_DAYS = 5;

/** Códigos de Postgres que significan "ya existe / se solapa" — no son una falla real. */
function isBenignConflict(code: string | undefined): boolean {
  return code === "23505" || code === "23P01";
}

/**
 * Genera todos los turnos futuros (hasta HORIZON_DAYS) que todavía no existan para una
 * regla de turno fijo. Es seguro llamarla repetidas veces: los turnos ya generados (o que
 * se solapan con otro turno) se saltean gracias a las constraints de la tabla `appointments`.
 */
export async function ensureOccurrences(
  rec: RecurringAppointment,
  service: Service | undefined
): Promise<{ created: number; failed: number }> {
  const duration = service?.duration_minutes ?? 30;
  const endTime = addMinutesToTime(rec.start_time, duration);
  let created = 0;
  let failed = 0;
  let date = todayStr();
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    date = i === 0 ? date : addDaysStr(date, 1);
    if (dayOfWeekFor(date) !== rec.day_of_week) continue;
    const { error } = await supabase.from("appointments").insert({
      employee_id: rec.employee_id,
      service_id: rec.service_id,
      recurring_id: rec.id,
      client_name: rec.client_name,
      client_phone: rec.client_phone,
      date,
      start_time: rec.start_time,
      end_time: endTime,
      price: service?.price ?? 0,
    });
    if (!error) created++;
    else if (!isBenignConflict((error as { code?: string }).code)) failed++;
  }
  return { created, failed };
}

async function ensureOccurrencesForEmployee(employeeId: string): Promise<{ created: number; failed: number }> {
  const [{ data: recs }, { data: services }] = await Promise.all([
    supabase.from("recurring_appointments").select("*").eq("employee_id", employeeId).eq("active", true),
    supabase.from("services").select("*").eq("employee_id", employeeId),
  ]);
  const servicesById = Object.fromEntries((services ?? []).map((s) => [s.id, s]));
  let created = 0;
  let failed = 0;
  for (const rec of (recs ?? []) as RecurringAppointment[]) {
    const r = await ensureOccurrences(rec, servicesById[rec.service_id]);
    created += r.created;
    failed += r.failed;
  }
  return { created, failed };
}

/** Genera los turnos fijos de todos los empleados visibles para este perfil (dueño = todos, staff = el suyo). */
export async function ensureOccurrencesForProfile(profile: {
  role: string;
  employeeId?: string | null;
}): Promise<{ created: number; failed: number }> {
  let employeeIds: string[];
  if (profile.role === "staff" && profile.employeeId) {
    employeeIds = [profile.employeeId];
  } else {
    const { data } = await supabase.from("employees").select("id");
    employeeIds = (data ?? []).map((e: { id: string }) => e.id);
  }
  let created = 0;
  let failed = 0;
  for (const id of employeeIds) {
    const r = await ensureOccurrencesForEmployee(id);
    created += r.created;
    failed += r.failed;
  }
  return { created, failed };
}
