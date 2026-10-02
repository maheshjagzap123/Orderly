import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { VendorLayout } from "./VendorLayout";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { publicPath } from "@/lib/format";

export function QrPage() {
  const navigate = useNavigate();
  const { business, loading } = useVendorBusiness();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  const orderingUrl = business ? `${window.location.origin}/order/${publicPath(business)}` : "";

  useEffect(() => {
    if (business && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, orderingUrl, { width: 260, margin: 2 }, (err) => {
        if (err) console.error(err);
      });
    }
  }, [business, orderingUrl]);

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${business!.slug}-qr.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  async function print() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head><title>${business!.name} — Scan to Order</title></head>
      <body style="text-align:center;font-family:system-ui;padding:40px">
        <h1>${business!.name}</h1>
        <p style="color:#555">Scan to order from your phone</p>
        <img src="${dataUrl}" style="width:320px" />
        <p style="color:#888;font-size:12px">${orderingUrl}</p>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  async function copy() {
    await navigator.clipboard.writeText(orderingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: business!.name, text: "Order from " + business!.name, url: orderingUrl });
      } catch {
        /* user cancelled */
      }
    } else {
      copy();
    }
  }

  return (
    <VendorLayout businessName={business.name}>
      <h1 style={{ marginTop: 0 }}>Your Ordering QR Code</h1>
      <p style={{ color: "var(--color-text-muted)", marginTop: -8 }}>
        Print this once and keep using it. The QR encodes your permanent ordering link, not the menu — so it never changes.
      </p>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={qrCard}>
          <canvas ref={canvasRef} />
          <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 10, wordBreak: "break-all", maxWidth: 260 }}>
            {orderingUrl}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 220 }}>
          <Button onClick={download}>⬇ Download QR</Button>
          <Button variant="secondary" onClick={print}>🖨 Print QR</Button>
          <Button variant="secondary" onClick={copy}>{copied ? "✓ Copied" : "🔗 Copy URL"}</Button>
          <Button variant="secondary" onClick={share}>↗ Share</Button>
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--color-text-muted)" }}>
            One permanent QR per stall. Unlimited customers can scan it; each checkout becomes its own order.
          </div>
        </div>
      </div>
    </VendorLayout>
  );
}

const qrCard: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 16,
  padding: 20,
  boxShadow: "var(--shadow-card)",
  textAlign: "center",
};
