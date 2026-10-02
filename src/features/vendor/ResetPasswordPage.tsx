import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { updatePassword } from "@/lib/auth";
import { validatePassword } from "@/lib/validation";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/Button";

/**
 * Landing page for the password-reset email link (/vendor/reset-password).
 * Supabase establishes a short-lived recovery session when the user arrives via
 * the emailed link; here they choose a new password.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Confirm a session exists (recovery flow). Supabase parses the URL hash.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await updatePassword(password);
    setBusy(false);
    if (error) {
      setError(friendlyError(error, "Could not update your password."));
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/vendor", { replace: true }), 1200);
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ marginTop: 0, fontSize: 22, textAlign: "center" }}>Set a New Password</h1>

        {done ? (
          <div style={okBox}>✓ Password updated. Redirecting you to your dashboard…</div>
        ) : !ready ? (
          <p style={{ color: "var(--color-text-muted)", fontSize: 14, textAlign: "center" }}>
            Open this page from the reset link in your email. If you got here by mistake,{" "}
            <button type="button" style={linkBtn} onClick={() => navigate("/vendor/login")}>
              go back to sign in
            </button>
            .
          </p>
        ) : (
          <form onSubmit={submit}>
            <label style={label}>New Password</label>
            <input
              style={input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              required
            />
            <label style={label}>Confirm Password</label>
            <input
              style={input}
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter password"
              autoComplete="new-password"
              required
            />
            {error && <div style={errorBox}>{error}</div>}
            <Button type="submit" fullWidth disabled={busy} style={{ marginTop: 14 }}>
              {busy ? "Updating…" : "Update Password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 };
const card: React.CSSProperties = {
  width: "100%", maxWidth: 400, background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: 16, boxShadow: "var(--shadow-card)", padding: 28,
};
const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "12px 0 6px" };
const input: React.CSSProperties = { width: "100%", padding: "11px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 15 };
const errorBox: React.CSSProperties = { marginTop: 12, padding: "9px 12px", background: "#fdecea", color: "#b42318", borderRadius: 8, fontSize: 13 };
const okBox: React.CSSProperties = { padding: "12px", background: "#e7f6ec", color: "#166534", borderRadius: 8, fontSize: 14, textAlign: "center" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "var(--color-primary)", fontWeight: 600, cursor: "pointer", fontSize: 14, padding: 0 };
