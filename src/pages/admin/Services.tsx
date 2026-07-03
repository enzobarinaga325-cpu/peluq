import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Employee, Service } from "@/lib/types";
import { Button, Card, Input, Label, Select, Badge } from "@/components/ui";
import { money } from "@/lib/format";
import { useAuth } from "@/lib/AuthContext";

export function Services() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("30");
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

  async function loadServices(empId: string) {
    setLoading(true);
    const { data } = await supabase.from("services").select("*").eq("employee_id", empId).order("created_at");
    setServices(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    if (employeeId) loadServices(employeeId);
  }, [employeeId]);

  async function createService(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !employeeId) return;
    setError(null);
    const { error } = await supabase.from("services").insert({
      employee_id: employeeId,
      name: name.trim(),
      price: Number(price) || 0,
      duration_minutes: Number(duration) || 30,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setName("");
    setPrice("");
    setDuration("30");
    loadServices(employeeId);
  }

  async function toggleActive(svc: Service) {
    setError(null);
    const { error } = await supabase.from("services").update({ active: !svc.active }).eq("id", svc.id);
    if (error) setError(error.message);
    loadServices(employeeId);
  }

  async function updatePrice(svc: Service, newPrice: number) {
    setError(null);
    const { error } = await supabase.from("services").update({ price: newPrice }).eq("id", svc.id);
    if (error) setError(error.message);
    loadServices(employeeId);
  }

  async function deleteService(svc: Service) {
    if (!confirm(`¿Borrar "${svc.name}"? Esta acción no se puede deshacer.`)) return;
    setError(null);
    const { error } = await supabase.from("services").delete().eq("id", svc.id);
    if (error) {
      setError(
        error.code === "23503"
          ? `No se puede borrar "${svc.name}" porque ya tiene turnos asociados. Desactivalo en su lugar.`
          : error.message
      );
    }
    loadServices(employeeId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Servicios y precios</h1>
        <p className="text-sm text-zinc-500">Cada empleado tiene su propia lista de servicios.</p>
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
        <h2 className="mb-3 text-sm font-semibold">Agregar servicio</h2>
        <form onSubmit={createService} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Corte de pelo" required />
          </div>
          <div className="w-32">
            <Label>Precio ($)</Label>
            <Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} min={0} />
          </div>
          <div className="w-32">
            <Label>Duración (min)</Label>
            <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} min={5} step={5} />
          </div>
          <Button type="submit">Agregar</Button>
        </form>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {services.map((svc) => (
            <Card key={svc.id} className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[160px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{svc.name}</span>
                  <Badge color={svc.active ? "green" : "zinc"}>{svc.active ? "Activo" : "Inactivo"}</Badge>
                </div>
                <p className="text-xs text-zinc-500">{svc.duration_minutes} min</p>
              </div>
              <Input
                type="number"
                defaultValue={svc.price}
                className="w-28"
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== svc.price) updatePrice(svc, v);
                }}
              />
              <span className="text-xs text-zinc-400">{money(svc.price)}</span>
              <Button variant="secondary" onClick={() => toggleActive(svc)}>
                {svc.active ? "Desactivar" : "Activar"}
              </Button>
              <Button variant="danger" onClick={() => deleteService(svc)}>
                Borrar
              </Button>
            </Card>
          ))}
          {services.length === 0 && <p className="text-sm text-zinc-500">Todavía no hay servicios para este empleado.</p>}
        </div>
      )}
    </div>
  );
}
