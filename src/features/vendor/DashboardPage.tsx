import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "./VendorLayout";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { useRealtimeOrders } from "@/hooks/useRealtimeOrders";
import { getTodayMetrics, getDashboardAnalytics, updateBusiness, type TodayMetrics, type DashboardAnalytics } from "@/lib/vendorApi";
import { formatINR, formatHours } from "@/lib/format";
import { ComboChart } from "@/components/charts/ComboChart";
import { BarChart } from "@/components/charts/BarChart";
import { NewOrderToast } from "@/components/NewOrderToast";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import type { Order } from "@/lib/database.types";

export function DashboardPage() {
  const navigate = useNavigate();
  const { business, loading, setBusiness } = useVendorBusiness();
  const { orders, connected, latestNew, newOrderCount, acknowledge } = useRealtimeOrders(business?.id, 15, true);
  const [metrics, setMetrics] = useState<TodayMetrics | null>(null);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);

  // No business yet -> go onboard.
  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  // Load today's KPIs + analytics; recompute when orders change.
  useEffect(() => {
    if (!business) return;
    getTodayMetrics(business.id).then(setMetrics).catch(() => setMetrics(null));
    getDashboardAnalytics(business.id, 7).then(setAnalytics).catch(() => setAnalytics(null));
  }, [business, orders.length]);

  if (loading || !business) {
    return <div style={{ padding: 32 }}>Loading…</div>;
  }

  const activeOrders = orders.filter((o) => ["NEW", "ACCEPTED", "PREPARING", "READY"].includes(o.status));
  const orderingUrl = `${window.location.origin}/order/${business.slug}`;

  async function toggleAccepting() {
    const updated = await updateBusiness(business!.id, { accepting_orders: !business!.accepting_orders });
    setBusiness(updated);
  }

  return (
    <VendorLayout businessName={business.name} ordersBadge={activeOrders.length}>
      <ConnectionBanner connected={connected} />

      {latestNew && (
        <NewOrderToast
          order={latestNew}
          count={newOrderCount}
          onView={() => { acknowledge(); navigate("/vendor/orders"); }}
          onDismiss={acknowledge}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Good day, {business.name.split(" ")[0]}! 👋</h1>
          <p style={{ color: "var(--color-text-muted)", margin: "4px 0 0" }}>
            Here's what's happening at your business today.
          </p>
        </div>

        {/* Prominent store control: Open/Paused + Pause/Resume */}
        <div style={storeControl}>
          <span style={storeState(business.accepting_orders)}>
            {business.accepting_orders ? "🟢 Accepting Orders" : "🟠 Orders Paused"}
          </span>
          <Button
            variant={business.accepting_orders ? "secondary" : "primary"}
            onClick={toggleAccepting}
          >
            {business.accepting_orders ? "Pause Orders" : "Resume Orders"}
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={kpiGrid}>
        <Kpi label="Today's Orders" value={metrics ? String(metrics.orders) : "—"} icon="🛒" />
        <Kpi label="Today's Revenue" value={metrics ? formatINR(metrics.revenue) : "—"} icon="₹" />
        <Kpi label="Items Sold" value={metrics ? String(metrics.itemsSold) : "—"} icon="🍽️" />
        <Kpi label="Avg. Order Value" value={metrics ? formatINR(metrics.avgOrderValue) : "—"} icon="📊" />
      </div>

      {/* Analytics row */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginTop: 20, alignItems: "start" }}>
        <Card title="Sales Overview (last 7 days)">
          {analytics && analytics.daily.some((d) => d.orders > 0) ? (
            <ComboChart data={analytics.daily.map((d) => ({ label: d.label, bar: d.orders, line: d.revenue }))} />
          ) : (
            <Empty>No sales in the last 7 days yet.</Empty>
          )}
        </Card>
        <Card title="Top Selling Items">
          {analytics && analytics.topItems.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {analytics.topItems.map((t, i) => {
                const max = analytics.topItems[0].qty || 1;
                return (
                  <div key={t.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3 }}>
                      <span><strong>{i + 1}.</strong> {t.name}</span>
                      <span style={{ color: "var(--color-text-muted)" }}>{t.qty} sold</span>
                    </div>
                    <div style={{ height: 7, background: "var(--color-bg)", borderRadius: 4 }}>
                      <div style={{ width: `${(t.qty / max) * 100}%`, height: "100%", background: "var(--color-primary)", borderRadius: 4 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty>No sales data yet.</Empty>
          )}
        </Card>
      </div>

      {/* Peak hours */}
      <div style={{ marginTop: 20 }}>
        <Card title={`Peak Hours${analytics?.peak ? ` — busiest ${analytics.peak.label} (${analytics.peak.value} orders)` : ""}`}>
          {analytics && analytics.hourly.some((h) => h.value > 0) ? (
            <BarChart data={analytics.hourly} />
          ) : (
            <Empty>Not enough data to show peak hours.</Empty>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginTop: 20, alignItems: "start" }}>
        {/* Left: active order queue */}
        <Card title={`Active Orders (${activeOrders.length})`}>
          {activeOrders.length === 0 ? (
            <Empty>No active orders right now.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeOrders.map((o) => <OrderRow key={o.id} order={o} />)}
            </div>
          )}
        </Card>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <Card title="Store Hours">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>🕐 {formatHours(business.open_time, business.close_time)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span style={{ fontWeight: 600 }}>Accepting Orders</span>
              <button onClick={toggleAccepting} style={toggle(business.accepting_orders)}>
                <span style={toggleKnob(business.accepting_orders)} />
              </button>
            </div>
          </Card>

          <Card title="Your Ordering QR Code">
            <div style={{ fontSize: 13, color: "var(--color-text-muted)", wordBreak: "break-all", marginBottom: 10 }}>
              {orderingUrl}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button onClick={() => navigate("/vendor/qr")}>Download QR</Button>
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(orderingUrl)}>Copy URL</Button>
            </div>
          </Card>

          <Card title="Customer POS">
            <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 0 }}>
              Launch the customer ordering screen on this device (Kiosk Mode).
            </p>
            <Button variant="positive" onClick={() => window.open(`/kiosk/${business.slug}`, "_blank")}>
              Open POS →
            </Button>
          </Card>
        </div>
      </div>

      {/* Recent orders */}
      <div style={{ marginTop: 20 }}>
        <Card title="Recent Orders">
          {orders.length === 0 ? (
            <Empty>No orders yet. Share your QR to start taking orders.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {orders.slice(0, 8).map((o) => <OrderRow key={o.id} order={o} compact />)}
            </div>
          )}
        </Card>
      </div>
    </VendorLayout>
  );
}

function OrderRow({ order, compact }: { order: Order; compact?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: compact ? "8px 0" : 12,
        border: compact ? "none" : "1px solid var(--color-border)",
        borderBottom: compact ? "1px solid var(--color-border)" : undefined,
        borderRadius: compact ? 0 : 10,
      }}
    >
      <strong style={{ minWidth: 48 }}>{order.order_number ? `#${order.order_number}` : "—"}</strong>
      <span style={{ flex: 1, fontSize: 13, color: "var(--color-text-muted)" }}>
        {order.customer_name || "Guest"} · {order.source}
      </span>
      <span style={{ fontWeight: 600 }}>{formatINR(Number(order.total))}</span>
      <StatusPill status={order.status} />
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={{ ...cardBase, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 22, width: 40, height: 40, borderRadius: 10, background: "var(--color-bg)", display: "grid", placeItems: "center" }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={cardBase}>
      <h3 style={{ marginTop: 0, marginBottom: 14, fontSize: 15 }}>{title}</h3>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => (
  <div style={{ color: "var(--color-text-muted)", fontSize: 14, padding: "8px 0" }}>{children}</div>
);

const cardBase: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  padding: 18,
  boxShadow: "var(--shadow-card)",
};
const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 16,
  marginTop: 20,
};
const storeControl: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: "10px 14px",
  boxShadow: "var(--shadow-card)",
};
const storeState = (on: boolean): React.CSSProperties => ({
  fontWeight: 700,
  fontSize: 14,
  color: on ? "var(--color-positive)" : "#b45309",
});
const toggle = (on: boolean): React.CSSProperties => ({
  width: 46,
  height: 26,
  borderRadius: 999,
  border: "none",
  background: on ? "var(--color-positive)" : "#cbd5e1",
  position: "relative",
  cursor: "pointer",
  transition: "background 0.15s",
});
const toggleKnob = (on: boolean): React.CSSProperties => ({
  position: "absolute",
  top: 3,
  left: on ? 23 : 3,
  width: 20,
  height: 20,
  borderRadius: "50%",
  background: "#fff",
  transition: "left 0.15s",
});
