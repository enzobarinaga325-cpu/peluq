import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Employee, RecurringAppointment, Service } from "@/lib/types";
import { Button, Card, Input, Label, Select, Badge } from "@/components/ui";
import { DIAS_SEMANA, todayStr } from "@/lib/format";
import { ensureOccurrences } from "@/lib/recurring";
import { useAuth } from "@/lib/AuthContext";

export function Recurring() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [recurring, setRecurring] = useState<RecurringAppointment[]>([]);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("10:00");
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RecurringAppointment | null>(null);
  const [editDraft, setEditDraft] = useState({ clientName: "", clientPhone: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let query = supabase.from("employees").select("*").order("created_at");
    if (profile?.role === "staff" && profile.employeeId) query = query.eq("id", profile.employeeId);
    query.then(({ data }) => {
      setEmployees(data ?? []);
      if (data && data.length > 0) setEmployeeId(data[0].id);
    });
  }, [profile]);

  async function loadForEmployee(empId: string) {
    const [{ data: svc }, { data: rec }] = await Promise.all([
      supabase.from("services").select("*").eq("employee_id", empId).eq("active", true),
      supabase.from("recurring_appointments").select("*").eq("employee_id", empId).order("day_of_week"),
    ]);
    setServices(svc ?? []);
    if (svc && svc.length > 0) setServiceId(svc[0].id);
    setRecurring(rec ?? []);
  }

  useEffect(() => {
    if (employeeId) loadForEmployee(employeeId);
  }, [employeeId]);

  async function createRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!clientName.trim() || !clientPhone.trim() || !serviceId) return;
    setError(null);
    const { data, error } = await supabase
      .from("recurring_appointments")
      .insert({
        employee_id: employeeId,
        service_id: serviceId,
        client_name: clientName.trim(),
        client_phone: clientPhone.trim(),
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
      })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    setClientName("");
    setClientPhone("");
    // Reserva las próximas fechas de una para que el horario quede bloqueado ya mismo,
    // en vez de esperar a la próxima vez que alguien entre al panel.
    const svc = services.find((s) => s.id === serviceId);
    await ensureOccurrences(data as RecurringAppointment, svc);
    loadForEmployee(employeeId);
  }

  /** Cancelación definitiva: borra la regla (desaparece de Turnos fijos) y libera todos sus
   * turnos futuros ya generados sin borrarlos — quedan cancelados, para que su horario
   * siga viéndose como su propia franja en la Agenda en vez de fundirse con el hueco de al
   * lado; al borrarse la regla dejan de estar asociados a un cliente fijo. Los turnos ya
   * pasados (completados o de días anteriores) no se tocan. */
  async function cancelPermanently(rec: RecurringAppointment) {
    if (
      !confirm(
        `¿Cancelar el turno fijo de ${rec.client_name} para siempre? Se liberan todos sus turnos futuros y se borra la regla — no se puede deshacer.`,
      )
    )
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

  function openEdit(rec: RecurringAppointment) {
    setError(null);
    setEditDraft({ clientName: rec.client_name, clientPhone: rec.client_phone });
    setEditing(rec);
  }

  /** Actualiza la regla y, para que no quede desactualizado en la Agenda, también los
   * turnos ya generados a futuro (cada uno guarda su propia copia del nombre/teléfono). */
  async function saveEdit() {
    if (!editing) return;
    const clientName = editDraft.clientName.trim();
    const clientPhone = editDraft.clientPhone.trim();
    if (!clientName || !clientPhone) {
      setError("Completá nombre y teléfono del cliente.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: e1 } = await supabase
      .from("recurring_appointments")
      .update({ client_name: clientName, client_phone: clientPhone })
      .eq("id", editing.id);
    if (e1) {
      setSaving(false);
      setError(e1.message);
      return;
    }
    await supabase
      .from("appointments")
      .update({ client_name: clientName, client_phone: clientPhone })
      .eq("recurring_id", editing.id)
      .eq("status", "confirmado")
      .gte("date", todayStr());
    setSaving(false);
    setEditing(null);
    loadForEmployee(employeeId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Turnos fijos</h1>
        <p className="text-sm text-zinc-500">
          Clientes que vienen siempre el mismo día y horario. Las próximas fechas se reservan solas para que nadie
          más pueda sacar ese horario; se ven y se gestionan día a día desde la Agenda.
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

      <div className="flex flex-col gap-2">
        {recurring.map((rec) => (
          <Card key={rec.id} className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[160px]">
              <div className="flex items-center gap-2">
                <span className="font-medium">{rec.client_name}</span>
                <Badge>{DIAS_SEMANA[rec.day_of_week]}</Badge>
              </div>
              <p className="text-xs text-zinc-500">{rec.start_time.slice(0, 5)} hs · {rec.client_phone}</p>
            </div>
            <Button variant="secondary" onClick={() => openEdit(rec)}>
              Editar
            </Button>
            <Button variant="danger" onClick={() => cancelPermanently(rec)}>
              Cancelar definitivo
            </Button>
          </Card>
        ))}
        {recurring.length === 0 && <p className="text-sm text-zinc-500">No hay turnos fijos para este empleado.</p>}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Editar turno fijo</h2>
              <button onClick={() => setEditing(null)} className="text-zinc-400 hover:text-zinc-700">
                <X size={18} />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <Label>Cliente</Label>
                <Input
                  value={editDraft.clientName}
                  onChange={(e) => setEditDraft((d) => ({ ...d, clientName: e.target.value }))}
                />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input
                  value={editDraft.clientPhone}
                  onChange={(e) => setEditDraft((d) => ({ ...d, clientPhone: e.target.value }))}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button onClick={saveEdit} disabled={saving}>
                  Guardar cambios
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
