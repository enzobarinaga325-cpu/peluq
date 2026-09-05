import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MessageCircle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Appointment, Employee, Schedule, ScheduleException, Service } from "@/lib/types";
import { dayOfWeekFor, addMinutesToTime } from "@/lib/availability";
import { todayStr, addDaysStr, formatDateLong } from "@/lib/format";
import { buildReminderMessage, waLink } from "@/lib/whatsapp";
import { Button, Card, Select, Label, Input, Spinner } from "@/components/ui";
import { useAuth } from "@/lib/AuthContext";

type Row = Appointment & { service?: Service };

type Block =
  | { kind: "busy"; row: Row; start: number; end: number }
  | { kind: "cancelledFijo"; row: Row; start: number; end: number }
  | { kind: "free"; start: number; end: number };

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function Agenda() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<Row | null>(null);
  const [newSlot, setNewSlot] = useState<string | null>(null);
  const [newDraft, setNewDraft] = useState({ serviceId: "", clientName: "", clientPhone: "" });
  const [editing, setEditing] = useState<Row | null>(null);
  const [editDraft, setEditDraft] = useState({ clientName: "", clientPhone: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let query = supabase.from("employees").select("*").order("created_at");
    if (profile?.role === "staff" && profile.employeeId) query = query.eq("id", profile.employeeId);
    query.then(({ data }) => {
      setEmployees(data ?? []);
      if (data && data.length > 0) setEmployeeId(data[0].id);
    });
  }, [profile]);

  async function load() {
    if (!employeeId) return;
    setLoading(true);
    const dow = dayOfWeekFor(date);
    const [{ data: sch }, { data: exc }, { data: appts }, { data: svc }] = await Promise.all([
      supabase.from("schedules").select("*").eq("employee_id", employeeId).eq("day_of_week", dow).eq("active", true),
      supabase.from("schedule_exceptions").select("*").eq("employee_id", employeeId).eq("date", date),
      supabase
        .from("appointments")
        .select("*, service:services(*)")
        .eq("employee_id", employeeId)
        .eq("date", date)
        .order("start_time"),
      supabase.from("services").select("*").eq("employee_id", employeeId).eq("active", true),
    ]);
    setSchedules(sch ?? []);
    setExceptions(exc ?? []);
    setRows((appts as Row[]) ?? []);
    setServices(svc ?? []);
    if (svc && svc.length > 0) setNewDraft((d) => (d.serviceId ? d : { ...d, serviceId: svc[0].id }));
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, date]);

  const isToday = date === todayStr();
  const employee = employees.find((e) => e.id === employeeId);

  const dayWindow = useMemo(() => {
    const exception = exceptions.find((e) => e.date === date);
    if (exception?.is_closed) return null;
    if (exception?.start_time && exception?.end_time) {
      return { start: toMinutes(exception.start_time), end: toMinutes(exception.end_time) };
    }
    const active = schedules.filter((s) => s.active);
    if (active.length === 0) return null;
    return {
      start: Math.min(...active.map((s) => toMinutes(s.start_time))),
      end: Math.max(...active.map((s) => toMinutes(s.end_time))),
    };
  }, [schedules, exceptions, date]);

  // En vez de una grilla fija cada 30 min, armamos bloques que se ajustan a los horarios
  // reales: cada turno ocupa exactamente su inicio y fin, y el próximo (sea el que sea)
  // arranca justo donde termina el anterior — nunca se solapan porque se arman a partir
  // de los turnos ya confirmados. Los huecos entre turnos (y antes del primero / después
  // del último) quedan como bloques "libres" del tamaño real del hueco.
  const blocks = useMemo<Block[]>(() => {
    if (!dayWindow) return [];
    const active = rows
      .filter((r) => r.status !== "cancelado")
      .map((r) => ({ start: toMinutes(r.start_time), end: toMinutes(r.end_time), row: r }))
      .sort((a, b) => a.start - b.start);
    // Un turno cancelado no debe fundirse sin más con el hueco libre de al lado: conserva
    // su propio horario como bloque separado, no importa si el hueco de al lado ya estaba
    // libre de antes. Si todavía es de un cliente fijo (se canceló solo por hoy) se marca
    // "Fijo cancelado" para poder restaurarlo — así pasó el lío que arrancó todo esto: el
    // horario quedaba en blanco, alguien más lo agarraba, y no había forma de ver que en
    // realidad era de un cliente fijo. Si ya no tiene turno fijo asociado (se canceló para
    // siempre, o era un turno suelto) se ve como un "Disponible" más, pero en su propia franja.
    const cancelled = rows
      .filter((r) => r.status === "cancelado")
      .map((r) => ({ start: toMinutes(r.start_time), end: toMinutes(r.end_time), row: r }));

    const result: Block[] = [];
    const fillGap = (from: number, to: number) => {
      if (to <= from) return;
      const inGap = cancelled.filter((c) => c.start < to && c.end > from).sort((a, b) => a.start - b.start);
      let p = from;
      for (const c of inGap) {
        // Dos turnos cancelados pueden solaparse entre sí (la base no lo impide para
        // cancelados) — se recorta al pedazo todavía no cubierto para no dibujar bloques
        // superpuestos ni fuera de orden.
        const s = Math.max(c.start, from, p);
        const e = Math.min(c.end, to);
        if (e <= s) continue;
        if (s > p) result.push({ kind: "free", start: p, end: s });
        result.push(
          c.row.recurring_id
            ? { kind: "cancelledFijo", row: c.row, start: s, end: e }
            : { kind: "free", start: s, end: e },
        );
        p = e;
      }
      if (p < to) result.push({ kind: "free", start: p, end: to });
    };

    let cursor = dayWindow.start;
    for (const a of active) {
      if (a.start > cursor) fillGap(cursor, a.start);
      result.push({ kind: "busy", row: a.row, start: a.start, end: a.end });
      cursor = Math.max(cursor, a.end);
    }
    if (cursor < dayWindow.end) fillGap(cursor, dayWindow.end);

    return result;
  }, [dayWindow, rows]);

  async function setStatus(row: Row, status: Appointment["status"]) {
    await supabase.from("appointments").update({ status }).eq("id", row.id);
    setDetail(null);
    load();
  }

  /** Cancela solo esta fecha puntual: la regla fija sigue generando turnos futuros. */
  async function cancelOneDay(row: Row) {
    await setStatus(row, "cancelado");
  }

  /** Reactiva un turno fijo cancelado solo ese día. Si en el medio otro cliente se llevó
   * ese horario, la base lo rechaza (no se pueden solapar) y se lo avisamos. */
  async function restoreOneDay(row: Row) {
    setError(null);
    const { error: restoreError } = await supabase.from("appointments").update({ status: "confirmado" }).eq("id", row.id);
    if (restoreError) {
      alert("Ese horario ya lo ocupa otro turno, no se puede restaurar. Revisalo desde la agenda.");
    }
    setDetail(null);
    load();
  }

  /** Cancelación definitiva: borra la regla (desaparece de Turnos fijos) y libera todos sus
   * turnos futuros ya generados. Esos turnos no se borran — quedan cancelados, así el
   * horario que ocupaban sigue viéndose como su propia franja en la Agenda en vez de
   * fundirse con el hueco de al lado — pero al borrarse la regla dejan de estar asociados
   * a ningún cliente fijo, así que se ven como un "Disponible" más, sin rastro de quién era.
   * Los turnos ya pasados (completados o de días anteriores) no se tocan. */
  async function cancelPermanently(row: Row) {
    if (!row.recurring_id) return;
    if (
      !confirm(
        `¿Cancelar el turno fijo de ${row.client_name} para siempre? Se liberan todos sus turnos futuros y se borra la regla — no se puede deshacer.`,
      )
    )
      return;
    await supabase
      .from("appointments")
      .update({ status: "cancelado" })
      .eq("recurring_id", row.recurring_id)
      .eq("status", "confirmado")
      .gte("date", todayStr());
    await supabase.from("recurring_appointments").delete().eq("id", row.recurring_id);
    setDetail(null);
    load();
  }

  function openEdit(row: Row) {
    setError(null);
    setEditDraft({ clientName: row.client_name, clientPhone: row.client_phone });
    setEditing(row);
    setDetail(null);
  }

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
    await supabase.from("appointments").update({ client_name: clientName, client_phone: clientPhone }).eq("id", editing.id);
    setSaving(false);
    setEditing(null);
    setDetail(null);
    load();
  }

  function openNewAppointment(startMinutes: number) {
    setError(null);
    setNewDraft((d) => ({ ...d, clientName: "", clientPhone: "" }));
    setNewSlot(toHHMM(startMinutes));
  }

  async function createAppointment() {
    const service = services.find((s) => s.id === newDraft.serviceId);
    if (!service || !newSlot) return;
    if (!newDraft.clientName.trim() || !newDraft.clientPhone.trim()) {
      setError("Completá nombre y teléfono del cliente.");
      return;
    }
    setSaving(true);
    setError(null);
    const endTime = addMinutesToTime(newSlot, service.duration_minutes);
    const { error: insertError } = await supabase.from("appointments").insert({
      employee_id: employeeId,
      service_id: service.id,
      client_name: newDraft.clientName.trim(),
      client_phone: newDraft.clientPhone.trim(),
      date,
      start_time: newSlot,
      end_time: endTime,
      price: service.price,
    });
    setSaving(false);
    if (insertError) {
      setError("Ese horario ya no está disponible, elegí otro.");
      load();
      return;
    }
    setNewSlot(null);
    load();
  }

  const taken = rows.filter((r) => r.status !== "cancelado").length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Agenda</h1>
        <p className="text-sm text-zinc-500">La foto completa del día, para no perderte ningún turno.</p>
      </div>

      <Card className="flex flex-wrap items-center gap-3">
        {profile?.role === "owner" && (
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-zinc-600">Empleado</label>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex items-center gap-1">
          <Button variant="secondary" onClick={() => setDate(addDaysStr(date, -1))} aria-label="Día anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <Button variant="secondary" onClick={() => setDate(addDaysStr(date, 1))} aria-label="Día siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button variant="ghost" onClick={() => setDate(todayStr())}>
              Hoy
            </Button>
          )}
        </div>
        <span className="text-sm capitalize text-zinc-600">{formatDateLong(date)}</span>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : !dayWindow ? (
        <Card className="text-center text-sm text-zinc-500">
          {employee?.name ?? "Este empleado"} no atiende este día (cerrado por horario o día puntual).
        </Card>
      ) : (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-semibold">{employee?.name}</p>
            <span className="text-xs tabular-nums text-zinc-500">{taken} turno{taken === 1 ? "" : "s"}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {blocks.map((b, i) => {
              if (b.kind === "free") {
                return (
                  <button
                    type="button"
                    key={i}
                    onClick={() => openNewAppointment(b.start)}
                    title="Cargar un turno acá"
                    className="flex items-center gap-3 rounded-md border border-dashed border-zinc-200 px-3 py-2 text-left text-xs text-zinc-400 transition hover:bg-zinc-50"
                  >
                    <span className="tabular-nums font-medium">{toHHMM(b.start)}–{toHHMM(b.end)}</span>
                    <span>Disponible</span>
                  </button>
                );
              }
              const isCancelledFijo = b.kind === "cancelledFijo";
              const row = b.row;
              const isFijo = !!row.recurring_id;
              const isCompletado = row.status === "completado";
              // Fijo = negro, casual = gris; el estado cancelado tiene su propio color clarito
              // y no se toca. "Completado" se marca con un ✓ en vez de cambiar el color, para
              // que el color siga indicando de un vistazo si es un cliente fijo o no.
              const cls = isCancelledFijo
                ? "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                : isFijo
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-400 text-white";
              return (
                <button
                  type="button"
                  key={i}
                  onClick={() => setDetail(row)}
                  title={isCancelledFijo ? "Fijo cancelado — tocá para restaurarlo" : `${row.client_name} · ${row.service?.name ?? ""}`}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-left text-xs font-medium transition hover:opacity-90 ${cls}`}
                >
                  <span className="tabular-nums">{toHHMM(b.start)}–{toHHMM(b.end)}</span>
                  <span className="truncate">
                    {isCompletado && !isCancelledFijo && "✓ "}
                    {row.client_name}
                    {isFijo && !isCancelledFijo && " · Fijo"}
                    {isCancelledFijo && " · Fijo cancelado"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-zinc-300" /> Disponible</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-zinc-900" /> Turno fijo</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-zinc-400" /> Turno casual</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-50 ring-1 ring-amber-200" /> Fijo cancelado (tocá para restaurar)</span>
            <span>✓ completado</span>
          </div>
        </Card>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setDetail(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Detalle del turno</h2>
              <button onClick={() => setDetail(null)} className="rounded-md p-1 hover:bg-zinc-100" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-medium">{detail.client_name} {detail.recurring_id && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Fijo</span>}</p>
              <p className="text-zinc-500">{detail.service?.name ?? "Servicio eliminado"}</p>
              <p className="text-zinc-500">{detail.start_time.slice(0, 5)} a {detail.end_time.slice(0, 5)} hs</p>
              <p className="text-zinc-500">{detail.client_phone}</p>
              <p className="text-zinc-500 capitalize">Estado: {detail.status}</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.status !== "cancelado" && (
                <a
                  href={waLink(
                    detail.client_phone,
                    buildReminderMessage({
                      clientName: detail.client_name,
                      employeeName: employee?.name ?? "",
                      serviceName: detail.service?.name ?? "tu servicio",
                      date: detail.date,
                      startTime: detail.start_time,
                    }),
                  )}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
              )}
              <Button variant="secondary" onClick={() => openEdit(detail)}>
                Editar
              </Button>
              {detail.status === "cancelado" ? (
                <Button variant="secondary" onClick={() => restoreOneDay(detail)}>
                  Restaurar
                </Button>
              ) : (
                <>
                  {detail.status === "confirmado" && (
                    <Button variant="secondary" onClick={() => setStatus(detail, "completado")}>
                      Marcar completado
                    </Button>
                  )}
                  {detail.recurring_id ? (
                    <>
                      <Button variant="danger" onClick={() => cancelOneDay(detail)}>
                        Cancelar solo hoy
                      </Button>
                      <Button variant="danger" onClick={() => cancelPermanently(detail)}>
                        Cancelar definitivo
                      </Button>
                    </>
                  ) : (
                    detail.status === "confirmado" && (
                      <Button variant="danger" onClick={() => cancelOneDay(detail)}>
                        Cancelar
                      </Button>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {newSlot && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setNewSlot(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Cargar turno</h2>
              <button onClick={() => setNewSlot(null)} className="rounded-md p-1 hover:bg-zinc-100" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            {services.length === 0 ? (
              <p className="text-sm text-zinc-500">Este empleado todavía no tiene servicios activos cargados.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <Label>Hora</Label>
                  <input
                    type="time"
                    value={newSlot ?? ""}
                    onChange={(e) => setNewSlot(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <Label>Servicio</Label>
                  <Select value={newDraft.serviceId} onChange={(e) => setNewDraft((d) => ({ ...d, serviceId: e.target.value }))}>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} · {s.duration_minutes} min</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Cliente</Label>
                  <Input value={newDraft.clientName} onChange={(e) => setNewDraft((d) => ({ ...d, clientName: e.target.value }))} />
                </div>
                <div>
                  <Label>Teléfono</Label>
                  <Input value={newDraft.clientPhone} onChange={(e) => setNewDraft((d) => ({ ...d, clientPhone: e.target.value }))} />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="mt-1 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setNewSlot(null)}>
                    Cancelar
                  </Button>
                  <Button onClick={createAppointment} disabled={saving}>
                    {saving ? "Guardando…" : "Guardar turno"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Editar turno</h2>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-zinc-100" aria-label="Cerrar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <Label>Cliente</Label>
                <Input value={editDraft.clientName} onChange={(e) => setEditDraft((d) => ({ ...d, clientName: e.target.value }))} />
              </div>
              <div>
                <Label>Teléfono</Label>
                <Input value={editDraft.clientPhone} onChange={(e) => setEditDraft((d) => ({ ...d, clientPhone: e.target.value }))} />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="mt-1 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button onClick={saveEdit} disabled={saving}>
                  {saving ? "Guardando…" : "Guardar cambios"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
