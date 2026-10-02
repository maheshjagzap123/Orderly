import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CANCEL_REASONS } from "@/lib/vendorApi";
import { formatINR } from "@/lib/format";
import type { Order } from "@/lib/database.types";

/** Vendor-facing cancel dialog with a reason picker. Flags a refund if the order was paid. */
export function CancelOrderModal({
  order,
  busy,
  onConfirm,
  onClose,
}: {
  order: Order;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<string>(CANCEL_REASONS[0]);
  const [note, setNote] = useState("");
  const paid = order.payment_status === "SUCCESS";

  const finalReason = reason === "Other" && note.trim() ? note.trim() : reason;

  return (
    <div style={backdrop} onClick={busy ? undefined : onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>
          Cancel order {order.order_number ? `#${order.order_number}` : ""}?
        </h2>

        {paid && (
          <div style={refundNote}>
            This order was paid ({formatINR(Number(order.total))}). Cancelling will mark a <strong>full refund</strong>.
          </div>
        )}

        <label style={label}>Reason</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {CANCEL_REASONS.map((r) => (
            <label key={r} style={radioRow}>
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
              <span>{r}</span>
            </label>
          ))}
        </div>

        {reason === "Other" && (
          <input
            style={input}
            placeholder="Describe the reason"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Keep Order</Button>
          <Button fullWidth onClick={() => onConfirm(finalReason)} disabled={busy}>
            {busy ? "Cancelling…" : paid ? "Cancel & Refund" : "Cancel Order"}
          </Button>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "grid", placeItems: "center", padding: 16 };
const sheet: React.CSSProperties = { background: "var(--color-surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 380 };
const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "14px 0 8px" };
const radioRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 14, marginTop: 10 };
const refundNote: React.CSSProperties = { background: "#eff6ff", color: "#1e40af", padding: "10px 12px", borderRadius: 10, fontSize: 13, marginBottom: 4 };
