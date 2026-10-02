import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "../VendorLayout";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { updateBusiness } from "@/lib/vendorApi";

type Tab = "business" | "location" | "payment";

/** Single Settings page with in-memory tabs — switching is instant (no route change / refetch). */
export function SettingsPage({ initialTab = "business" }: { initialTab?: Tab }) {
  const navigate = useNavigate();
  const { business, loading } = useVendorBusiness();
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  const tabs: { key: Tab; label: string }[] = [
    { key: "business", label: "Business" },
    { key: "location", label: "Location & Hours" },
    { key: "payment", label: "Payment" },
  ];

  return (
    <VendorLayout businessName={business.name}>
      <h1 style={{ margin: "0 0 4px", fontSize: 28 }}>Settings</h1>
      <p style={{ color: "var(--color-text-muted)", margin: "0 0 16px" }}>Manage your business configuration.</p>

      <div style={bar}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tabBtn(tab === t.key)}>{t.label}</button>
        ))}
      </div>

      <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 20 }}>
        {tab === "business" && <BusinessTab />}
        {tab === "location" && <LocationTab />}
        {tab === "payment" && <PaymentTab />}
      </div>
    </VendorLayout>
  );
}

/* ---------------- Business tab ---------------- */
function BusinessTab() {
  const { business, setBusiness } = useVendorBusiness();
  const [name, setName] = useState(business?.name ?? "");
  const [description, setDescription] = useState(business?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveProfile() {
    setSaving(true);
    try {
      const updated = await updateBusiness(business!.id, { name: name.trim(), description: description.trim() || null });
      setBusiness(updated);
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  }

  async function toggle(field: "is_open" | "accepting_orders") {
    const updated = await updateBusiness(business!.id, { [field]: !business![field] });
    setBusiness(updated);
  }

  return (
    <>
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Business Profile</h3>
        <label style={lbl}>Name</label>
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
        <label style={lbl}>Description</label>
        <input style={input} value={description} onChange={(e) => setDescription(e.target.value)} />
        <Button onClick={saveProfile} disabled={saving} style={{ marginTop: 14 }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
        </Button>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Store Status</h3>
        <ToggleRow label="Store Open" sub="Overrides scheduled hours" on={business!.is_open} onToggle={() => toggle("is_open")} />
        <ToggleRow label="Accepting Orders" sub="Pause checkout without closing" on={business!.accepting_orders} onToggle={() => toggle("accepting_orders")} />
      </section>
    </>
  );
}

/* ---------------- Location tab ---------------- */
function LocationTab() {
  const { business, setBusiness } = useVendorBusiness();
  const [address, setAddress] = useState(business?.address ?? "");
  const [pincode, setPincode] = useState(business?.pincode ?? "");
  const [lat, setLat] = useState<number | null>(business?.latitude ?? null);
  const [lng, setLng] = useState<number | null>(business?.longitude ?? null);
  const [openTime, setOpenTime] = useState(business?.open_time ?? "");
  const [closeTime, setCloseTime] = useState(business?.close_time ?? "");
  const [prepMin, setPrepMin] = useState(business?.prep_time_min != null ? String(business.prep_time_min) : "");
  const [prepMax, setPrepMax] = useState(business?.prep_time_max != null ? String(business.prep_time_max) : "");
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function useLocation() {
    if (!navigator.geolocation) { setGeoMsg("Geolocation not available"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setGeoMsg("Location captured"); },
      () => setGeoMsg("Permission denied")
    );
  }

  async function save() {
    setSaving(true);
    try {
      const updated = await updateBusiness(business!.id, {
        address: address.trim() || null, pincode: pincode.trim() || null,
        latitude: lat, longitude: lng,
        open_time: openTime || null, close_time: closeTime || null,
        prep_time_min: prepMin ? Number(prepMin) : null, prep_time_max: prepMax ? Number(prepMax) : null,
      });
      setBusiness(updated);
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  }

  return (
    <>
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Location</h3>
        <label style={lbl}>Address</label>
        <input style={input} value={address} onChange={(e) => setAddress(e.target.value)} />
        <label style={lbl}>Pincode</label>
        <input style={input} value={pincode} onChange={(e) => setPincode(e.target.value)} />
        <Button variant="secondary" onClick={useLocation} style={{ marginTop: 12 }}>📍 Use my location</Button>
        {(geoMsg || lat != null) && (
          <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {geoMsg} {lat != null ? `(${lat.toFixed(4)}, ${lng?.toFixed(4)})` : ""}
          </p>
        )}
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Hours & Prep</h3>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}><label style={lbl}>Opens</label><input style={input} type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} /></div>
          <div style={{ flex: 1, minWidth: 140 }}><label style={lbl}>Closes</label><input style={input} type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}><label style={lbl}>Prep min (mins)</label><input style={input} type="number" value={prepMin} onChange={(e) => setPrepMin(e.target.value)} /></div>
          <div style={{ flex: 1, minWidth: 140 }}><label style={lbl}>Prep max (mins)</label><input style={input} type="number" value={prepMax} onChange={(e) => setPrepMax(e.target.value)} /></div>
        </div>
      </section>

      <Button onClick={save} disabled={saving}>{saving ? "Saving…" : saved ? "✓ Saved" : "Save"}</Button>
    </>
  );
}

/* ---------------- Payment tab ---------------- */
function PaymentTab() {
  const { business, setBusiness } = useVendorBusiness();
  const [taxPercent, setTaxPercent] = useState(String(business?.tax_percent ?? 0));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function saveTax() {
    setSaving(true);
    try {
      const updated = await updateBusiness(business!.id, { tax_percent: Number(taxPercent) || 0 });
      setBusiness(updated);
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } finally { setSaving(false); }
  }

  return (
    <>
      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Payment Gateway</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600 }}>Razorpay — Not connected</div>
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              Dev mode: orders are auto-confirmed. Connect Razorpay to accept real payments.
            </div>
          </div>
        </div>
        <Button variant="secondary" style={{ marginTop: 14 }} disabled>Connect Gateway (coming soon)</Button>
      </section>

      <section style={card}>
        <h3 style={{ marginTop: 0 }}>Tax</h3>
        <label style={lbl}>Tax percentage applied at checkout</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input style={{ ...input, maxWidth: 120 }} type="number" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
          <span>%</span>
        </div>
        <Button onClick={saveTax} disabled={saving} style={{ marginTop: 14 }}>
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
        </Button>
      </section>
    </>
  );
}

function ToggleRow({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{sub}</div>
      </div>
      <button onClick={onToggle} style={toggle(on)}><span style={knob(on)} /></button>
    </div>
  );
}

const bar: React.CSSProperties = { display: "flex", gap: 4, borderBottom: "1px solid var(--color-border)", marginBottom: 20 };
const tabBtn = (active: boolean): React.CSSProperties => ({
  background: "none", border: "none", padding: "10px 16px", fontSize: 15, fontWeight: 600,
  color: active ? "var(--color-primary)" : "var(--color-text-muted)",
  borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
  cursor: "pointer", marginBottom: -1,
});
const card: React.CSSProperties = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 18, boxShadow: "var(--shadow-card)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "10px 0 6px" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 15 };
const toggle = (on: boolean): React.CSSProperties => ({ width: 46, height: 26, borderRadius: 999, border: "none", background: on ? "var(--color-positive)" : "#cbd5e1", position: "relative", cursor: "pointer" });
const knob = (on: boolean): React.CSSProperties => ({ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s" });
