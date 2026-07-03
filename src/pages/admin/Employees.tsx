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
  const [accessFor, setAccessFor] = useState<string | null>(null);
  const [accessEmail, setAccessEmail] = useState("");
  const [accessPassword, setAccessPassword] = useState("");
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessDoneFor, setAccessDoneFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    const slug = slugify(name);
    const { error } = await supabase.from("employees").insert({ name: name.trim(), slug, phone: phone.trim() || null });
    setCreating(false);
    if (error) {
      setError(
        error.code === "23505"
          ? "Ya existe un empleado con un nombre muy similar (el link generado se repite). Probá con otro nombre."
          : error.message
      );
      return;
    }
    setName("");
    setPhone("");
    load();
  }

  async function toggleActive(emp: Employee) {
    setError(null);
    const { error } = await supabase.from("employees").update({ active: !emp.active }).eq("id", emp.id);
    if (error) setError(error.message);
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

  function openAccessForm(emp: Employee) {
    setAccessFor(emp.id);
    setAccessEmail("");
    setAccessPassword("");
    setAccessError(null);
    setAccessDoneFor(null);
  }

  async function createAccess(emp: Employee, e: React.FormEvent) {
    e.preventDefault();
    setAccessSaving(true);
    setAccessError(null);
    const { data, error } = await supabase.functions.invoke("create-staff-user", {
      body: { email: accessEmail.trim(), password: accessPassword, employee_id: emp.id },
    });
    setAccessSaving(false);
    if (error) {
      const bodyMsg = (error as any)?.context?.json
        ? await (error as any).context.json().then((j: any) => j.error).catch(() => null)
        : null;
      setAccessError(bodyMsg || error.message || "No se pudo crear el acceso");
      return;
    }
    if (data?.error) {
      setAccessError(data.error);
      return;
    }
    setAccessFor(null);
    setAccessDoneFor(emp.id);
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
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </Card>

      {loading ? (
        <p className="text-sm text-zinc-500">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-3">
          {employees.map((emp) => (
            <Card key={emp.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-4">
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
                <Button variant="secondary" onClick={() => openAccessForm(emp)}>
                  Crear acceso al panel
                </Button>
              </div>

              {accessDoneFor === emp.id && (
                <p className="text-sm text-green-700">Acceso creado. Pasale el email y la contraseña a {emp.name}.</p>
              )}

              {accessFor === emp.id && (
                <form
                  onSubmit={(e) => createAccess(emp, e)}
                  className="flex flex-wrap items-end gap-3 rounded-lg bg-zinc-50 p-3"
                >
                  <div className="flex-1 min-w-[160px]">
                    <Label>Email de {emp.name}</Label>
                    <Input
                      type="email"
                      value={accessEmail}
                      onChange={(e) => setAccessEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <Label>Contraseña (mínimo 8 caracteres)</Label>
                    <Input
                      type="text"
                      value={accessPassword}
                      onChange={(e) => setAccessPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={accessSaving}>
                    {accessSaving ? "Creando..." : "Confirmar"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setAccessFor(null)}>
                    Cancelar
                  </Button>
                  {accessError && <p className="w-full text-sm text-red-600">{accessError}</p>}
                </form>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
