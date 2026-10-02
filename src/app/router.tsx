import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";
import { RequireAuth } from "./RequireAuth";
import { VendorBusinessProvider } from "@/hooks/useVendorBusiness";
import { HealthCheck } from "@/components/HealthCheck";
import { LandingPage } from "@/features/LandingPage";
import { MenuPage } from "@/features/customer/MenuPage";
import { TrackingPage } from "@/features/customer/TrackingPage";
import { TokenTrackingPage } from "@/features/customer/TokenTrackingPage";
import { LoginPage } from "@/features/vendor/LoginPage";
import { ResetPasswordPage } from "@/features/vendor/ResetPasswordPage";

// Vendor pages are lazy-loaded so the customer bundle stays small.
const OnboardingWizard = lazy(() => import("@/features/vendor/OnboardingWizard").then((m) => ({ default: m.OnboardingWizard })));
const DashboardPage = lazy(() => import("@/features/vendor/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const OrdersPage = lazy(() => import("@/features/vendor/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import("@/features/vendor/OrderDetailPage").then((m) => ({ default: m.OrderDetailPage })));
const MenuManagementPage = lazy(() => import("@/features/vendor/MenuManagementPage").then((m) => ({ default: m.MenuManagementPage })));
const ItemEditorPage = lazy(() => import("@/features/vendor/ItemEditorPage").then((m) => ({ default: m.ItemEditorPage })));
const QrPage = lazy(() => import("@/features/vendor/QrPage").then((m) => ({ default: m.QrPage })));
const ReportsPage = lazy(() => import("@/features/vendor/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import("@/features/vendor/settings/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import("@/features/vendor/settings/ProfilePage").then((m) => ({ default: m.ProfilePage })));

function Suspended(el: ReactNode) {
  return <Suspense fallback={<div style={{ padding: 32 }}>Loading…</div>}>{el}</Suspense>;
}

/**
 * Vendor shell: auth guard + a single shared business provider that persists
 * across all vendor pages (fetched once), so navigation is instant.
 */
function VendorShell() {
  return (
    <RequireAuth>
      <VendorBusinessProvider>
        <Outlet />
      </VendorBusinessProvider>
    </RequireAuth>
  );
}

export const router = createBrowserRouter([
  // --- Public landing + dev health check ---
  { path: "/", element: <LandingPage /> },
  { path: "/health", element: <HealthCheck /> },

  // --- Public customer (no auth) ---
  { path: "/order/:slug", element: <MenuPage mode="QR" /> },
  { path: "/order/:slug/track/:orderNo", element: <TrackingPage /> },
  { path: "/track/:token", element: <TokenTrackingPage /> },
  { path: "/kiosk/:slug", element: <MenuPage mode="KIOSK" /> },

  // --- Vendor auth ---
  { path: "/vendor/login", element: <LoginPage /> },
  { path: "/vendor/reset-password", element: <ResetPasswordPage /> },

  // --- Vendor app (auth + shared business provider) ---
  {
    element: <VendorShell />,
    children: [
      { path: "/vendor/onboarding", element: Suspended(<OnboardingWizard />) },
      { path: "/vendor", element: Suspended(<DashboardPage />) },
      { path: "/vendor/orders", element: Suspended(<OrdersPage />) },
      { path: "/vendor/orders/:id", element: Suspended(<OrderDetailPage />) },
      { path: "/vendor/menu", element: Suspended(<MenuManagementPage />) },
      { path: "/vendor/menu/item/new", element: Suspended(<ItemEditorPage />) },
      { path: "/vendor/menu/item/:id", element: Suspended(<ItemEditorPage />) },
      { path: "/vendor/qr", element: Suspended(<QrPage />) },
      { path: "/vendor/reports", element: Suspended(<ReportsPage />) },
      // Settings is a single page with in-memory tabs; keep deep links working.
      { path: "/vendor/settings", element: Suspended(<SettingsPage />) },
      { path: "/vendor/settings/location", element: Suspended(<SettingsPage initialTab="location" />) },
      { path: "/vendor/settings/payment", element: Suspended(<SettingsPage initialTab="payment" />) },
      { path: "/vendor/settings/profile", element: Suspended(<ProfilePage />) },
    ],
  },

  // --- Fallback ---
  { path: "*", element: <Navigate to="/" replace /> },
]);
