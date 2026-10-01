export interface ComboPoint {
  label: string;
  bar: number;   // e.g. orders
  line: number;  // e.g. revenue
}

/**
 * Lightweight SVG combo chart: bars (left axis) + line (right axis).
 * No external charting dependency.
 */
export function ComboChart({ data, barLabel = "Orders", lineLabel = "Revenue" }: { data: ComboPoint[]; barLabel?: string; lineLabel?: string }) {
  const W = 560, H = 220, padL = 36, padR = 44, padB = 28, padT = 12;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxBar = Math.max(1, ...data.map((d) => d.bar));
  const maxLine = Math.max(1, ...data.map((d) => d.line));
  const n = data.length || 1;
  const slot = innerW / n;
  const barW = Math.min(28, slot * 0.5);

  const linePts = data.map((d, i) => {
    const x = padL + slot * i + slot / 2;
    const y = padT + innerH - (d.line / maxLine) * innerH;
    return [x, y] as const;
  });
  const linePath = linePts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");

  return (
    <div>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "#bcd3ff", borderRadius: 2, marginRight: 5 }} />{barLabel}</span>
        <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--color-primary)", borderRadius: 2, marginRight: 5 }} />{lineLabel}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Sales overview chart">
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = padT + innerH - t * innerH;
          return <line key={t} x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--color-border)" strokeWidth={1} />;
        })}
        {/* bars */}
        {data.map((d, i) => {
          const x = padL + slot * i + slot / 2 - barW / 2;
          const h = (d.bar / maxBar) * innerH;
          const y = padT + innerH - h;
          return <rect key={i} x={x} y={y} width={barW} height={h} rx={3} fill="#bcd3ff" />;
        })}
        {/* line */}
        <path d={linePath} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} />
        {linePts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill="var(--color-primary)" />)}
        {/* x labels */}
        {data.map((d, i) => (
          <text key={i} x={padL + slot * i + slot / 2} y={H - 8} fontSize={10} textAnchor="middle" fill="var(--color-text-muted)">
            {d.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
