import type { OrderStatus } from "@/lib/database.types";

const colors: Record<OrderStatus, { bg: string; fg: string }> = {
  NEW: { bg: "#fde8e6", fg: "#c42b22" },
  ACCEPTED: { bg: "#e0edff", fg: "#1d4ed8" },
  PREPARING: { bg: "#fef3c7", fg: "#b45309" },
  READY: { bg: "#dcfce7", fg: "#15803d" },
  COMPLETED: { bg: "#eef2f5", fg: "#475569" },
  CANCELLED: { bg: "#f3f4f6", fg: "#6b7280" },
};

const labels: Record<OrderStatus, string> = {
  NEW: "New",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  const c = colors[status];
  return (
    <span
      style={{
        background: c.bg,
        color: c.fg,
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {labels[status]}
    </span>
  );
}
