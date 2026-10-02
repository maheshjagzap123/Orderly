import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/database.types";
import { getRecentOrders } from "@/lib/vendorApi";

/** Sound-alert preference (vendor-toggleable, persisted). Defaults ON. */
export const SOUND_PREF_KEY = "orderly.soundAlerts";
export function soundEnabled(): boolean {
  return localStorage.getItem(SOUND_PREF_KEY) !== "off";
}

/** Voice-announcement preference (speaks the new order aloud). Defaults OFF. */
export const VOICE_PREF_KEY = "orderly.voiceAlerts";
export function voiceEnabled(): boolean {
  return localStorage.getItem(VOICE_PREF_KEY) === "on";
}

/**
 * Speak a new-order announcement using the browser's SpeechSynthesis API.
 * `force` ignores the preference (used to test when turning voice on).
 * No external service or audio files — all local to the browser.
 */
export function speakOrder(text: string, force = false) {
  if (!force && !voiceEnabled()) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel(); // don't queue up a backlog if several arrive
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 1;
    u.volume = 1;
    synth.speak(u);
  } catch {
    /* speech not available — ignore */
  }
}

/** Approximate chime length in ms (used to sequence voice after it). */
export const CHIME_MS = 1500;

/**
 * One shared AudioContext for the whole app. Creating a new context per chime is
 * unreliable (browsers cap them and new ones start "suspended"), which caused the
 * chime to play only sometimes. We keep a single context and resume it as needed.
 */
let sharedCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedCtx || sharedCtx.state === "closed") sharedCtx = new Ctx();
    if (sharedCtx.state === "suspended") void sharedCtx.resume();
    return sharedCtx;
  } catch {
    return null;
  }
}

/**
 * Unlock/resume the audio context from a user gesture (e.g. clicking a toggle).
 * Keeping the context alive this way lets later programmatic chimes play reliably.
 */
export function unlockAudio() {
  getAudioCtx();
}

/** Schedule the actual tones on a running context. */
function scheduleChime(ctx: AudioContext) {
  // Resume is async; start a touch later so notes are never scheduled in the past.
  const start0 = ctx.currentTime + 0.06;
  const notes = [1046.5, 1318.5, 1568.0]; // C6, E6, G6
  const noteDur = 0.22;
  const sequence: { freq: number; at: number }[] = [];
  notes.forEach((f, i) => sequence.push({ freq: f, at: i * noteDur }));         // first run
  notes.forEach((f, i) => sequence.push({ freq: f, at: 0.78 + i * noteDur }));   // second run

  for (const n of sequence) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = n.freq;
    const start = start0 + n.at;
    // Linear envelope (reliable regardless of starting value).
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.35, start + 0.03);
    gain.gain.linearRampToValueAtTime(0, start + noteDur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + noteDur + 0.02);
  }
}

/**
 * Play a ~1.5s new-order chime using the shared Web Audio context.
 * `force` plays even when the sound preference is off — used as a test tone.
 * Resumes the context first (and waits if needed) so it plays reliably every time.
 */
export function playChime(force = false) {
  if (!force && !soundEnabled()) return;
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      // Wait for resume to complete before scheduling, otherwise the first chime is dropped.
      ctx.resume().then(() => scheduleChime(ctx)).catch(() => {});
    } else {
      scheduleChime(ctx);
    }
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
          // Fire the chime HERE, synchronously, exactly once per INSERT — this is the
          // reliable path (not dependent on React render/effect timing). Voice is
          // handled by the Orders page once the order's items are loaded.
          if (notify && isNew && primed.current) {
            setNewOrderCount((c) => c + 1);
            setLatestNew(row);
            playChime(); // respects the sound preference internally
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
