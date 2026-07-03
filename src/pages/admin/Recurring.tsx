import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Appointment, Employee, RecurringAppointment, Service } from "@/lib/types";
import { Button, Card, Input, Label, Select, Badge } from "@/components/ui";
import { DIAS_SEMANA, addDaysStr, todayStr, formatDateLong } from "@/lib/format";
import { dayOfWeekFor, addMinutesToTime } from "@/lib/availability";
import { useAuth } from "@/lib/AuthContext";

export function Recurring() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [recurring, setRecurring] = useState<RecurringAppointment[]>([]);
  const [upcoming, setUpcoming] = useState<Record<string, Appointment[]>>({});
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("10:00");
  const [generating, setGenerating] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("employees")
      .select("*")
      .order("created_at")
      .then(({ data }) => {
        setEmployees(data ?? []);
        if (data && data.length > 0) setEmployeeId(data[0].id);
      });
  }, []);

  async function loadForEmployee(empId: string) {
    const [{ data: svc }, { data: rec }] = await Promise.all([
      supabase.from("services").select("*").eq("employee_id", empId).eq("active", true),
      supabase.from("recurring_appointments").select("*").eq("employee_id", empId).order("day_of_week"),
    ]);
    setServices(svc ?? []);
    if (svc && svc.length > 0) setServiceId(svc[0].id);
    setRecurring(rec ?? []);

    const ids = (rec ?? []).map((r) => r.id);
    if (ids.length > 0) {
      const { data: appts } = await supabase
        .from("appointments")
        .select("*")
        .in("recurring_id", ids)
        .eq("status", "confirmado")
        .gte("date", todayStr())
        .order("date");
      const byRecurring: Record<string, Appointment[]> = {};
      for (const a of appts ?? []) {
        if (!a.recurring_id) continue;
        (byRecurring[a.recurring_id] ??= []).push(a);
      }
      setUpcoming(byRecurring);
    } else {
      setUpcoming({});
    }
  }

  useEffect(() => {
    if (employeeId) loadForEmployee(employeeId);
  }, [employeeId]);

  async function createRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim() || !clientPhone.trim() || !serviceId) return;
    setError(null);
    const { error } = await supabase.from("recurring_appointments").insert({
      employee_id: employeeId,
      service_id: serviceId,
      client_name: clientName.trim(),
      client_phone: clientPhone.trim(),
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setClientName("");
    setClientPhone("");
    loadForEmployee(employeeId);
  }

  /** Cancela definitivamente: borra la regla y cancela todos los turnos futuros ya generados a partir de ella. */
  async function cancelPermanently(rec: RecurringAppointment) {
    if (!confirm(`¿Cancelar definitivamente el turno fijo de ${rec.client_name}? Se liberan todos sus turnos futuros ya generados.`))
      return;
    setError(null);
    const { error: e1 } = await supabase
      .from("appointments")
      .update({ status: "cancelado" })
      .eq("recurring_id", rec.id)
      .eq("status", "confirmado")
      .gte("date", todayStr());
    if (e1) {
      setError(e1.message);
      return;
    }
    const { error: e2 } = await supabase.from("recurring_appointments").delete().eq("id", rec.id);
    if (e2) setError(e2.message);
    loadForEmployee(employeeId);
  }

  /** Cancela solo una fecha puntual, sin tocar la regla fija (sigue generando turnos futuros). */
  async function cancelOneDay(appointmentId: string) {
    setError(null);
    const { error } = await supabase.from("appointments").update({ status: "cancelado" }).eq("id", appointmentId);
    if (error) setError(error.message);
    loadForEmployee(employeeId);
  }

  /** Genera los próximos 8 turnos reales a partir de un turno fijo, saltando los horarios ya ocupados. */
  async function generateOccurrences(rec: RecurringAppointment) {
    setGenerating(rec.id);
    setMessage(null);
    const svc = services.find((s) => s.id === rec.service_id);
    const duration = svc?.duration_minutes ?? 30;
    let created = 0;
    let date = todayStr();
    for (let i = 0; i < 90 && created < 8; i++) {
      date = i === 0 ? date : addDaysStr(date, 1);
      if (dayOfWeekFor(date) !== rec.day_of_week) continue;
      const endTime = addMinutesToTime(rec.start_time, duration);
      const { error } = await supabase.from("appointments").insert({
        employee_id: rec.employee_id,
        service_id: rec.service_id,
        recurring_id: rec.id,
        client_name: rec.client_name,
        client_phone: rec.client_phone,
        date,
        start_time: rec.start_time,
        end_time: endTime,
        price: svc?.price ?? 0,
      });
      if (!error) created++;
      // si error (choque de horario u ocupado), simplemente lo salteamos y seguimos
    }
    setGenerating(null);
    setMessage(`Se generaron ${created} turnos para ${rec.client_name}.`);
    loadForEmployee(employeeId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Turnos fijos</h1>
        <p className="text-sm text-zinc-500">
          Clientes que vienen siempre el mismo día y horario. Generá las próximas fechas cuando quieras que queden reservadas.
        </p>
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
        <h2 className="mb-3 text-sm font-semibold">Nuevo turno fijo</h2>
        <form onSubmit={createRecurring} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <Label>Cliente</Label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Label>Teléfono</Label>
            <Input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} required />
          </div>
          <div className="min-w-[160px]">
            <Label>Servicio</Label>
            <Select value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="min-w-[130px]">
            <Label>Día</Label>
            <Select value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
              {DIAS_SEMANA.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-32">
            <Label>Hora</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <Button type="submit">Agregar</Button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {message && <p className="text-sm text-zinc-600">{message}</p>}

      <div className="flex flex-col gap-3">
        {recurring.map((rec) => (
          <Card key={rec.id} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[160px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{rec.client_name}</span>
                  <Badge>{DIAS_SEMANA[rec.day_of_week]}</Badge>
                </div>
                <p className="text-xs text-zinc-500">{rec.start_time.slice(0, 5)} hs · {rec.client_phone}</p>
              </div>
              <Button onClick={() => generateOccurrences(rec)} disabled={generating === rec.id}>
                {generating === rec.id ? "Generando…" : "Generar próximos turnos"}
              </Button>
              <Button variant="danger" onClick={() => cancelPermanently(rec)}>
                Cancelar definitivo
              </Button>
            </div>

            {(upcoming[rec.id]?.length ?? 0) > 0 && (
              <div className="rounded-lg bg-zinc-50 p-3">
                <p className="mb-2 text-xs font-medium text-zinc-600">Próximos turnos generados — cancelar solo un día:</p>
                <div className="flex flex-wrap gap-2">
                  {upcoming[rec.id].map((a) => (
                    <div key={a.id} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-xs">
                      <span>{formatDateLong(a.date)}</span>
                      <button
                        onClick={() => cancelOneDay(a.id)}
                        className="text-red-600 hover:underline"
                        title="Cancelar solo este día"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        ))}
        {recurring.length === 0 && <p className="text-sm text-zinc-500">No hay turnos fijos para este empleado.</p>}
      </div>
    </div>
  );
}
