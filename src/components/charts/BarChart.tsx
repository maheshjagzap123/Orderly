import { useId, useState } from "react";

export interface BarPoint {
  label: string;
  value: number;
}

/** Modern SVG bar chart (e.g. peak hours): gradient rounded bars, highlighted peak, hover tooltip. */
export function BarChart({ data, color = "var(--color-primary)" }: { data: BarPoint[]; color?: string }) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const W = 560, H = 150, padL = 14, padR = 14, padB = 22, padT = 12;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.value));
  const maxIdx = data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  const n = data.length || 1;
  const slot = innerW / n;
  const barW = Math.min(16, slot * 0.62);

  const xOf = (i: number) => padL + slot * i + slot / 2;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Peak hours chart" style={{ display: "block", maxHeight: H }}>
        <defs>
          <linearGradient id={`peak-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id={`peak-dim-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f6c9c5" />
            <stop offset="100%" stopColor="#fbe4e2" />
          </linearGradient>
        </defs>

        {data.map((d, i) => {
          const h = (d.value / max) * innerH;
          const x = xOf(i) - barW / 2;
          const y = padT + innerH - h;
          const isPeak = i === maxIdx && d.value > 0;
          const active = hover === i;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(h, 1)}
                rx={5}
                fill={isPeak || active ? `url(#peak-${uid})` : `url(#peak-dim-${uid})`}
              />
              {(i % 2 === 0 || isPeak) && (
                <text x={xOf(i)} y={H - 7} fontSize={9} textAnchor="middle" fill="var(--color-text-muted)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}

        {/* hover hit areas */}
        {data.map((_, i) => (
          <rect
            key={i}
            x={padL + slot * i}
            y={padT}
            width={slot}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>

      {hover != null && data[hover] && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${(xOf(hover) / W) * 100}%`,
            transform: "translateX(-50%)",
            background: "var(--color-text)",
            color: "#fff",
            fontSize: 11,
            padding: "5px 9px",
            borderRadius: 8,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
          }}
        >
          <strong>{data[hover].label}</strong> · {data[hover].value} orders
        </div>
      )}
    </div>
  );
}
