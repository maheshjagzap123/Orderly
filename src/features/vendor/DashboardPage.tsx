import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "./VendorLayout";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { useRealtimeOrders } from "@/hooks/useRealtimeOrders";
import { getDashboardData, updateBusiness, type DashboardData } from "@/lib/vendorApi";
import { formatINR, formatHours } from "@/lib/format";
import { ComboChart } from "@/components/charts/ComboChart";
import { DonutChart } from "@/components/charts/DonutChart";
import { NewOrderToast } from "@/components/NewOrderToast";
import { ConnectionBanner } from "@/components/ConnectionBanner";

const RANGES: { label: string; days: number }[] = [
  { label: "Today", days: 1 },
  { label: "7 Days", days: 7 },
  { label: "30 Days", days: 30 },
];

const STATUS_COLORS: Record<string, string> = {
  New: "#a96500",
  Accepted: "#2864b5",
  Preparing: "#d97706",
  Ready: "#16804a",
  Completed: "#64748b",
  Cancelled: "#d7372e",
};

export function DashboardPage() {
  const navigate = useNavigate();
  const { business, loading, setBusiness } = useVendorBusiness();
  // Realtime only drives live recompute + the new-order toast; no order cards on the dashboard.
  const { orders, connected, latestNew, newOrderCount, acknowledge } = useRealtimeOrders(business?.id, 15, true);
  const [rangeIdx, setRangeIdx] = useState(1); // 7 days
  const [data, setData] = useState<DashboardData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  useEffect(() => {
    if (!business) return;
    setDataLoading(true);
    getDashboardData(business.id, RANGES[rangeIdx].days)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setDataLoading(false));
  }, [business, rangeIdx, orders.length]);

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  async function toggleAccepting() {
    const updated = await updateBusiness(business!.id, { accepting_orders: !business!.accepting_orders });
    setBusiness(updated);
  }

  const accepting = business.accepting_orders;
  const totalSource = data ? data.source.qr + data.source.kiosk : 0;
  const qrPct = totalSource ? Math.round((data!.source.qr / totalSource) * 100) : 0;
  const kioskPct = totalSource ? 100 - qrPct : 0;

  return (
    <VendorLayout businessName={business.name} ordersBadge={orders.filter((o) => ["NEW", "ACCEPTED", "PREPARING", "READY"].includes(o.status)).length}>
      <ConnectionBanner connected={connected} />

      {latestNew && (
        <NewOrderToast
          order={latestNew}
          count={newOrderCount}
          onView={() => { acknowledge(); navigate("/vendor/orders"); }}
          onDismiss={acknowledge}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Good day, {business.name.split(" ")[0]}! 👋</h1>
          <p style={{ color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            Here's what's happening at your business today.
          </p>
        </div>
        <div style={storeControl}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 700, color: accepting ? "var(--color-positive)" : "var(--color-danger)" }}>
              {accepting ? "🟢 Open" : "🔴 Paused"}
            </span>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
              {accepting ? "Accepting Orders" : "Not Accepting Orders"}
            </span>
          </div>
          <Button variant={accepting ? "secondary" : "primary"} onClick={toggleAccepting}>
            {accepting ? "Pause Orders" : "Resume Orders"}
          </Button>
        </div>
      </div>

      {/* Active work summary (numbers only — manage orders on the Orders page) */}
      {data && (data.statusCounts.NEW + data.statusCounts.ACCEPTED + data.statusCounts.PREPARING + data.statusCounts.READY) > 0 && (
        <div style={activeStrip}>
          <span style={{ fontWeight: 700 }}>
            Active Orders: {data.statusCounts.NEW + data.statusCounts.ACCEPTED + data.statusCounts.PREPARING + data.statusCounts.READY}
          </span>
          <span style={{ color: "var(--color-text-muted)" }}>·</span>
          <span>🟠 New {data.statusCounts.NEW}</span>
          <span>🔵 Accepted {data.statusCounts.ACCEPTED}</span>
          <span>🔥 Preparing {data.statusCounts.PREPARING}</span>
          <span>🟢 Ready {data.statusCounts.READY}</span>
          <button style={{ ...linkBtn, marginLeft: "auto" }} onClick={() => navigate("/vendor/orders")}>Manage Orders →</button>
        </div>
      )}

      {/* KPI cards */}
      <div style={kpiGrid}>
        <Kpi label="Today's Orders" icon="🛒" value={data ? String(data.kpis.orders.value) : "—"} trend={data?.kpis.orders.deltaPct ?? null} loading={dataLoading} />
        <Kpi label="Today's Revenue" icon="₹" value={data ? formatINR(data.kpis.revenue.value) : "—"} trend={data?.kpis.revenue.deltaPct ?? null} loading={dataLoading} />
        <Kpi label="Items Sold" icon="🍽️" value={data ? String(data.kpis.itemsSold.value) : "—"} trend={data?.kpis.itemsSold.deltaPct ?? null} loading={dataLoading} />
        <Kpi label="Avg. Order Value" icon="📊" value={data ? formatINR(data.kpis.avgOrderValue.value) : "—"} trend={data?.kpis.avgOrderValue.deltaPct ?? null} loading={dataLoading} />
      </div>

      {/* Sales Overview + Order Status */}
      <div style={row2}>
        <Card
          title="Sales Overview"
          action={
            <div style={{ display: "flex", gap: 6 }}>
              {RANGES.map((r, i) => (
                <button key={r.label} onClick={() => setRangeIdx(i)} style={rangeChip(i === rangeIdx)}>{r.label}</button>
              ))}
            </div>
          }
        >
          {dataLoading ? <Skeleton h={180} /> : data && data.daily.some((d) => d.orders > 0) ? (
            <ComboChart data={data.daily.map((d) => ({ label: d.label, bar: d.orders, line: d.revenue }))} />
          ) : (
            <Empty>No sales in this period yet.</Empty>
          )}
        </Card>

        <Card title="Order Status">
          {dataLoading ? <Skeleton h={160} /> : data && data.totalOrders > 0 ? (
            <DonutChart
              centerValue={data.totalOrders}
              centerLabel="Total Orders"
              slices={[
                { label: "New", value: data.statusCounts.NEW, color: STATUS_COLORS.New },
                { label: "Accepted", value: data.statusCounts.ACCEPTED, color: STATUS_COLORS.Accepted },
                { label: "Preparing", value: data.statusCounts.PREPARING, color: STATUS_COLORS.Preparing },
                { label: "Ready", value: data.statusCounts.READY, color: STATUS_COLORS.Ready },
                { label: "Completed", value: data.statusCounts.COMPLETED, color: STATUS_COLORS.Completed },
                { label: "Cancelled", value: data.statusCounts.CANCELLED, color: STATUS_COLORS.Cancelled },
              ]}
            />
          ) : (
            <Empty>No orders in this period yet.</Empty>
          )}
        </Card>
      </div>

      {/* Peak Hours + Top Selling */}
      <div style={row2}>
        <Card title="Peak Hours">
          <PeakHours data={data} loading={dataLoading} />
        </Card>

        <Card title="Top Selling Items" action={<button style={linkBtn} onClick={() => navigate("/vendor/reports")}>View All →</button>}>
          {dataLoading ? <Skeleton h={140} /> : data && data.topItems.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {data.topItems.map((t, i) => {
                const max = data.topItems[0].qty || 1;
                return (
                  <div key={t.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                      <span><strong>{i + 1}.</strong> {t.name}</span>
                      <span style={{ color: "var(--color-text-muted)" }}>{t.qty} sold</span>
                    </div>
                    <div style={track}><div style={{ ...fill, width: `${(t.qty / max) * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>No sales data yet.</Empty>
          )}
        </Card>
      </div>

      {/* Order Source + Revenue Trend + Business Hours */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16, alignItems: "stretch" }}>
        <Card title="Order Source">
          {dataLoading ? <Skeleton h={140} /> : totalSource > 0 ? (
            <DonutChart
              centerValue={totalSource}
              centerLabel="Total"
              size={130}
              slices={[
                { label: `QR · ${qrPct}%`, value: data!.source.qr, color: "var(--color-primary)" },
                { label: `Kiosk · ${kioskPct}%`, value: data!.source.kiosk, color: "var(--color-info)" },
              ]}
            />
          ) : (
            <Empty>No orders yet.</Empty>
          )}
        </Card>

        <Card title="Revenue Trend">
          {dataLoading ? <Skeleton h={140} /> : data && data.daily.some((d) => d.revenue > 0) ? (
            <RevenueTrend daily={data.daily} />
          ) : (
            <Empty>No revenue in this period yet.</Empty>
          )}
        </Card>

        <Card title="Business Hours">
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Today</div>
          <div style={{ fontWeight: 700, margin: "2px 0 10px" }}>{formatHours(business.open_time, business.close_time)}</div>
          <span style={{ ...pill, background: accepting ? "var(--color-positive-bg)" : "var(--color-danger-bg)", color: accepting ? "var(--color-positive)" : "var(--color-danger)" }}>
            {accepting ? "🟢 Open" : "🔴 Paused"}
          </span>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Accepting Orders</span>
            <button onClick={toggleAccepting} style={toggle(accepting)}><span style={toggleKnob(accepting)} /></button>
          </div>
          <button style={{ ...linkBtn, marginTop: 14 }} onClick={() => navigate("/vendor/settings/location")}>Edit Hours →</button>
        </Card>
      </div>
    </VendorLayout>
  );
}

/* ---------------- sub-components ---------------- */

function Kpi({ label, value, icon, trend, loading }: { label: string; value: string; icon: string; trend: number | null; loading: boolean }) {
  const up = trend != null && trend >= 0;
  return (
    <div style={{ ...cardBase, display: "flex", alignItems: "center", gap: 14 }}>
      <div style={kpiIcon}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{label}</div>
        {loading ? <Skeleton h={26} w={80} /> : <div style={{ fontSize: 24, fontWeight: 800 }}>{value}</div>}
        {!loading && trend != null && (
          <div style={{ fontSize: 12, fontWeight: 600, color: up ? "var(--color-positive)" : "var(--color-danger)" }}>
            {up ? "↑" : "↓"} {Math.abs(trend)}% <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>vs yesterday</span>
          </div>
        )}
      </div>
    </div>
  );
}

function PeakHours({ data, loading }: { data: DashboardData | null; loading: boolean }) {
  if (loading) return <Skeleton h={140} />;
  if (!data || !data.hourly.some((h) => h.value > 0)) return <Empty>Not enough data yet.</Empty>;
  const max = Math.max(...data.hourly.map((h) => h.value), 1);
  const top = [...data.hourly].filter((h) => h.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {data.peak && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: "var(--color-primary)" }}>{data.peak.label}</span>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>busiest · {data.peak.value} orders</span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {top.map((h) => (
          <div key={h.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 52, fontSize: 12, color: "var(--color-text-muted)" }}>{h.label}</span>
            <div style={track}><div style={{ ...fill, width: `${(h.value / max) * 100}%` }} /></div>
            <span style={{ width: 20, textAlign: "right", fontSize: 13, fontWeight: 600 }}>{h.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevenueTrend({ daily }: { daily: DashboardData["daily"] }) {
  const max = Math.max(...daily.map((d) => d.revenue), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120 }}>
      {daily.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div
            title={`${d.label}: ${formatINR(d.revenue)}`}
            style={{ width: "100%", height: `${(d.revenue / max) * 92}%`, minHeight: d.revenue > 0 ? 4 : 0, background: "linear-gradient(180deg, var(--color-positive), #4fb57a)", borderRadius: 5 }}
          />
          <span style={{ fontSize: 10, color: "var(--color-text-muted)" }}>{d.label.slice(0, 3)}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={cardBase}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div style={{ color: "var(--color-text-muted)", fontSize: 14, padding: "16px 0" }}>{children}</div>
);

function Skeleton({ h, w }: { h: number; w?: number }) {
  return (
    <div
      style={{
        height: h,
        width: w ?? "100%",
        borderRadius: 8,
        background: "linear-gradient(90deg,#eef0f3,#f6f7f9,#eef0f3)",
        backgroundSize: "200% 100%",
        animation: "orderly-shimmer 1.2s ease-in-out infinite",
      }}
    >
      <style>{`@keyframes orderly-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }`}</style>
    </div>
  );
}

/* ---------------- styles ---------------- */

const cardBase: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  padding: 18,
  boxShadow: "var(--shadow-card)",
};
const kpiGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 20 };
const activeStrip: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 18,
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: 12, padding: "12px 16px", boxShadow: "var(--shadow-card)", fontSize: 14,
};
const row2: React.CSSProperties = { display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginTop: 16, alignItems: "stretch" };
const kpiIcon: React.CSSProperties = { fontSize: 20, width: 42, height: 42, borderRadius: 12, background: "var(--color-bg)", display: "grid", placeItems: "center", flexShrink: 0 };
const storeControl: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 14,
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: 12, padding: "10px 14px", boxShadow: "var(--shadow-card)",
};
const track: React.CSSProperties = { flex: 1, height: 8, background: "var(--color-bg)", borderRadius: 5, overflow: "hidden" };
const fill: React.CSSProperties = { height: "100%", background: "var(--color-primary)", borderRadius: 5 };
const pill: React.CSSProperties = { padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, display: "inline-block" };
const linkBtn: React.CSSProperties = { background: "none", border: "none", color: "var(--color-primary)", fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0 };
const rangeChip = (active: boolean): React.CSSProperties => ({
  padding: "5px 11px", borderRadius: 8, border: "1px solid var(--color-border)",
  background: active ? "var(--color-primary)" : "#fff", color: active ? "#fff" : "var(--color-text-muted)",
  fontWeight: 600, fontSize: 12, cursor: "pointer",
});
const toggle = (on: boolean): React.CSSProperties => ({
  width: 46, height: 26, borderRadius: 999, border: "none",
  background: on ? "var(--color-positive)" : "#cbd5e1", position: "relative", cursor: "pointer", transition: "background 0.15s",
});
const toggleKnob = (on: boolean): React.CSSProperties => ({
  position: "absolute", top: 3, left: on ? 23 : 3, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.15s",
});
