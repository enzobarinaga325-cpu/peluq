import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Services } from "./Services";
import { SchedulePage } from "./Schedule";
import { Employees } from "./Employees";
import { MyProfile } from "./MyProfile";

type Tab = "servicios" | "horarios" | "empleados" | "perfil";

/** Todo lo que se configura una vez y se toca poco, junto en un solo lugar del menú. */
export function Configuracion() {
  const { profile } = useAuth();
  const tabs: { key: Tab; label: string }[] = [
    { key: "servicios", label: "Servicios" },
    { key: "horarios", label: "Horarios" },
    ...(profile?.role === "owner" ? [{ key: "empleados" as const, label: "Empleados" }] : []),
    ...(profile?.employeeId ? [{ key: "perfil" as const, label: "Mi perfil" }] : []),
  ];
  const [tab, setTab] = useState<Tab>("servicios");
  const active = tabs.some((t) => t.key === tab) ? tab : "servicios";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1 text-sm w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 ${active === t.key ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {active === "servicios" && <Services />}
      {active === "horarios" && <SchedulePage />}
      {active === "empleados" && <Employees />}
      {active === "perfil" && <MyProfile />}
    </div>
  );
}
