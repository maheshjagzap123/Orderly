import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { slugify } from "@/lib/format";
import { createBusiness, getMyBusiness } from "@/lib/vendorApi";

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
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);

  // If already onboarded, skip to dashboard.
  useEffect(() => {
    getMyBusiness().then((b) => {
      if (b?.onboarding_complete) navigate("/vendor", { replace: true });
    });
  }, [navigate]);

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

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const slug = slugify(form.name) || `stall-${Date.now()}`;
      await createBusiness({
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
      navigate("/vendor", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete setup");
    } finally {
      setBusy(false);
    }
  }

  const canNext1 = form.name.trim().length > 0;
  const canNext2 = form.address.trim().length > 0;

  return (
    <div style={wrap}>
      <div style={card}>
        <Steps step={step} />

        {step === 1 && (
          <section>
            <h2 style={h2}>Business details</h2>
            <Field label="Stall / business name *">
              <input style={input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Mahesh Paratha Center" />
            </Field>
            <Field label="Short tagline / description">
              <input style={input} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Fresh • Tasty • Desi Flavour" />
            </Field>
            {form.name && (
              <p style={hint}>Public link will be: <code>/order/{slugify(form.name)}</code></p>
            )}
            <Nav>
              <span />
              <Button disabled={!canNext1} onClick={() => setStep(2)}>Next</Button>
            </Nav>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 style={h2}>Address & location</h2>
            <Field label="Address *">
              <input style={input} value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Sector 17, Chandigarh" />
            </Field>
            <Field label="Pincode">
              <input style={input} value={form.pincode} onChange={(e) => set("pincode", e.target.value)} placeholder="160017" />
            </Field>
            <Button variant="secondary" onClick={useMyLocation} type="button">📍 Use my location</Button>
            {geoMsg && <p style={hint}>{geoMsg}{form.latitude ? ` (${form.latitude.toFixed(4)}, ${form.longitude?.toFixed(4)})` : ""}</p>}
            <Nav>
              <Button variant="secondary" onClick={() => setStep(1)}>Back</Button>
              <Button disabled={!canNext2} onClick={() => setStep(3)}>Next</Button>
            </Nav>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 style={h2}>Hours & preparation</h2>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Opens"><input style={input} type="time" value={form.open_time} onChange={(e) => set("open_time", e.target.value)} /></Field>
              <Field label="Closes"><input style={input} type="time" value={form.close_time} onChange={(e) => set("close_time", e.target.value)} /></Field>
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <Field label="Prep time min (mins)"><input style={input} type="number" value={form.prep_time_min} onChange={(e) => set("prep_time_min", e.target.value)} /></Field>
              <Field label="Prep time max (mins)"><input style={input} type="number" value={form.prep_time_max} onChange={(e) => set("prep_time_max", e.target.value)} /></Field>
            </div>
            <Field label="Tax % (optional)">
              <input style={input} type="number" value={form.tax_percent} onChange={(e) => set("tax_percent", e.target.value)} />
            </Field>
            <Nav>
              <Button variant="secondary" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)}>Next</Button>
            </Nav>
          </section>
        )}

        {step === 4 && (
          <section>
            <h2 style={h2}>Finish setup</h2>
            <p style={{ color: "var(--color-text-muted)" }}>
              We'll create your stall and a permanent ordering link. You can add menu categories and items from the dashboard next.
            </p>
            <ul style={{ lineHeight: 1.8, fontSize: 14 }}>
              <li><strong>Name:</strong> {form.name}</li>
              <li><strong>Link:</strong> /order/{slugify(form.name)}</li>
              <li><strong>Address:</strong> {form.address || "—"}</li>
              <li><strong>Hours:</strong> {form.open_time} – {form.close_time}</li>
            </ul>
            {error && <div style={errorBox}>{error}</div>}
            <Nav>
              <Button variant="secondary" onClick={() => setStep(3)}>Back</Button>
              <Button onClick={finish} disabled={busy}>{busy ? "Creating…" : "Finish Setup"}</Button>
            </Nav>
          </section>
        )}
      </div>
    </div>
  );
}

function Steps({ step }: { step: number }) {
  const labels = ["Business", "Location", "Hours", "Finish"];
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={l} style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                height: 6,
                borderRadius: 4,
                background: done || active ? "var(--color-primary)" : "var(--color-border)",
              }}
            />
            <span style={{ fontSize: 12, color: active ? "var(--color-primary)" : "var(--color-text-muted)" }}>{l}</span>
          </div>
        );
      })}
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ flex: 1, marginBottom: 12 }}>
    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</label>
    {children}
  </div>
);

const Nav = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>{children}</div>
);

const wrap: React.CSSProperties = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 };
const card: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  boxShadow: "var(--shadow-card)",
  padding: 28,
};
const h2: React.CSSProperties = { marginTop: 0 };
const input: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 15,
};
const hint: React.CSSProperties = { fontSize: 13, color: "var(--color-text-muted)" };
const errorBox: React.CSSProperties = {
  marginTop: 12,
  padding: "9px 12px",
  background: "#fdecea",
  color: "#b42318",
  borderRadius: 8,
  fontSize: 13,
};
