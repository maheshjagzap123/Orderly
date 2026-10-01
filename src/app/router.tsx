import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { RequireAuth } from "./RequireAuth";
import { HealthCheck } from "@/components/HealthCheck";
import { MenuPage } from "@/features/customer/MenuPage";
import { TrackingPage } from "@/features/customer/TrackingPage";
import { LoginPage } from "@/features/vendor/LoginPage";

// Vendor pages are lazy-loaded so the customer bundle stays small.
const OnboardingWizard = lazy(() => import("@/features/vendor/OnboardingWizard").then((m) => ({ default: m.OnboardingWizard })));
const DashboardPage = lazy(() => import("@/features/vendor/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const OrdersPage = lazy(() => import("@/features/vendor/OrdersPage").then((m) => ({ default: m.OrdersPage })));
const OrderDetailPage = lazy(() => import("@/features/vendor/OrderDetailPage").then((m) => ({ default: m.OrderDetailPage })));
const MenuManagementPage = lazy(() => import("@/features/vendor/MenuManagementPage").then((m) => ({ default: m.MenuManagementPage })));
const ItemEditorPage = lazy(() => import("@/features/vendor/ItemEditorPage").then((m) => ({ default: m.ItemEditorPage })));
const QrPage = lazy(() => import("@/features/vendor/QrPage").then((m) => ({ default: m.QrPage })));
const ReportsPage = lazy(() => import("@/features/vendor/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const BusinessSettingsPage = lazy(() => import("@/features/vendor/settings/BusinessSettingsPage").then((m) => ({ default: m.BusinessSettingsPage })));
const LocationPage = lazy(() => import("@/features/vendor/settings/LocationPage").then((m) => ({ default: m.LocationPage })));
const PaymentSettingsPage = lazy(() => import("@/features/vendor/settings/PaymentSettingsPage").then((m) => ({ default: m.PaymentSettingsPage })));
const ProfilePage = lazy(() => import("@/features/vendor/settings/ProfilePage").then((m) => ({ default: m.ProfilePage })));

/** Wrap a lazily-loaded vendor page with the auth guard + a Suspense fallback. */
function Vendor(el: ReactNode) {
  return (
    <RequireAuth>
      <Suspense fallback={<div style={{ padding: 32 }}>Loading…</div>}>{el}</Suspense>
    </RequireAuth>
  );
}

/**
 * Route map (see docs/10-customer-pages.md and docs/20-vendor-pages.md).
 */
export const router = createBrowserRouter([
  // --- Dev / smoke test ---
  { path: "/", element: <HealthCheck /> },

  // --- Public customer (no auth) ---
  { path: "/order/:slug", element: <MenuPage mode="QR" /> },
  { path: "/order/:slug/track/:orderNo", element: <TrackingPage /> },

  // --- Kiosk (same screens, kiosk mode) ---
  { path: "/kiosk/:slug", element: <MenuPage mode="KIOSK" /> },

  // --- Vendor auth ---
  { path: "/vendor/login", element: <LoginPage /> },
  { path: "/vendor/onboarding", element: Vendor(<OnboardingWizard />) },

  // --- Vendor app (auth required) ---
  { path: "/vendor", element: Vendor(<DashboardPage />) },
  { path: "/vendor/orders", element: Vendor(<OrdersPage />) },
  { path: "/vendor/orders/:id", element: Vendor(<OrderDetailPage />) },
  { path: "/vendor/menu", element: Vendor(<MenuManagementPage />) },
  { path: "/vendor/menu/item/new", element: Vendor(<ItemEditorPage />) },
  { path: "/vendor/menu/item/:id", element: Vendor(<ItemEditorPage />) },
  { path: "/vendor/qr", element: Vendor(<QrPage />) },
  { path: "/vendor/reports", element: Vendor(<ReportsPage />) },
  { path: "/vendor/settings", element: Vendor(<BusinessSettingsPage />) },
  { path: "/vendor/settings/payment", element: Vendor(<PaymentSettingsPage />) },
  { path: "/vendor/settings/location", element: Vendor(<LocationPage />) },
  { path: "/vendor/settings/profile", element: Vendor(<ProfilePage />) },

  // --- Fallback ---
  { path: "*", element: <Navigate to="/" replace /> },
]);
