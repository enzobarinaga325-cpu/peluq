import { NavLink, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { Spinner } from "./ui";

const NAV = [
  { to: "/admin", label: "Panel", end: true },
  { to: "/admin/turnos", label: "Turnos" },
  { to: "/admin/turnos-fijos", label: "Turnos fijos" },
  { to: "/admin/empleados", label: "Empleados" },
  { to: "/admin/servicios", label: "Servicios" },
  { to: "/admin/horarios", label: "Horarios" },
];

export function AdminLayout() {
  const { session, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!session) return <Navigate to="/admin/login" replace />;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="font-semibold">Panel de administración</span>
          <button onClick={() => signOut()} className="text-sm text-zinc-500 hover:text-zinc-900">
            Cerrar sesión
          </button>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2 text-sm">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-1.5 ${isActive ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
