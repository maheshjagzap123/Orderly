import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "positive" | "success" | "danger" | "warning" | "info";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  children: ReactNode;
}

const base: React.CSSProperties = {
  border: "1px solid transparent",
  borderRadius: 10,
  padding: "11px 16px",
  fontWeight: 600,
  fontSize: 15,
  transition: "background 0.15s, opacity 0.15s",
};

const variants: Record<Variant, React.CSSProperties> = {
  primary: { background: "var(--color-primary)", color: "#fff" },
  positive: { background: "var(--color-positive)", color: "#fff" },
  success: { background: "var(--color-positive)", color: "#fff" },
  danger: { background: "var(--color-danger)", color: "#fff" },
  warning: { background: "var(--color-warning)", color: "#fff" },
  info: { background: "var(--color-info)", color: "#fff" },
  secondary: { background: "#fff", color: "var(--color-text)", borderColor: "var(--color-border)" },
  ghost: { background: "transparent", color: "var(--color-text-muted)" },
};

export function Button({ variant = "primary", fullWidth, style, disabled, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        ...base,
        ...variants[variant],
        width: fullWidth ? "100%" : undefined,
        opacity: disabled ? 0.6 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
