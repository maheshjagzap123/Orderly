import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { VendorLayout } from "./VendorLayout";
import { Button } from "@/components/ui/Button";
import { useVendorBusiness } from "@/hooks/useVendorBusiness";
import {
  getCategories, getItemById, createItem, updateItem, uploadMenuImage,
} from "@/lib/vendorApi";
import type { Category, ItemBadge } from "@/lib/database.types";

const BADGES: (ItemBadge | "")[] = ["", "POPULAR", "BESTSELLER", "NEW"];

export function ItemEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isNew = !id;
  const { business, loading } = useVendorBusiness();

  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [badge, setBadge] = useState<ItemBadge | "">("");
  const [available, setAvailable] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !business) navigate("/vendor/onboarding", { replace: true });
  }, [loading, business, navigate]);

  useEffect(() => {
    if (!business) return;
    getCategories(business.id).then(setCategories);
    if (id) {
      getItemById(id).then((item) => {
        if (!item) return;
        setName(item.name);
        setCategoryId(item.category_id ?? "");
        setPrice(String(item.price));
        setDescription(item.description ?? "");
        setBadge(item.badge ?? "");
        setAvailable(item.is_available);
        setImageUrl(item.image_url);
      });
    }
  }, [business, id]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !business) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadMenuImage(business.id, file);
      setImageUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!business) return;
    if (!name.trim() || !price) {
      setError("Name and price are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        category_id: categoryId || null,
        price: Number(price),
        description: description.trim() || null,
        image_url: imageUrl,
        is_available: available,
        badge: (badge || null) as ItemBadge | null,
      };
      if (isNew) await createItem(business.id, payload);
      else await updateItem(id!, payload);
      navigate("/vendor/menu");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (loading || !business) return <div style={{ padding: 32 }}>Loading…</div>;

  return (
    <VendorLayout businessName={business.name}>
      <h1 style={{ marginTop: 0 }}>{isNew ? "Add Item" : "Edit Item"}</h1>

      <div style={{ maxWidth: 520, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={imageBox}>
          {imageUrl ? <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 40 }}>🍽️</span>}
        </div>
        <label>
          <span style={lbl}>Image</span>
          <input type="file" accept="image/*" onChange={onFile} disabled={uploading} />
          {uploading && <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}> uploading…</span>}
        </label>

        <Field label="Name *"><input style={input} value={name} onChange={(e) => setName(e.target.value)} /></Field>

        <Field label="Category">
          <select style={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Uncategorized</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>

        <Field label="Price (₹) *"><input style={input} type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>

        <Field label="Description">
          <textarea style={{ ...input, minHeight: 70 }} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <Field label="Badge">
          <select style={input} value={badge} onChange={(e) => setBadge(e.target.value as ItemBadge | "")}>
            {BADGES.map((b) => <option key={b} value={b}>{b === "" ? "None" : b}</option>)}
          </select>
        </Field>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
          <span>Available (uncheck for sold out)</span>
        </label>

        {error && <div style={errorBox}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <Button variant="secondary" onClick={() => navigate("/vendor/menu")}>Cancel</Button>
          <Button onClick={save} disabled={saving || uploading}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </VendorLayout>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <span style={lbl}>{label}</span>
    {children}
  </div>
);

const lbl: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", border: "1px solid var(--color-border)", borderRadius: 10, fontSize: 15 };
const imageBox: React.CSSProperties = { width: 160, height: 120, borderRadius: 12, background: "var(--color-bg)", display: "grid", placeItems: "center", overflow: "hidden", border: "1px solid var(--color-border)" };
const errorBox: React.CSSProperties = { padding: "9px 12px", background: "#fdecea", color: "#b42318", borderRadius: 8, fontSize: 13 };
