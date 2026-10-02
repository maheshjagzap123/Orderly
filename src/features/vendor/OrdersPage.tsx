import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "./VendorLayout";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { NewOrderToast } from "@/components/NewOrderToast";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { useRealtimeOrders, SOUND_PREF_KEY, soundEnabled, playChime, VOICE_PREF_KEY, voiceEnabled, speakOrder, CHIME_MS, unlockAudio } from "@/hooks/useRealtimeOrders";
import { getOrderItemsFor, updateOrderStatus, cancelOrder, getCompletedOrders, type OrderItemWithImage } from "@/lib/vendorApi";
import { formatINR } from "@/lib/format";
import type { Order, OrderSource } from "@/lib/database.types";
import { CancelOrderModal } from "./CancelOrderModal";
import { OrderDrawer } from "./OrderDrawer";
import { PaymentDot, primaryActionLabel, actionVariant, vendorNextStatus, ACTIVE_GROUPS } from "./orderUi";

const PAGE_SIZE = 10;

export function OrdersPage() {
  const navigate = useNavigate();
  const { business, loading } = useVendorBusiness();
  // Live queue tracks recent orders (active + a few just-completed) for realtime
  // + the new-order chime. Completed history is fetched separately + paginated.
  const { orders, connected, latestNew, newOrderCount, acknowledge } = useRealtimeOrders(business?.id, 50, true);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemWithImage[]>>({});
  const [completedRows, setCompletedRows] = useState<Order[]>([]);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [completedLoading, setCompletedLoading] = useState(false);
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [sourceFilter, setSourceFilter] = useState<OrderSource | "ALL">("ALL");
  const [sortDir, setSortDir] = useState<"oldest" | "newest">("oldest");
  const [dateRange, setDateRange] = useState<"today" | "week" | "month" | "all">("today");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sound, setSound] = useState(soundEnabled());
  const [voice, setVoice] = useState(voiceEnabled());
  const [fullscreen, setFullscreen] = useState(false);
  const spokenRef = useState(() => new Set<string>())[0];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  // Keep the shared audio context alive after any user interaction, so new-order
  // chimes play reliably (browsers require a gesture to start/resume audio).
  useEffect(() => {
    const onInteract = () => unlockAudio();
    window.addEventListener("pointerdown", onInteract);
    window.addEventListener("keydown", onInteract);
    return () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, []);

  useEffect(() => {
    // Fetch items for the orders actually on screen: the live queue + the current
    // completed page. Merge so we don't refetch everything on every realtime tick.
    const ids = [...new Set([...orders.map((o) => o.id), ...completedRows.map((o) => o.id)])];
    if (ids.length) getOrderItemsFor(ids).then((m) => setItemsByOrder((prev) => ({ ...prev, ...m }))).catch(() => {});
  }, [orders, completedRows]);

  // Keep the open drawer's order in sync with realtime updates.
  useEffect(() => {
    if (!detail) return;
    const fresh = orders.find((o) => o.id === detail.id);
    if (fresh && fresh.status !== detail.status) setDetail(fresh);
  }, [orders, detail]);

  function toggleSound() {
    unlockAudio(); // user gesture → keep the shared audio context alive
    const next = !sound;
    setSound(next);
    localStorage.setItem(SOUND_PREF_KEY, next ? "on" : "off");
    if (next) playChime(true);
  }

  function toggleVoice() {
    unlockAudio();
    const next = !voice;
    setVoice(next);
    localStorage.setItem(VOICE_PREF_KEY, next ? "on" : "off");
    if (next) speakOrder("Voice announcements are on.", true);
  }

  // Voice announcement for a new order (the chime itself fires in the realtime hook).
  // Waits until the order's items are loaded; when sound is also on, starts after the
  // chime (~1.5s) so they don't overlap.
  useEffect(() => {
    if (!voice || !latestNew) return;
    if (spokenRef.has(latestNew.id)) return;
    const its = itemsByOrder[latestNew.id];
    if (!its) return; // wait for items
    spokenRef.add(latestNew.id);

    const itemText = its.map((it) => `${it.quantity} ${it.item_name}`).join(", ");
    const num = latestNew.order_number ? `number ${latestNew.order_number}` : "";
    const sentence = `New order ${num}. ${itemText}.`;

    const delay = sound ? CHIME_MS : 0;
    const t = setTimeout(() => speakOrder(sentence, true), delay);
    return () => clearTimeout(t);
  }, [voice, sound, latestNew, itemsByOrder, spokenRef]);

  const bySource = (o: Order) => (sourceFilter === "ALL" ? true : o.source === sourceFilter);

  // Two sections only: Preparing (accepted/preparing/ready) + New. Oldest → newest within each.
  const grouped = useMemo(() => {
    const map: Record<"PREPARING" | "NEW", Order[]> = { PREPARING: [], NEW: [] };
    for (const o of orders) {
      if (!bySource(o)) continue;
      if (o.status === "NEW") map.NEW.push(o);
      else if (o.status === "ACCEPTED" || o.status === "PREPARING" || o.status === "READY") map.PREPARING.push(o);
    }
    const cmp = (a: Order, b: Order) => {
      const diff = new Date(a.placed_at).getTime() - new Date(b.placed_at).getTime();
      return sortDir === "oldest" ? diff : -diff;
    };
    map.PREPARING.sort(cmp);
    map.NEW.sort(cmp);
    return map;
  }, [orders, sourceFilter, sortDir]);

  const activeCount = grouped.PREPARING.length + grouped.NEW.length;

  // Completed history is fetched server-side + paginated (scalable; no 200-row
  // client download). Refetch when the completed tab is open and its filters change.
  const dateRangeToSince = (r: typeof dateRange): Date | null => {
    const ms = rangeCutoff(r);
    return ms == null ? null : new Date(ms);
  };
  useEffect(() => {
    if (tab !== "completed" || !business) return;
    let active = true;
    setCompletedLoading(true);
    getCompletedOrders(business.id, {
      page,
      pageSize: PAGE_SIZE,
      since: dateRangeToSince(dateRange),
      search,
      source: sourceFilter,
    })
      .then((res) => {
        if (!active) return;
        setCompletedRows(res.rows);
        setCompletedTotal(res.total);
      })
      .finally(() => active && setCompletedLoading(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, business?.id, page, dateRange, search, sourceFilter]);

  const totalPages = Math.max(1, Math.ceil(completedTotal / PAGE_SIZE));
  const completed = completedRows;
  const completedRevenue = useMemo(
    () => completedRows.filter((o) => o.payment_status === "SUCCESS").reduce((s, o) => s + Number(o.total), 0),
    [completedRows]
  );
  useEffect(() => { if (page > totalPages) setPage(1); }, [page, totalPages]);
  useEffect(() => { setPage(1); }, [dateRange, search, sourceFilter]);

  async function advance(order: Order) {
    const next = vendorNextStatus(order.status);
    if (!next || busyId) return; // double-action guard
    setBusyId(order.id);
    try {
      await updateOrderStatus(order.id, next);
      if (next === "COMPLETED") setDetail((d) => (d && d.id === order.id ? null : d));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmCancel(reason: string) {
    if (!cancelling || busyId) return;
    const id = cancelling.id;
    setBusyId(id);
    try {
      await cancelOrder(id, reason);
      setCancelling(null);
      setDetail((d) => (d && d.id === id ? null : d));
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <VendorLayout businessName={business.name} ordersBadge={activeCount} bare={fullscreen}>
      <ConnectionBanner connected={connected} />

      {latestNew && (
        <NewOrderToast order={latestNew} count={newOrderCount} onView={() => { acknowledge(); setTab("active"); }} onDismiss={acknowledge} />
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Orders</h1>
          <p style={{ color: "var(--color-text-muted)", margin: "4px 0 0" }}>Manage and track customer orders in real time.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={toggleSound} style={pillBtn(sound, sound)}>{sound ? "🔊" : "🔇"} Sound {sound ? "On" : "Off"}</button>
          <button onClick={toggleVoice} style={pillBtn(voice, voice)}>🗣️ Voice {voice ? "On" : "Off"}</button>
          <button onClick={() => setFullscreen((f) => !f)} style={pillBtn(fullscreen, false)}>
            {fullscreen ? "✕ Exit Full Screen" : "⛶ Full Screen"}
          </button>
          {tab === "active" && (
            <button
              onClick={() => setSortDir((d) => (d === "oldest" ? "newest" : "oldest"))}
              style={pillBtn(false, false)}
              title="Toggle sort order within each group"
            >
              ↕ {sortDir === "oldest" ? "Oldest First" : "Newest First"}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={tabBar}>
        <button style={tabBtn(tab === "active")} onClick={() => setTab("active")}>
          Active Orders <span style={countBadge}>{activeCount}</span>
        </button>
        <button style={tabBtn(tab === "completed")} onClick={() => setTab("completed")}>Completed Orders</button>
      </div>

      {/* Source filter */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0 0" }}>
        {(["ALL", "QR", "KIOSK"] as const).map((s) => (
          <Chip key={s} active={sourceFilter === s} onClick={() => setSourceFilter(s)}>{s === "ALL" ? "All sources" : s}</Chip>
        ))}
      </div>

      {/* Completed-only: date range + search + daily total */}
      {tab === "completed" && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "12px 0 0" }}>
          {DATE_RANGES.map((r) => (
            <Chip key={r.key} active={dateRange === r.key} onClick={() => setDateRange(r.key)}>{r.label}</Chip>
          ))}
          <input style={searchInput} placeholder="Search by order # or name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--color-text-muted)", whiteSpace: "nowrap" }}>
            {completedTotal} order{completedTotal === 1 ? "" : "s"} · <strong style={{ color: "var(--color-text)" }}>{formatINR(completedRevenue)}</strong> <span style={{ fontWeight: 400 }}>(this page)</span>
          </span>
        </div>
      )}
      <div style={{ height: 16 }} />

      {tab === "active" ? (
        activeCount === 0 ? (
          <EmptyState icon="🎉" title="No active orders" sub="You're all caught up! New customer orders will appear here." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {ACTIVE_GROUPS.map((g) => {
              const list = grouped[g.key];
              const isCollapsed = collapsed[g.key] ?? false;
              return (
                <section key={g.key}>
                  <button style={groupHeader} onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !isCollapsed }))}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>
                      {g.emoji} {g.label} <span style={{ color: "var(--color-text-muted)", fontWeight: 500 }}>({list.length})</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--color-text-muted)", fontSize: 12, fontWeight: 500 }}>
                      {list.length > 0 && <span>Oldest first ↑</span>}
                      <span>{isCollapsed ? "▾" : "▴"}</span>
                    </span>
                  </button>
                  {!isCollapsed && (
                    list.length === 0 ? (
                      <div style={{ color: "var(--color-text-muted)", fontSize: 13, padding: "6px 2px 0" }}>
                        {g.key === "PREPARING" ? "No orders currently being prepared." : "No new orders."}
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                        {list.map((o) => (
                          <CompactOrderCard
                            key={o.id}
                            order={o}
                            items={itemsByOrder[o.id] ?? []}
                            border={g.border}
                            isNew={latestNew?.id === o.id}
                            busy={busyId === o.id}
                            onAdvance={() => advance(o)}
                            onDecline={() => setCancelling(o)}
                            onView={() => setDetail(o)}
                          />
                        ))}
                      </div>
                    )
                  )}
                </section>
              );
            })}
          </div>
        )
      ) : (
        completedLoading && completed.length === 0 ? (
          <div style={{ padding: 32, color: "var(--color-text-muted)" }}>Loading…</div>
        ) : completedTotal === 0 ? (
          <EmptyState icon="📋" title="No completed orders yet" sub="Completed orders will appear here." />
        ) : (
          <CompletedTable rows={completed} itemsByOrder={itemsByOrder} onView={setDetail} page={page} totalPages={totalPages} total={completedTotal} onPage={setPage} />
        )
      )}

      {cancelling && (
        <CancelOrderModal order={cancelling} busy={busyId === cancelling.id} onConfirm={confirmCancel} onClose={() => setCancelling(null)} />
      )}
      {detail && (
        <OrderDrawer
          order={detail}
          items={itemsByOrder[detail.id] ?? []}
          busy={busyId === detail.id}
          onAdvance={() => advance(detail)}
          onDecline={() => setCancelling(detail)}
          onClose={() => setDetail(null)}
        />
      )}
    </VendorLayout>
  );
}

/* ---------- Compact active order card ---------- */

function CompactOrderCard({
  order, items, border, isNew, busy, onAdvance, onDecline, onView,
}: {
  order: Order; items: OrderItemWithImage[]; border: string; isNew: boolean; busy: boolean;
  onAdvance: () => void; onDecline: () => void; onView: () => void;
}) {
  const ago = timeAgo(order.placed_at);
  const nextLabel = primaryActionLabel(order.status);
  const totalCount = items.reduce((s, it) => s + it.quantity, 0);
  // Badge must match the section: any non-NEW active order shows "Preparing".
  const displayStatus = order.status === "NEW" ? "NEW" : "PREPARING";

  // Compact one-line item summary: "2 × Methi · 1 × Tea  + N more"
  const MAX = 3;
  const shown = items.slice(0, MAX);
  const extra = items.length - shown.length;
  const itemLine = shown.map((it) => `${it.quantity} × ${it.item_name}`).join("  ·  ");

  return (
    <div
      style={{ ...compactCard, borderLeft: `4px solid ${border}`, animation: isNew ? "orderly-new-highlight 1s ease-out" : undefined }}
      onClick={onView}
    >
      {/* Row 1: number + status + meta + total */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 18, fontWeight: 800 }}>{order.order_number ? `#${order.order_number}` : "—"}</strong>
        <StatusPill status={displayStatus} />
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{order.customer_name || "Guest"} · {order.source} · {ago}</span>
        <strong style={{ marginLeft: "auto", fontSize: 16 }}>{formatINR(Number(order.total))}</strong>
      </div>

      {/* Row 2: item thumbnails + names + payment + actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 180 }}>
          {/* up to 3 small thumbnails */}
          <div style={{ display: "flex", flexShrink: 0 }}>
            {shown.map((it, i) => (
              <span key={it.id} style={{ ...thumb, marginLeft: i === 0 ? 0 : -8, zIndex: shown.length - i }}>
                {it.image_url ? <img src={it.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🍽️"}
              </span>
            ))}
          </div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {itemLine || `${totalCount} item${totalCount === 1 ? "" : "s"}`}
            {extra > 0 && <span style={{ color: "var(--color-primary)", fontWeight: 600 }}>{"  "}+ {extra} more</span>}
          </span>
        </div>
        <PaymentDot status={order.payment_status} />
        {/* Stop propagation so action clicks don't also open the drawer */}
        <div style={{ display: "flex", gap: 8 }} onClick={(e) => e.stopPropagation()}>
          {order.status === "NEW" ? (
            <>
              <Button variant="success" onClick={onAdvance} disabled={busy}>{busy ? "…" : "Accept Order"}</Button>
              <Button variant="danger" onClick={onDecline} disabled={busy}>Decline</Button>
            </>
          ) : (
            nextLabel && (
              <Button variant={actionVariant(order.status)} onClick={onAdvance} disabled={busy}>{busy ? "…" : nextLabel}</Button>
            )
          )}
          <Button variant="secondary" onClick={onView} disabled={busy}>View</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Completed table ---------- */

function CompletedTable({
  rows, itemsByOrder, onView, page, totalPages, total, onPage,
}: {
  rows: Order[]; itemsByOrder: Record<string, OrderItemWithImage[]>; onView: (o: Order) => void;
  page: number; totalPages: number; total: number; onPage: (p: number) => void;
}) {
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "var(--color-bg)", textAlign: "left" }}>
            {["#", "Customer", "Items", "Total", "Completed", "Source", "Payment", ""].map((h) => <th key={h} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const count = (itemsByOrder[o.id] ?? []).reduce((s, it) => s + it.quantity, 0);
            const when = new Date(o.cancelled_at ?? o.confirmed_at ?? o.placed_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return (
              <tr key={o.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                <td style={{ ...td, fontWeight: 700 }}>{o.order_number ? `#${o.order_number}` : "—"}</td>
                <td style={td}>{o.customer_name || "Guest"}</td>
                <td style={td}>{count} item{count === 1 ? "" : "s"}</td>
                <td style={{ ...td, fontWeight: 600 }}>{formatINR(Number(o.total))}</td>
                <td style={{ ...td, color: "var(--color-text-muted)" }}>{when}</td>
                <td style={td}>{o.source}</td>
                <td style={td}><PaymentDot status={o.payment_status} /></td>
                <td style={{ ...td, textAlign: "right" }}><button style={viewLink} onClick={() => onView(o)}>View</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
        <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
          Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} orders
        </span>
        <div style={{ display: "flex", gap: 4 }}>
          <PageBtn disabled={page === 1} onClick={() => onPage(page - 1)}>←</PageBtn>
          {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map((p) => (
            <PageBtn key={p} active={p === page} onClick={() => onPage(p)}>{p}</PageBtn>
          ))}
          <PageBtn disabled={page === totalPages} onClick={() => onPage(page + 1)}>→</PageBtn>
        </div>
      </div>
    </div>
  );
}

/* ---------- small UI ---------- */

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={chip(active)}>{children}</button>;
}

function PageBtn({ children, active, disabled, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      minWidth: 30, height: 30, borderRadius: 8, border: "1px solid var(--color-border)",
      background: active ? "var(--color-primary)" : "#fff", color: active ? "#fff" : "var(--color-text)",
      fontWeight: 600, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  );
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--color-text-muted)" }}>
      <div style={{ fontSize: 40 }}>{icon}</div>
      <h3 style={{ margin: "10px 0 4px", color: "var(--color-text)" }}>{title}</h3>
      <p style={{ margin: 0, fontSize: 14 }}>{sub}</p>
    </div>
  );
}

/** Return the epoch-ms cutoff for a completed-orders date range, or null for "all". */
function rangeCutoff(range: "today" | "week" | "month" | "all"): number | null {
  if (range === "all") return null;
  const d = new Date();
  if (range === "today") {
    d.setHours(0, 0, 0, 0);
  } else if (range === "week") {
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
  }
  return d.getTime();
}

const DATE_RANGES: { key: "today" | "week" | "month" | "all"; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "all", label: "All" },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString();
}

/* ---------- styles ---------- */

const card: React.CSSProperties = {
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: 14, padding: 16, boxShadow: "var(--shadow-card)",
};
const compactCard: React.CSSProperties = {
  background: "var(--color-surface)", border: "1px solid var(--color-border)",
  borderRadius: 12, padding: "12px 16px", boxShadow: "var(--shadow-card)", cursor: "pointer",
};
const tabBar: React.CSSProperties = { display: "flex", gap: 4, borderBottom: "1px solid var(--color-border)", marginTop: 20 };
const tabBtn = (active: boolean): React.CSSProperties => ({
  background: "none", border: "none", padding: "10px 16px", fontSize: 15, fontWeight: 600,
  color: active ? "var(--color-primary)" : "var(--color-text-muted)",
  borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
  cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: -1,
});
const countBadge: React.CSSProperties = { background: "var(--color-primary)", color: "#fff", borderRadius: 999, fontSize: 12, fontWeight: 700, padding: "1px 8px" };
const groupHeader: React.CSSProperties = {
  width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
  background: "none", border: "none", borderBottom: "1px solid var(--color-border)",
  padding: "6px 2px 10px", cursor: "pointer", textAlign: "left",
};
const chip = (active: boolean): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 999, border: "1px solid var(--color-border)",
  background: active ? "var(--color-primary)" : "#fff", color: active ? "#fff" : "var(--color-text-muted)",
  fontWeight: 600, fontSize: 13, cursor: "pointer",
});
const pillBtn = (active: boolean, success: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10,
  border: "1px solid var(--color-border)",
  background: active ? (success ? "var(--color-positive-bg)" : "var(--color-primary)") : "#fff",
  color: active ? (success ? "var(--color-positive)" : "#fff") : "var(--color-text)",
  fontWeight: 600, fontSize: 13, cursor: "pointer",
});
const searchInput: React.CSSProperties = { flex: 1, minWidth: 160, padding: "9px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 14 };
const th: React.CSSProperties = { padding: "10px 14px", fontSize: 12, color: "var(--color-text-muted)", fontWeight: 600 };
const td: React.CSSProperties = { padding: "12px 14px" };
const viewLink: React.CSSProperties = { background: "none", border: "1px solid var(--color-border)", borderRadius: 8, padding: "5px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer", color: "var(--color-primary)" };
const thumb: React.CSSProperties = { width: 34, height: 34, borderRadius: 8, background: "var(--color-bg)", display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0, fontSize: 15, border: "2px solid var(--color-surface)" };
