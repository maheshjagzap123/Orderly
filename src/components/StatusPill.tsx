import type { OrderStatus } from "@/lib/database.types";

const colors: Record<OrderStatus, { bg: string; fg: string }> = {
  NEW: { bg: "#fff3dc", fg: "#a96500" },
  ACCEPTED: { bg: "#eaf2ff", fg: "#2864b5" },
  PREPARING: { bg: "#fff4e5", fg: "#d97706" },
  READY: { bg: "#eaf9ef", fg: "#16804a" },
  COMPLETED: { bg: "#eaf9ef", fg: "#16804a" },
  CANCELLED: { bg: "#fff0ee", fg: "#d7372e" },
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
