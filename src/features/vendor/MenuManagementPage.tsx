import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { VendorLayout } from "./VendorLayout";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import {
  getCategories, getItems, createCategory, updateCategory, deleteCategory,
  toggleItemAvailable, deleteItem, reorderItems, reorderCategories,
} from "@/lib/vendorApi";
import { formatINR } from "@/lib/format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { Category, Item } from "@/lib/database.types";

export function MenuManagementPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "categories" ? "categories" : "items";
  const { business, loading } = useVendorBusiness();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  // Unified delete confirmation (replaces native confirm()).
  const [pendingDelete, setPendingDelete] = useState<
    { kind: "item"; item: Item } | { kind: "category"; cat: Category } | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!business) return;
    const [c, i] = await Promise.all([getCategories(business.id), getItems(business.id)]);
    setCategories(c);
    setItems(i);
  }, [business]);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  useEffect(() => { load(); }, [load]);

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? "Uncategorized";
  const visibleItems = items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase()));
  // Reordering only makes sense on the full, unfiltered list.
  const canReorderItems = query.trim() === "";

  async function onToggle(item: Item) {
    const updated = await toggleItemAvailable(item.id, !item.is_available);
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  }

  // Move item at `from` to `to` within the full list, persist new display_order.
  async function moveItem(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setItems(next); // optimistic
    try {
      await reorderItems(next.map((i) => i.id));
    } catch {
      load(); // revert to authoritative order on failure
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.kind === "item") {
        await deleteItem(pendingDelete.item.id);
        setItems((prev) => prev.filter((i) => i.id !== pendingDelete.item.id));
      } else {
        await deleteCategory(pendingDelete.cat.id);
        await load();
      }
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <VendorLayout businessName={business.name}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Menu Management</h1>
        {tab === "items" && <Button onClick={() => navigate("/vendor/menu/item/new")}>+ Add Item</Button>}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <TabBtn active={tab === "items"} onClick={() => setParams({})}>Items ({items.length})</TabBtn>
        <TabBtn active={tab === "categories"} onClick={() => setParams({ tab: "categories" })}>Categories ({categories.length})</TabBtn>
      </div>

      {tab === "items" ? (
        <>
          <input
            style={search}
            placeholder="Search items…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)" }}>
              <div style={{ fontSize: 40 }}>🍽️</div>
              <h3 style={{ margin: "10px 0 4px", color: "var(--color-text)" }}>Your menu is empty</h3>
              <p style={{ margin: "0 0 14px", fontSize: 14 }}>Add your first item to start accepting orders.</p>
              <Button onClick={() => navigate("/vendor/menu/item/new")}>+ Add Item</Button>
            </div>
          ) : (
            <>
              {canReorderItems && (
                <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 10px" }}>
                  Drag the ⠿ handle to reorder how items appear on the customer menu.
                </p>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleItems.map((item) => {
                  const fullIndex = items.findIndex((i) => i.id === item.id);
                  return (
                    <DragRow
                      key={item.id}
                      draggable={canReorderItems}
                      index={fullIndex}
                      onDropIndex={(from) => moveItem(from, fullIndex)}
                    >
                      {canReorderItems && <span style={dragHandle} aria-hidden title="Drag to reorder">⠿</span>}
                      <div style={thumb}>{item.image_url ? <img src={item.image_url} alt="" style={img} /> : "🍽️"}</div>
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{catName(item.category_id)}</div>
                      </div>
                      <strong style={{ color: "var(--color-primary)" }}>{formatINR(Number(item.price))}</strong>
                      <button onClick={() => onToggle(item)} style={availBtn(item.is_available)}>
                        {item.is_available ? "Available" : "Sold Out"}
                      </button>
                      <Button variant="secondary" onClick={() => navigate(`/vendor/menu/item/${item.id}`)}>Edit</Button>
                      <button onClick={() => setPendingDelete({ kind: "item", item })} style={trash} aria-label="Delete">🗑</button>
                    </DragRow>
                  );
                })}
                {visibleItems.length === 0 && <div style={{ color: "var(--color-text-muted)" }}>No items match your search.</div>}
              </div>
            </>
          )}
        </>
      ) : (
        <CategoriesTab
          categories={categories}
          onCreate={async (name) => { await createCategory(business.id, name, categories.length + 1); await load(); }}
          onToggle={async (c) => { await updateCategory(c.id, { is_active: !c.is_active }); await load(); }}
          onRename={async (c, name) => { await updateCategory(c.id, { name }); await load(); }}
          onDelete={async (c) => setPendingDelete({ kind: "category", cat: c })}
          onReorder={async (orderedIds) => {
            // Reorder optimistically, guarding against any id that's momentarily missing.
            setCategories((prev) => {
              const byId = new Map(prev.map((c) => [c.id, c]));
              const next = orderedIds.map((id) => byId.get(id)).filter((c): c is Category => Boolean(c));
              // Append any categories not in orderedIds (defensive) so none are dropped.
              for (const c of prev) if (!orderedIds.includes(c.id)) next.push(c);
              return next;
            });
            try { await reorderCategories(orderedIds); } catch { await load(); }
          }}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          title={pendingDelete.kind === "item" ? "Delete item?" : "Delete category?"}
          message={
            pendingDelete.kind === "item"
              ? `"${pendingDelete.item.name}" will be removed from your menu. Past orders keep their record.`
              : `"${pendingDelete.cat.name}" will be deleted. Items in it become uncategorized.`
          }
          confirmLabel="Delete"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </VendorLayout>
  );
}

function CategoriesTab({
  categories, onCreate, onToggle, onRename, onDelete, onReorder,
}: {
  categories: Category[];
  onCreate: (name: string) => Promise<void>;
  onToggle: (c: Category) => Promise<void>;
  onRename: (c: Category, name: string) => Promise<void>;
  onDelete: (c: Category) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");

  function moveCategory(from: number, to: number) {
    if (from === to || to < 0 || to >= categories.length) return;
    const next = [...categories];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onReorder(next.map((c) => c.id));
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input style={{ ...search, marginBottom: 0 }} placeholder="New category name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button
          onClick={async () => { if (newName.trim()) { await onCreate(newName.trim()); setNewName(""); } }}
          disabled={!newName.trim()}
        >
          Add Category
        </Button>
      </div>
      {categories.length > 1 && (
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 10px" }}>
          Drag the ⠿ handle to reorder categories on the customer menu.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {categories.map((c, i) => (
          <DragRow key={c.id} draggable index={i} onDropIndex={(from) => moveCategory(from, i)}>
            <span style={dragHandle} aria-hidden title="Drag to reorder">⠿</span>
            <input
              defaultValue={c.name}
              style={{ flex: 1, border: "1px solid var(--color-border)", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
              onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.name) onRename(c, e.target.value.trim()); }}
            />
            <button onClick={() => onToggle(c)} style={availBtn(c.is_active)}>
              {c.is_active ? "Active" : "Hidden"}
            </button>
            <button onClick={() => onDelete(c)} style={trash} aria-label="Delete">🗑</button>
          </DragRow>
        ))}
        {categories.length === 0 && <div style={{ color: "var(--color-text-muted)" }}>No categories yet.</div>}
      </div>
    </div>
  );
}

/**
 * A row that participates in native HTML5 drag-and-drop reordering.
 * On drop, calls onDropIndex with the dragged row's original index so the parent
 * can move it to this row's position. Keeps dependencies out (no DnD library).
 */
function DragRow({
  index,
  draggable,
  onDropIndex,
  children,
}: {
  index: number;
  draggable: boolean;
  onDropIndex: (fromIndex: number) => void;
  children: React.ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(index));
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (!Number.isNaN(from)) onDropIndex(from);
      }}
      style={{ ...row, outline: over ? "2px dashed var(--color-primary)" : "none" }}
    >
      {children}
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: 10,
        border: "1px solid var(--color-border)",
        background: active ? "var(--color-primary)" : "#fff",
        color: active ? "#fff" : "var(--color-text-muted)",
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

const search: React.CSSProperties = {
  width: "100%", maxWidth: 360, padding: "10px 12px", border: "1px solid var(--color-border)",
  borderRadius: 10, fontSize: 14, marginBottom: 16,
};
const row: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 12, background: "var(--color-surface)",
  border: "1px solid var(--color-border)", borderRadius: 12, padding: 12,
  // Allow the price + Available + Edit + delete controls to wrap below the
  // name on narrow screens instead of overflowing the row.
  flexWrap: "wrap",
};
const thumb: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 10, background: "var(--color-bg)",
  display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0,
};
const img: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
const trash: React.CSSProperties = { background: "none", border: "none", fontSize: 16, cursor: "pointer" };
const dragHandle: React.CSSProperties = { cursor: "grab", color: "var(--color-text-muted)", fontSize: 18, userSelect: "none", flexShrink: 0 };
const availBtn = (on: boolean): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 999, border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer",
  background: on ? "#dcfce7" : "#fde8e6", color: on ? "#166534" : "#c42b22",
});
