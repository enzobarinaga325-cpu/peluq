import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Appointment, Employee, Service } from "@/lib/types";
import { Button, Card, Select, Badge } from "@/components/ui";
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
    setRows((data as Row[]) ?? []);
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Turnos</h1>
        <p className="text-sm text-zinc-500">Desde acá gestionás las reservas y mandás recordatorios por WhatsApp.</p>
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
            </Card>
          ))}
          {rows.length === 0 && <p className="text-sm text-zinc-500">No hay turnos para este filtro.</p>}
        </div>
      )}
    </div>
  );
}
