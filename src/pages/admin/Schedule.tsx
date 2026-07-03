import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Employee, Schedule, ScheduleException } from "@/lib/types";
import { Button, Card, Input, Label, Select } from "@/components/ui";
import { DIAS_SEMANA } from "@/lib/format";
import { useAuth } from "@/lib/AuthContext";

export function SchedulePage() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [excDate, setExcDate] = useState("");
  const [excClosed, setExcClosed] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let query = supabase.from("employees").select("*").order("created_at");
    if (profile?.role === "staff" && profile.employeeId) query = query.eq("id", profile.employeeId);
    query.then(({ data }) => {
      setEmployees(data ?? []);
      if (data && data.length > 0) setEmployeeId(data[0].id);
    });
  }, [profile]);

  async function load(empId: string) {
    const [{ data: sch }, { data: exc }] = await Promise.all([
      supabase.from("schedules").select("*").eq("employee_id", empId).order("day_of_week"),
      supabase.from("schedule_exceptions").select("*").eq("employee_id", empId).order("date"),
    ]);
    setSchedules(sch ?? []);
    setExceptions(exc ?? []);
  }

  useEffect(() => {
    if (employeeId) load(employeeId);
  }, [employeeId]);

  function scheduleFor(day: number) {
    return schedules.find((s) => s.day_of_week === day);
  }

  async function setDayOff(day: number) {
    setError(null);
    const existing = scheduleFor(day);
    if (existing) {
      const { error } = await supabase.from("schedules").delete().eq("id", existing.id);
      if (error) setError(error.message);
    }
    load(employeeId);
  }

  async function setDayHours(day: number, start: string, end: string) {
    setError(null);
    const existing = scheduleFor(day);
    const { error } = existing
      ? await supabase.from("schedules").update({ start_time: start, end_time: end }).eq("id", existing.id)
      : await supabase.from("schedules").insert({ employee_id: employeeId, day_of_week: day, start_time: start, end_time: end });
    if (error) setError(error.message);
    load(employeeId);
  }

  async function addException(e: React.FormEvent) {
    e.preventDefault();
    if (!excDate) return;
    setError(null);
    const { error } = await supabase.from("schedule_exceptions").upsert(
      { employee_id: employeeId, date: excDate, is_closed: excClosed },
      { onConflict: "employee_id,date" }
    );
    if (error) {
      setError(error.message);
      return;
    }
    setExcDate("");
    load(employeeId);
  }

  async function removeException(id: string) {
    setError(null);
    const { error } = await supabase.from("schedule_exceptions").delete().eq("id", id);
    if (error) setError(error.message);
    load(employeeId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Horarios</h1>
        <p className="text-sm text-zinc-500">Horario semanal y días puntuales cerrados (feriados, vacaciones, etc.)</p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {profile?.role === "owner" && (
        <Card>
          <Label>Empleado</Label>
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Horario semanal</h2>
        <div className="flex flex-col gap-2">
          {DIAS_SEMANA.map((label, day) => {
            const s = scheduleFor(day);
            return (
              <div key={day} className="flex flex-wrap items-center gap-3 border-b border-zinc-100 py-2 last:border-0">
                <span className="w-24 text-sm capitalize">{label}</span>
                {s ? (
                  <>
                    <Input
                      type="time"
                      defaultValue={s.start_time.slice(0, 5)}
                      className="w-32"
                      onBlur={(e) => setDayHours(day, e.target.value, s.end_time.slice(0, 5))}
                    />
                    <span className="text-zinc-400">a</span>
                    <Input
                      type="time"
                      defaultValue={s.end_time.slice(0, 5)}
                      className="w-32"
                      onBlur={(e) => setDayHours(day, s.start_time.slice(0, 5), e.target.value)}
                    />
                    <Button variant="ghost" onClick={() => setDayOff(day)}>
                      Marcar cerrado
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => setDayHours(day, "09:00", "18:00")}>
                    Abrir 09:00–18:00
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Días puntuales (feriados, vacaciones)</h2>
        <form onSubmit={addException} className="mb-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={excDate} onChange={(e) => setExcDate(e.target.value)} required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={excClosed} onChange={(e) => setExcClosed(e.target.checked)} />
            Cerrado todo el día
          </label>
          <Button type="submit">Agregar</Button>
        </form>
        <div className="flex flex-col gap-2">
          {exceptions.map((exc) => (
            <div key={exc.id} className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm">
              <span>
                {exc.date} — {exc.is_closed ? "cerrado" : `${exc.start_time?.slice(0, 5)} a ${exc.end_time?.slice(0, 5)}`}
              </span>
              <Button variant="ghost" onClick={() => removeException(exc.id)}>
                Quitar
              </Button>
            </div>
          ))}
          {exceptions.length === 0 && <p className="text-sm text-zinc-400">No hay días puntuales cargados.</p>}
        </div>
      </Card>
    </div>
  );
}
