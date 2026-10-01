import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSession } from "@/hooks/useSession";

/** Guards vendor routes. Redirects to login when there is no session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  if (!session) {
    return <Navigate to="/vendor/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
