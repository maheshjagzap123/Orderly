import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Business } from "@/lib/database.types";
import { getMyBusiness } from "@/lib/vendorApi";

interface VendorBusinessValue {
  business: Business | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setBusiness: (b: Business | null) => void;
}

const VendorBusinessContext = createContext<VendorBusinessValue | null>(null);

/**
 * Provides the current vendor's business ONCE for the whole vendor app.
 * Fetched a single time and cached in context, so switching pages/tabs is instant
 * (no refetch, no loading flash on every navigation).
 */
export function VendorBusinessProvider({ children }: { children: ReactNode }) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setBusiness(await getMyBusiness());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load business");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value: VendorBusinessValue = { business, loading, error, reload, setBusiness };
  return createElement(VendorBusinessContext.Provider, { value }, children);
}

/** Access the shared vendor business (must be inside VendorBusinessProvider). */
export function useVendorBusiness(): VendorBusinessValue {
  const ctx = useContext(VendorBusinessContext);
  if (!ctx) throw new Error("useVendorBusiness must be used within a VendorBusinessProvider");
  return ctx;
}
