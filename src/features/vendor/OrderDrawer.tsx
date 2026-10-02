import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import type { Order } from "@/lib/database.types";
import type { OrderItemWithImage } from "@/lib/vendorApi";
import { PaymentDot, primaryActionLabel, actionVariant, vendorNextStatus } from "./orderUi";

/** Right-side order detail drawer (400px desktop, full-width mobile). */
export function OrderDrawer({
  order,
  items,
  busy,
  onAdvance,
  onDecline,
  onClose,
}: {
  order: Order;
  items: OrderItemWithImage[];
  busy: boolean;
  onAdvance: () => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  const time = new Date(order.placed_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  const terminal = order.status === "COMPLETED" || order.status === "CANCELLED";
  const nextLabel = vendorNextStatus(order.status) ? primaryActionLabel(order.status) : "";

  return (
    <div style={backdrop} onClick={busy ? undefined : onClose}>
      <aside style={drawer} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Order ${order.order_number ?? ""}`}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Order {order.order_number ? `#${order.order_number}` : ""}</h2>
          <button onClick={onClose} style={closeBtn} aria-label="Close">✕</button>
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "6px 0 16px" }}>
          {order.customer_name || "Guest"} · {order.source} · {time}
        </div>

        <h4 style={{ margin: "0 0 8px", fontSize: 13, color: "var(--color-text-muted)" }}>Items</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={thumb}>
                {it.image_url ? <img src={it.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🍽️"}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{it.item_name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>× {it.quantity} · {formatINR(Number(it.unit_price))} each</div>
              </div>
              <strong>{formatINR(Number(it.line_total))}</strong>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--color-border)", margin: "16px 0", paddingTop: 12 }}>
          <Row label="Subtotal" value={formatINR(Number(order.subtotal))} />
          {Number(order.tax_amount) > 0 && <Row label="Tax" value={formatINR(Number(order.tax_amount))} />}
          <Row label="Total" value={formatINR(Number(order.total))} bold />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Meta label="Payment"><PaymentDot status={order.payment_status} /></Meta>
          <Meta label="Status"><StatusPill status={order.status} /></Meta>
          <Meta label="Source"><span>{order.source}</span></Meta>
        </div>

        {order.status === "CANCELLED" && order.cancel_reason && (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--color-danger)" }}>
            Cancelled: {order.cancel_reason}{order.payment_status === "REFUNDED" ? " · Refund issued" : ""}
          </div>
        )}

        {!terminal && (
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            {nextLabel && (
              <Button fullWidth variant={actionVariant(order.status)} onClick={onAdvance} disabled={busy}>
                {busy ? "…" : nextLabel}
              </Button>
            )}
            <Button variant="danger" onClick={onDecline} disabled={busy}>Decline</Button>
          </div>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontWeight: bold ? 700 : 400, fontSize: bold ? 17 : 14 }}>
      <span style={{ color: bold ? "var(--color-text)" : "var(--color-text-muted)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{label}</span>
      {children}
    </div>
  );
}

const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(23,32,51,0.4)", zIndex: 50, display: "flex", justifyContent: "flex-end" };
const drawer: React.CSSProperties = {
  width: "min(400px, 100%)", height: "100%", background: "var(--color-surface)",
  padding: 24, overflow: "auto", boxShadow: "-8px 0 24px rgba(23,32,51,0.12)",
  animation: "orderly-drawer-in 0.18s ease-out",
};
const closeBtn: React.CSSProperties = { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--color-text-muted)" };
const thumb: React.CSSProperties = { width: 42, height: 42, borderRadius: 8, background: "var(--color-bg)", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0, fontSize: 18 };
