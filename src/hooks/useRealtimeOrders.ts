import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/database.types";
import { getRecentOrders } from "@/lib/vendorApi";

/** Play a short chime using the Web Audio API (no asset file needed). */
function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Two quick ascending notes.
    [880, 1174].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.16);
    });
    setTimeout(() => ctx.close(), 600);
  } catch {
    /* audio not available / blocked — ignore */
  }
}

/**
 * Loads recent orders and keeps them in sync via Supabase Realtime.
 * The DB is the source of truth: on (re)subscribe we re-fetch authoritative data.
 *
 * Also surfaces new-order notifications:
 *  - newOrderCount: how many brand-new orders have arrived since last acknowledged
 *  - latestNew: the most recent newly-arrived order (for a toast)
 *  - acknowledge(): clears the notification state
 * Set `notify` to true (vendor views) to enable the sound/badge behaviour.
 */
export function useRealtimeOrders(businessId: string | undefined, limit = 15, notify = false) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [connected, setConnected] = useState(false);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [latestNew, setLatestNew] = useState<Order | null>(null);
  const seen = useRef<Set<string>>(new Set());
  // Skip notifications for the very first authoritative load (existing orders).
  const primed = useRef(false);

  const acknowledge = useCallback(() => {
    setNewOrderCount(0);
    setLatestNew(null);
  }, []);

  useEffect(() => {
    if (!businessId) return;
    let active = true;
    primed.current = false;

    async function refresh() {
      const rows = await getRecentOrders(businessId!, limit);
      if (!active) return;
      seen.current = new Set(rows.map((r) => r.id));
      setOrders(rows);
      primed.current = true;
    }
    refresh();

    const channel = supabase
      .channel(`orders:${businessId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `business_id=eq.${businessId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as Order;
            seen.current.delete(old.id);
            setOrders((prev) => prev.filter((o) => o.id !== old.id));
            return;
          }

          const row = payload.new as Order;
          const isNew = payload.eventType === "INSERT" && !seen.current.has(row.id);
          seen.current.add(row.id);

          setOrders((prev) => {
            const idx = prev.findIndex((o) => o.id === row.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = row;
              return copy;
            }
            return [row, ...prev].slice(0, limit);
          });

          // Notify only for genuinely new orders after the first load.
          if (notify && isNew && primed.current) {
            setNewOrderCount((c) => c + 1);
            setLatestNew(row);
            playChime();
          }
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
  }, [businessId, limit, notify]);

  return { orders, connected, newOrderCount, latestNew, acknowledge };
}
