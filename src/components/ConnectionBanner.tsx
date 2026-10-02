import { useEffect, useRef, useState } from "react";

/**
 * Thin realtime-connection indicator for vendor views.
 * Shows "Reconnecting…" while disconnected and a brief "Connected ✓" when it
 * comes back, then hides itself. Nothing is shown on the very first connect.
 */
export function ConnectionBanner({ connected }: { connected: boolean }) {
  const [show, setShow] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const wasDisconnected = useRef(false);

  useEffect(() => {
    if (!connected) {
      wasDisconnected.current = true;
      setReconnected(false);
      setShow(true);
      return;
    }
    // Connected now.
    if (wasDisconnected.current) {
      setReconnected(true);
      setShow(true);
      const t = setTimeout(() => setShow(false), 2500);
      return () => clearTimeout(t);
    }
    setShow(false);
  }, [connected]);

  if (!show) return null;

  return (
    <div
      style={{
        ...bar,
        background: reconnected ? "#dcfce7" : "#fef3c7",
        color: reconnected ? "#166534" : "#92400e",
      }}
      role="status"
      aria-live="polite"
    >
      {reconnected ? "✓ Connected — orders are live." : "⟳ Reconnecting… trying to restore live orders."}
    </div>
  );
}

const bar: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 14,
  textAlign: "center",
};
