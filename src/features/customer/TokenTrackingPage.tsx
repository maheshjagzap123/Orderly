import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getOrderTrackingByToken, type OrderTracking } from "@/lib/publicApi";
import { Button } from "@/components/ui/Button";
import { formatINR, publicPath } from "@/lib/format";
import { LoadingState, ErrorState, EmptyState } from "@/components/ui/States";
import type { OrderStatus } from "@/lib/database.types";

/**
 * Secure, shareable tracking page: /track/:token
 *
 * Reads ONLY safe public fields through the token RPC (migration 0006) — no
 * internal ids or payment references. Because the id is never exposed, live
 * updates use a light poll of the same RPC until the order reaches a terminal
 * state.
 */

const STAGES = ["Order Received", "Preparing Your Order", "Order Completed"];

function stageIndex(status: OrderStatus): number {
  switch (status) {
    case "NEW":
      return 0;
    case "ACCEPTED":
    case "PREPARING":
    case "READY":
      return 1;
    case "COMPLETED":
      return 2;
    default:
      return 0;
  }
}

export function TokenTrackingPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<OrderTracking | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await getOrderTrackingByToken(token);
      if (!res) {
        setStatus("notfound");
        return;
      }
      setData(res);
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll for live status until terminal.
  useEffect(() => {
    const terminal = data?.status === "COMPLETED" || data?.status === "CANCELLED";
    if (status !== "ok" || terminal) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(load, 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [status, data?.status, load]);

  if (status === "loading") return <Shell><LoadingState /></Shell>;
  if (status === "notfound")
    return (
      <Shell>
        <EmptyState icon="🔍" title="Order not found" message="This tracking link is invalid or has expired." />
      </Shell>
    );
  if (status === "error" || !data)
    return (
      <Shell>
        <ErrorState onRetry={load} />
      </Shell>
    );

  const idx = stageIndex(data.status);
  const cancelled = data.status === "CANCELLED";
  const estimate =
    data.prepTimeMin && data.prepTimeMax
      ? `${data.prepTimeMin}–${data.prepTimeMax} min`
      : data.prepTimeMin
      ? `~${data.prepTimeMin} min`
      : null;
  const trackUrl = `${window.location.origin}/track/${token}`;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `Order #${data!.orderNumber}`, url: trackUrl });
        return;
      }
    } catch {
      /* cancelled */
    }
    try {
      await navigator.clipboard.writeText(trackUrl);
    } catch {
      /* no clipboard */
    }
  }

  return (
    <Shell>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44 }} aria-hidden>
          {cancelled ? "⚠️" : "✅"}
        </div>
        <div style={{ color: "var(--color-text-muted)", fontSize: 14 }}>{data.businessName}</div>
        <h2 style={{ margin: "6px 0" }}>{cancelled ? "Order Cancelled" : "Order Confirmed"}</h2>
        <div style={{ fontSize: 32, fontWeight: 800, color: "var(--color-primary)" }}>#{data.orderNumber}</div>
        <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>Total {formatINR(data.total)}</div>
        {!cancelled && estimate && idx < 2 && (
          <div style={{ color: "var(--color-text-muted)", marginTop: 2, fontSize: 14 }}>
            Estimated preparation: <strong>{estimate}</strong>
          </div>
        )}

        {cancelled && (
          <div style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", padding: "10px 12px", borderRadius: 10, fontSize: 14, margin: "14px 0" }}>
            This order was cancelled. {data.cancelReason ? `Reason: ${data.cancelReason}.` : ""} If you were charged, your payment will be refunded.
          </div>
        )}

        {!cancelled && (
          <div style={{ textAlign: "left", margin: "22px 0" }}>
            {STAGES.map((label, i) => {
              const done = i < idx;
              const current = i === idx;
              const reached = i <= idx;
              const dotBg = done ? "var(--color-positive)" : current ? "var(--color-primary)" : "transparent";
              return (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0", position: "relative" }}>
                  {i < STAGES.length - 1 && (
                    <span aria-hidden style={{ position: "absolute", left: 10, top: 26, width: 2, height: 18, background: done ? "var(--color-positive)" : "var(--color-border)" }} />
                  )}
                  <span
                    aria-hidden
                    style={{
                      width: 22, height: 22, borderRadius: "50%", background: dotBg,
                      border: reached ? "none" : "2px solid var(--color-border)", color: "#fff",
                      display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0,
                      boxShadow: current ? "0 0 0 4px rgba(239,59,50,0.15)" : "none",
                    }}
                  >
                    {done ? "✓" : current ? "●" : ""}
                  </span>
                  <span style={{ fontWeight: current ? 700 : 400, color: reached ? "var(--color-text)" : "var(--color-text-muted)" }}>{label}</span>
                </div>
              );
            })}
          </div>
        )}

        {!cancelled && (data.status === "READY" || data.status === "COMPLETED") && (
          <div style={{ background: "var(--color-positive-bg)", color: "var(--color-positive)", padding: "14px 12px", borderRadius: 10, fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
            🔔 Please collect your order from the counter.
          </div>
        )}

        {data.items.length > 0 && (
          <div style={{ textAlign: "left", background: "var(--color-bg)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
            {data.items.map((it, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "2px 0" }}>
                <span>{it.quantity} × {it.item_name}</span>
                <span>{formatINR(Number(it.line_total))}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <Button fullWidth onClick={() => navigate(`/order/${publicPath({ slug: data.businessSlug, public_code: data.businessPublicCode })}`)}>
            Order Again
          </Button>
          <Button variant="secondary" fullWidth onClick={share}>
            🔗 Share
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 420, background: "var(--color-surface)", borderRadius: 16, padding: 24, boxShadow: "var(--shadow-card)" }}>
        {children}
      </div>
    </div>
  );
}
