import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { signOut } from "@/lib/auth";
import { useIsMobile } from "@/hooks/useMediaQuery";

const nav = [
  { to: "/vendor", label: "Dashboard", icon: "📊", end: true },
  { to: "/vendor/orders", label: "Orders", icon: "🧾" },
  { to: "/vendor/menu", label: "Menu Management", icon: "🍽️" },
  { to: "/vendor/menu?tab=categories", label: "Categories", icon: "🗂️" },
  { to: "/vendor/reports", label: "Reports", icon: "📈" },
  { to: "/vendor/qr", label: "QR Code", icon: "🔳" },
  { to: "/vendor/settings", label: "Settings", icon: "⚙️" },
  { to: "/vendor/settings/profile", label: "Profile & Team", icon: "👤" },
];

export function VendorLayout({
  children,
  businessName,
  ordersBadge,
  bare = false,
}: {
  children: ReactNode;
  businessName?: string;
  ordersBadge?: number;
  /** Full-screen focus mode: hide sidebar + topbar, show only the content. */
  bare?: boolean;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isMobile = useIsMobile();

  // Mobile: the sidebar is an off-canvas drawer toggled by the hamburger.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the route changes (e.g. a nav link was tapped),
  // and whenever we leave mobile width.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  async function handleLogout() {
    await signOut();
    navigate("/vendor/login", { replace: true });
  }

  // Settings is active on its three tabs but NOT the profile page.
  const isSettingsActive = pathname.startsWith("/vendor/settings") && !pathname.startsWith("/vendor/settings/profile");

  // Full-screen focus mode: just the scrollable content, no vendor chrome.
  if (bare) {
    return (
      <div style={{ height: "100vh", overflow: "auto", background: "var(--color-bg)" }}>
        <main style={{ padding: isMobile ? 16 : 24, maxWidth: 1100, margin: "0 auto" }}>{children}</main>
      </div>
    );
  }

  const sidebarContent = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 8px 18px" }}>
        <div style={brandLogo}>🍳</div>
        <strong style={{ fontSize: 15, lineHeight: 1.2 }}>{businessName ?? "Orderly"}</strong>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {nav.map((n) => (
          <NavLink
            key={n.label}
            to={n.to}
            end={n.end}
            style={({ isActive }) =>
              navItem(n.label === "Settings" ? isSettingsActive : n.label === "Profile & Team" ? pathname.startsWith("/vendor/settings/profile") : isActive)
            }
          >
            <span>{n.icon}</span>
            <span style={{ flex: 1 }}>{n.label}</span>
            {n.label === "Orders" && ordersBadge ? <span style={badge}>{ordersBadge}</span> : null}
          </NavLink>
        ))}
      </nav>

      <button onClick={handleLogout} style={{ ...navItem(false), width: "100%", textAlign: "left" }}>
        <span>⏻</span>
        <span>Logout</span>
      </button>
      <div style={helpCard}>
        <strong style={{ fontSize: 13 }}>Need Help?</strong>
        <div style={{ fontSize: 12, color: "#9aa3af" }}>Contact Support</div>
      </div>
    </>
  );

  // ---- Mobile: top app bar + off-canvas drawer ----
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--color-bg)" }}>
        <header style={mobileTopbar}>
          <button aria-label="Open menu" onClick={() => setDrawerOpen(true)} style={hamburger}>☰</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={brandLogo}>🍳</div>
            <strong style={{ fontSize: 15 }}>{businessName ?? "Orderly"}</strong>
          </div>
          <div style={onlinePill}>● Online</div>
        </header>

        {/* Drawer + backdrop */}
        {drawerOpen && (
          <div style={drawerBackdrop} onClick={() => setDrawerOpen(false)}>
            <aside
              style={{ ...sidebar, height: "100%", animation: "orderly-drawer-in-left 0.2s ease-out" }}
              onClick={(e) => e.stopPropagation()}
            >
              {sidebarContent}
            </aside>
          </div>
        )}

        <main style={{ padding: 16, flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    );
  }

  // ---- Desktop: fixed sidebar + topbar ----
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <aside style={sidebar}>{sidebarContent}</aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, height: "100vh" }}>
        <header style={topbar}>
          <div style={onlinePill}>● Online</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 20 }}>🔔</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={avatar}>🍳</div>
              <div style={{ lineHeight: 1.1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{businessName ?? "Vendor"}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>Owner</div>
              </div>
            </div>
          </div>
        </header>

        <main style={{ padding: 24, overflow: "auto", flex: 1, minHeight: 0 }}>{children}</main>
      </div>
    </div>
  );
}

const sidebar: React.CSSProperties = {
  width: 240,
  flexShrink: 0,
  height: "100vh",
  background: "var(--color-sidebar)",
  color: "#e5e7eb",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  overflowY: "auto",
};
const brandLogo: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "var(--color-primary)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};
const navItem = (active: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "9px 12px",
  borderRadius: 10,
  color: active ? "#fff" : "#c3c9d2",
  background: active ? "var(--color-primary)" : "transparent",
  fontSize: 14,
  fontWeight: active ? 600 : 500,
  border: "none",
  cursor: "pointer",
});
const badge: React.CSSProperties = {
  background: "var(--color-primary)",
  color: "#fff",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  padding: "1px 7px",
};
const helpCard: React.CSSProperties = {
  marginTop: 10,
  padding: 12,
  borderRadius: 10,
  background: "#1b1e24",
};
const topbar: React.CSSProperties = {
  height: 60,
  flexShrink: 0,
  background: "var(--color-surface)",
  borderBottom: "1px solid var(--color-border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0 24px",
};
const mobileTopbar: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 30,
  height: 56,
  flexShrink: 0,
  background: "var(--color-surface)",
  borderBottom: "1px solid var(--color-border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "0 14px",
};
const hamburger: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 22,
  lineHeight: 1,
  padding: 4,
  cursor: "pointer",
  color: "var(--color-text)",
};
const drawerBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  zIndex: 50,
  display: "flex",
};
const onlinePill: React.CSSProperties = {
  color: "var(--color-positive)",
  fontWeight: 600,
  fontSize: 13,
};
const avatar: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: "50%",
  background: "#fde68a",
  display: "grid",
  placeItems: "center",
};
