import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "../VendorLayout";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { updateBusiness } from "@/lib/vendorApi";

export function LocationPage() {
  const navigate = useNavigate();
  const { business, loading, setBusiness } = useVendorBusiness();
  const [address, setAddress] = useState("");
  const [pincode, setPincode] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [prepMin, setPrepMin] = useState("");
  const [prepMax, setPrepMax] = useState("");
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  useEffect(() => {
    if (business) {
      setAddress(business.address ?? "");
      setPincode(business.pincode ?? "");
      setLat(business.latitude);
      setLng(business.longitude);
      setOpenTime(business.open_time ?? "");
      setCloseTime(business.close_time ?? "");
      setPrepMin(business.prep_time_min != null ? String(business.prep_time_min) : "");
      setPrepMax(business.prep_time_max != null ? String(business.prep_time_max) : "");
    }
  }, [business]);

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

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
        address: address.trim() || null,
        pincode: pincode.trim() || null,
        latitude: lat,
        longitude: lng,
        open_time: openTime || null,
        close_time: closeTime || null,
        prep_time_min: prepMin ? Number(prepMin) : null,
        prep_time_max: prepMax ? Number(prepMax) : null,
      });
      setBusiness(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <VendorLayout businessName={business.name}>
      <h1 style={{ marginTop: 0 }}>Location & Hours</h1>

      <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 20 }}>
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
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><label style={lbl}>Opens</label><input style={input} type="time" value={openTime} onChange={(e) => setOpenTime(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Closes</label><input style={input} type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} /></div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}><label style={lbl}>Prep min (mins)</label><input style={input} type="number" value={prepMin} onChange={(e) => setPrepMin(e.target.value)} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Prep max (mins)</label><input style={input} type="number" value={prepMax} onChange={(e) => setPrepMax(e.target.value)} /></div>
          </div>
        </section>

        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : saved ? "✓ Saved" : "Save"}</Button>
      </div>
    </VendorLayout>
  );
}

const card: React.CSSProperties = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 18, boxShadow: "var(--shadow-card)" };
const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "10px 0 6px" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 15 };
