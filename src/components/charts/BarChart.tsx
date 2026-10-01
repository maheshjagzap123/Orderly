export interface BarPoint {
  label: string;
  value: number;
}

/** Lightweight SVG bar chart (e.g. peak hours). Highlights the max bar. */
export function BarChart({ data, color = "var(--color-primary)" }: { data: BarPoint[]; color?: string }) {
  const W = 560, H = 180, padL = 28, padR = 10, padB = 24, padT = 10;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.value));
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const n = data.length || 1;
  const slot = innerW / n;
  const barW = Math.min(22, slot * 0.6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Peak hours chart">
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const x = padL + slot * i + slot / 2 - barW / 2;
        const y = padT + innerH - h;
        const isPeak = i === maxIdx && d.value > 0;
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={h} rx={3} fill={isPeak ? color : "#f3c6c2"} opacity={isPeak ? 1 : 0.7} />
            {i % 2 === 0 && (
              <text x={padL + slot * i + slot / 2} y={H - 8} fontSize={9} textAnchor="middle" fill="var(--color-text-muted)">
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
