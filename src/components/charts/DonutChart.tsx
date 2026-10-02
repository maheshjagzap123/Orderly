export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

/**
 * Clean SVG donut with a center total and a legend.
 * Used for Order Status and Order Source analytics.
 */
export function DonutChart({
  slices,
  centerValue,
  centerLabel,
  size = 150,
}: {
  slices: DonutSlice[];
  centerValue: string | number;
  centerLabel: string;
  size?: number;
}) {
  const total = slices.reduce((s, d) => s + d.value, 0);
  const stroke = size * 0.16;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;

  let offset = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = total > 0 ? s.value / total : 0;
      const len = frac * circ;
      const arc = { ...s, dash: `${len} ${circ - len}`, dashOffset: -offset };
      offset += len;
      return arc;
    });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${centerLabel} donut chart`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-bg)" strokeWidth={stroke} />
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={stroke}
            strokeDasharray={a.dash}
            strokeDashoffset={a.dashOffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={size * 0.2} fontWeight={800} fill="var(--color-text)">
          {centerValue}
        </text>
        <text x={cx} y={cy + size * 0.13} textAnchor="middle" fontSize={size * 0.08} fill="var(--color-text-muted)">
          {centerLabel}
        </text>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 120 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: s.color, display: "inline-block", flexShrink: 0 }} />
            <span style={{ flex: 1, color: "var(--color-text-muted)" }}>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
