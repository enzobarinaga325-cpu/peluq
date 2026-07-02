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
  stepMinutes?: number;
  now?: Date;
}): string[] {
  const { date, schedules, exceptions, busySlots, durationMinutes, stepMinutes = 15, now = new Date() } = opts;

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
    .map((b) => ({ start: toMinutes(b.start_time), end: toMinutes(b.end_time) }));

  const isToday =
    date === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const slots: string[] = [];
  for (let start = windowStart; start + durationMinutes <= windowEnd; start += stepMinutes) {
    const end = start + durationMinutes;
    if (isToday && start <= nowMinutes) continue;
    const overlaps = busyRanges.some((b) => start < b.end && end > b.start);
    if (overlaps) continue;
    slots.push(toHHMM(start));
  }
  return slots;
}
