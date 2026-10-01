import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "../VendorLayout";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { updateBusiness } from "@/lib/vendorApi";

export function BusinessSettingsPage() {
  const navigate = useNavigate();
  const { business, loading, setBusiness } = useVendorBusiness();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  useEffect(() => {
    if (business) {
      setName(business.name);
      setDescription(business.description ?? "");
    }
  }, [business]);

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  async function saveProfile() {
    setSaving(true);
    try {
      const updated = await updateBusiness(business!.id, { name: name.trim(), description: description.trim() || null });
      setBusiness(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(field: "is_open" | "accepting_orders") {
    const updated = await updateBusiness(business!.id, { [field]: !business![field] });
    setBusiness(updated);
  }

  return (
    <VendorLayout businessName={business.name}>
      <h1 style={{ marginTop: 0 }}>Business Settings</h1>

      <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 20 }}>
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
          <ToggleRow label="Store Open" sub="Overrides scheduled hours" on={business.is_open} onToggle={() => toggle("is_open")} />
          <ToggleRow label="Accepting Orders" sub="Pause checkout without closing" on={business.accepting_orders} onToggle={() => toggle("accepting_orders")} />
        </section>
      </div>
    </VendorLayout>
  );
}

function ToggleRow({ label, sub, on, onToggle }: { label: string; sub: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0" }}>
      <div>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{sub}</div>
      </div>
      <button onClick={onToggle} style={toggle(on)}>
        <span style={knob(on)} />
      </button>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 18, boxShadow: "var(--shadow-card)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "10px 0 6px" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 15 };
const toggle = (on: boolean): React.CSSProperties => ({ width: 46, height: 26, borderRadius: 999, border: "none", background: on ? "var(--color-positive)" : "#cbd5e1", position: "relative", cursor: "pointer" });
const knob = (on: boolean): React.CSSProperties => ({ position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s" });
