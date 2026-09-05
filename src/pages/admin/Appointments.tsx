import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Appointment, Employee, Service } from "@/lib/types";
import { Button, Card, Select, Badge, Label, Input } from "@/components/ui";
import { money, todayStr, formatDateLong } from "@/lib/format";
import { buildReminderMessage, waLink } from "@/lib/whatsapp";
import { useAuth } from "@/lib/AuthContext";

type Row = Appointment & { employee?: Employee; service?: Service };

export function Appointments() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("todos");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(todayStr());
  const [editing, setEditing] = useState<Row | null>(null);
  const [editDraft, setEditDraft] = useState({ clientName: "", clientPhone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let query = supabase.from("employees").select("*").order("created_at");
    if (profile?.role === "staff" && profile.employeeId) query = query.eq("id", profile.employeeId);
    query.then(({ data }) => setEmployees(data ?? []));
  }, [profile]);

  async function load() {
    setLoading(true);
    let query = supabase
      .from("appointments")
      .select("*, employee:employees(*), service:services(*)")
      .gte("date", from)
      .order("date")
      .order("start_time");
    if (employeeId !== "todos") query = query.eq("employee_id", employeeId);
    const { data } = await query;
    // Los turnos de clientes fijos se gestionan aparte, en "Turnos fijos" y en la Agenda —
    // acá solo van los turnos sueltos, para no mezclar las dos cosas. Los cancelados
    // desaparecen de esta lista (el horario liberado se ve en la Agenda, no hace falta
    // seguir viendo acá turnos que ya no van a pasar).
    const visible = ((data as Row[]) ?? []).filter((row) => !row.recurring_id && row.status !== "cancelado");
    setRows(visible);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, from]);

  async function setStatus(row: Row, status: Appointment["status"]) {
    await supabase.from("appointments").update({ status }).eq("id", row.id);
    load();
  }

  function openEdit(row: Row) {
    setError(null);
    setEditing(row);
    setEditDraft({ clientName: row.client_name, clientPhone: row.client_phone });
  }

  async function saveEdit() {
    if (!editing) return;
    if (!editDraft.clientName.trim() || !editDraft.clientPhone.trim()) return;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from("appointments")
      .update({ client_name: editDraft.clientName.trim(), client_phone: editDraft.clientPhone.trim() })
      .eq("id", editing.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditing(null);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Turnos</h1>
        <p className="text-sm text-zinc-500">
          Turnos sueltos: gestioná las reservas y mandá recordatorios por WhatsApp. Los turnos de clientes fijos
          se manejan en "Turnos fijos" y en la Agenda.
        </p>
      </div>

      <Card className="flex flex-wrap items-end gap-3">
        {profile?.role === "owner" && (
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-zinc-600">Empleado</label>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="todos">Todos</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Desde</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </Card>

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <Card key={row.id} className="flex flex-wrap items-center gap-4">
              <div className="min-w-[140px]">
                <p className="text-sm font-medium">{formatDateLong(row.date)}</p>
                <p className="text-xs text-zinc-500">{row.start_time.slice(0, 5)} hs</p>
              </div>
              <div className="flex-1 min-w-[180px]">
                <p className="font-medium">{row.client_name}</p>
                <p className="text-xs text-zinc-500">
                  {row.service?.name ?? "Servicio eliminado"} con {row.employee?.name} · {money(row.price ?? 0)}
                </p>
              </div>
              <Badge
                color={row.status === "confirmado" ? "amber" : row.status === "completado" ? "green" : "red"}
              >
                {row.status}
              </Badge>
              {row.status === "confirmado" && (
                <>
                  <a
                    href={waLink(
                      row.client_phone,
                      buildReminderMessage({
                        clientName: row.client_name,
                        employeeName: row.employee?.name ?? "",
                        serviceName: row.service?.name ?? "tu servicio",
                        date: row.date,
                        startTime: row.start_time,
                      })
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Recordar por WhatsApp
                  </a>
                  <Button variant="secondary" onClick={() => setStatus(row, "completado")}>
                    Marcar completado
                  </Button>
                  <Button variant="danger" onClick={() => setStatus(row, "cancelado")}>
                    Cancelar
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => openEdit(row)}>
                Editar
              </Button>
            </Card>
          ))}
          {rows.length === 0 && <p className="text-sm text-zinc-500">No hay turnos para este filtro.</p>}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <Card className="w-full max-w-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Editar turno</h2>
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
