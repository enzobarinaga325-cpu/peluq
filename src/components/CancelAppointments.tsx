import { useState } from "react";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, Button, Card, Input, Label, Spinner } from "@/components/ui";
import { formatDateLong } from "@/lib/format";

type MyAppointment = {
  id: string;
  date: string;
  start_time: string;
  service_name: string;
  employee_name: string;
  is_fixed: boolean;
};

/**
 * Botón + ventana para que un cliente cancele sus turnos con el celular que cargó al reservar.
 * El público no puede leer ni editar la tabla de turnos, así que todo pasa por dos funciones
 * de la base (list_my_appointments / cancel_my_appointment, ver supabase_client_cancel_appointments.sql)
 * que verifican el teléfono del lado del servidor.
 */
export function CancelAppointments() {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MyAppointment[] | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setPhone("");
    setResults(null);
    setConfirmingId(null);
    setError(null);
    setNotice(null);
  }

  async function fetchAppointments(): Promise<MyAppointment[] | null> {
    const { data, error } = await supabase.rpc("list_my_appointments", { p_phone: phone.trim() });
    if (error) {
      console.error("list_my_appointments", error);
      setError("No pudimos buscar tus turnos. Probá de nuevo en un rato.");
      return null;
    }
    return (data as MyAppointment[]) ?? [];
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setConfirmingId(null);
    if (phone.replace(/\D/g, "").length < 8) {
      setError("Ingresá el número completo, con código de área.");
      return;
    }
    setLoading(true);
    const list = await fetchAppointments();
    setLoading(false);
    if (list) setResults(list);
  }

  async function handleCancel(id: string) {
    setCancellingId(id);
    setError(null);
    setNotice(null);
    const { data, error } = await supabase.rpc("cancel_my_appointment", { p_id: id, p_phone: phone.trim() });
    if (error) {
      console.error("cancel_my_appointment", error);
      setError("No pudimos cancelar el turno. Probá de nuevo en un rato.");
    } else if (data === true) {
      setNotice("Listo, tu turno quedó cancelado.");
    } else {
      setError("No se pudo cancelar: puede que el turno ya haya pasado o que ya esté cancelado.");
    }
    setConfirmingId(null);
    const list = await fetchAppointments();
    if (list) setResults(list);
    setCancellingId(null);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800"
      >
        ¿Necesitás cancelar un turno?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label="Cancelar un turno"
        >
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <Card className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Cancelar un turno</h2>
                  <p className="text-sm text-zinc-500">Ingresá el celular con el que reservaste.</p>
                </div>
                <button type="button" onClick={close} aria-label="Cerrar" className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSearch} className="flex flex-col gap-3">
                <div>
                  <Label>Teléfono</Label>
                  <Input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="Con código de área, sin 0 ni 15"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={loading}>
                  {loading ? "Buscando..." : "Buscar mis turnos"}
                </Button>
              </form>

              {error && <p className="text-sm text-red-600">{error}</p>}
              {notice && <p className="text-sm text-green-700">{notice}</p>}

              {loading && (
                <div className="flex justify-center">
                  <Spinner />
                </div>
              )}

              {results && results.length === 0 && !loading && (
                <p className="text-sm text-zinc-500">No encontramos turnos próximos con ese número.</p>
              )}

              {results && results.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {results.map((a) => (
                    <li key={a.id} className="flex flex-col gap-2 rounded-lg border border-zinc-200 p-3 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium"><span className="capitalize">{formatDateLong(a.date)}</span> · {a.start_time.slice(0, 5)} hs</p>
                          <p className="text-zinc-500">{a.service_name} con {a.employee_name}</p>
                        </div>
                        {a.is_fixed && <Badge color="amber">Turno fijo</Badge>}
                      </div>
                      {confirmingId === a.id ? (
                        <div className="flex flex-col gap-2">
                          <p className="text-zinc-600">
                            {a.is_fixed
                              ? "Se cancela solo este día; tu turno fijo sigue los demás."
                              : "¿Seguro que querés cancelar este turno?"}
                          </p>
                          <div className="flex gap-2">
                            <Button variant="danger" className="flex-1" disabled={cancellingId === a.id} onClick={() => handleCancel(a.id)}>
                              {cancellingId === a.id ? "Cancelando..." : "Sí, cancelar"}
                            </Button>
                            <Button variant="secondary" className="flex-1" disabled={cancellingId === a.id} onClick={() => setConfirmingId(null)}>
                              No
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="secondary" onClick={() => { setConfirmingId(a.id); setNotice(null); }}>
                          Cancelar este turno
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
