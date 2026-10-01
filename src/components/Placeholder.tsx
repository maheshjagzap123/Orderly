import { useParams } from "react-router-dom";

/** Temporary placeholder for a screen that isn't built yet. */
export function Placeholder({ title }: { title: string }) {
  const params = useParams();
  return (
    <div style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ color: "var(--color-primary)" }}>{title}</h1>
      <p style={{ color: "var(--color-text-muted)" }}>
        This screen is scaffolded and will be implemented next.
      </p>
      {Object.keys(params).length > 0 && (
        <pre
          style={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius)",
            padding: 12,
          }}
        >
          {JSON.stringify(params, null, 2)}
        </pre>
      )}
    </div>
  );
}
