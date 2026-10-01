import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "../VendorLayout";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { getMyProfile, updateMyProfile } from "@/lib/vendorApi";
import { signOut } from "@/lib/auth";

export function ProfilePage() {
  const navigate = useNavigate();
  const { business, loading } = useVendorBusiness();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getMyProfile().then((p) => {
      if (p) {
        setFullName(p.full_name ?? "");
        setPhone(p.phone ?? "");
      }
    });
  }, []);

  if (loading) return <div style={{ padding: 32 }}>Loading…</div>;

  async function save() {
    setSaving(true);
    try {
      await updateMyProfile({ full_name: fullName.trim() || null, phone: phone.trim() || null });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await signOut();
    navigate("/vendor/login", { replace: true });
  }

  return (
    <VendorLayout businessName={business?.name}>
      <h1 style={{ marginTop: 0 }}>Profile & Team</h1>

      <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 20 }}>
        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Owner Profile</h3>
          <label style={lbl}>Full Name</label>
          <input style={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <label style={lbl}>Phone</label>
          <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button onClick={save} disabled={saving} style={{ marginTop: 14 }}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save"}
          </Button>
        </section>

        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Team</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: 14, marginTop: 0 }}>
            Staff roles and team invites are coming in a later phase.
          </p>
        </section>

        <Button variant="secondary" onClick={logout}>⏻ Logout</Button>
      </div>
    </VendorLayout>
  );
}

const card: React.CSSProperties = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 18, boxShadow: "var(--shadow-card)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "10px 0 6px" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 15 };
