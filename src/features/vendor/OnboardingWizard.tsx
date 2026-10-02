import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { slugify } from "@/lib/format";
import { createBusiness, getMyBusiness } from "@/lib/vendorApi";
import { signOut } from "@/lib/auth";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { validateBusinessName, validateRequired, validatePincode, validateTaxPercent } from "@/lib/validation";

interface FormState {
  name: string;
  description: string;
  address: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  open_time: string;
  close_time: string;
  prep_time_min: string;
  prep_time_max: string;
  tax_percent: string;
}

const initial: FormState = {
  name: "",
  description: "",
  address: "",
  pincode: "",
  latitude: null,
  longitude: null,
  open_time: "10:00",
  close_time: "22:00",
  prep_time_min: "10",
  prep_time_max: "15",
  tax_percent: "0",
};

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { setBusiness } = useVendorBusiness();
  const [form, setForm] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  // If already onboarded, skip straight to the dashboard.
  useEffect(() => {
    getMyBusiness().then((b) => {
      if (b?.onboarding_complete) {
        setBusiness(b);
        navigate("/vendor", { replace: true });
      }
    });
  }, [navigate, setBusiness]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoMsg("Geolocation not available");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set("latitude", pos.coords.latitude);
        set("longitude", pos.coords.longitude);
        setGeoMsg("Location captured");
      },
      () => setGeoMsg("Permission denied or unavailable")
    );
  }

  /** Leave onboarding: sign out, then go to the login page. */
  async function backToLogin() {
    await signOut();
    setBusiness(null);
    navigate("/vendor/login", { replace: true });
  }

  function validate(): string | null {
    return (
      validateBusinessName(form.name) ||
      validateRequired(form.address, "Address") ||
      validatePincode(form.pincode) ||
      validateTaxPercent(form.tax_percent)
    );
  }

  async function finish() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const slug = slugify(form.name) || `stall-${Date.now()}`;
      const created = await createBusiness({
        name: form.name.trim(),
        slug,
        description: form.description.trim() || null,
        address: form.address.trim() || null,
        pincode: form.pincode.trim() || null,
        latitude: form.latitude,
        longitude: form.longitude,
        open_time: form.open_time || null,
        close_time: form.close_time || null,
        prep_time_min: form.prep_time_min ? Number(form.prep_time_min) : null,
        prep_time_max: form.prep_time_max ? Number(form.prep_time_max) : null,
        tax_percent: form.tax_percent ? Number(form.tax_percent) : 0,
      });
      setBusiness(created);
      navigate("/vendor", { replace: true });
    } catch (e) {
      console.error("createBusiness failed:", e);
      const raw = e as { message?: string; details?: string; code?: string };
      const msg = raw?.message || raw?.details || "Could not complete setup";
      if (raw?.code === "23505" || /duplicate|unique/i.test(msg)) {
        setError("A shop with this name already exists for your account. Try a different name, or go to your dashboard.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={wrap}>
      <div style={card}>
        {/* Header with a way back to login */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <button type="button" style={linkBtn} onClick={backToLogin}>← Back to login</button>
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Step 1 of 1</span>
        </div>

        <h1 style={{ margin: "4px 0 2px", fontSize: 24 }}>Set up your shop</h1>
        <p style={{ color: "var(--color-text-muted)", margin: "0 0 20px", fontSize: 14 }}>
          Fill in your details below. You can add menu items from the dashboard afterwards.
        </p>

        {/* ---- Business ---- */}
        <SectionTitle>Business</SectionTitle>
        <Field label="Stall / business name *">
          <input style={input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Mahesh Paratha Center" />
        </Field>
        <Field label="Short tagline / description">
          <input style={input} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Fresh • Tasty • Desi Flavour" />
        </Field>
        {form.name && (
          <p style={hint}>
            Public link: <code>/order/{slugify(form.name) || "your-shop"}-xxxxxx</code>{" "}
            <span>— the extra code keeps it private so only people with your QR can find it.</span>
          </p>
        )}

        {/* ---- Location ---- */}
        <SectionTitle>Location</SectionTitle>
        <div style={rowFields}>
          <Field label="Address *">
            <input style={input} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Sector 17, Chandigarh" />
          </Field>
          <Field label="Pincode">
            <input style={input} value={form.pincode} onChange={(e) => set("pincode", e.target.value)} placeholder="160017" inputMode="numeric" />
          </Field>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={useMyLocation} type="button">📍 Use my location</Button>
          {geoMsg && (
            <span style={hint}>
              {geoMsg}
              {form.latitude ? ` (${form.latitude.toFixed(4)}, ${form.longitude?.toFixed(4)})` : ""}
            </span>
          )}
        </div>

        {/* ---- Hours & preparation ---- */}
        <SectionTitle>Hours & preparation</SectionTitle>
        <div style={rowFields}>
          <Field label="Opens"><input style={input} type="time" value={form.open_time} onChange={(e) => set("open_time", e.target.value)} /></Field>
          <Field label="Closes"><input style={input} type="time" value={form.close_time} onChange={(e) => set("close_time", e.target.value)} /></Field>
        </div>
        <div style={rowFields}>
          <Field label="Prep time min (mins)"><input style={input} type="number" min="0" value={form.prep_time_min} onChange={(e) => set("prep_time_min", e.target.value)} /></Field>
          <Field label="Prep time max (mins)"><input style={input} type="number" min="0" value={form.prep_time_max} onChange={(e) => set("prep_time_max", e.target.value)} /></Field>
        </div>
        <Field label="Tax % (optional)">
          <input style={input} type="number" min="0" max="100" value={form.tax_percent} onChange={(e) => set("tax_percent", e.target.value)} />
        </Field>

        {error && <div style={errorBox}>{error}</div>}

        {/* ---- Actions ---- */}
        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <Button variant="secondary" onClick={backToLogin} type="button">Cancel</Button>
          <Button fullWidth onClick={finish} disabled={busy}>{busy ? "Creating…" : "Finish Setup"}</Button>
        </div>
      </div>
    </div>
  );
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h3 style={{ margin: "18px 0 10px", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.4, color: "var(--color-text-muted)" }}>
    {children}
  </h3>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ flex: 1, marginBottom: 12 }}>
    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</label>
    {children}
  </div>
);

const wrap: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 };
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  boxShadow: "var(--shadow-card)",
  padding: 28,
};
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 15,
};
const rowFields: React.CSSProperties = { display: "flex", gap: 12, flexWrap: "wrap" };
const hint: React.CSSProperties = { fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 4px" };
const linkBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--color-primary)",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
  padding: 0,
};
const errorBox: React.CSSProperties = {
  marginTop: 14,
  padding: "9px 12px",
  background: "#fdecea",
  color: "#b42318",
  borderRadius: 8,
  fontSize: 13,
};
