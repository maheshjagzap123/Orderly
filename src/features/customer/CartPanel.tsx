import { useCart } from "./cart";
import { QtyStepper } from "@/components/QtyStepper";
import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/format";
import type { Business } from "@/lib/database.types";

export function CartPanel({
  business,
  onCheckout,
}: {
  business: Business;
  onCheckout: () => void;
}) {
  const cart = useCart();
  const prep =
    business.prep_time_min && business.prep_time_max
      ? `${business.prep_time_min} - ${business.prep_time_max} minutes`
      : null;

  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          🛒 Your Cart ({cart.count})
        </h3>
        {cart.count > 0 && (
          <button onClick={cart.clear} style={clearBtn}>
            Clear All
          </button>
        )}
      </div>

      {cart.count === 0 ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: 14 }}>
          Your cart is empty. Add some items to get started.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, margin: "16px 0" }}>
            {cart.lines.map((l) => (
              <div key={l.item.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={thumb}>{l.item.image_url ? <img src={l.item.image_url} alt="" style={img} /> : "🍽️"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{l.item.name}</div>
                  <div style={{ color: "var(--color-primary)", fontSize: 13 }}>{formatINR(Number(l.item.price))}</div>
                </div>
                <QtyStepper
                  qty={l.quantity}
                  onDec={() => cart.setQty(l.item.id, l.quantity - 1)}
                  onInc={() => cart.setQty(l.item.id, l.quantity + 1)}
                />
                <button onClick={() => cart.remove(l.item.id)} style={trash} aria-label="Remove">
                  🗑
                </button>
              </div>
            ))}
          </div>

          <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 14 }}>
            <h4 style={{ margin: "0 0 10px" }}>Bill Summary</h4>
            <Row label="Subtotal" value={formatINR(cart.subtotal)} />
            {Number(business.tax_percent) > 0 && (
              <Row label={`Taxes (${business.tax_percent}%)`} value={formatINR(cart.taxAmount)} />
            )}
            <Row label="Total" value={formatINR(cart.total)} bold />
          </div>

          <Button fullWidth onClick={onCheckout} style={{ marginTop: 14 }}>
            Proceed to Checkout →
          </Button>

          <div style={{ textAlign: "center", marginTop: 12 }}>
            <div style={{ color: "var(--color-positive)", fontSize: 13, fontWeight: 600 }}>🛡 Secure Payment</div>
            <div style={{ color: "var(--color-text-muted)", fontSize: 12, marginTop: 4 }}>
              GPay · PhonePe · Paytm · Cards · UPI
            </div>
          </div>

          {prep && (
            <div style={prepCard}>
              <span>🕐</span>
              <div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Estimated Preparation Time</div>
                <div style={{ fontWeight: 600 }}>{prep}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontWeight: bold ? 700 : 400, fontSize: bold ? 17 : 14 }}>
    <span style={{ color: bold ? "var(--color-text)" : "var(--color-text-muted)" }}>{label}</span>
    <span>{value}</span>
  </div>
);

const panel: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  boxShadow: "var(--shadow-card)",
  padding: 18,
};
const clearBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "var(--color-primary)",
  fontWeight: 600,
  fontSize: 13,
};
const thumb: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 10,
  background: "var(--color-bg)",
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  flexShrink: 0,
};
const img: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
const trash: React.CSSProperties = { background: "none", border: "none", fontSize: 16, cursor: "pointer" };
const prepCard: React.CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  marginTop: 14,
  padding: 12,
  background: "#fdecea",
  borderRadius: 10,
};
