import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/AuthContext";
import type { Employee } from "@/lib/types";
import { slugify } from "@/lib/slug";
import { Button, Card, Label, Spinner } from "@/components/ui";

export function MyProfile() {
  const { profile } = useAuth();
  const [employee, setEmployee] = useState<Employee | null | undefined>(undefined);
  const [slugDraft, setSlugDraft] = useState("");
  const [slugSaving, setSlugSaving] = useState(false);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [slugSaved, setSlugSaved] = useState(false);

  async function load() {
    if (!profile?.employeeId) {
      setEmployee(null);
      return;
    }
    const { data } = await supabase.from("employees").select("*").eq("id", profile.employeeId).maybeSingle();
    setEmployee(data ?? null);
    if (data) setSlugDraft(data.slug);
  }

  useEffect(() => {
    load();
  }, [profile?.employeeId]);

  async function uploadLogo(file: File) {
    if (!employee) return;
    const ext = file.name.split(".").pop();
    const path = `${employee.slug}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) {
      alert("Error subiendo la foto: " + error.message);
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    await supabase.from("employees").update({ logo_url: data.publicUrl }).eq("id", employee.id);
    load();
  }

  async function uploadBackground(file: File) {
    if (!employee) return;
    const ext = file.name.split(".").pop();
    const path = `${employee.slug}-bg-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (error) {
      alert("Error subiendo el fondo: " + error.message);
      return;
    }
    const { data } = supabase.storage.from("logos").getPublicUrl(path);
    await supabase.from("employees").update({ background_url: data.publicUrl }).eq("id", employee.id);
    load();
  }

  async function removeBackground() {
    if (!employee) return;
    await supabase.from("employees").update({ background_url: null }).eq("id", employee.id);
    load();
  }

  async function saveSlug(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;
    const slug = slugify(slugDraft);
    setSlugError(null);
    setSlugSaved(false);
    if (!slug) {
      setSlugError("La URL no puede quedar vacía.");
      return;
    }
    if (slug === employee.slug) return;
    setSlugSaving(true);
    const { error } = await supabase.from("employees").update({ slug }).eq("id", employee.id);
    setSlugSaving(false);
    if (error) {
      setSlugError(error.code === "23505" ? "Esa URL ya la está usando otro empleado." : error.message);
      return;
    }
    setSlugSaved(true);
    load();
  }

  if (employee === undefined) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (employee === null) {
    return (
      <Card>
        <p className="text-sm text-zinc-500">
          Esta sección es para peluqueros con su propia página de reserva. Tu usuario no tiene un empleado asociado.
        </p>
      </Card>
    );
  }

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Mi perfil</h1>
        <p className="text-sm text-zinc-500">Personalizá tu foto, el fondo de tu página y tu link de reserva.</p>
      </div>

      <Card className="flex flex-col gap-4">
        <div>
          <Label>Foto de perfil</Label>
          <div className="flex items-center gap-4">
            <img
              src={employee.logo_url ?? "https://api.dicebear.com/9.x/initials/svg?seed=" + employee.name}
              alt={employee.name}
              className="h-16 w-16 rounded-full border border-zinc-200 object-cover"
            />
            <label className="cursor-pointer text-sm text-zinc-600 underline">
              Cambiar foto
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLogo(file);
                }}
              />
            </label>
          </div>
        </div>

        <div>
          <Label>Fondo de tu página de reserva</Label>
          <div className="flex items-center gap-4">
            {employee.background_url ? (
              <img src={employee.background_url} alt="Fondo" className="h-16 w-24 rounded-lg border border-zinc-200 object-cover" />
            ) : (
              <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-[10px] text-zinc-400">
                Sin fondo
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="cursor-pointer text-sm text-zinc-600 underline">
                {employee.background_url ? "Cambiar fondo" : "Subir fondo"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadBackground(file);
                  }}
                />
              </label>
              {employee.background_url && (
                <button onClick={removeBackground} className="text-left text-sm text-zinc-500 underline">
                  Quitar fondo
                </button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <Label>URL de tu página de reserva</Label>
        <form onSubmit={saveSlug} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <div className="flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm">
              <span className="text-zinc-400">{siteUrl}/</span>
              <input
                value={slugDraft}
                onChange={(e) => setSlugDraft(e.target.value)}
                className="w-full outline-none"
              />
            </div>
          </div>
          <Button type="submit" disabled={slugSaving}>
            {slugSaving ? "Guardando..." : "Guardar"}
          </Button>
        </form>
        {slugError && <p className="mt-2 text-sm text-red-600">{slugError}</p>}
        {slugSaved && <p className="mt-2 text-sm text-green-700">URL actualizada.</p>}
        <a href={`/${employee.slug}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-zinc-500 underline">
          Ver mi página
        </a>
      </Card>
    </div>
  );
}
