import { useState } from "react";
import { Appointments } from "./Appointments";
import { Recurring } from "./Recurring";

type Tab = "casual" | "fija";

/** Junta los turnos de siempre y los fijos en un solo lugar del menú, con pestañas adentro. */
export function Reservas() {
  const [tab, setTab] = useState<Tab>("casual");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 text-sm w-fit">
        <button
          onClick={() => setTab("casual")}
          className={`rounded-md px-3 py-1.5 ${tab === "casual" ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}
        >
          Turnos
        </button>
        <button
          onClick={() => setTab("fija")}
          className={`rounded-md px-3 py-1.5 ${tab === "fija" ? "bg-white font-semibold shadow-sm" : "text-zinc-500"}`}
        >
          Turnos fijos
        </button>
      </div>

      {tab === "casual" ? <Appointments /> : <Recurring />}
    </div>
  );
}
