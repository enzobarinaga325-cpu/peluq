import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type StaffRole = "owner" | "staff";
export type StaffProfile = { role: StaffRole; employeeId: string | null };

type AuthContextValue = {
  session: Session | null;
  profile: StaffProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string): Promise<StaffProfile | null> {
  const { data } = await supabase.from("staff_profiles").select("role, employee_id").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { role: data.role as StaffRole, employeeId: data.employee_id };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setProfile(data.session ? await loadProfile(data.session.user.id) : null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      setProfile(s ? await loadProfile(s.user.id) : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
