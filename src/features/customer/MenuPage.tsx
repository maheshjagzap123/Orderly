import { useEffect, useMemo, useRef, useState } from "react";
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

  // Kiosk session: "started" gates the menu behind a Start Order screen, and
  // `sessionKey` is bumped to fully reset the cart/menu after each order or idle timeout.
  const [started, setStarted] = useState(mode !== "KIOSK");
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

  if (loading) return <Center>Loading menu…</Center>;
  if (error || !business || !menu) return <Center>{error ?? "Something went wrong"}</Center>;

  // Kiosk Start Order screen.
  if (mode === "KIOSK" && !started) {
    return <KioskStartScreen business={business} onStart={() => setStarted(true)} />;
  }

  /** End the kiosk session: clear everything and return to the Start screen. */
  const resetKiosk = () => {
    setStarted(false);
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

  // Kiosk idle timeout: warn after inactivity, then auto-reset the session.
  const idleOverlay = useIdleReset({
    enabled: isKiosk && !checkoutOpen,
    onReset: () => onKioskReset?.(),
  });

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
        <CheckoutModal
          business={business}
          mode={mode}
          onClose={() => {
            setCheckoutOpen(false);
            // Kiosk: after the checkout flow closes (incl. "Order Again"), reset for the next customer.
            if (isKiosk) onKioskReset?.();
          }}
        />
      )}

      {idleOverlay}

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

const IDLE_WARN_MS = 45_000; // show "are you still here?" after 45s idle
const IDLE_RESET_MS = 15_000; // then reset 15s later if no response

/**
 * Kiosk idle watchdog. After inactivity it shows an "Are you still ordering?"
 * overlay, and if the customer doesn't respond it clears the session.
 * Any pointer/key/touch activity resets the timer.
 */
function useIdleReset({ enabled, onReset }: { enabled: boolean; onReset: () => void }) {
  const [warning, setWarning] = useState(false);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a mutable reference so listeners don't need to re-bind.
  const warnRef = useRef(warning);
  warnRef.current = warning;

  useEffect(() => {
    if (!enabled) return;

    const clearTimers = () => {
      if (warnTimer.current) clearTimeout(warnTimer.current);
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };

    const startCountdown = () => {
      clearTimers();
      warnTimer.current = setTimeout(() => {
        setWarning(true);
        resetTimer.current = setTimeout(() => {
          setWarning(false);
          onReset();
        }, IDLE_RESET_MS);
      }, IDLE_WARN_MS);
    };

    const onActivity = () => {
      // Ignore activity while the warning is up — the overlay has its own buttons.
      if (warnRef.current) return;
      startCountdown();
    };

    const events = ["pointerdown", "keydown", "touchstart", "mousemove"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    startCountdown();

    return () => {
      clearTimers();
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [enabled, onReset]);

  // Fixed-position overlay returned to the caller for inline rendering.
  return warning ? (
    <div style={idleBackdrop}>
      <div style={idleCard}>
        <div style={{ fontSize: 44 }}>⏳</div>
        <h2 style={{ margin: "10px 0 6px" }}>Are you still ordering?</h2>
        <p style={{ color: "var(--color-text-muted)", marginTop: 0 }}>
          We'll clear this order soon if there's no response.
        </p>
        <button
          style={idleBtn}
          onClick={() => {
            setWarning(false);
            if (resetTimer.current) clearTimeout(resetTimer.current);
          }}
        >
          Yes, continue
        </button>
      </div>
    </div>
  ) : null;
}

/** Kiosk welcome screen shown before the menu, with a big Start Order button. */
function KioskStartScreen({ business, onStart }: { business: Business; onStart: () => void }) {
  return (
    <div style={kioskStartWrap}>
      <div style={{ ...logoCircle, width: 110, height: 110, fontSize: 52 }}>🍳</div>
      <div style={{ fontSize: 18, color: "var(--color-text-muted)", marginTop: 24, letterSpacing: 1 }}>WELCOME TO</div>
      <h1 style={{ fontSize: 44, margin: "6px 0 2px", textAlign: "center" }}>{business.name}</h1>
      {business.description && <div style={{ color: "var(--color-text-muted)", fontSize: 18 }}>{business.description}</div>}
      <button style={kioskStartBtn} onClick={onStart}>Start Order →</button>
      <div style={{ color: "var(--color-text-muted)", fontSize: 14, marginTop: 20 }}>Tap anywhere to begin</div>
    </div>
  );
}

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

const kioskStartWrap: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: 32,
  background: "linear-gradient(160deg,#fff,#fdf2f0)",
};
const kioskStartBtn: React.CSSProperties = {
  marginTop: 40,
  background: "var(--color-primary)",
  color: "#fff",
  border: "none",
  borderRadius: 18,
  padding: "22px 56px",
  fontSize: 24,
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 10px 30px rgba(220,38,38,0.3)",
};
const idleBackdrop: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 70, display: "grid", placeItems: "center", padding: 24 };
const idleCard: React.CSSProperties = { background: "var(--color-surface)", borderRadius: 20, padding: 36, textAlign: "center", maxWidth: 420 };
const idleBtn: React.CSSProperties = { marginTop: 10, background: "var(--color-primary)", color: "#fff", border: "none", borderRadius: 14, padding: "16px 40px", fontSize: 18, fontWeight: 700, cursor: "pointer" };

const responsiveCss = `
@media (max-width: 860px) {
  .cart-desktop { display: none; }
  .cart-sticky { display: flex !important; }
}
/* Kiosk mode: larger touch targets for a tablet. */
.kiosk-mode h1 { font-size: 34px; }
.kiosk-mode button { font-size: 17px; }
.kiosk-mode .cart-sticky { padding: 22px 20px; font-size: 18px; }
`;
