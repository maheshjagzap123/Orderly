import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { Business, Category, Item } from "@/lib/database.types";
import { getBusinessBySlug, getMenu, type Menu } from "@/lib/publicApi";
import { supabase } from "@/lib/supabase";
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

  // Kiosk session: `sessionKey` is bumped to fully reset the cart/menu after
  // each completed order. There is no Start Order gate and no idle auto-reset —
  // the kiosk lands directly on the menu and stays there.
  const [sessionKey, setSessionKey] = useState(0);

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

  // Live menu: react to vendor changes (sold-out toggles, price edits, new/removed
  // items, category activation) without a page refresh. The `items`/`categories`
  // tables are in the realtime publication (migration 0002). Business open/paused
  // state also updates live.
  const businessId = business?.id;
  useEffect(() => {
    if (!businessId) return;

    const applyItem = (row: Item, deleted = false) => {
      setMenu((m) => {
        if (!m) return m;
        const rest = m.items.filter((i) => i.id !== row.id);
        return { ...m, items: deleted ? rest : [...rest, row].sort((a, b) => a.display_order - b.display_order) };
      });
    };
    const applyCategory = (row: Category, deleted = false) => {
      setMenu((m) => {
        if (!m) return m;
        // Customer menu only shows active categories.
        const rest = m.categories.filter((c) => c.id !== row.id);
        const keep = !deleted && row.is_active;
        return { ...m, categories: keep ? [...rest, row].sort((a, b) => a.display_order - b.display_order) : rest };
      });
    };

    const channel = supabase
      .channel(`menu:${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `business_id=eq.${businessId}` },
        (p) => {
          if (p.eventType === "DELETE") applyItem(p.old as Item, true);
          else applyItem(p.new as Item);
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter: `business_id=eq.${businessId}` },
        (p) => {
          if (p.eventType === "DELETE") applyCategory(p.old as Category, true);
          else applyCategory(p.new as Category);
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "businesses", filter: `id=eq.${businessId}` },
        (p) => setBusiness(p.new as Business))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [businessId]);

  if (loading) return <Center>Loading menu…</Center>;
  if (error || !business || !menu) return <Center>{error ?? "Something went wrong"}</Center>;

  /** End the kiosk session after an order: clear the cart for the next customer. */
  const resetKiosk = () => {
    setSessionKey((k) => k + 1);
  };

  return (
    <CartProvider key={sessionKey} taxPercent={Number(business.tax_percent)}>
      <MenuInner business={business} menu={menu} mode={mode} onKioskReset={mode === "KIOSK" ? resetKiosk : undefined} />
    </CartProvider>
  );
}

function MenuInner({
  business,
  menu,
  mode,
  onKioskReset,
}: {
  business: Business;
  menu: Menu;
  mode: "QR" | "KIOSK";
  onKioskReset?: () => void;
}) {
  const cart = useCart();
  const [activeCat, setActiveCat] = useState<string>("all");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isKiosk = mode === "KIOSK";

  const canOrder = business.is_open && business.accepting_orders;
  const [browseAnyway, setBrowseAnyway] = useState(false);

  const visibleItems = useMemo(() => {
    if (activeCat === "all") return menu.items;
    return menu.items.filter((i) => i.category_id === activeCat);
  }, [menu.items, activeCat]);

  // Store closed → dedicated full screen (customer can choose to browse the menu).
  if (!business.is_open && !browseAnyway) {
    return <ClosedScreen business={business} onBrowse={() => setBrowseAnyway(true)} />;
  }

  return (
    <div style={{ paddingBottom: 90 }} className={isKiosk ? "kiosk-mode" : undefined}>
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
          <strong>{business.is_open ? "⏸ Orders are temporarily paused." : "🔒 This stall is currently closed."}</strong>{" "}
          You can browse the menu, but ordering is unavailable right now.
        </div>
      )}

      {/* Category tabs (sticky) */}
      <div style={tabBar}>
        <div style={tabBarInner}>
          <Tab label="All Items" active={activeCat === "all"} onClick={() => setActiveCat("all")} />
          {menu.categories.map((c) => (
            <Tab key={c.id} label={c.name} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} />
          ))}
        </div>
      </div>

      {/* Body: menu grid + cart */}
      <div style={bodyGrid} className="menu-body-grid">
        <div>
          <h2 style={{ marginTop: 0 }}>Our Menu</h2>
          <p style={{ color: "var(--color-text-muted)", marginTop: -8 }}>Delicious food made with fresh ingredients</p>
          <div style={grid} className="menu-item-grid">
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
        <CheckoutModal
          business={business}
          mode={mode}
          onClose={() => {
            setCheckoutOpen(false);
            // On a kiosk, closing checkout (e.g. "Order Again" after a confirmed
            // order) starts a clean session for the next customer.
            onKioskReset?.();
          }}
        />
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

/** Full-screen "we're closed" state shown when a store is not open. */
function ClosedScreen({ business, onBrowse }: { business: Business; onBrowse: () => void }) {
  const opensAt = business.open_time ? to12hLabel(business.open_time) : null;
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 420 }}>
        <div style={logoCircle}>🍳</div>
        <h1 style={{ margin: "18px 0 4px" }}>{business.name}</h1>
        <div style={{ fontSize: 48, margin: "18px 0 8px" }}>😴</div>
        <h2 style={{ margin: "0 0 6px" }}>We're Closed</h2>
        <p style={{ color: "var(--color-text-muted)", margin: "0 0 6px" }}>
          {opensAt ? `We open at ${opensAt}.` : "We're not taking orders right now."}
        </p>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>
          {formatHours(business.open_time, business.close_time)}
        </p>
        <button
          onClick={onBrowse}
          style={{ background: "none", border: "1px solid var(--color-border)", borderRadius: 10, padding: "10px 18px", marginTop: 16, cursor: "pointer", fontWeight: 600 }}
        >
          View Menu
        </button>
      </div>
    </div>
  );
}

/** Local 12-hour label from an "HH:MM" time string. */
function to12hLabel(hhmm: string): string {
  const [h, m = "00"] = hhmm.split(":");
  let hr = parseInt(h, 10);
  const period = hr >= 12 ? "PM" : "AM";
  hr = hr % 12 || 12;
  return `${hr}:${m} ${period}`;
}

const badgeLabel = (b: string) => (b === "POPULAR" ? "Popular" : b === "BESTSELLER" ? "Bestseller" : "New");

// ---- styles ----
const hero: React.CSSProperties = { position: "relative", minHeight: 160, background: "linear-gradient(120deg,#5a3b2e,#2d1a12)", display: "flex", alignItems: "flex-end" };
const heroOverlay: React.CSSProperties = { position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" };
const heroContent: React.CSSProperties = { position: "relative", display: "flex", gap: 16, alignItems: "center", padding: 24, maxWidth: 1100, margin: "0 auto", width: "100%" };
const logoCircle: React.CSSProperties = { width: 72, height: 72, borderRadius: "50%", background: "#f5c518", display: "grid", placeItems: "center", fontSize: 34, flexShrink: 0 };
const pausedBanner: React.CSSProperties = { background: "#fef3c7", color: "#92400e", padding: "10px 16px", textAlign: "center", fontSize: 14 };
const tabBar: React.CSSProperties = { position: "sticky", top: 0, zIndex: 10, padding: "14px 24px", overflowX: "auto", background: "var(--color-surface)", borderBottom: "1px solid var(--color-border)" };
const tabBarInner: React.CSSProperties = { display: "flex", gap: 8, maxWidth: 1100, margin: "0 auto" };
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
  /* Collapse the "menu | 360px cart" grid to a single column so the hidden
     desktop cart no longer reserves a phantom 360px column that squeezes the
     menu. This is what broke the kiosk view on phones. */
  .menu-body-grid { grid-template-columns: 1fr !important; padding: 16px !important; }
  /* Two item cards per row on phones (instead of one). */
  .menu-item-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 12px !important; }
}
/* Kiosk mode: larger touch targets for a tablet. These apply at ALL widths, so
   keep them modest and let the mobile breakpoint below rein them back in. */
.kiosk-mode h1 { font-size: 30px; }
.kiosk-mode button { font-size: 17px; }
.kiosk-mode .cart-sticky { padding: 22px 20px; font-size: 18px; }

/* Kiosk on a phone: don't inflate type/targets meant for a tablet. */
@media (max-width: 860px) {
  .kiosk-mode h1 { font-size: 24px; }
  .kiosk-mode button { font-size: 15px; }
  .kiosk-mode .cart-sticky { padding: 16px 20px; font-size: 16px; }
}

/* Very small phones: a single column reads better than two cramped cards. */
@media (max-width: 360px) {
  .menu-item-grid { grid-template-columns: 1fr !important; }
}
`;
