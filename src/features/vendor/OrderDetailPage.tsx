import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { VendorLayout } from "./VendorLayout";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { getOrderItemsFor, updateOrderStatus } from "@/lib/vendorApi";
import { primaryActionLabel, actionVariant, vendorNextStatus, PaymentDot } from "./orderUi";
import { OrderTimeline } from "./OrderTimeline";
import { formatINR } from "@/lib/format";
import { LoadingState, ErrorState } from "@/components/ui/States";
import type { Order, OrderItem } from "@/lib/database.types";

export function OrderDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { business, loading } = useVendorBusiness();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  function load() {
    if (!id) return;
    setFailed(false);
    supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          setFailed(true);
          return;
        }
        setOrder(data);
        if (data) getOrderItemsFor([data.id]).then((m) => setItems(m[data.id] ?? []));
      });
  }

  useEffect(load, [id]);

  if (loading || !business) return <LoadingState />;
  if (failed) {
    return (
      <VendorLayout businessName={business.name}>
        <ErrorState onRetry={load} />
      </VendorLayout>
    );
  }
  if (!order) {
    return (
      <VendorLayout businessName={business.name}>
        <p>Order not found.</p>
      </VendorLayout>
    );
  }

  // Unified 2-step machine (shared with the queue + drawer).
  const next = vendorNextStatus(order.status);
  const nextLabel = next ? primaryActionLabel(order.status) : "";
  const terminal = order.status === "COMPLETED" || order.status === "CANCELLED";

  async function advance() {
    if (!next || busy) return; // double-action guard
    setBusy(true);
    try {
      setOrder(await updateOrderStatus(order!.id, next));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <VendorLayout businessName={business.name}>
      <Button variant="ghost" onClick={() => navigate("/vendor/orders")}>
        ← Back to Orders
      </Button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
        <h1 style={{ margin: 0 }}>Order #{order.order_number ?? "—"}</h1>
        <StatusPill status={order.status} />
      </div>

      <div style={{ maxWidth: 560, marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <section style={card}>
          <Meta label="Customer" value={order.customer_name || "Guest"} />
          <Meta label="Source" value={order.source} />
          <Meta label="Placed" value={new Date(order.placed_at).toLocaleString()} />
          <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
            <span style={{ color: "var(--color-text-muted)" }}>Payment</span>
            <PaymentDot status={order.payment_status} />
          </div>
          {order.cancel_reason && <Meta label="Cancellation reason" value={order.cancel_reason} />}
        </section>

        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Items</h3>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span>
                {it.quantity} × {it.item_name}
              </span>
              <span>{formatINR(Number(it.line_total))}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-text-muted)" }}>
            <span>Subtotal</span>
            <span>{formatINR(Number(order.subtotal))}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-text-muted)" }}>
            <span>Tax</span>
            <span>{formatINR(Number(order.tax_amount))}</span>
          </div>
          <div style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
            <span>Total</span>
            <span>{formatINR(Number(order.total))}</span>
          </div>
        </section>

        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Timeline</h3>
          <OrderTimeline order={order} />
        </section>

        {!terminal && nextLabel && (
          <Button variant={actionVariant(order.status)} onClick={advance} disabled={busy}>
            {busy ? "…" : nextLabel}
          </Button>
        )}
      </div>
    </VendorLayout>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 14 }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  padding: 18,
  boxShadow: "var(--shadow-card)",
};
