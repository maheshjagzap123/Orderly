import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getOrderByNumber, getOrderTrackingByToken } from "@/lib/publicApi";
import { Button } from "@/components/ui/Button";
import { formatINR, publicPath } from "@/lib/format";
import type { Business, Order, OrderStatus } from "@/lib/database.types";

/**
 * Customer-facing tracker. Mirrors the unified 2-step vendor workflow as a
 * simple 3-stage progress:  Order Received → Preparing → Completed.
 * The DB may still carry ACCEPTED / READY; those collapse into "Preparing"
 * (READY additionally surfaces a "collect at counter" message).
 */

const STAGES: { key: string; label: string }[] = [
  { key: "RECEIVED", label: "Order Received" },
  { key: "PREPARING", label: "Preparing Your Order" },
  { key: "COMPLETED", label: "Order Completed" },
];

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

function prepEstimate(b: Business): string | null {
  const min = b.prep_time_min;
  const max = b.prep_time_max;
  if (min && max) return `${min}–${max} min`;
  if (min) return `~${min} min`;
  if (max) return `~${max} min`;
  return null;
}

export function OrderTracker({
  business,
  orderNumber,
  trackToken,
  onClose,
  autoCloseMs,
}: {
  business: Business;
  orderNumber: number;
  /** Optional secure tracking token (preferred share path). */
  trackToken?: string | null;
  onClose: () => void;
  /** When set, auto-dismiss the confirmation after this many ms (kiosk flow). */
  autoCloseMs?: number;
}) {
  const [status, setStatus] = useState<OrderStatus | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [items, setItems] = useState<{ item_name: string; quantity: number; line_total: number }[]>([]);

  // Kiosk: close the confirmation on its own so the next customer gets a fresh
  // menu without anyone tapping. QR orders leave this unset and stay open so the
  // customer can keep tracking their order.
  useEffect(() => {
    if (!autoCloseMs) return;
    const t = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(t);
  }, [autoCloseMs, onClose]);

  useEffect(() => {
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    async function loadViaToken(token: string) {
      const t = await getOrderTrackingByToken(token);
      if (!active || !t) return;
      setStatus(t.status);
      setTotal(t.total);
      setItems(t.items);
      // No internal id is exposed via the token path, so poll for live status
      // until the order reaches a terminal state.
      if (t.status !== "COMPLETED" && t.status !== "CANCELLED") {
        poll = setInterval(async () => {
          const next = await getOrderTrackingByToken(token);
          if (!active || !next) return;
          setStatus(next.status);
          if (next.status === "COMPLETED" || next.status === "CANCELLED") {
            if (poll) clearInterval(poll);
          }
        }, 5000);
      }
    }

    async function loadViaNumber() {
      // Legacy fallback (used only when no token is available). Requires a
      // readable orders row; post-0006 this works for the owner, not anon.
      const res = await getOrderByNumber(business.id, orderNumber);
      if (!active || !res) return;
      setStatus(res.order.status);
      setTotal(Number(res.order.total));
      setItems(res.items.map((it) => ({ item_name: it.item_name, quantity: it.quantity, line_total: Number(it.line_total) })));
      channel = supabase
        .channel(`order:${res.order.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${res.order.id}` },
          (payload) => setStatus((payload.new as Order).status)
        )
        .subscribe();
    }

    if (trackToken) loadViaToken(trackToken);
    else loadViaNumber();

    return () => {
      active = false;
      if (channel) supabase.removeChannel(channel);
      if (poll) clearInterval(poll);
    };
  }, [business.id, orderNumber, trackToken]);

  const idx = status ? stageIndex(status) : 0;
  const cancelled = status === "CANCELLED";
  const estimate = prepEstimate(business);

  // Prefer the secure token link; fall back to the slug/number link.
  const trackUrl = trackToken
    ? `${window.location.origin}/track/${trackToken}`
    : `${window.location.origin}/order/${publicPath(business)}/track/${orderNumber}`;

  async function share() {
    const shareData = { title: `Order #${orderNumber}`, text: `Track my order at ${business.name}`, url: trackUrl };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      /* user cancelled share — fall through to copy */
    }
    try {
      await navigator.clipboard.writeText(trackUrl);
    } catch {
      /* clipboard unavailable — nothing more we can do silently */
    }
  }

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 44 }} aria-hidden>
        {cancelled ? "⚠️" : "✅"}
      </div>
      <h2 style={{ margin: "6px 0" }}>{cancelled ? "Order Cancelled" : "Order Confirmed"}</h2>
      <div style={{ fontSize: 32, fontWeight: 800, color: "var(--color-primary)" }}>#{orderNumber}</div>
      {total != null && (
        <div style={{ color: "var(--color-text-muted)", marginTop: 4 }}>
          Total {formatINR(total)}
        </div>
      )}
      {!cancelled && estimate && idx < 2 && (
        <div style={{ color: "var(--color-text-muted)", marginTop: 2, fontSize: 14 }}>
          Estimated preparation: <strong>{estimate}</strong>
        </div>
      )}

      {cancelled && (
        <div style={{ background: "var(--color-danger-bg)", color: "var(--color-danger)", padding: "10px 12px", borderRadius: 10, fontSize: 14, margin: "14px 0" }}>
          This order was cancelled. If you were charged, your payment will be refunded.
        </div>
      )}

      {/* 3-stage timeline */}
      {!cancelled && (
        <div style={{ textAlign: "left", margin: "22px 0" }}>
          {STAGES.map((s, i) => {
            const done = i < idx;
            const current = i === idx;
            const reached = i <= idx;
            const dotBg = done ? "var(--color-positive)" : current ? "var(--color-primary)" : "transparent";
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0", position: "relative" }}>
                {i < STAGES.length - 1 && (
                  <span
                    aria-hidden
                    style={{ position: "absolute", left: 10, top: 26, width: 2, height: 18, background: done ? "var(--color-positive)" : "var(--color-border)" }}
                  />
                )}
                <span
                  aria-hidden
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: dotBg,
                    border: reached ? "none" : "2px solid var(--color-border)",
                    color: "#fff",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    flexShrink: 0,
                    boxShadow: current ? "0 0 0 4px rgba(239,59,50,0.15)" : "none",
                  }}
                >
                  {done ? "✓" : current ? "●" : ""}
                </span>
                <span style={{ fontWeight: current ? 700 : 400, color: reached ? "var(--color-text)" : "var(--color-text-muted)" }}>
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!cancelled && (status === "READY" || status === "COMPLETED") && (
        <div style={{ background: "var(--color-positive-bg)", color: "var(--color-positive)", padding: "14px 12px", borderRadius: 10, fontSize: 15, fontWeight: 600, marginBottom: 14, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
          🔔 Please collect your order from the counter.
        </div>
      )}

      {items.length > 0 && (
        <div style={{ textAlign: "left", background: "var(--color-bg)", borderRadius: 10, padding: 12, marginBottom: 14 }}>
          {items.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "2px 0" }}>
              <span>
                {it.quantity} × {it.item_name}
              </span>
              <span>{formatINR(Number(it.line_total))}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <Button fullWidth onClick={onClose}>
          Order Again
        </Button>
        <Button variant="secondary" fullWidth onClick={share}>
          🔗 Share
        </Button>
      </div>
      <button
        onClick={onClose}
        style={{ background: "none", border: "none", color: "var(--color-text-muted)", fontSize: 13, marginTop: 12, cursor: "pointer" }}
      >
        ← Back to Menu
      </button>
    </div>
  );
}
