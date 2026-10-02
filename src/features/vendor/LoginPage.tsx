import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { signInWithPassword, signInWithMagicLink, signUpWithPassword, sendPasswordReset } from "@/lib/auth";
import { getMyBusiness } from "@/lib/vendorApi";
import { Button } from "@/components/ui/Button";
import { validateEmail, validatePassword, validateBusinessName } from "@/lib/validation";
import { friendlyError } from "@/lib/errors";

type Mode = "password" | "magic" | "signup" | "forgot";

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>(params.get("mode") === "signup" ? "signup" : "password");
  // Surface a one-time "session expired" notice set by useSession on token loss.
  const [expiredNotice] = useState<boolean>(() => {
    try {
      if (sessionStorage.getItem("orderly.sessionExpired")) {
        sessionStorage.removeItem("orderly.sessionExpired");
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    // Shared email validation for every mode.
    const emailErr = validateEmail(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }

    if (mode === "magic") return handleMagicLink();
    if (mode === "forgot") return handleForgot();
    if (mode === "signup") return handleSignup();
    return handlePasswordLogin();
  }

  async function handlePasswordLogin() {
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    setBusy(true);
    const { error } = await signInWithPassword(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(friendlyError(error, "Could not sign in. Please check your details."));
      return;
    }
    await routeAfterAuth();
  }

  async function handleSignup() {
    const nameErr = validateBusinessName(fullName); // reused: validates owner/display name length
    if (nameErr) {
      setError("Please enter your name (2–80 characters).");
      return;
    }
    const pwErr = validatePassword(password);
    if (pwErr) {
      setError(pwErr);
      return;
    }
    setBusy(true);
    const { data, error } = await signUpWithPassword(email.trim(), password, fullName.trim());
    setBusy(false);
    if (error) {
      setError(friendlyError(error, "Could not create your account."));
      return;
    }
    // If email confirmation is required, there's no session yet.
    if (!data.session) {
      setMessage("Account created. Check your email to confirm, then sign in to set up your shop.");
      switchMode("password");
      return;
    }
    // Confirmation disabled → straight into onboarding to register the shop.
    await routeAfterAuth();
  }

  async function handleMagicLink() {
    setBusy(true);
    const { error } = await signInWithMagicLink(email.trim());
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setMessage("Check your email for a sign-in link.");
  }

  async function handleForgot() {
    setBusy(true);
    const { error } = await sendPasswordReset(email.trim());
    setBusy(false);
    if (error) setError(friendlyError(error));
    else setMessage("If an account exists for that email, a password-reset link is on its way.");
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={logo}>🍳</div>
          <h1 style={{ margin: "12px 0 2px", fontSize: 22 }}>
            {mode === "signup" ? "Create Your Shop" : mode === "forgot" ? "Reset Password" : "Vendor Login"}
          </h1>
          <p style={{ color: "var(--color-text-muted)", margin: 0, fontSize: 14 }}>
            {mode === "signup"
              ? "Register to start taking orders"
              : mode === "forgot"
              ? "We'll email you a reset link"
              : "Sign in to manage your stall"}
          </p>
        </div>

        {expiredNotice && (
          <div style={{ marginBottom: 16, padding: "9px 12px", background: "#fff3dc", color: "#92400e", borderRadius: 8, fontSize: 13 }}>
            Your session has expired. Please sign in again.
          </div>
        )}

        {/* Primary Sign In / Sign Up tabs */}
        {mode !== "forgot" && (
          <div style={tabs}>
            <button style={tab(mode === "password" || mode === "magic")} onClick={() => switchMode("password")} type="button">
              Sign In
            </button>
            <button style={tab(mode === "signup")} onClick={() => switchMode("signup")} type="button">
              Sign Up
            </button>
          </div>
        )}

        {/* Sign-in sub-tabs: Password vs Magic Link */}
        {(mode === "password" || mode === "magic") && (
          <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
            <button style={subTab(mode === "password")} onClick={() => switchMode("password")} type="button">
              Password
            </button>
            <button style={subTab(mode === "magic")} onClick={() => switchMode("magic")} type="button">
              Magic Link
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <>
              <label style={label}>Your Name</label>
              <input
                style={input}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Mahesh Kumar"
                autoComplete="name"
              />
            </>
          )}

          <label style={label}>Email</label>
          <input
            style={input}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          {(mode === "password" || mode === "signup") && (
            <>
              <label style={label}>Password</label>
              <input
                style={input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
              />
            </>
          )}

          {error && <div style={errorBox}>{error}</div>}
          {message && <div style={okBox}>{message}</div>}

          <Button type="submit" fullWidth disabled={busy} style={{ marginTop: 14 }}>
            {busy
              ? "Please wait…"
              : mode === "signup"
              ? "Create Account"
              : mode === "magic"
              ? "Send Magic Link"
              : mode === "forgot"
              ? "Send Reset Link"
              : "Sign In"}
          </Button>
        </form>

        {/* Footer links */}
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13 }}>
          {mode === "password" && (
            <button type="button" style={linkBtn} onClick={() => switchMode("forgot")}>
              Forgot password?
            </button>
          )}
          {mode === "signup" && (
            <span style={{ color: "var(--color-text-muted)" }}>
              Already have a shop?{" "}
              <button type="button" style={linkBtn} onClick={() => switchMode("password")}>
                Sign in
              </button>
            </span>
          )}
          {(mode === "forgot" || mode === "magic") && (
            <button type="button" style={linkBtn} onClick={() => switchMode("password")}>
              ← Back to sign in
            </button>
          )}
        </div>

        {(mode === "password" || mode === "magic") && (
          <p style={{ color: "var(--color-text-muted)", fontSize: 12, textAlign: "center", marginTop: 12 }}>
            Phone OTP login will be enabled once an SMS provider is configured.
          </p>
        )}
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
const subTab = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "6px 0",
  borderRadius: 8,
  border: "1px solid var(--color-border)",
  background: active ? "var(--color-bg)" : "#fff",
  color: active ? "var(--color-text)" : "var(--color-text-muted)",
  fontWeight: 600,
  fontSize: 13,
});
const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--color-primary)",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
  padding: 0,
};
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
