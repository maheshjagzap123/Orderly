import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getBusinessBySlug } from "@/lib/publicApi";
import { publicPath } from "@/lib/format";
import { OrderTracker } from "./OrderTracker";
import type { Business } from "@/lib/database.types";

/** Standalone, shareable tracking page: /order/:slug/track/:orderNo */
export function TrackingPage() {
  const { slug, orderNo } = useParams();
  const [business, setBusiness] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBusinessBySlug(slug!)
      .then((b) => (b ? setBusiness(b) : setError("Order page not found")))
      .catch(() => setError("Failed to load"));
  }, [slug]);

  const orderNumber = Number(orderNo);

  if (error) return <Center>{error}</Center>;
  if (!business || Number.isNaN(orderNumber)) return <Center>Loading…</Center>;

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "var(--color-surface)", borderRadius: 16, padding: 24, boxShadow: "var(--shadow-card)" }}>
        <OrderTracker
          business={business}
          orderNumber={orderNumber}
          onClose={() => (window.location.href = `/order/${publicPath(business)}`)}
        />
      </div>
    </div>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", color: "var(--color-text-muted)" }}>{children}</div>
);
