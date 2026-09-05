import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { BusySlot, Employee, Schedule, ScheduleException, Service } from "@/lib/types";
import { Button, Card, Input, Label, Spinner } from "@/components/ui";
import { money, todayStr, addDaysStr, formatDateLong } from "@/lib/format";
import { addMinutesToTime, getAvailableSlots } from "@/lib/availability";

export function BookingPage() {
  const { slug } = useParams();
  const [employee, setEmployee] = useState<Employee | null | undefined>(undefined);
  const [services, setServices] = useState<Service[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);

  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [busySlots, setBusySlots] = useState<BusySlot[]>([]);
  const [time, setTime] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    supabase
      .from("employees")
      .select("*")
      .eq("slug", slug)
      .eq("active", true)
      .maybeSingle()
      .then(async ({ data: emp }) => {
        setEmployee(emp ?? null);
        if (!emp) return;
        const [{ data: svc }, { data: sch }, { data: exc }] = await Promise.all([
          supabase.from("services").select("*").eq("employee_id", emp.id).eq("active", true).order("name"),
          supabase.from("schedules").select("*").eq("employee_id", emp.id),
          supabase.from("schedule_exceptions").select("*").eq("employee_id", emp.id),
        ]);
        setServices(svc ?? []);
        if (svc && svc.length > 0) setServiceId(svc[0].id);
        setSchedules(sch ?? []);
        setExceptions(exc ?? []);
      });
  }, [slug]);

  useEffect(() => {
    if (!employee) return;
    supabase
      .from("busy_slots")
      .select("*")
      .eq("employee_id", employee.id)
      .eq("date", date)
      .then(({ data }) => setBusySlots(data ?? []));
    setTime(null);
  }, [employee, date]);

  const selectedService = services.find((s) => s.id === serviceId);

  const slots = useMemo(() => {
    if (!selectedService) return [];
    return getAvailableSlots({
      date,
      schedules,
      exceptions,
      busySlots,
      durationMinutes: selectedService.duration_minutes,
    });
  }, [date, schedules, exceptions, busySlots, selectedService]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee || !selectedService || !time) return;
    setSubmitting(true);
    setError(null);
    const endTime = addMinutesToTime(time, selectedService.duration_minutes);
    const { error } = await supabase.from("appointments").insert({
      employee_id: employee.id,
      service_id: selectedService.id,
      client_name: name.trim(),
      client_phone: phone.trim(),
      date,
      start_time: time,
      end_time: endTime,
      price: selectedService.price,
    });
    setSubmitting(false);
    if (error) {
      setError("Ese horario ya no está disponible, elegí otro.");
      setTime(null);
      supabase
        .from("busy_slots")
        .select("*")
        .eq("employee_id", employee.id)
        .eq("date", date)
        .then(({ data }) => setBusySlots(data ?? []));
      return;
    }
    setDone(true);
  }

  if (employee === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (employee === null) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-medium">No encontramos esta página.</p>
        <Link to="/" className="text-sm underline">
          Volver al inicio
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <Card className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="mb-2 text-2xl font-bold">¡Turno confirmado!</h1>
          <p className="mb-6 text-zinc-500">Tu reserva fue registrada con éxito</p>
          <div className="mb-6 space-y-2 rounded-lg bg-zinc-50 p-4 text-left text-sm">
            <p><span className="font-medium">Servicio:</span> {selectedService?.name}</p>
            <p><span className="font-medium">Con:</span> {employee.name}</p>
            <p><span className="font-medium">Fecha:</span> {formatDateLong(date)}</p>
            <p><span className="font-medium">Horario:</span> {time} hs</p>
            <p><span className="font-medium">Nombre:</span> {name}</p>
            <p><span className="font-medium">Teléfono:</span> {phone}</p>
          </div>
          <Link to="/">
            <Button variant="secondary" className="w-full">Volver al inicio</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const maxDate = addDaysStr(todayStr(), 60);

  return (
    <div
      className="min-h-screen bg-zinc-50 bg-cover bg-center bg-fixed"
      style={
        employee.background_url
          ? {
              backgroundImage: `linear-gradient(rgba(250,250,250,0.88), rgba(250,250,250,0.88)), url(${employee.background_url})`,
            }
          : undefined
      }
    >
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-4 py-8">
      <div className="flex flex-col items-center gap-2">
        <img
          src={employee.logo_url ?? "https://api.dicebear.com/9.x/initials/svg?seed=" + employee.name}
          alt={employee.name}
          className="h-20 w-20 rounded-full object-cover"
        />
        <h1 className="text-lg font-semibold">{employee.name}</h1>
      </div>

      <Card>
        <Label>Servicio</Label>
        <div className="flex flex-col gap-2">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => setServiceId(s.id)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${
                serviceId === s.id ? "border-zinc-900 bg-zinc-50" : "border-zinc-200"
              }`}
            >
              <span>{s.name} <span className="text-zinc-400">· {s.duration_minutes} min</span></span>
              <span className="font-medium">{money(s.price)}</span>
            </button>
          ))}
          {services.length === 0 && <p className="text-sm text-zinc-400">Este empleado no tiene servicios activos.</p>}
        </div>
      </Card>

      <Card>
        <Label>Fecha</Label>
        <Input type="date" min={todayStr()} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} />
        <Label>
          <span className="mt-3 block">Horario</span>
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {slots.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTime(t);
                setError(null);
              }}
              className={`rounded-lg border px-2 py-2 text-sm ${
                time === t ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {t}
            </button>
          ))}
          {slots.length === 0 && <p className="col-span-3 text-sm text-zinc-400">No hay horarios disponibles este día.</p>}
        </div>
        {/* Se muestra acá afuera (no solo dentro del form) porque el error puede llegar
            justo cuando se vuelve a pedir el horario, antes de que el usuario elija otro. */}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {time && (
        <Card>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <div>
              <Label>Nombre</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Reservando..." : `Confirmar turno · ${money(selectedService?.price ?? 0)}`}
            </Button>
          </form>
        </Card>
      )}
    </div>
    </div>
  );
}
