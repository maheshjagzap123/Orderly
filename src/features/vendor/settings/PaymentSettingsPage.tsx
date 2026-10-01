import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "../VendorLayout";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { updateBusiness } from "@/lib/vendorApi";

export function PaymentSettingsPage() {
  const navigate = useNavigate();
  const { business, loading, setBusiness } = useVendorBusiness();
  const [taxPercent, setTaxPercent] = useState("0");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  useEffect(() => {
    if (business) setTaxPercent(String(business.tax_percent));
  }, [business]);

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  async function saveTax() {
    setSaving(true);
    try {
      const updated = await updateBusiness(business!.id, { tax_percent: Number(taxPercent) || 0 });
      setBusiness(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <VendorLayout businessName={business.name}>
      <h1 style={{ marginTop: 0 }}>Payment Settings</h1>

      <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 20 }}>
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Payment Gateway</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ ...dot, background: "#f59e0b" }} />
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
      </div>
    </VendorLayout>
  );
}

const card: React.CSSProperties = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 18, boxShadow: "var(--shadow-card)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "10px 0 6px" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 15 };
const dot: React.CSSProperties = { width: 12, height: 12, borderRadius: "50%", flexShrink: 0 };
