import { useRef, useState } from "react";
import type { Business } from "@/lib/database.types";
import { payForCart, razorpayEnabled, PaymentError } from "@/lib/payments";
import { revalidateCart, OrderError, type PriceChange } from "@/lib/publicApi";
import { useCart } from "./cart";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import { OrderTracker } from "./OrderTracker";

/**
 * Checkout phases:
 *  review     – show summary + name, ready to pay
 *  price      – prices changed since the cart was built; customer must review
 *  paying     – payment in flight (Razorpay open or dev confirm)
 *  pending    – payment submitted, waiting on webhook confirmation
 *  failed     – payment failed (retry possible)
 *  cancelled  – customer dismissed payment (retry possible)
 *  soldout    – an item is no longer available; cart was adjusted
 *  closed     – store stopped accepting orders
 *  done       – confirmed, show tracker
 */
type Phase =
  | "review"
  | "price"
  | "paying"
  | "pending"
  | "failed"
  | "cancelled"
  | "soldout"
  | "closed"
  | "done";

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
  const [message, setMessage] = useState<string | null>(null);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [trackToken, setTrackToken] = useState<string | null>(null);

  // Duplicate-order guard: blocks a second Pay while one attempt is in flight.
  const inFlight = useRef(false);

  async function pay() {
    if (inFlight.current) return; // double-tap protection
    if (cart.lines.length === 0) return;
    inFlight.current = true;
    setMessage(null);

    try {
      // 1. Pre-check against live DB: sold-out + price changes, before taking money.
      const check = await revalidateCart(
        business.id,
        cart.lines.map((l) => ({ item_id: l.item.id, quantity: l.quantity, clientPrice: Number(l.item.price) }))
      );

      if (!check.storeOpen) {
        setPhase("closed");
        return;
      }
      if (check.unavailable.length > 0) {
        // Drop the unavailable items from the cart and tell the customer.
        for (const u of check.unavailable) cart.remove(u.itemId);
        setMessage(check.unavailable.map((u) => u.name).join(", "));
        setPhase("soldout");
        return;
      }
      if (check.priceChanges.length > 0) {
        // Apply fresh prices to the cart, then make the customer confirm.
        for (const pc of check.priceChanges) {
          const line = cart.lines.find((l) => l.item.id === pc.itemId);
          if (line) cart.updatePrice(pc.itemId, pc.newPrice);
        }
        setPriceChanges(check.priceChanges);
        setPhase("price");
        return;
      }

      // 2. Take payment. Razorpay path moves through pending; dev path returns immediately.
      setPhase(razorpayEnabled ? "pending" : "paying");
      const { orderNumber, trackToken } = await payForCart({
        businessId: business.id,
        source: mode,
        customerName: name,
        lines: cart.lines.map((l) => ({ item_id: l.item.id, quantity: l.quantity })),
      });
      setOrderNumber(orderNumber);
      setTrackToken(trackToken ?? null);
      setPhase("done");
      cart.clear();
    } catch (e) {
      if (e instanceof PaymentError) {
        setMessage(e.message);
        setPhase(e.kind === "CANCELLED" ? "cancelled" : "failed");
      } else if (e instanceof OrderError) {
        if (e.reason === "STORE_CLOSED") {
          setPhase("closed");
        } else {
          setMessage(e.message);
          setPhase("soldout");
        }
      } else {
        setMessage(e instanceof Error ? e.message : "Payment failed");
        setPhase("failed");
      }
    } finally {
      inFlight.current = false;
    }
  }

  const lockBackdrop = phase === "paying" || phase === "pending" || phase === "done";

  return (
    <div style={backdrop} onClick={lockBackdrop ? undefined : onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        {/* ---- Review ---- */}
        {phase === "review" && (
          <>
            <h2 style={{ marginTop: 0 }}>Checkout</h2>
            <Summary lines={cart.lines} total={cart.total} />
            <label style={label}>Name (optional, helps us call you)</label>
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <Button variant="secondary" onClick={onClose}>Back to Cart</Button>
              <Button fullWidth onClick={pay}>{`Pay ${formatINR(cart.total)}`}</Button>
            </div>
            <p style={fine}>
              {razorpayEnabled
                ? "🛡 Secure payment via Razorpay."
                : "Dev mode: payment is auto-confirmed. Razorpay activates when keys are set."}
            </p>
          </>
        )}

        {/* ---- Price changed ---- */}
        {phase === "price" && (
          <StatusView icon="🔖" title="Prices updated" tone="warn">
            <p style={pMuted}>Some prices changed since you added them. Please review the new total.</p>
            <div style={summaryBox}>
              {priceChanges.map((pc) => (
                <div key={pc.itemId} style={rowLine}>
                  <span>{pc.name}</span>
                  <span>
                    <s style={{ color: "var(--color-text-muted)" }}>{formatINR(pc.oldPrice)}</s>{" "}
                    <strong>{formatINR(pc.newPrice)}</strong>
                  </span>
                </div>
              ))}
              <div style={{ ...rowLine, borderTop: "1px solid var(--color-border)", marginTop: 8, paddingTop: 8, fontWeight: 700 }}>
                <span>New Total</span>
                <span>{formatINR(cart.total)}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <Button variant="secondary" onClick={onClose}>Back to Cart</Button>
              <Button fullWidth onClick={() => { setPhase("review"); }}>Review &amp; Continue</Button>
            </div>
          </StatusView>
        )}

        {/* ---- Paying (dev) ---- */}
        {phase === "paying" && (
          <StatusView icon={<Spinner />} title="Processing…" tone="muted">
            <p style={pMuted}>Confirming your order. Please don't close this screen.</p>
          </StatusView>
        )}

        {/* ---- Pending (webhook) ---- */}
        {phase === "pending" && (
          <StatusView icon={<Spinner />} title="Payment Processing" tone="muted">
            <p style={pMuted}>We're confirming your payment. Please don't place another order or close this screen.</p>
          </StatusView>
        )}

        {/* ---- Failed ---- */}
        {phase === "failed" && (
          <StatusView icon="⚠️" title="Payment Failed" tone="danger">
            <p style={pMuted}>{message ?? "Your payment wasn't completed."}</p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <Button variant="secondary" onClick={onClose}>Back to Cart</Button>
              <Button fullWidth onClick={() => { setPhase("review"); pay(); }}>Try Again</Button>
            </div>
          </StatusView>
        )}

        {/* ---- Cancelled ---- */}
        {phase === "cancelled" && (
          <StatusView icon="🚫" title="Payment Cancelled" tone="warn">
            <p style={pMuted}>No order was confirmed. You can try again.</p>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <Button variant="secondary" onClick={onClose}>Back to Cart</Button>
              <Button fullWidth onClick={() => { setPhase("review"); pay(); }}>Try Payment Again</Button>
            </div>
          </StatusView>
        )}

        {/* ---- Sold out ---- */}
        {phase === "soldout" && (
          <StatusView icon="😕" title="Item no longer available" tone="warn">
            <p style={pMuted}>
              {message ? `${message} is no longer available and was removed from your cart.` : "An item is no longer available."}
            </p>
            <Button fullWidth onClick={onClose} style={{ marginTop: 16 }}>Back to Cart</Button>
          </StatusView>
        )}

        {/* ---- Closed ---- */}
        {phase === "closed" && (
          <StatusView icon="🔒" title="Orders Paused" tone="warn">
            <p style={pMuted}>This stall just stopped accepting orders. Please try again later.</p>
            <Button fullWidth onClick={onClose} style={{ marginTop: 16 }}>Back to Menu</Button>
          </StatusView>
        )}

        {/* ---- Done ---- */}
        {phase === "done" && orderNumber != null && (
          <OrderTracker
            business={business}
            orderNumber={orderNumber}
            trackToken={trackToken}
            onClose={onClose}
            autoCloseMs={mode === "KIOSK" ? 2000 : undefined}
          />
        )}
      </div>
    </div>
  );
}

function Summary({ lines, total }: { lines: ReturnType<typeof useCart>["lines"]; total: number }) {
  return (
    <div style={summaryBox}>
      {lines.map((l) => (
        <div key={l.item.id} style={rowLine}>
          <span>{l.quantity} × {l.item.name}</span>
          <span>{formatINR(Number(l.item.price) * l.quantity)}</span>
        </div>
      ))}
      <div style={{ ...rowLine, borderTop: "1px solid var(--color-border)", marginTop: 8, paddingTop: 8, fontWeight: 700 }}>
        <span>Total</span>
        <span>{formatINR(total)}</span>
      </div>
    </div>
  );
}

function StatusView({
  icon,
  title,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "muted" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const color =
    tone === "danger" ? "#b42318" : tone === "warn" ? "#92400e" : "var(--color-text)";
  return (
    <div style={{ textAlign: "center", padding: "8px 0" }}>
      <div style={{ fontSize: 40, display: "grid", placeItems: "center", minHeight: 48 }}>{icon}</div>
      <h2 style={{ margin: "8px 0", color }}>{title}</h2>
      <div style={{ textAlign: "left" }}>{children}</div>
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 34, height: 34, borderRadius: "50%",
        border: "3px solid var(--color-border)", borderTopColor: "var(--color-primary)",
        display: "inline-block", animation: "orderly-spin 0.8s linear infinite",
      }}
    >
      <style>{`@keyframes orderly-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}

const backdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 40, display: "grid", placeItems: "center", padding: 16 };
const sheet: React.CSSProperties = { background: "var(--color-surface)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, maxHeight: "90vh", overflow: "auto" };
const summaryBox: React.CSSProperties = { background: "var(--color-bg)", borderRadius: 10, padding: 12 };
const rowLine: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: 14, padding: "3px 0" };
const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, margin: "14px 0 6px" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 15 };
const fine: React.CSSProperties = { fontSize: 11, color: "var(--color-text-muted)", textAlign: "center", marginTop: 12 };
const pMuted: React.CSSProperties = { color: "var(--color-text-muted)", fontSize: 14, textAlign: "center", margin: "0 0 4px" };
