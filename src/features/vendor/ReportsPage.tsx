import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "./VendorLayout";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { getReport, type ReportData } from "@/lib/vendorApi";
import { formatINR } from "@/lib/format";

const PERIODS: { label: string; days: number }[] = [
  { label: "Today", days: 1 },
  { label: "Last 5 days", days: 5 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
];

export function ReportsPage() {
  const navigate = useNavigate();
  const { business, loading } = useVendorBusiness();
  const [periodIdx, setPeriodIdx] = useState(2); // Last 7 days
  const [report, setReport] = useState<ReportData | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  const since = useMemo(() => {
    const d = new Date();
    if (PERIODS[periodIdx].days === 1) d.setHours(0, 0, 0, 0);
    else d.setDate(d.getDate() - PERIODS[periodIdx].days);
    return d;
  }, [periodIdx]);

  useEffect(() => {
    if (!business) return;
    setBusy(true);
    getReport(business.id, since).then(setReport).finally(() => setBusy(false));
  }, [business, since]);

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <VendorLayout businessName={business.name}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Reports</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {PERIODS.map((p, i) => (
            <button key={p.label} onClick={() => setPeriodIdx(i)} style={chip(i === periodIdx)}>{p.label}</button>
          ))}
        </div>
      </div>

      {busy && <p style={{ color: "var(--color-text-muted)" }}>Loading report…</p>}

      {report && (
        <>
          <div style={grid}>
            <Stat label="Revenue" value={formatINR(report.revenue)} />
            <Stat label="Orders" value={String(report.ordersTotal)} />
            <Stat label="Items Sold" value={String(report.itemsSold)} />
            <Stat label="Avg Order Value" value={formatINR(report.avgOrderValue)} />
            <Stat label="Completed" value={String(report.completed)} />
            <Stat label="Cancelled" value={String(report.cancelled)} />
            <Stat label="QR Orders" value={String(report.qrOrders)} />
            <Stat label="Kiosk Orders" value={String(report.kioskOrders)} />
          </div>

          <div style={{ marginTop: 20 }}>
            <div style={card}>
              <h3 style={{ marginTop: 0 }}>Best Sellers</h3>
              {report.bestSellers.length === 0 ? (
                <div style={{ color: "var(--color-text-muted)" }}>No sales in this period yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {report.bestSellers.map((b, i) => {
                    const max = report.bestSellers[0].qty || 1;
                    return (
                      <div key={b.name}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                          <span><strong>{i + 1}.</strong> {b.name} <span style={{ color: "var(--color-text-muted)" }}>· {b.qty} sold</span></span>
                          <strong>{formatINR(b.revenue)}</strong>
                        </div>
                        <div style={{ height: 8, background: "var(--color-bg)", borderRadius: 4 }}>
                          <div style={{ width: `${(b.qty / max) * 100}%`, height: "100%", background: "var(--color-primary)", borderRadius: 4 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <p style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 16 }}>
            Exports (CSV / Excel / PDF) coming in a later phase.
          </p>
        </>
      )}
    </VendorLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14, marginTop: 18 };
const card: React.CSSProperties = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 16, boxShadow: "var(--shadow-card)" };
const chip = (active: boolean): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 999, border: "1px solid var(--color-border)",
  background: active ? "var(--color-primary)" : "#fff", color: active ? "#fff" : "var(--color-text-muted)", fontWeight: 600, fontSize: 13,
});
