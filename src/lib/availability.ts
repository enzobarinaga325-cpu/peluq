import type { BusySlot, Schedule, ScheduleException } from "./types";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function addMinutesToTime(hhmm: string, minutes: number): string {
  return toHHMM(toMinutes(hhmm) + minutes);
}

/** 0 = domingo .. 6 = sábado, calculado en horario local (sin desfasajes de UTC) */
export function dayOfWeekFor(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function getAvailableSlots(opts: {
  date: string; // "YYYY-MM-DD"
  schedules: Schedule[];
  exceptions: ScheduleException[];
  busySlots: BusySlot[];
  durationMinutes: number;
  now?: Date;
}): string[] {
  const { date, schedules, exceptions, busySlots, durationMinutes, now = new Date() } = opts;

  const exception = exceptions.find((e) => e.date === date);

  let windowStart: number | null = null;
  let windowEnd: number | null = null;

  if (exception) {
    if (exception.is_closed) return [];
    if (exception.start_time && exception.end_time) {
      windowStart = toMinutes(exception.start_time);
      windowEnd = toMinutes(exception.end_time);
    }
  }

  if (windowStart === null || windowEnd === null) {
    const dow = dayOfWeekFor(date);
    const daySchedules = schedules.filter((s) => s.day_of_week === dow && s.active);
    if (daySchedules.length === 0) return [];
    windowStart = Math.min(...daySchedules.map((s) => toMinutes(s.start_time)));
    windowEnd = Math.max(...daySchedules.map((s) => toMinutes(s.end_time)));
  }

  const busyRanges = busySlots
    .filter((b) => b.date === date)
    .map((b) => ({ start: toMinutes(b.start_time), end: toMinutes(b.end_time) }))
    .sort((a, b) => a.start - b.start);

  // Funde turnos ocupados que se solapan o se tocan, para que cada hueco libre quede bien
  // delimitado por sus dos bordes reales (el fin de un turno y el inicio del siguiente).
  const busy: { start: number; end: number }[] = [];
  for (const r of busyRanges) {
    const last = busy[busy.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else busy.push({ ...r });
  }

  // Huecos libres dentro de la ventana del día. El paso entre horarios es la propia duración
  // del servicio, pero arrancando SIEMPRE desde el borde real de cada hueco (el inicio del día
  // o el fin del turno anterior) — no desde el inicio del día a secas. Antes, un servicio de
  // 20 min podía saltar 09:00, 09:20, 09:40… y ofrecer recién 13:20 aunque un turno anterior
  // hubiera liberado la agenda justo a las 13:00: ese 13:00 no caía en la cuenta de "cada 20
  // min desde las 09:00", así que quedaba un hueco de 20 min sin usar y el turno arrancaba más
  // tarde de lo que le correspondía, comiéndole tiempo al que viniera después.
  const gaps: { start: number; end: number }[] = [];
  let cursor = windowStart;
  for (const b of busy) {
    if (b.start > cursor) gaps.push({ start: cursor, end: Math.min(b.start, windowEnd) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= windowEnd) break;
  }
  if (cursor < windowEnd) gaps.push({ start: cursor, end: windowEnd });

  const isToday =
    date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots: string[] = [];
  for (const gap of gaps) {
    for (let start = gap.start; start + durationMinutes <= gap.end; start += durationMinutes) {
      if (isToday && start <= nowMinutes) continue;
      slots.push(toHHMM(start));
    }
  }
  return slots;
}
