import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Status = "checking" | "ok" | "error";

/** Dev landing page: verifies the browser can reach Supabase with the anon key. */
export function HealthCheck() {
  const [status, setStatus] = useState<Status>("checking");
  const [detail, setDetail] = useState<string>("");

  useEffect(() => {
    (async () => {
      // Public read of businesses is allowed by RLS; empty result is a success.
      const { error, count } = await supabase
        .from("businesses")
        .select("id", { count: "exact", head: true });

      if (error) {
        setStatus("error");
        setDetail(error.message);
      } else {
        setStatus("ok");
        setDetail(`businesses table reachable (rows: ${count ?? 0})`);
      }
    })();
  }, []);

  const color =
    status === "ok" ? "var(--color-positive)" : status === "error" ? "var(--color-primary)" : "var(--color-text-muted)";

  return (
    <div style={{ padding: 32, maxWidth: 720, margin: "0 auto" }}>
      <h1>Orderly</h1>
      <p style={{ color: "var(--color-text-muted)" }}>Street-food ordering + POS. Dev health check.</p>

      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius)",
          padding: 16,
          boxShadow: "var(--shadow-card)",
        }}
      >
        <strong>Supabase connectivity: </strong>
        <span style={{ color, fontWeight: 600 }}>{status.toUpperCase()}</span>
        <div style={{ color: "var(--color-text-muted)", marginTop: 6 }}>{detail}</div>
      </div>

      <h3 style={{ marginTop: 28 }}>Routes</h3>
      <ul style={{ lineHeight: 1.9 }}>
        <li><a href="/order/mahesh-paratha">/order/:slug</a> — public menu</li>
        <li><a href="/kiosk/mahesh-paratha">/kiosk/:slug</a> — kiosk</li>
        <li><a href="/vendor/login">/vendor/login</a> — vendor login</li>
        <li><a href="/vendor">/vendor</a> — dashboard (guarded)</li>
      </ul>
    </div>
  );
}
