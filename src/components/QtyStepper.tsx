interface Props {
  qty: number;
  onDec: () => void;
  onInc: () => void;
  disabled?: boolean;
}

/** Circular red +/- stepper with the quantity between, matching the mockup. */
export function QtyStepper({ qty, onDec, onInc, disabled }: Props) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button
        aria-label="Decrease"
        onClick={onDec}
        disabled={disabled || qty === 0}
        style={circle(qty === 0 || disabled)}
      >
        −
      </button>
      <span style={{ minWidth: 18, textAlign: "center", fontWeight: 600 }}>{qty}</span>
      <button aria-label="Increase" onClick={onInc} disabled={disabled} style={circle(disabled)}>
        +
      </button>
    </div>
  );
}

const circle = (dim?: boolean): React.CSSProperties => ({
  width: 30,
  height: 30,
  borderRadius: "50%",
  border: "none",
  background: "var(--color-primary)",
  color: "#fff",
  fontSize: 18,
  lineHeight: 1,
  display: "grid",
  placeItems: "center",
  opacity: dim ? 0.4 : 1,
  cursor: dim ? "not-allowed" : "pointer",
});
