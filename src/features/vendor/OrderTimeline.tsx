import type { Order, OrderStatus } from "@/lib/database.types";

/**
 * The single, authoritative 3-stage order timeline that mirrors the unified
 * 2-step vendor workflow:
 *
 *   Order Received  →  Preparing  →  Completed
 *
 * The database still has ACCEPTED / READY for forward-compatibility; those are
 * collapsed here so the UI never shows stages the vendor doesn't operate.
 */

const STAGES: { key: "RECEIVED" | "PREPARING" | "COMPLETED"; label: string }[] = [
  { key: "RECEIVED", label: "Order Received" },
  { key: "PREPARING", label: "Preparing" },
  { key: "COMPLETED", label: "Completed" },
];

/** Map any DB status onto a 0..2 stage index. */
export function stageIndex(status: OrderStatus): number {
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

export function OrderTimeline({ order }: { order: Order }) {
  if (order.status === "CANCELLED") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <TimelineRow label="Order Received" state="done" />
        <Connector done />
        <TimelineRow label="Cancelled" state="cancelled" />
        {order.cancel_reason && (
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 6, paddingLeft: 34 }}>
            Reason: {order.cancel_reason}
          </div>
        )}
      </div>
    );
  }

  const idx = stageIndex(order.status);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {STAGES.map((s, i) => {
        const state: RowState = i < idx ? "done" : i === idx ? "current" : "pending";
        return (
          <div key={s.key}>
            <TimelineRow label={s.label} state={state} />
            {i < STAGES.length - 1 && <Connector done={i < idx} />}
          </div>
        );
      })}
    </div>
  );
}

type RowState = "done" | "current" | "pending" | "cancelled";

function TimelineRow({ label, state }: { label: string; state: RowState }) {
  const palette: Record<RowState, { bg: string; fg: string; mark: string }> = {
    done: { bg: "var(--color-positive)", fg: "var(--color-text)", mark: "✓" },
    current: { bg: "var(--color-primary)", fg: "var(--color-text)", mark: "●" },
    pending: { bg: "transparent", fg: "var(--color-text-muted)", mark: "" },
    cancelled: { bg: "var(--color-danger)", fg: "var(--color-text)", mark: "✕" },
  };
  const p = palette[state];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span
        aria-hidden
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: p.bg,
          border: state === "pending" ? "2px solid var(--color-border)" : "none",
          color: "#fff",
          display: "grid",
          placeItems: "center",
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {p.mark}
      </span>
      <span style={{ fontWeight: state === "current" ? 700 : 500, color: p.fg }}>{label}</span>
    </div>
  );
}

function Connector({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width: 2,
        height: 16,
        marginLeft: 10,
        background: done ? "var(--color-positive)" : "var(--color-border)",
      }}
    />
  );
}
