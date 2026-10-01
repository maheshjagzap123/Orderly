import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { Business, Item } from "@/lib/database.types";
import { getBusinessBySlug, getMenu, type Menu } from "@/lib/publicApi";
import { formatHours } from "@/lib/format";
import { CartProvider, useCart } from "./cart";
import { CartPanel } from "./CartPanel";
import { CheckoutModal } from "./CheckoutModal";
import { QtyStepper } from "@/components/QtyStepper";
import { formatINR } from "@/lib/format";

const CATEGORY_ICONS: Record<string, string> = {
  "All Items": "🍱",
  Paratha: "🫓",
  Combo: "🍔",
  Beverages: "🥤",
  Sides: "🍟",
};

export function MenuPage({ mode = "QR" }: { mode?: "QR" | "KIOSK" }) {
  const { slug } = useParams();
  const [business, setBusiness] = useState<Business | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const biz = await getBusinessBySlug(slug!);
        if (!biz) {
          setError("This ordering page was not found.");
          return;
        }
        setBusiness(biz);
        setMenu(await getMenu(biz.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load menu");
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) return <Center>Loading menu…</Center>;
  if (error || !business || !menu) return <Center>{error ?? "Something went wrong"}</Center>;

  return (
    <CartProvider taxPercent={Number(business.tax_percent)}>
      <MenuInner business={business} menu={menu} mode={mode} />
    </CartProvider>
  );
}

function MenuInner({ business, menu, mode }: { business: Business; menu: Menu; mode: "QR" | "KIOSK" }) {
  const cart = useCart();
  const [activeCat, setActiveCat] = useState<string>("all");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const canOrder = business.is_open && business.accepting_orders;

  const visibleItems = useMemo(() => {
    if (activeCat === "all") return menu.items;
    return menu.items.filter((i) => i.category_id === activeCat);
  }, [menu.items, activeCat]);

  return (
    <div style={{ paddingBottom: 90 }}>
      {/* Hero */}
      <div style={hero}>
        <div style={heroOverlay} />
        <div style={heroContent}>
          <div style={logoCircle}>🍳</div>
          <div>
            <h1 style={{ margin: 0, color: "#fff", fontSize: 28 }}>{business.name}</h1>
            {business.description && <div style={{ color: "#f0f0f0" }}>{business.description}</div>}
            <div style={{ display: "flex", gap: 16, color: "#f0f0f0", fontSize: 13, marginTop: 8, flexWrap: "wrap" }}>
              {business.address && <span>📍 {business.address}</span>}
              <span>{business.is_open ? "🟢 Open Now" : "🔴 Closed"} · {formatHours(business.open_time, business.close_time)}</span>
            </div>
          </div>
        </div>
      </div>

      {!canOrder && (
        <div style={pausedBanner}>
          {business.is_open ? "Not accepting orders right now." : "This stall is currently closed."} You can still browse the menu.
        </div>
      )}

      {/* Category tabs */}
      <div style={tabBar}>
        <Tab label="All Items" active={activeCat === "all"} onClick={() => setActiveCat("all")} />
        {menu.categories.map((c) => (
          <Tab key={c.id} label={c.name} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />
        ))}
      </div>

      {/* Body: menu grid + cart */}
      <div style={bodyGrid}>
        <div>
          <h2 style={{ marginTop: 0 }}>Our Menu</h2>
          <p style={{ color: "var(--color-text-muted)", marginTop: -8 }}>Delicious food made with fresh ingredients</p>
          <div style={grid}>
            {visibleItems.map((item) => (
              <ItemCard key={item.id} item={item} canOrder={canOrder} />
            ))}
          </div>
        </div>

        {/* Desktop cart */}
        <div style={cartColumn} className="cart-desktop">
          <CartPanel business={business} onCheckout={() => setCheckoutOpen(true)} />
        </div>
      </div>

      {/* Phone sticky bar */}
      {cart.count > 0 && (
        <button style={stickyBar} className="cart-sticky" onClick={() => setDrawerOpen(true)}>
          <span>{cart.count} items</span>
          <span>{formatINR(cart.total)} · View Cart →</span>
        </button>
      )}

      {/* Phone drawer */}
      {drawerOpen && (
        <div style={drawerBackdrop} onClick={() => setDrawerOpen(false)}>
          <div style={drawerSheet} onClick={(e) => e.stopPropagation()}>
            <CartPanel business={business} onCheckout={() => { setDrawerOpen(false); setCheckoutOpen(true); }} />
          </div>
        </div>
      )}

      {checkoutOpen && (
        <CheckoutModal business={business} mode={mode} onClose={() => setCheckoutOpen(false)} />
      )}

      <style>{responsiveCss}</style>
    </div>
  );
}

function ItemCard({ item, canOrder }: { item: Item; canOrder: boolean }) {
  const cart = useCart();
  const qty = cart.qtyOf(item.id);
  const soldOut = !item.is_available;

  return (
    <div style={card}>
      <div style={cardImg}>
        {item.image_url ? <img src={item.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 40 }}>🍽️</span>}
        {item.badge && <span style={badge(item.badge)}>{badgeLabel(item.badge)}</span>}
        {soldOut && <span style={soldOutTag}>Sold Out</span>}
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ fontWeight: 700 }}>{item.name}</div>
        {item.description && <div style={{ color: "var(--color-text-muted)", fontSize: 13, margin: "4px 0 10px" }}>{item.description}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ color: "var(--color-primary)", fontSize: 16 }}>{formatINR(Number(item.price))}</strong>
          <QtyStepper
            qty={qty}
            disabled={soldOut || !canOrder}
            onInc={() => (qty === 0 ? cart.add(item) : cart.setQty(item.id, qty + 1))}
            onDec={() => cart.setQty(item.id, qty - 1)}
          />
        </div>
      </div>
    </div>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={tab(active)}>
      <span>{CATEGORY_ICONS[label] ?? "🍽️"}</span>
      <span>{label}</span>
    </button>
  );
}

const Center = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", padding: 24, textAlign: "center", color: "var(--color-text-muted)" }}>{children}</div>
);

const badgeLabel = (b: string) => (b === "POPULAR" ? "Popular" : b === "BESTSELLER" ? "Bestseller" : "New");

// ---- styles ----
const hero: React.CSSProperties = { position: "relative", minHeight: 160, background: "linear-gradient(120deg,#5a3b2e,#2d1a12)", display: "flex", alignItems: "flex-end" };
const heroOverlay: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" };
const heroContent: React.CSSProperties = { position: "relative", display: "flex", gap: 16, alignItems: "center", padding: 24, maxWidth: 1100, margin: "0 auto", width: "100%" };
const logoCircle: React.CSSProperties = { width: 72, height: 72, borderRadius: "50%", background: "#f5c518", display: "grid", placeItems: "center", fontSize: 34, flexShrink: 0 };
const pausedBanner: React.CSSProperties = { background: "#fef3c7", color: "#92400e", padding: "10px 16px", textAlign: "center", fontSize: 14 };
const tabBar: React.CSSProperties = { display: "flex", gap: 8, padding: "14px 24px", overflowX: "auto", background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)", maxWidth: 1100, margin: "0 auto" };
const tab = (active: boolean): React.CSSProperties => ({ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: "none", whiteSpace: "nowrap", background: active ? "#fde8e6" : "transparent", color: active ? "var(--color-primary)" : "var(--color-text-muted)", fontWeight: 600, borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent" });
const bodyGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, padding: 24, maxWidth: 1100, margin: "0 auto", alignItems: "start" };
const cartColumn: React.CSSProperties = { position: "sticky", top: 16 };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 };
const card: React.CSSProperties = { background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, overflow: "hidden", boxShadow: "var(--shadow-card)" };
const cardImg: React.CSSProperties = { position: "relative", height: 140, background: "#f0ece6", display: "grid", placeItems: "center" };
const badge = (b: string): React.CSSProperties => ({ position: "absolute", top: 8, right: 8, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, color: "#fff", background: b === "BESTSELLER" ? "var(--color-primary)" : b === "POPULAR" ? "var(--color-positive)" : "#2563eb" });
const soldOutTag: React.CSSProperties = { position: "absolute", bottom: 8, left: 8, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, background: "rgba(0,0,0,0.7)", color: "#fff" };
const stickyBar: React.CSSProperties = { position: "fixed", bottom: 0, left: 0, right: 0, display: "none", justifyContent: "space-between", padding: "16px 20px", background: "var(--color-primary)", color: "#fff", border: "none", fontWeight: 700, fontSize: 15, zIndex: 20 };
const drawerBackdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 30, display: "flex", alignItems: "flex-end" };
const drawerSheet: React.CSSProperties = { background: "var(--color-bg)", width: "100%", maxHeight: "85vh", overflow: "auto", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 12 };

const responsiveCss = `
@media (max-width: 860px) {
  .cart-desktop { display: none; }
  .cart-sticky { display: flex !important; }
}
`;
