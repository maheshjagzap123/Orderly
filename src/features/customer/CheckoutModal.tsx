import { useState } from "react";
import type { Business } from "@/lib/database.types";
import { payForCart, razorpayEnabled } from "@/lib/payments";
import { useCart } from "./cart";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import { OrderTracker } from "./OrderTracker";

type Phase = "review" | "paying" | "done";

export function CheckoutModal({
  business,
  mode,
  onClose,
}: {
  business: Business;
  mode: "QR" | "KIOSK";
  onClose: () => void;
}) {
  const cart = useCart();
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("review");
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);

  async function pay() {
    setPhase("paying");
    setError(null);
    try {
      const { orderNumber } = await payForCart({
        businessId: business.id,
        source: mode,
        customerName: name,
        lines: cart.lines.map((l) => ({ item_id: l.item.id, quantity: l.quantity })),
      });
      setOrderNumber(orderNumber);
      setPhase("done");
      cart.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setPhase("review");
    }
  }

  return (
    <div style={backdrop} onClick={phase === "done" ? undefined : onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        {phase !== "done" && (
          <>
            <h2 style={{ marginTop: 0 }}>Checkout</h2>

            <div style={summary}>
              {cart.lines.map((l) => (
                <div key={l.item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 0" }}>
                  <span>{l.quantity} × {l.item.name}</span>
                  <span>{formatINR(Number(l.item.price) * l.quantity)}</span>
                </div>
              ))}
              <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Total</span>
                <span>{formatINR(cart.total)}</span>
              </div>
            </div>

            <label style={{ display: "block", fontSize: 13, fontWeight: 600, margin: "14px 0 6px" }}>
              Name (optional, helps us call you)
            </label>
            <input
              style={input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />

            {error && <div style={errorBox}>{error}</div>}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <Button variant="secondary" onClick={onClose} disabled={phase === "paying"}>
                Back to Cart
              </Button>
              <Button fullWidth onClick={pay} disabled={phase === "paying"}>
                {phase === "paying" ? "Processing…" : `Pay ${formatINR(cart.total)}`}
              </Button>
            </div>

            <p style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center", marginTop: 12 }}>
              {razorpayEnabled ? "Secure payment via Razorpay." : "Dev mode: payment is auto-confirmed. Razorpay activates when keys are set."}
            </p>
          </>
        )}

        {phase === "done" && orderNumber != null && (
          <OrderTracker business={business} orderNumber={orderNumber} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 40, display: "grid", placeItems: "center", padding: 16 };
const sheet: React.CSSProperties = { background: "var(--color-surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflow: "auto" };
const summary: React.CSSProperties = { background: "var(--color-bg)", borderRadius: 10, padding: 12 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 15 };
const errorBox: React.CSSProperties = { marginTop: 12, padding: "9px 12px", background: "#fdecea", color: "#b42318", borderRadius: 8, fontSize: 13 };
