import { useId, useState } from "react";
import { formatINR } from "@/lib/format";

export interface ComboPoint {
  label: string;
  bar: number;   // e.g. orders
  line: number;  // e.g. revenue
}

/**
 * Modern SVG combo chart: soft rounded bars (orders) + a smooth gradient area
 * line (revenue), subtle gridlines and an interactive hover tooltip.
 * No external charting dependency.
 */
export function ComboChart({ data, barLabel = "Orders", lineLabel = "Revenue" }: { data: ComboPoint[]; barLabel?: string; lineLabel?: string }) {
  const uid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const W = 560, H = 180, padL = 30, padR = 16, padB = 26, padT = 14;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const maxBar = Math.max(1, ...data.map((d) => d.bar));
  const maxLine = Math.max(1, ...data.map((d) => d.line));
  const n = data.length || 1;
  const slot = innerW / n;
  const barW = Math.min(18, slot * 0.4);

  const xOf = (i: number) => padL + slot * i + slot / 2;
  const yLine = (v: number) => padT + innerH - (v / maxLine) * innerH;

  const linePts = data.map((d, i) => [xOf(i), yLine(d.line)] as const);
  const smooth = smoothPath(linePts);
  const areaPath =
    smooth +
    ` L${linePts[linePts.length - 1]?.[0] ?? padL},${padT + innerH}` +
    ` L${linePts[0]?.[0] ?? padL},${padT + innerH} Z`;

  return (
    <div style={{ position: "relative" }}>
      <div style={legend}>
        <span style={legendItem}><span style={{ ...dot, background: "#dbe5ff" }} />{barLabel}</span>
        <span style={legendItem}><span style={{ ...dot, background: "var(--color-primary)" }} />{lineLabel}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Sales overview chart" style={{ display: "block", maxHeight: H }}>
        <defs>
          <linearGradient id={`bar-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c9d9ff" />
            <stop offset="100%" stopColor="#eaf1ff" />
          </linearGradient>
          <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* gridlines */}
        {[0, 0.5, 1].map((t) => {
          const y = padT + innerH - t * innerH;
          return <line key={t} x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3 4" />;
        })}

        {/* bars */}
        {data.map((d, i) => {
          const x = xOf(i) - barW / 2;
          const h = (d.bar / maxBar) * innerH;
          const y = padT + innerH - h;
          const active = hover === i;
          return <rect key={i} x={x} y={y} width={barW} height={Math.max(h, 1)} rx={5} fill={`url(#bar-${uid})`} opacity={active ? 1 : 0.9} />;
        })}

        {/* revenue area + line */}
        <path d={areaPath} fill={`url(#area-${uid})`} />
        <path d={smooth} fill="none" stroke="var(--color-primary)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        {linePts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={hover === i ? 5 : 3} fill="#fff" stroke="var(--color-primary)" strokeWidth={2} />
        ))}

        {/* x labels */}
        {data.map((d, i) => (
          <text key={i} x={xOf(i)} y={H - 8} fontSize={10} textAnchor="middle" fill="var(--color-text-muted)">
            {d.label}
          </text>
        ))}

        {/* hover hit areas + guide */}
        {hover != null && (
          <line x1={xOf(hover)} x2={xOf(hover)} y1={padT} y2={padT + innerH} stroke="var(--color-border)" strokeWidth={1} />
        )}
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
        <Tooltip x={(xOf(hover) / W) * 100}>
          <strong>{data[hover].label}</strong>
          <div>{barLabel}: {data[hover].bar}</div>
          <div>{lineLabel}: {formatINR(data[hover].line)}</div>
        </Tooltip>
      )}
    </div>
  );
}

/** Catmull-Rom → cubic Bézier smoothing for a clean revenue curve. */
function smoothPath(pts: readonly (readonly [number, number])[]): string {
  if (pts.length === 0) return "";
  if (pts.length < 3) return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function Tooltip({ x, children }: { x: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: `${x}%`,
        transform: "translateX(-50%)",
        background: "var(--color-text)",
        color: "#fff",
        fontSize: 11,
        lineHeight: 1.5,
        padding: "6px 9px",
        borderRadius: 8,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
      }}
    >
      {children}
    </div>
  );
}

const legend: React.CSSProperties = { display: "flex", gap: 16, fontSize: 12, color: "var(--color-text-muted)", marginBottom: 4 };
const legendItem: React.CSSProperties = { display: "inline-flex", alignItems: "center" };
const dot: React.CSSProperties = { display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5 };
