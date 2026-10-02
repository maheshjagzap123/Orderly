import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "./VendorLayout";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { NewOrderToast } from "@/components/NewOrderToast";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { useRealtimeOrders } from "@/hooks/useRealtimeOrders";
import { getOrderItemsFor, updateOrderStatus, cancelOrder, NEXT_STATUS, NEXT_ACTION_LABEL } from "@/lib/vendorApi";
import { formatINR } from "@/lib/format";
import type { Order, OrderItem, OrderStatus, OrderSource } from "@/lib/database.types";
import { CancelOrderModal } from "./CancelOrderModal";

const STATUS_FILTERS: (OrderStatus | "ALL" | "ACTIVE")[] = [
  "ACTIVE", "ALL", "NEW", "ACCEPTED", "PREPARING", "READY", "COMPLETED", "CANCELLED",
];

export function OrdersPage() {
  const navigate = useNavigate();
  const { business, loading } = useVendorBusiness();
  const { orders, connected, latestNew, newOrderCount, acknowledge } = useRealtimeOrders(business?.id, 100, true);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItem[]>>({});
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("ACTIVE");
  const [sourceFilter, setSourceFilter] = useState<OrderSource | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState(""); // yyyy-mm-dd
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  // Load items for all visible orders.
  useEffect(() => {
    const ids = orders.map((o) => o.id);
    if (ids.length) getOrderItemsFor(ids).then(setItemsByOrder).catch(() => {});
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const statusOk =
        statusFilter === "ALL" ? true :
        statusFilter === "ACTIVE" ? ["NEW", "ACCEPTED", "PREPARING", "READY"].includes(o.status) :
        o.status === statusFilter;
      const sourceOk = sourceFilter === "ALL" ? true : o.source === sourceFilter;
      const dateOk = !dateFilter ? true : new Date(o.placed_at).toISOString().slice(0, 10) === dateFilter;
      const searchOk =
        !q ? true :
        String(o.order_number ?? "").includes(q) ||
        (o.customer_name ?? "").toLowerCase().includes(q);
      return statusOk && sourceOk && dateOk && searchOk;
    });
  }, [orders, statusFilter, sourceFilter, dateFilter, search]);

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

  async function confirmCancel(reason: string) {
    if (!cancelling) return;
    const id = cancelling.id;
    setBusyId(id);
    try {
      await cancelOrder(id, reason);
      setCancelling(null);
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <VendorLayout businessName={business.name} ordersBadge={activeCount}>
      <ConnectionBanner connected={connected} />

      {latestNew && (
        <NewOrderToast
          order={latestNew}
          count={newOrderCount}
          onView={acknowledge}
          onDismiss={acknowledge}
        />
      )}

      <h1 style={{ marginTop: 0 }}>Orders</h1>

      {/* Search + date */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          style={searchInput}
          placeholder="Search by order # or customer name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="date"
          style={{ ...searchInput, maxWidth: 170 }}
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
        {(search || dateFilter) && (
          <Button variant="secondary" onClick={() => { setSearch(""); setDateFilter(""); }}>Clear</Button>
        )}
      </div>

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
              onCancel={() => setCancelling(o)}
            />
          ))}
        </div>
      )}

      {cancelling && (
        <CancelOrderModal
          order={cancelling}
          busy={busyId === cancelling.id}
          onConfirm={confirmCancel}
          onClose={() => setCancelling(null)}
        />
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
  const paid = order.payment_status === "SUCCESS";

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: 18 }}>{order.order_number ? `#${order.order_number}` : "—"}</strong>
        <StatusPill status={order.status} />
      </div>
      <div style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "2px 0 10px" }}>
        {time} · {order.source} · {order.customer_name || "Guest"} · <PaymentTag status={order.payment_status} />
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

      {order.status === "CANCELLED" && order.cancel_reason && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#b42318" }}>
          Cancelled: {order.cancel_reason}
          {order.payment_status === "REFUNDED" ? " · Refund issued" : ""}
        </div>
      )}

      {!terminal && (
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {nextLabel && (
            <Button fullWidth onClick={onAdvance} disabled={busy}>
              {busy ? "…" : nextLabel}
            </Button>
          )}
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {paid ? "Cancel & Refund" : "Cancel"}
          </Button>
        </div>
      )}
    </div>
  );
}

function PaymentTag({ status }: { status: Order["payment_status"] }) {
  const map: Record<string, { label: string; color: string }> = {
    SUCCESS: { label: "Paid", color: "var(--color-positive)" },
    PENDING: { label: "Pending", color: "#b45309" },
    INITIATED: { label: "Unpaid", color: "var(--color-text-muted)" },
    FAILED: { label: "Payment failed", color: "#b42318" },
    CANCELLED: { label: "Payment cancelled", color: "var(--color-text-muted)" },
    REFUNDED: { label: "Refunded", color: "#2563eb" },
  };
  const m = map[status] ?? { label: status, color: "var(--color-text-muted)" };
  return <span style={{ color: m.color, fontWeight: 600 }}>{m.label}</span>;
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
        cursor: "pointer",
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
const searchInput: React.CSSProperties = {
  flex: 1,
  minWidth: 220,
  padding: "9px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: 10,
  fontSize: 14,
};
