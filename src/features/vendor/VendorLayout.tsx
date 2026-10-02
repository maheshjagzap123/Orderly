import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "@/lib/auth";

const nav = [
  { to: "/vendor", label: "Dashboard", icon: "📊", end: true },
  { to: "/vendor/orders", label: "Orders", icon: "🧾" },
  { to: "/vendor/menu", label: "Menu Management", icon: "🍽️" },
  { to: "/vendor/menu?tab=categories", label: "Categories", icon: "🗂️" },
  { to: "/vendor/reports", label: "Reports", icon: "📈" },
  { to: "/vendor/qr", label: "QR Code", icon: "🔳" },
  { to: "/vendor/settings", label: "Business Settings", icon: "⚙️" },
  { to: "/vendor/settings/location", label: "Location & Hours", icon: "📍" },
  { to: "/vendor/settings/payment", label: "Payment Settings", icon: "💳" },
  { to: "/vendor/settings/profile", label: "Profile & Team", icon: "👤" },
];

export function VendorLayout({
  children,
  businessName,
  ordersBadge,
}: {
  children: ReactNode;
  businessName?: string;
  ordersBadge?: number;
}) {
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    navigate("/vendor/login", { replace: true });
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={sidebar}>
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
              style={({ isActive }) => navItem(isActive)}
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
      </aside>

      {/* Main */}
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
