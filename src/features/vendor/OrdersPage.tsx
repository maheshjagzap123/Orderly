import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "./VendorLayout";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { useRealtimeOrders } from "@/hooks/useRealtimeOrders";
import { getOrderItemsFor, updateOrderStatus, NEXT_STATUS, NEXT_ACTION_LABEL } from "@/lib/vendorApi";
import { formatINR } from "@/lib/format";
import type { Order, OrderItem, OrderStatus, OrderSource } from "@/lib/database.types";

const STATUS_FILTERS: (OrderStatus | "ALL" | "ACTIVE")[] = [
  "ACTIVE", "ALL", "NEW", "ACCEPTED", "PREPARING", "READY", "COMPLETED", "CANCELLED",
];

export function OrdersPage() {
  const navigate = useNavigate();
  const { business, loading } = useVendorBusiness();
  const { orders } = useRealtimeOrders(business?.id, 50);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItem[]>>({});
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("ACTIVE");
  const [sourceFilter, setSourceFilter] = useState<OrderSource | "ALL">("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  // Load items for all visible orders.
  useEffect(() => {
    const ids = orders.map((o) => o.id);
    if (ids.length) getOrderItemsFor(ids).then(setItemsByOrder).catch(() => {});
  }, [orders]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const statusOk =
        statusFilter === "ALL" ? true :
        statusFilter === "ACTIVE" ? ["NEW", "ACCEPTED", "PREPARING", "READY"].includes(o.status) :
        o.status === statusFilter;
      const sourceOk = sourceFilter === "ALL" ? true : o.source === sourceFilter;
      return statusOk && sourceOk;
    });
  }, [orders, statusFilter, sourceFilter]);

  const activeCount = orders.filter((o) => ["NEW", "ACCEPTED", "PREPARING", "READY"].includes(o.status)).length;

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    setBusyId(order.id);
    try {
      await updateOrderStatus(order.id, next);
    } finally {
      setBusyId(null);
    }
  }

  async function cancel(order: Order) {
    if (!confirm(`Cancel order #${order.order_number}?`)) return;
    setBusyId(order.id);
    try {
      await updateOrderStatus(order.id, "CANCELLED");
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <VendorLayout businessName={business.name} ordersBadge={activeCount}>
      <h1 style={{ marginTop: 0 }}>Orders</h1>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {STATUS_FILTERS.map((s) => (
          <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {s === "ACTIVE" ? "Active" : s === "ALL" ? "All" : titleCase(s)}
          </Chip>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {(["ALL", "QR", "KIOSK"] as const).map((s) => (
          <Chip key={s} active={sourceFilter === s} onClick={() => setSourceFilter(s)} small>
            {s === "ALL" ? "All sources" : s}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ color: "var(--color-text-muted)" }}>No orders match this filter.</div>
      ) : (
        <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
          {filtered.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              items={itemsByOrder[o.id] ?? []}
              busy={busyId === o.id}
              onAdvance={() => advance(o)}
              onCancel={() => cancel(o)}
            />
          ))}
        </div>
      )}
    </VendorLayout>
  );
}

function OrderCard({
  order, items, busy, onAdvance, onCancel,
}: {
  order: Order; items: OrderItem[]; busy: boolean; onAdvance: () => void; onCancel: () => void;
}) {
  const nextLabel = NEXT_ACTION_LABEL[order.status];
  const terminal = order.status === "COMPLETED" || order.status === "CANCELLED";
  const time = new Date(order.placed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 18 }}>{order.order_number ? `#${order.order_number}` : "—"}</strong>
        <StatusPill status={order.status} />
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "2px 0 10px" }}>
        {time} · {order.source} · {order.customer_name || "Guest"}
      </div>

      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 8 }}>
        {items.map((it) => (
          <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "2px 0" }}>
            <span>{it.quantity} × {it.item_name}</span>
            <span>{formatINR(Number(it.line_total))}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginTop: 6 }}>
          <span>Total</span>
          <span>{formatINR(Number(order.total))}</span>
        </div>
      </div>

      {!terminal && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {nextLabel && (
            <Button fullWidth onClick={onAdvance} disabled={busy}>
              {busy ? "…" : nextLabel}
            </Button>
          )}
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children, small }: { active: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? "5px 12px" : "7px 14px",
        borderRadius: 999,
        border: "1px solid var(--color-border)",
        background: active ? "var(--color-primary)" : "#fff",
        color: active ? "#fff" : "var(--color-text-muted)",
        fontWeight: 600,
        fontSize: 13,
      }}
    >
      {children}
    </button>
  );
}

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

const card: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  padding: 16,
  boxShadow: "var(--shadow-card)",
};
