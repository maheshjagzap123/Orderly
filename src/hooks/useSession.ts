import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/** Tracks the current Supabase auth session for the vendor area. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      // A sign-out or failed token refresh while the vendor was active means the
      // session expired — flag it so the login screen can explain what happened.
      if (!s && (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED")) {
        try {
          sessionStorage.setItem("orderly.sessionExpired", "1");
        } catch {
          /* storage unavailable — ignore */
        }
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}
