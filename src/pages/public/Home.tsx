import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { Employee } from "@/lib/types";
import { Spinner } from "@/components/ui";

export function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("employees")
      .select("*")
      .eq("active", true)
      .order("name")
      .then(({ data }) => {
        setEmployees(data ?? []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="text-center text-xl font-semibold">Reservá tu turno</h1>
      <p className="text-center text-sm text-zinc-500">Elegí con quién querés atenderte</p>
      <div className="mt-4 flex flex-col gap-3">
        {employees.map((emp) => (
          <Link
            key={emp.id}
            to={`/${emp.slug}`}
            className="flex items-center gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:shadow-md"
          >
            <img
              src={emp.logo_url ?? "https://api.dicebear.com/9.x/initials/svg?seed=" + emp.name}
              alt={emp.name}
              className="h-14 w-14 rounded-full object-cover"
            />
            <span className="font-medium">{emp.name}</span>
          </Link>
        ))}
        {employees.length === 0 && <p className="text-center text-sm text-zinc-400">No hay empleados disponibles.</p>}
      </div>
    </div>
  );
}
