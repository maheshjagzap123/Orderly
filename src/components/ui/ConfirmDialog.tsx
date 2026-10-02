import { useEffect } from "react";
import { Button } from "./Button";

/**
 * Accessible, styled confirmation modal — a drop-in replacement for the native
 * blocking `confirm()`. Closes on Escape or backdrop click.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      style={backdrop}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: "0 0 8px" }}>{title}</h3>
        {message && <p style={{ color: "var(--color-text-muted)", fontSize: 14, margin: "0 0 18px" }}>{message}</p>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

const backdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  zIndex: 60,
  display: "grid",
  placeItems: "center",
  padding: 16,
};
const sheet: React.CSSProperties = {
  background: "var(--color-surface)",
  borderRadius: 14,
  padding: 22,
  width: "100%",
  maxWidth: 380,
  boxShadow: "var(--shadow-card)",
};
