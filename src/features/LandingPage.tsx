import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";

/**
 * Public homepage at "/".
 *
 * A random visitor to the root has no vendor context, so we intentionally do NOT
 * link to any customer menu or kiosk here — those are per-vendor URLs
 * (/order/:slug, /kiosk/:slug) reached by scanning a vendor's QR or launched by
 * the vendor from their dashboard. This page's only real action is vendor sign in
 * / sign up.
 */
export function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={logo}>🍳</div>
        <h1 style={{ margin: "14px 0 4px", fontSize: 30 }}>Orderly</h1>
        <p style={{ color: "var(--color-text-muted)", margin: "0 0 24px", fontSize: 15 }}>
          Simple ordering and POS for street-food vendors. Set up your menu, generate a QR, and start
          taking orders in minutes.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Button fullWidth onClick={() => navigate("/vendor/login")}>
            Vendor Sign In
          </Button>
          <Button variant="secondary" fullWidth onClick={() => navigate("/vendor/login?mode=signup")}>
            Register Your Shop
          </Button>
        </div>

        <div style={note}>
          <strong>Are you a customer?</strong> Scan the QR code at the stall to open that vendor's menu.
          There's no app to install and no sign-up needed.
        </div>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 };
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 18,
  boxShadow: "var(--shadow-card)",
  padding: 32,
  textAlign: "center",
};
const logo: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: "50%",
  background: "var(--color-primary)",
  display: "grid",
  placeItems: "center",
  fontSize: 32,
  margin: "0 auto",
};
const note: React.CSSProperties = {
  marginTop: 22,
  padding: "12px 14px",
  background: "var(--color-bg)",
  borderRadius: 10,
  fontSize: 13,
  color: "var(--color-text-muted)",
  textAlign: "left",
  lineHeight: 1.5,
};
