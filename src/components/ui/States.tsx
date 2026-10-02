import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * Shared, reusable UI state components used across customer + vendor screens so
 * loading / empty / error presentation is consistent and never leaks raw
 * database errors to end users.
 */

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "grid",
        placeItems: "center",
        minHeight: 160,
        gap: 10,
        color: "var(--color-text-muted)",
        padding: 24,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: "3px solid var(--color-border)",
          borderTopColor: "var(--color-primary)",
          animation: "orderly-spin 0.8s linear infinite",
        }}
      />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  icon = "📭",
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        gap: 8,
        padding: "40px 20px",
        color: "var(--color-text-muted)",
      }}
    >
      <div style={{ fontSize: 40 }} aria-hidden>
        {icon}
      </div>
      <div style={{ fontWeight: 700, color: "var(--color-text)", fontSize: 16 }}>{title}</div>
      {message && <div style={{ fontSize: 14, maxWidth: 320 }}>{message}</div>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}

export function RetryButton({ onRetry, label = "Try again" }: { onRetry: () => void; label?: string }) {
  return (
    <Button variant="secondary" onClick={onRetry}>
      ↻ {label}
    </Button>
  );
}

export function ErrorState({
  title = "Something went wrong.",
  message = "Please try again.",
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        gap: 8,
        padding: "40px 20px",
      }}
    >
      <div style={{ fontSize: 40 }} aria-hidden>
        ⚠️
      </div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
      <div style={{ fontSize: 14, color: "var(--color-text-muted)", maxWidth: 320 }}>{message}</div>
      {onRetry && (
        <div style={{ marginTop: 8 }}>
          <RetryButton onRetry={onRetry} />
        </div>
      )}
    </div>
  );
}
