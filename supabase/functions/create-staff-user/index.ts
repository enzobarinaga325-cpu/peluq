// Crea el login de un peluquero (auth user + fila en staff_profiles). Solo el dueño puede llamarla.
// Usa npm: (cacheado por el runtime de Deno) en vez de un import de esm.sh para no depender
// de esa CDN en cada arranque en frío.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const { email, password, employee_id } = body ?? {};
  if (!email || typeof email !== "string") return json({ error: "Email requerido" }, 400);
  if (!password || typeof password !== "string" || password.length < 8) {
    return json({ error: "La contraseña debe tener al menos 8 caracteres" }, 400);
  }
  if (!employee_id || typeof employee_id !== "string") return json({ error: "Empleado requerido" }, 400);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return json({ error: "Faltan variables de entorno del proyecto" }, 500);
  }

  try {
    // Verificamos quién llama usando SU propio token (no la service key) y chequeamos que sea owner.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await callerClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const { data: callerProfile } = await admin
      .from("staff_profiles")
      .select("role")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (callerProfile?.role !== "owner") {
      return json({ error: "Solo el dueño puede crear accesos" }, 403);
    }

    const { data: employee } = await admin.from("employees").select("id").eq("id", employee_id).maybeSingle();
    if (!employee) return json({ error: "Empleado inválido" }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      const msg = createErr.message?.includes("already been registered")
        ? "Ese email ya tiene una cuenta"
        : createErr.message;
      return json({ error: msg }, 400);
    }

    const { error: profileErr } = await admin
      .from("staff_profiles")
      .upsert({ user_id: created.user.id, role: "staff", employee_id });
    if (profileErr) throw profileErr;

    return json({ ok: true });
  } catch (e: any) {
    console.error("create-staff-user error", e);
    return json({ error: e.message ?? "internal error" }, 500);
  }
});
