import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Employee } from "@/lib/types";
import { Button, Card, Input, Label, Badge } from "@/components/ui";
import { useAuth } from "@/lib/AuthContext";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function Employees() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("employees").select("*").order("created_at");
    setEmployees(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function createEmployee(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const slug = slugify(name);
    await supabase.from("employees").insert({ name: name.trim(), slug, phone: phone.trim() || null });
    setName("");
    setPhone("");
    setCreating(false);
    load();
  }

  async function toggleActive(emp: Employee) {
    await supabase.from("employees").update({ active: !emp.active }).eq("id", emp.id);
    load();
  }

  async function uploadLogo(emp: Employee, file: File) {
    const ext = file.name.split(".").pop();
    const path = `${emp.slug}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) {
      alert("Error subiendo el logo: " + error.message);
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    await supabase.from("employees").update({ logo_url: data.publicUrl }).eq("id", emp.id);
    load();
  }

  if (profile?.role !== "owner") return <Navigate to="/admin" replace />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Empleados</h1>
        <p className="text-sm text-zinc-500">Cada uno tiene su propia página pública de reserva y su logo.</p>
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold">Agregar empleado</h2>
        <form onSubmit={createEmployee} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <Label>Nombre</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Pérez" required />
          </div>
          <div className="flex-1 min-w-[160px]">
            <Label>Teléfono (WhatsApp, con código de área, sin 0 ni 15)</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="3815551234" />
          </div>
          <Button type="submit" disabled={creating}>
            Agregar
          </Button>
        </form>
      </Card>

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {employees.map((emp) => (
            <Card key={emp.id} className="flex flex-wrap items-center gap-4">
              <img
                src={emp.logo_url ?? "https://api.dicebear.com/9.x/initials/svg?seed=" + emp.name}
                alt={emp.name}
                className="h-14 w-14 rounded-full border border-zinc-200 object-cover"
              />
              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{emp.name}</span>
                  <Badge color={emp.active ? "green" : "zinc"}>{emp.active ? "Activo" : "Inactivo"}</Badge>
                </div>
                <p className="text-xs text-zinc-500">/{emp.slug} · {emp.phone || "sin teléfono"}</p>
              </div>
              <label className="cursor-pointer text-sm text-zinc-600 underline">
                Cambiar logo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo(emp, file);
                  }}
                />
              </label>
              <Button variant="secondary" onClick={() => toggleActive(emp)}>
                {emp.active ? "Desactivar" : "Activar"}
              </Button>
              <a
                href={`/${emp.slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-zinc-500 underline"
              >
                Ver página
              </a>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
