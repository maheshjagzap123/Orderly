import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/database.types";
import { getRecentOrders } from "@/lib/vendorApi";

/**
 * Loads recent orders and keeps them in sync via Supabase Realtime.
 * The DB is the source of truth: on (re)subscribe we re-fetch authoritative data.
 */
export function useRealtimeOrders(businessId: string | undefined, limit = 15) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [connected, setConnected] = useState(false);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!businessId) return;
    let active = true;

    async function refresh() {
      const rows = await getRecentOrders(businessId!, limit);
      if (!active) return;
      seen.current = new Set(rows.map((r) => r.id));
      setOrders(rows);
    }
    refresh();

    const channel = supabase
      .channel(`orders:${businessId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` },
        (payload) => {
          setOrders((prev) => {
            const row = payload.new as Order;
            if (payload.eventType === "DELETE") {
              return prev.filter((o) => o.id !== (payload.old as Order).id);
            }
            const idx = prev.findIndex((o) => o.id === row.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = row;
              return copy;
            }
            return [row, ...prev].slice(0, limit);
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConnected(true);
          refresh(); // authoritative re-fetch on (re)connect
        } else {
          setConnected(false);
        }
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [businessId, limit]);

  return { orders, connected };
}
