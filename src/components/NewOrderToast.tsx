import { useEffect } from "react";
import type { Order } from "@/lib/database.types";
import { formatINR } from "@/lib/format";

/**
 * Floating alert shown to the vendor when a new order arrives.
 * Auto-dismisses after a few seconds; clicking it (or View) can route to orders.
 */
export function NewOrderToast({
  order,
  count,
  onView,
  onDismiss,
}: {
  order: Order;
  count: number;
  onView: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000);
    return () => clearTimeout(t);
  }, [order.id, onDismiss]);

  return (
    <div style={wrap} role="alert" aria-live="assertive">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>🔔</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700 }}>
            New Order {order.order_number ? `#${order.order_number}` : ""}
            {count > 1 ? ` (+${count - 1} more)` : ""}
          </div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
            {order.customer_name || "Guest"} · {order.source} · {formatINR(Number(order.total))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button style={viewBtn} onClick={onView}>View Orders</button>
        <button style={dismissBtn} onClick={onDismiss} aria-label="Dismiss">✕</button>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  top: 72,
  right: 20,
  zIndex: 60,
  width: 300,
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderLeft: "4px solid var(--color-primary)",
  borderRadius: 12,
  padding: 14,
  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
  animation: "orderly-toast-in 0.2s ease-out",
};
const viewBtn: React.CSSProperties = {
  flex: 1,
  background: "var(--color-primary)",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 600,
  cursor: "pointer",
};
const dismissBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  padding: "8px 12px",
  cursor: "pointer",
  color: "var(--color-text-muted)",
};
