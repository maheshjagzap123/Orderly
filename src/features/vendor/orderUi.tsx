import type { Order, OrderStatus } from "@/lib/database.types";

/**
 * Final 2-step vendor flow (no Accepted/Ready UI sections):
 *   NEW --(Accept Order)--> PREPARING --(Mark as Done)--> COMPLETED
 * Accepting an order puts it straight into Preparing; Mark as Done completes it.
 * (Legacy ACCEPTED/READY rows are shown under Preparing and also complete on Mark as Done.)
 */
export function vendorNextStatus(status: Order["status"]): OrderStatus | null {
  switch (status) {
    case "NEW": return "PREPARING";
    case "ACCEPTED": return "COMPLETED";
    case "PREPARING": return "COMPLETED";
    case "READY": return "COMPLETED";
    default: return null;
  }
}

/** Primary-action label for each stage. */
export function primaryActionLabel(status: Order["status"]): string {
  switch (status) {
    case "NEW": return "Accept Order";
    default: return "Mark as Done";
  }
}

/** Button color: Accept Order = green (success), Mark as Done = blue (info). */
export function actionVariant(status: Order["status"]): "success" | "info" {
  return status === "NEW" ? "success" : "info";
}

/** The two active sections, in display order: Preparing first, then New. */
export const ACTIVE_GROUPS: { key: "PREPARING" | "NEW"; label: string; emoji: string; border: string }[] = [
  { key: "PREPARING", label: "Preparing", emoji: "🔥", border: "#f59e0b" },
  { key: "NEW", label: "New Orders", emoji: "🟠", border: "#f97316" },
];

/** Colored payment dot + label. */
export function PaymentDot({ status }: { status: Order["payment_status"] }) {
  const map: Record<string, { label: string; color: string }> = {
    SUCCESS: { label: "Paid", color: "var(--color-positive)" },
    PENDING: { label: "Pending", color: "var(--color-warning)" },
    INITIATED: { label: "Unpaid", color: "var(--color-text-muted)" },
    FAILED: { label: "Failed", color: "var(--color-danger)" },
    CANCELLED: { label: "Cancelled", color: "var(--color-text-muted)" },
    REFUNDED: { label: "Refunded", color: "var(--color-info)" },
  };
  const m = map[status] ?? { label: status, color: "var(--color-text-muted)" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13, color: m.color }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, display: "inline-block" }} />
      {m.label}
    </span>
  );
}
