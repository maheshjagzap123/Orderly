import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import type { Order, OrderItem } from "@/lib/database.types";
import { NEXT_ACTION_LABEL } from "@/lib/vendorApi";
import { PaymentDot, primaryActionLabel } from "./orderUi";

/** Full order detail with the same lifecycle actions as the queue. */
export function OrderDetailModal({
  order,
  items,
  busy,
  onAdvance,
  onDecline,
  onClose,
}: {
  order: Order;
  items: OrderItem[];
  busy: boolean;
  onAdvance: () => void;
  onDecline: () => void;
  onClose: () => void;
}) {
  const time = new Date(order.placed_at).toLocaleString([], { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  const terminal = order.status === "COMPLETED" || order.status === "CANCELLED";
  const nextLabel = NEXT_ACTION_LABEL[order.status];

  return (
    <div style={backdrop} onClick={busy ? undefined : onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Order {order.order_number ? `#${order.order_number}` : ""}</h2>
          <button onClick={onClose} style={closeBtn} aria-label="Close">✕</button>
        </div>
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0 14px" }}>
          {order.customer_name || "Guest"} · {order.source} · {time}
        </div>

        <div style={box}>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{it.item_name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{it.quantity} × {formatINR(Number(it.unit_price))}</div>
              </div>
              <strong>{formatINR(Number(it.line_total))}</strong>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <Row label="Subtotal" value={formatINR(Number(order.subtotal))} />
          {Number(order.tax_amount) > 0 && <Row label="Tax" value={formatINR(Number(order.tax_amount))} />}
          <Row label="Total" value={formatINR(Number(order.total))} bold />
        </div>

        <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
          <Meta label="Payment"><PaymentDot status={order.payment_status} /></Meta>
          <Meta label="Source"><span>{order.source}</span></Meta>
          <Meta label="Status"><StatusPill status={order.status} /></Meta>
        </div>

        {order.status === "CANCELLED" && order.cancel_reason && (
          <div style={{ marginTop: 12, fontSize: 13, color: "var(--color-danger)" }}>
            Cancelled: {order.cancel_reason}{order.payment_status === "REFUNDED" ? " · Refund issued" : ""}
          </div>
        )}

        {!terminal && (
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <Button variant="secondary" onClick={onDecline} disabled={busy}>Decline</Button>
            {nextLabel && (
              <Button fullWidth variant={order.status === "READY" ? "positive" : "primary"} onClick={onAdvance} disabled={busy}>
                {busy ? "…" : primaryActionLabel(order.status)}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontWeight: bold ? 700 : 400, fontSize: bold ? 16 : 14 }}>
      <span style={{ color: bold ? "var(--color-text)" : "var(--color-text-muted)" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(23,32,51,0.45)", zIndex: 50, display: "grid", placeItems: "center", padding: 16 };
const sheet: React.CSSProperties = { background: "var(--color-surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 440, maxHeight: "90vh", overflow: "auto" };
const box: React.CSSProperties = { background: "var(--color-bg)", borderRadius: 10, padding: 12 };
const closeBtn: React.CSSProperties = { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--color-text-muted)" };
