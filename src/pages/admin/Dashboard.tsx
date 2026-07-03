import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Appointment, Employee, Service } from "@/lib/types";
import { Button, Card, Select } from "@/components/ui";
import { money, todayStr, addDaysStr, DIAS_SEMANA } from "@/lib/format";
import { dayOfWeekFor } from "@/lib/availability";
import { useAuth } from "@/lib/AuthContext";

type Row = Appointment & { employee?: Employee; service?: Service };

function BookingLinkCard({ employeeId }: { employeeId: string }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    supabase
      .from("employees")
      .select("slug")
      .eq("id", employeeId)
      .maybeSingle()
      .then(({ data }) => setSlug(data?.slug ?? null));
  }, [employeeId]);

  if (!slug) return null;
  const url = `${window.location.origin}/${slug}`;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold">Tu link para compartir con clientes</h2>
        <p className="text-sm text-zinc-600">{url}</p>
      </div>
      <Button
        variant="secondary"
        onClick={() => {
          navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "¡Copiado!" : "Copiar link"}
      </Button>
    </Card>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </Card>
  );
}

export function Dashboard() {
  const { profile } = useAuth();
  const [range, setRange] = useState("30");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const from = addDaysStr(todayStr(), -Number(range));
    setLoading(true);
    supabase
      .from("appointments")
      .select("*, employee:employees(*), service:services(*)")
      .gte("date", from)
      .then(({ data }) => {
        setRows((data as Row[]) ?? []);
        setLoading(false);
      });
  }, [range]);

  const stats = useMemo(() => {
    const completados = rows.filter((r) => r.status === "completado");
    const activos = rows.filter((r) => r.status !== "cancelado");
    const revenue = completados.reduce((acc, r) => acc + (r.price ?? 0), 0);

    const byService = new Map<string, number>();
    const byEmployee = new Map<string, number>();
    const byDay = new Map<number, number>();

    for (const r of activos) {
      const svcName = r.service?.name ?? "—";
      byService.set(svcName, (byService.get(svcName) ?? 0) + 1);
      const empName = r.employee?.name ?? "—";
      byEmployee.set(empName, (byEmployee.get(empName) ?? 0) + 1);
      const dow = dayOfWeekFor(r.date);
      byDay.set(dow, (byDay.get(dow) ?? 0) + 1);
    }

    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
    const topDay = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      total: activos.length,
      completados: completados.length,
      cancelados: rows.filter((r) => r.status === "cancelado").length,
      revenue,
      topServices: top(byService).slice(0, 5),
      topEmployees: top(byEmployee).slice(0, 5),
      busiestDay: topDay ? DIAS_SEMANA[topDay[0]] : "—",
    };
  }, [rows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Estadísticas</h1>
          <p className="text-sm text-zinc-500">
            {profile?.role === "owner" ? "Resumen de la actividad" : "Tus turnos y estadísticas"}
          </p>
        </div>
        <div className="w-40">
          <Select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="365">Último año</option>
          </Select>
        </div>
      </div>

      {profile?.role === "staff" && profile.employeeId && <BookingLinkCard employeeId={profile.employeeId} />}

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Turnos (activos)" value={String(stats.total)} />
            <StatCard label="Completados" value={String(stats.completados)} />
            <StatCard label="Cancelados" value={String(stats.cancelados)} />
            <StatCard label="Ingresos (completados)" value={money(stats.revenue)} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <h2 className="mb-2 text-sm font-semibold">Servicios más pedidos</h2>
              <ul className="flex flex-col gap-1 text-sm">
                {stats.topServices.map(([name, count]) => (
                  <li key={name} className="flex justify-between">
                    <span>{name}</span>
                    <span className="text-zinc-500">{count}</span>
                  </li>
                ))}
                {stats.topServices.length === 0 && <li className="text-zinc-400">Sin datos</li>}
              </ul>
            </Card>
            {profile?.role === "owner" && (
              <Card>
                <h2 className="mb-2 text-sm font-semibold">Empleados con más turnos</h2>
                <ul className="flex flex-col gap-1 text-sm">
                  {stats.topEmployees.map(([name, count]) => (
                    <li key={name} className="flex justify-between">
                      <span>{name}</span>
                      <span className="text-zinc-500">{count}</span>
                    </li>
                  ))}
                  {stats.topEmployees.length === 0 && <li className="text-zinc-400">Sin datos</li>}
                </ul>
              </Card>
            )}
            <Card>
              <h2 className="mb-2 text-sm font-semibold">Día más ocupado</h2>
              <p className="text-2xl font-semibold capitalize">{stats.busiestDay}</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
