/**
 * Map backend/auth errors to short, user-friendly messages so raw Supabase /
 * Postgres text (constraint names, "JWT expired", etc.) never reaches end users.
 * Falls back to a generic message; the original is still logged by callers.
 */
export function friendlyError(e: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw = e as { message?: string; code?: string; details?: string } | null;
  const msg = (raw?.message || raw?.details || "").toString();
  const code = raw?.code;

  if (!msg && !code) return fallback;

  const m = msg.toLowerCase();

  // Auth
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email before signing in (check your inbox).";
  if (m.includes("user already registered") || m.includes("already been registered")) return "An account with this email already exists. Try signing in.";
  if (m.includes("email rate limit") || m.includes("rate limit")) return "Too many attempts. Please wait a little while and try again.";
  if (m.includes("password should be at least") || m.includes("password")) return "Password doesn't meet the requirements (at least 8 characters).";
  if (m.includes("jwt expired") || m.includes("token") && m.includes("expired")) return "Your session has expired. Please sign in again.";
  if (m.includes("invalid or has expired") || m.includes("otp")) return "This link is invalid or has expired. Please request a new one.";

  // Database / RLS
  if (code === "23505" || m.includes("duplicate key") || m.includes("already exists")) return "That already exists. Please use a different value.";
  if (code === "23503") return "This can't be changed because it's linked to other data.";
  if (code === "42501" || m.includes("row-level security") || m.includes("permission denied")) return "You don't have permission to do that.";
  if (m.includes("store_closed")) return "This stall isn't accepting orders right now.";
  if (m.includes("item_unavailable")) return "An item is no longer available.";

  // Network
  if (m.includes("failed to fetch") || m.includes("network")) return "Network problem. Check your connection and try again.";

  return fallback;
}
