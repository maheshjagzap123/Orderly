import { useCallback, useEffect, useState } from "react";
import type { Business } from "@/lib/database.types";
import { getMyBusiness } from "@/lib/vendorApi";

/** Loads the business owned by the current vendor. */
export function useVendorBusiness() {
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

  return { business, loading, error, reload, setBusiness };
}
