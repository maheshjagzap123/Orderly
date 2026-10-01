import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { VendorLayout } from "./VendorLayout";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { getOrderItemsFor, updateOrderStatus, NEXT_STATUS, NEXT_ACTION_LABEL } from "@/lib/vendorApi";
import { formatINR } from "@/lib/format";
import type { Order, OrderItem } from "@/lib/database.types";

export function OrderDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { business, loading } = useVendorBusiness();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  useEffect(() => {
    if (!id) return;
    supabase.from("orders").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      setOrder(data);
      if (data) getOrderItemsFor([data.id]).then((m) => setItems(m[data.id] ?? []));
    });
  }, [id]);

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;
  if (!order) return <VendorLayout businessName={business.name}><p>Order not found.</p></VendorLayout>;

  const nextLabel = NEXT_ACTION_LABEL[order.status];
  const next = NEXT_STATUS[order.status];
  const terminal = order.status === "COMPLETED" || order.status === "CANCELLED";

  async function advance() {
    if (!next) return;
    setBusy(true);
    try {
      setOrder(await updateOrderStatus(order!.id, next));
    } finally {
      setBusy(false);
    }
  }

  return (
    <VendorLayout businessName={business.name}>
      <Button variant="ghost" onClick={() => navigate("/vendor/orders")}>← Back to Orders</Button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <h1 style={{ margin: 0 }}>Order #{order.order_number}</h1>
        <StatusPill status={order.status} />
      </div>

      <div style={{ maxWidth: 520, marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        <section style={card}>
          <Meta label="Customer" value={order.customer_name || "Guest"} />
          <Meta label="Source" value={order.source} />
          <Meta label="Placed" value={new Date(order.placed_at).toLocaleString()} />
          <Meta label="Payment" value={order.payment_status} />
        </section>

        <section style={card}>
          <h3 style={{ marginTop: 0 }}>Items</h3>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span>{it.quantity} × {it.item_name}</span>
              <span>{formatINR(Number(it.line_total))}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid var(--color-border)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
            <span>Total</span><span>{formatINR(Number(order.total))}</span>
          </div>
        </section>

        {!terminal && nextLabel && (
          <Button onClick={advance} disabled={busy}>{busy ? "…" : nextLabel}</Button>
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

const card: React.CSSProperties = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 18, boxShadow: "var(--shadow-card)" };
