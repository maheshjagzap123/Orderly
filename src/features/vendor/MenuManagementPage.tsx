import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { VendorLayout } from "./VendorLayout";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import {
  getCategories, getItems, createCategory, updateCategory, deleteCategory,
  toggleItemAvailable, deleteItem,
} from "@/lib/vendorApi";
import { formatINR } from "@/lib/format";
import type { Category, Item } from "@/lib/database.types";

export function MenuManagementPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "categories" ? "categories" : "items";
  const { business, loading } = useVendorBusiness();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [query, setQuery] = useState("");

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

  async function onToggle(item: Item) {
    const updated = await toggleItemAvailable(item.id, !item.is_available);
    setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  }

  async function onDeleteItem(item: Item) {
    if (!confirm(`Delete "${item.name}"?`)) return;
    await deleteItem(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
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
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleItems.map((item) => (
              <div key={item.id} style={row}>
                <div style={thumb}>{item.image_url ? <img src={item.image_url} alt="" style={img} /> : "🍽️"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{catName(item.category_id)}</div>
                </div>
                <strong style={{ color: "var(--color-primary)" }}>{formatINR(Number(item.price))}</strong>
                <button onClick={() => onToggle(item)} style={availBtn(item.is_available)}>
                  {item.is_available ? "Available" : "Sold Out"}
                </button>
                <Button variant="secondary" onClick={() => navigate(`/vendor/menu/item/${item.id}`)}>Edit</Button>
                <button onClick={() => onDeleteItem(item)} style={trash} aria-label="Delete">🗑</button>
              </div>
            ))}
            {visibleItems.length === 0 && <div style={{ color: "var(--color-text-muted)" }}>No items found.</div>}
          </div>
        </>
      ) : (
        <CategoriesTab
          businessId={business.id}
          categories={categories}
          onChange={load}
          onCreate={async (name) => { await createCategory(business.id, name, categories.length + 1); await load(); }}
          onToggle={async (c) => { await updateCategory(c.id, { is_active: !c.is_active }); await load(); }}
          onRename={async (c, name) => { await updateCategory(c.id, { name }); await load(); }}
          onDelete={async (c) => { if (confirm(`Delete category "${c.name}"?`)) { await deleteCategory(c.id); await load(); } }}
        />
      )}
    </VendorLayout>
  );
}

function CategoriesTab({
  categories, onCreate, onToggle, onRename, onDelete,
}: {
  businessId: string;
  categories: Category[];
  onChange: () => void;
  onCreate: (name: string) => Promise<void>;
  onToggle: (c: Category) => Promise<void>;
  onRename: (c: Category, name: string) => Promise<void>;
  onDelete: (c: Category) => Promise<void>;
}) {
  const [newName, setNewName] = useState("");

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
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {categories.map((c) => (
          <div key={c.id} style={row}>
            <input
              defaultValue={c.name}
              style={{ flex: 1, border: "1px solid var(--color-border)", borderRadius: 8, padding: "8px 10px", fontSize: 14 }}
              onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.name) onRename(c, e.target.value.trim()); }}
            />
            <button onClick={() => onToggle(c)} style={availBtn(c.is_active)}>
              {c.is_active ? "Active" : "Hidden"}
            </button>
            <button onClick={() => onDelete(c)} style={trash} aria-label="Delete">🗑</button>
          </div>
        ))}
        {categories.length === 0 && <div style={{ color: "var(--color-text-muted)" }}>No categories yet.</div>}
      </div>
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
};
const thumb: React.CSSProperties = {
  width: 44, height: 44, borderRadius: 10, background: "var(--color-bg)",
  display: "grid", placeItems: "center", overflow: "hidden", flexShrink: 0,
};
const img: React.CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
const trash: React.CSSProperties = { background: "none", border: "none", fontSize: 16, cursor: "pointer" };
const availBtn = (on: boolean): React.CSSProperties => ({
  padding: "6px 12px", borderRadius: 999, border: "none", fontWeight: 600, fontSize: 12, cursor: "pointer",
  background: on ? "#dcfce7" : "#fde8e6", color: on ? "#166534" : "#c42b22",
});
