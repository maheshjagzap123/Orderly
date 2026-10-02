import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getOrderByNumber } from "@/lib/publicApi";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import type { Business, Order, OrderItem, OrderStatus } from "@/lib/database.types";

const STEPS: OrderStatus[] = ["NEW", "ACCEPTED", "PREPARING", "READY", "COMPLETED"];
const LABELS: Record<OrderStatus, string> = {
  NEW: "Order Received",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready for Collection",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function OrderTracker({
  business,
  orderNumber,
  onClose,
}: {
  business: Business;
  orderNumber: number;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);

  useEffect(() => {
    let active = true;
    getOrderByNumber(business.id, orderNumber).then((res) => {
      if (!active || !res) return;
      setOrder(res.order);
      setItems(res.items);

      // Live-track this order's status.
      const channel = supabase
        .channel(`order:${res.order.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${res.order.id}` },
          (payload) => setOrder(payload.new as Order)
        )
        .subscribe();

      return () => supabase.removeChannel(channel);
    });
    return () => {
      active = false;
    };
  }, [business.id, orderNumber]);

  const currentIdx = order ? STEPS.indexOf(order.status) : 0;

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 44 }}>✅</div>
      <h2 style={{ margin: "6px 0" }}>Order Confirmed</h2>
      <div style={{ fontSize: 32, fontWeight: 800, color: "var(--color-primary)" }}>#{orderNumber}</div>
      {order && <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>Total {formatINR(Number(order.total))} · Paid</div>}

      {order?.status === "CANCELLED" && (
        <div style={{ background: "#fdecea", color: "#b42318", padding: "10px 12px", borderRadius: 10, fontSize: 14, margin: "14px 0" }}>
          This order was cancelled. If you were charged, your payment will be refunded.
        </div>
      )}

      {/* Timeline */}
      <div style={{ textAlign: "left", margin: "22px 0" }}>
        {STEPS.map((s, i) => {
          const done = i < currentIdx;
          const current = i === currentIdx;
          const reached = i <= currentIdx;
          // dot: filled check when done, pulsing ring when current, hollow when pending
          const dotBg = done ? "var(--color-positive)" : current ? "var(--color-primary)" : "transparent";
          const dotBorder = reached ? dotBg : "2px solid var(--color-border)";
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0", position: "relative" }}>
              {/* connector line to the next step */}
              {i < STEPS.length - 1 && (
                <span style={{ position: "absolute", left: 10, top: 26, width: 2, height: 18, background: done ? "var(--color-positive)" : "var(--color-border)" }} />
              )}
              <span
                style={{
                  width: 22, height: 22, borderRadius: "50%",
                  background: dotBg, border: typeof dotBorder === "string" && dotBorder.startsWith("2px") ? dotBorder : "none",
                  color: "#fff", display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0,
                  boxShadow: current ? "0 0 0 4px rgba(220,38,38,0.15)" : "none",
                }}
              >
                {done ? "✓" : current ? "●" : ""}
              </span>
              <span style={{ fontWeight: current ? 700 : 400, color: reached ? "var(--color-text)" : "var(--color-text-muted)" }}>
                {LABELS[s]}
              </span>
            </div>
          );
        })}
      </div>

      {order?.status === "READY" && (
        <div style={{ background: "#dcfce7", color: "#166534", padding: "14px 12px", borderRadius: 10, fontSize: 15, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          🔔 Your order is ready! Please collect it at the counter.
        </div>
      )}

      {items.length > 0 && (
        <div style={{ textAlign: "left", background: "var(--color-bg)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "2px 0" }}>
              <span>{it.quantity} × {it.item_name}</span>
              <span>{formatINR(Number(it.line_total))}</span>
            </div>
          ))}
        </div>
      )}

      <Button fullWidth onClick={onClose}>Order Again</Button>
      <button
        onClick={() => navigator.clipboard.writeText(`${window.location.origin}/order/${business.slug}/track/${orderNumber}`)}
        style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: 12, marginTop: 10, cursor: "pointer" }}
      >
        🔗 Copy tracking link
      </button>
    </div>
  );
}
