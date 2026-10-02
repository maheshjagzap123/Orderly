import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { VendorLayout } from "./VendorLayout";
import { StatusPill } from "@/components/StatusPill";
import { Button } from "@/components/ui/Button";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { NewOrderToast } from "@/components/NewOrderToast";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import { useRealtimeOrders, SOUND_PREF_KEY, soundEnabled } from "@/hooks/useRealtimeOrders";
import { getOrderItemsFor, updateOrderStatus, cancelOrder, NEXT_STATUS } from "@/lib/vendorApi";
import { formatINR } from "@/lib/format";
import type { Order, OrderItem, OrderSource, OrderStatus } from "@/lib/database.types";
import { CancelOrderModal } from "./CancelOrderModal";
import { OrderDetailModal } from "./OrderDetailModal";
import { PaymentDot, primaryActionLabel } from "./orderUi";

const ACTIVE_STATUSES = ["NEW", "ACCEPTED", "PREPARING", "READY"];
const ACTIVE_FILTERS: (OrderStatus | "ALL")[] = ["ALL", "NEW", "ACCEPTED", "PREPARING", "READY"];
const PAGE_SIZE = 10;

export function OrdersPage() {
  const navigate = useNavigate();
  const { business, loading } = useVendorBusiness();
  const { orders, connected, latestNew, newOrderCount, acknowledge } = useRealtimeOrders(business?.id, 200, true);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItem[]>>({});
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [activeFilter, setActiveFilter] = useState<(typeof ACTIVE_FILTERS)[number]>("ALL");
  const [sourceFilter, setSourceFilter] = useState<OrderSource | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sound, setSound] = useState(soundEnabled());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Order | null>(null);
  const [detail, setDetail] = useState<Order | null>(null);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  useEffect(() => {
    const ids = orders.map((o) => o.id);
    if (ids.length) getOrderItemsFor(ids).then(setItemsByOrder).catch(() => {});
  }, [orders]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    localStorage.setItem(SOUND_PREF_KEY, next ? "on" : "off");
  }

  const bySource = (o: Order) => (sourceFilter === "ALL" ? true : o.source === sourceFilter);

  const active = useMemo(
    () => orders
      .filter((o) => ACTIVE_STATUSES.includes(o.status) && bySource(o))
      .filter((o) => (activeFilter === "ALL" ? true : o.status === activeFilter)),
    [orders, sourceFilter, activeFilter]
  );

  const completedAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders
      .filter((o) => (o.status === "COMPLETED" || o.status === "CANCELLED") && bySource(o))
      .filter((o) =>
        !q ? true :
        String(o.order_number ?? "").includes(q) || (o.customer_name ?? "").toLowerCase().includes(q)
      );
  }, [orders, sourceFilter, search]);

  const totalPages = Math.max(1, Math.ceil(completedAll.length / PAGE_SIZE));
  const completed = completedAll.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > totalPages) setPage(1); }, [page, totalPages]);

  async function advance(order: Order) {
    const next = NEXT_STATUS[order.status];
    if (!next || busyId) return; // double-action guard
    setBusyId(order.id);
    try {
      await updateOrderStatus(order.id, next);
      setDetail((d) => (d && d.id === order.id ? { ...d, status: next } : d));
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
      setDetail(null);
    } finally {
      setBusyId(null);
    }
  }

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <VendorLayout businessName={business.name} ordersBadge={active.length}>
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
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={toggleSound} style={soundBtn(sound)} title="New-order sound alerts">
            {sound ? "🔊" : "🔇"} Sound {sound ? "On" : "Off"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={tabBar}>
        <button style={tabBtn(tab === "active")} onClick={() => setTab("active")}>
          Active Orders <span style={countBadge}>{active.length}</span>
        </button>
        <button style={tabBtn(tab === "completed")} onClick={() => setTab("completed")}>
          Completed Orders
        </button>
      </div>

      {tab === "active" ? (
        <>
          {/* Active filters */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
            {ACTIVE_FILTERS.map((s) => (
              <Chip key={s} active={activeFilter === s} onClick={() => setActiveFilter(s)}>
                {s === "ALL" ? "All Active" : titleCase(s)}
              </Chip>
            ))}
            <span style={{ width: 1, background: "var(--color-border)", margin: "0 4px" }} />
            {(["ALL", "QR", "KIOSK"] as const).map((s) => (
              <Chip key={s} active={sourceFilter === s} onClick={() => setSourceFilter(s)}>
                {s === "ALL" ? "All sources" : s}
              </Chip>
            ))}
          </div>

          {active.length === 0 ? (
            <EmptyState icon="🎉" title="No active orders" sub="You're all caught up! New customer orders will appear here." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {active.map((o) => (
                <ActiveOrderCard
                  key={o.id}
                  order={o}
                  items={itemsByOrder[o.id] ?? []}
                  busy={busyId === o.id}
                  onAdvance={() => advance(o)}
                  onDecline={() => setCancelling(o)}
                  onDetail={() => setDetail(o)}
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* Completed search */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "16px 0" }}>
            <input style={searchInput} placeholder="Search completed orders…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            {(["ALL", "QR", "KIOSK"] as const).map((s) => (
              <Chip key={s} active={sourceFilter === s} onClick={() => setSourceFilter(s)}>
                {s === "ALL" ? "All sources" : s}
              </Chip>
            ))}
          </div>

          {completedAll.length === 0 ? (
            <EmptyState icon="📋" title="No completed orders yet" sub="Completed orders will appear here." />
          ) : (
            <CompletedTable
              rows={completed}
              itemsByOrder={itemsByOrder}
              onView={setDetail}
              page={page}
              totalPages={totalPages}
              total={completedAll.length}
              onPage={setPage}
            />
          )}
        </>
      )}

      {cancelling && (
        <CancelOrderModal order={cancelling} busy={busyId === cancelling.id} onConfirm={confirmCancel} onClose={() => setCancelling(null)} />
      )}
      {detail && (
        <OrderDetailModal
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

/* ---------- Active order card (matches reference) ---------- */

function ActiveOrderCard({
  order, items, busy, onAdvance, onDecline, onDetail,
}: {
  order: Order; items: OrderItem[]; busy: boolean; onAdvance: () => void; onDecline: () => void; onDetail: () => void;
}) {
  const ago = timeAgo(order.placed_at);
  const nextLabel = primaryActionLabel(order.status);
  const busyLabel = order.status === "NEW" ? "Accepting…" : order.status === "READY" ? "Completing…" : "Updating…";

  return (
    <div style={card}>
      {/* Header line */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 20, fontWeight: 800 }}>{order.order_number ? `#${order.order_number}` : "—"}</strong>
        <StatusPill status={order.status} />
        <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>{order.customer_name || "Guest"} · {order.source} · {ago}</span>
        <strong style={{ marginLeft: "auto", fontSize: 18 }}>{formatINR(Number(order.total))}</strong>
      </div>

      {/* Items + payment */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          {items.map((it) => (
            <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "2px 0", maxWidth: 320 }}>
              <span>{it.quantity} × {it.item_name}</span>
              <span style={{ color: "var(--color-text-muted)" }}>{formatINR(Number(it.line_total))}</span>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 4 }}>Payment</div>
          <PaymentDot status={order.payment_status} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button variant="ghost" onClick={onDetail} disabled={busy}>View Details</Button>
        <Button variant="secondary" onClick={onDecline} disabled={busy}>Decline</Button>
        {nextLabel && (
          <Button variant={order.status === "READY" ? "positive" : "primary"} onClick={onAdvance} disabled={busy}>
            {busy ? busyLabel : nextLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- Completed table ---------- */

function CompletedTable({
  rows, itemsByOrder, onView, page, totalPages, total, onPage,
}: {
  rows: Order[]; itemsByOrder: Record<string, OrderItem[]>; onView: (o: Order) => void;
  page: number; totalPages: number; total: number; onPage: (p: number) => void;
}) {
  return (
    <div style={{ ...card, padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr style={{ background: "var(--color-bg)", textAlign: "left" }}>
            {["#", "Customer", "Items", "Total", "Completed", "Source", "Payment", ""].map((h) => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => {
            const items = itemsByOrder[o.id] ?? [];
            const count = items.reduce((s, it) => s + it.quantity, 0);
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
                <td style={{ ...td, textAlign: "right" }}>
                  <button style={viewLink} onClick={() => onView(o)}>View</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

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
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 30, height: 30, borderRadius: 8, border: "1px solid var(--color-border)",
        background: active ? "var(--color-primary)" : "#fff", color: active ? "#fff" : "var(--color-text)",
        fontWeight: 600, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
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

const titleCase = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

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
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 14,
  padding: 16,
  boxShadow: "var(--shadow-card)",
};
const tabBar: React.CSSProperties = { display: "flex", gap: 4, borderBottom: "1px solid var(--color-border)", marginTop: 20 };
const tabBtn = (active: boolean): React.CSSProperties => ({
  background: "none", border: "none", padding: "10px 16px", fontSize: 15, fontWeight: 600,
  color: active ? "var(--color-primary)" : "var(--color-text-muted)",
  borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
  cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginBottom: -1,
});
const countBadge: React.CSSProperties = { background: "var(--color-primary)", color: "#fff", borderRadius: 999, fontSize: 12, fontWeight: 700, padding: "1px 8px" };
const chip = (active: boolean): React.CSSProperties => ({
  padding: "7px 14px", borderRadius: 999, border: "1px solid var(--color-border)",
  background: active ? "var(--color-primary)" : "#fff", color: active ? "#fff" : "var(--color-text-muted)",
  fontWeight: 600, fontSize: 13, cursor: "pointer",
});
const soundBtn = (on: boolean): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 10,
  border: "1px solid var(--color-border)", background: on ? "var(--color-positive-bg)" : "#fff",
  color: on ? "var(--color-positive)" : "var(--color-text-muted)", fontWeight: 600, fontSize: 13, cursor: "pointer",
});
const searchInput: React.CSSProperties = { flex: 1, minWidth: 220, padding: "9px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 14 };
const th: React.CSSProperties = { padding: "10px 14px", fontSize: 12, color: "var(--color-text-muted)", fontWeight: 600 };
const td: React.CSSProperties = { padding: "12px 14px" };
const viewLink: React.CSSProperties = { background: "none", border: "1px solid var(--color-border)", borderRadius: 8, padding: "5px 12px", fontWeight: 600, fontSize: 13, cursor: "pointer", color: "var(--color-primary)" };
