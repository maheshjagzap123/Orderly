import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { signInWithPassword, signInWithMagicLink } from "@/lib/auth";
import { getMyBusiness } from "@/lib/vendorApi";
import { Button } from "@/components/ui/Button";

type Mode = "password" | "magic";

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If already signed in, route onward.
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) await routeAfterAuth();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function routeAfterAuth() {
    try {
      const biz = await getMyBusiness();
      navigate(biz?.onboarding_complete ? "/vendor" : "/vendor/onboarding", { replace: true });
    } catch {
      navigate("/vendor/onboarding", { replace: true });
    }
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    await routeAfterAuth();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error } = await signInWithMagicLink(email.trim());
    setBusy(false);
    if (error) setError(error.message);
    else setMessage("Check your email for a sign-in link.");
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={logo}>🍳</div>
          <h1 style={{ margin: "12px 0 2px", fontSize: 22 }}>Vendor Login</h1>
          <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: 14 }}>
            Sign in to manage your stall
          </p>
        </div>

        <div style={tabs}>
          <button style={tab(mode === "password")} onClick={() => setMode("password")} type="button">
            Password
          </button>
          <button style={tab(mode === "magic")} onClick={() => setMode("magic")} type="button">
            Magic Link
          </button>
        </div>

        <form onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink}>
          <label style={label}>Email</label>
          <input
            style={input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vendor@orderly.test"
            required
          />

          {mode === "password" && (
            <>
              <label style={label}>Password</label>
              <input
                style={input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </>
          )}

          {error && <div style={errorBox}>{error}</div>}
          {message && <div style={okBox}>{message}</div>}

          <Button type="submit" fullWidth disabled={busy} style={{ marginTop: 14 }}>
            {busy ? "Please wait…" : mode === "password" ? "Sign In" : "Send Magic Link"}
          </Button>
        </form>

        <p style={{ color: "var(--color-text-muted)", fontSize: 12, textAlign: "center", marginTop: 16 }}>
          Phone OTP login will be enabled once an SMS provider is configured.
        </p>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 20,
};
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  boxShadow: "var(--shadow-card)",
  padding: 28,
};
const logo: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: "50%",
  background: "var(--color-primary)",
  display: "grid",
  placeItems: "center",
  fontSize: 28,
  margin: "0 auto",
};
const tabs: React.CSSProperties = { display: "flex", gap: 8, marginBottom: 18 };
const tab = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "8px 0",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: active ? "var(--color-primary)" : "#fff",
  color: active ? "#fff" : "var(--color-text-muted)",
  fontWeight: 600,
});
const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  margin: "12px 0 6px",
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "11px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 15,
};
const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "9px 12px",
  background: "#fdecea",
  color: "#b42318",
  borderRadius: 8,
  fontSize: 13,
};
const okBox: React.CSSProperties = {
  marginTop: 12,
  padding: "9px 12px",
  background: "#e7f6ec",
  color: "#166534",
  borderRadius: 8,
  fontSize: 13,
};
