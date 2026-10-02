import type { Order } from "@/lib/database.types";

/** Clear primary-action label for each lifecycle stage (matches the reference). */
export function primaryActionLabel(status: Order["status"]): string {
  switch (status) {
    case "NEW": return "Accept Order";
    case "ACCEPTED": return "Mark as Done";
    case "PREPARING": return "Mark as Done";
    case "READY": return "Complete Order";
    default: return "";
  }
}

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
