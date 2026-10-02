import { supabase } from "./supabase";
import type { Business, Category, Item, Order, OrderItem, OrderStatus, ItemBadge } from "./database.types";

/** Fetch the business owned by the current user (or null if none yet). */
export async function getMyBusiness(): Promise<Business | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("owner_id", uid)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export interface CreateBusinessInput {
  name: string;
  slug: string;
  description?: string | null;
  address?: string | null;
  pincode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  open_time?: string | null;
  close_time?: string | null;
  prep_time_min?: number | null;
  prep_time_max?: number | null;
  tax_percent?: number;
}

/**
 * Create the business for the current user and mark onboarding complete.
 *
 * - If the user ALREADY has a business, return it (idempotent — avoids creating
 *   duplicates and getting stuck when onboarding is retried).
 * - The `slug` column is globally unique; if the chosen slug is taken, retry
 *   with a short random suffix so setup never dead-ends on a name clash.
 */
export async function createBusiness(input: CreateBusinessInput): Promise<Business> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not authenticated");

  // Already onboarded? Reuse it instead of inserting a duplicate.
  const existing = await getMyBusiness();
  if (existing) return existing;

  const baseSlug = input.slug;
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      // order_seq starts at 0 so this vendor's first order is #1
      // (assign_order_number increments-then-returns). Set explicitly here so it
      // works regardless of the column's DB default.
      .insert({ ...input, slug, owner_id: uid, onboarding_complete: true, order_seq: 0 })
      .select("*")
      .single();

    if (!error) return data;
    // 23505 = unique_violation (slug taken) → try another slug.
    const code = (error as { code?: string }).code;
    if (code !== "23505") throw error;
  }
  throw new Error("Could not generate a unique link for your shop. Please try a different name.");
}

/** Update fields on a business. */
export async function updateBusiness(id: string, patch: Partial<Business>): Promise<Business> {
  const { data, error } = await supabase
    .from("businesses")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getCategories(businessId: string): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("business_id", businessId)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createCategory(businessId: string, name: string, displayOrder: number): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert({ business_id: businessId, name, display_order: displayOrder })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getItems(businessId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("business_id", businessId)
    .order("display_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getRecentOrders(businessId: string, limit = 10): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("business_id", businessId)
    .order("placed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Fetch only ACTIVE orders (NEW/ACCEPTED/PREPARING/READY) for the live queue. */
export async function getActiveOrders(businessId: string): Promise<Order[]> {
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("business_id", businessId)
    .in("status", ["NEW", "ACCEPTED", "PREPARING", "READY"])
    .order("placed_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface CompletedOrdersPage {
  rows: Order[];
  total: number;
}

/**
 * Fetch COMPLETED/CANCELLED orders, paginated server-side, with optional
 * since-date and search. Keeps the client from downloading hundreds of rows.
 */
export async function getCompletedOrders(
  businessId: string,
  opts: { page: number; pageSize: number; since?: Date | null; search?: string; source?: "QR" | "KIOSK" | "ALL" } = { page: 1, pageSize: 10 }
): Promise<CompletedOrdersPage> {
  const { page, pageSize, since, search, source } = opts;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("orders")
    .select("*", { count: "exact" })
    .eq("business_id", businessId)
    .in("status", ["COMPLETED", "CANCELLED"]);

  if (since) q = q.gte("placed_at", since.toISOString());
  if (source && source !== "ALL") q = q.eq("source", source);
  if (search && search.trim()) {
    const s = search.trim();
    // order_number is numeric; match customer_name OR exact order number.
    const asNum = Number(s);
    if (!Number.isNaN(asNum)) q = q.or(`customer_name.ilike.%${s}%,order_number.eq.${asNum}`);
    else q = q.ilike("customer_name", `%${s}%`);
  }

  const { data, error, count } = await q.order("placed_at", { ascending: false }).range(from, to);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export interface TodayMetrics {
  orders: number;
  revenue: number;
  itemsSold: number;
  avgOrderValue: number;
}

/** Compute today's KPIs from confirmed orders. */
export async function getTodayMetrics(businessId: string): Promise<TodayMetrics> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id,total,payment_status,placed_at")
    .eq("business_id", businessId)
    .gte("placed_at", start.toISOString());
  if (error) throw error;

  const paid = (orders ?? []).filter((o) => o.payment_status === "SUCCESS");
  const revenue = paid.reduce((s, o) => s + Number(o.total), 0);

  let itemsSold = 0;
  if (paid.length > 0) {
    const ids = paid.map((o) => o.id);
    const { data: oi, error: oiErr } = await supabase
      .from("order_items")
      .select("quantity,order_id")
      .in("order_id", ids);
    if (oiErr) throw oiErr;
    itemsSold = (oi ?? []).reduce((s, r) => s + r.quantity, 0);
  }

  return {
    orders: paid.length,
    revenue,
    itemsSold,
    avgOrderValue: paid.length ? revenue / paid.length : 0,
  };
}

// ---------- Orders ----------
//
// The authoritative vendor order state machine lives in
// `src/features/vendor/orderUi.tsx` (2-step: NEW → PREPARING → COMPLETED).
// Do NOT reintroduce a second status helper here — there must be exactly one.

/** Preset cancellation reasons shown to the vendor. */
export const CANCEL_REASONS = [
  "Item unavailable",
  "Too busy",
  "Customer requested",
  "Payment issue",
  "Other",
] as const;

/**
 * Cancel an order with a reason. If the order was paid, this also flags a full
 * refund (payment + order payment_status -> REFUNDED) via the cancel_order RPC.
 */
export async function cancelOrder(orderId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_reason: reason });
  if (error) throw error;
}

/** Advance (or set) an order's status. Owner-only via RLS. */
export async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<Order> {
  const { data, error } = await supabase
    .from("orders")
    .update({ status })
    .eq("id", orderId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Fetch all order_items for a set of order ids, grouped by order. */
/** order_items row plus the current item image (joined from items), for display. */
export type OrderItemWithImage = OrderItem & { image_url: string | null };

export async function getOrderItemsFor(orderIds: string[]): Promise<Record<string, OrderItemWithImage[]>> {
  if (orderIds.length === 0) return {};

  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);
  if (error) throw error;
  const rows = data ?? [];

  // Look up current images for the referenced items in one query.
  // item_id can be null (item deleted) — those fall back to a placeholder.
  const itemIds = [...new Set(rows.map((r) => r.item_id).filter((id): id is string => !!id))];
  const imageById = new Map<string, string | null>();
  if (itemIds.length > 0) {
    const { data: imgs } = await supabase.from("items").select("id,image_url").in("id", itemIds);
    for (const it of imgs ?? []) imageById.set(it.id, it.image_url);
  }

  const map: Record<string, OrderItemWithImage[]> = {};
  for (const row of rows) {
    (map[row.order_id] ??= []).push({ ...row, image_url: row.item_id ? imageById.get(row.item_id) ?? null : null });
  }
  return map;
}

// ---------- Categories (write) ----------

export async function updateCategory(id: string, patch: Partial<Category>): Promise<Category> {
  const { data, error } = await supabase.from("categories").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Items (write) ----------

export interface ItemInput {
  name: string;
  category_id: string | null;
  price: number;
  description?: string | null;
  image_url?: string | null;
  is_available?: boolean;
  display_order?: number;
  badge?: ItemBadge | null;
  prep_time_min?: number | null;
}

export async function createItem(businessId: string, input: ItemInput): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .insert({ ...input, business_id: businessId })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateItem(id: string, patch: Partial<Item>): Promise<Item> {
  const { data, error } = await supabase.from("items").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

/**
 * Persist a new ordering for items. `orderedIds` is the full list in the desired
 * order; each row's display_order is set to its index. Writes are sequential so
 * rapid successive drags can't interleave partial updates; any failure throws so
 * the caller can revert to the authoritative DB order.
 */
export async function reorderItems(orderedIds: string[]): Promise<void> {
  for (let idx = 0; idx < orderedIds.length; idx++) {
    const { error } = await supabase.from("items").update({ display_order: idx }).eq("id", orderedIds[idx]);
    if (error) throw error;
  }
}

/** Persist a new ordering for categories (display_order = index), sequentially. */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  for (let idx = 0; idx < orderedIds.length; idx++) {
    const { error } = await supabase.from("categories").update({ display_order: idx }).eq("id", orderedIds[idx]);
    if (error) throw error;
  }
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

export async function getItemById(id: string): Promise<Item | null> {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

/** Toggle an item's availability (sold-out switch). */
export async function toggleItemAvailable(id: string, available: boolean): Promise<Item> {
  return updateItem(id, { is_available: available });
}

// ---------- Image upload ----------

/** Upload an image to the menu-images bucket and return its public URL. */
/** Allowed image types + max size for menu uploads. */
export const MENU_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MENU_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MENU_IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Validate a candidate menu image. Returns an error message, or null if valid. */
export function validateMenuImage(file: File): string | null {
  if (!MENU_IMAGE_TYPES.includes(file.type)) {
    return "Please choose a JPG, PNG, WebP, or GIF image.";
  }
  if (file.size > MENU_IMAGE_MAX_BYTES) {
    return `Image is too large (max ${(MENU_IMAGE_MAX_BYTES / 1024 / 1024).toFixed(0)} MB).`;
  }
  return null;
}

export async function uploadMenuImage(businessId: string, file: File): Promise<string> {
  const invalid = validateMenuImage(file);
  if (invalid) throw new Error(invalid);

  // Derive the extension from the (verified) MIME type, not the spoofable name.
  const ext = MENU_IMAGE_EXT[file.type] ?? "jpg";
  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("menu-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
  return data.publicUrl;
}

// ---------- Reports ----------

export interface ReportData {
  revenue: number;
  ordersTotal: number;
  completed: number;
  cancelled: number;
  itemsSold: number;
  avgOrderValue: number;
  qrOrders: number;
  kioskOrders: number;
  bestSellers: { name: string; qty: number; revenue: number }[];
}

/** Aggregate order metrics for a period (since = ISO datetime). */
export async function getReport(businessId: string, since: Date): Promise<ReportData> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id,total,status,payment_status,source,placed_at")
    .eq("business_id", businessId)
    .gte("placed_at", since.toISOString());
  if (error) throw error;

  const all = orders ?? [];
  const paid = all.filter((o) => o.payment_status === "SUCCESS");
  const revenue = paid.reduce((s, o) => s + Number(o.total), 0);
  const completed = all.filter((o) => o.status === "COMPLETED").length;
  const cancelled = all.filter((o) => o.status === "CANCELLED").length;
  const qrOrders = paid.filter((o) => o.source === "QR").length;
  const kioskOrders = paid.filter((o) => o.source === "KIOSK").length;

  // Best sellers from order_items of paid orders.
  const bestSellers: ReportData["bestSellers"] = [];
  let itemsSold = 0;
  if (paid.length > 0) {
    const ids = paid.map((o) => o.id);
    const { data: oi, error: oiErr } = await supabase
      .from("order_items")
      .select("item_name,quantity,line_total,order_id")
      .in("order_id", ids);
    if (oiErr) throw oiErr;
    const map = new Map<string, { qty: number; revenue: number }>();
    for (const r of oi ?? []) {
      itemsSold += r.quantity;
      const cur = map.get(r.item_name) ?? { qty: 0, revenue: 0 };
      cur.qty += r.quantity;
      cur.revenue += Number(r.line_total);
      map.set(r.item_name, cur);
    }
    for (const [name, v] of map) bestSellers.push({ name, qty: v.qty, revenue: v.revenue });
    bestSellers.sort((a, b) => b.qty - a.qty);
  }

  return {
    revenue,
    ordersTotal: paid.length,
    completed,
    cancelled,
    itemsSold,
    avgOrderValue: paid.length ? revenue / paid.length : 0,
    qrOrders,
    kioskOrders,
    bestSellers: bestSellers.slice(0, 5),
  };
}

/** A flat order row for CSV export (no sensitive/internal fields). */
export interface ReportOrderRow {
  orderNumber: number | null;
  placedAt: string;
  customerName: string;
  source: string;
  items: string;
  subtotal: number;
  tax: number;
  total: number;
  status: string;
}

/** Fetch orders in a period as flat rows suitable for CSV export. */
export async function getReportOrders(businessId: string, since: Date): Promise<ReportOrderRow[]> {
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id,order_number,customer_name,source,status,subtotal,tax_amount,total,placed_at")
    .eq("business_id", businessId)
    .gte("placed_at", since.toISOString())
    .order("placed_at", { ascending: true });
  if (error) throw error;
  const rows = orders ?? [];
  if (rows.length === 0) return [];

  // One query for all line items, grouped into a readable summary per order.
  const itemsByOrder = await getOrderItemsFor(rows.map((o) => o.id));

  return rows.map((o) => {
    const its = itemsByOrder[o.id] ?? [];
    const summary = its.map((it) => `${it.quantity}x ${it.item_name}`).join("; ");
    return {
      orderNumber: o.order_number,
      placedAt: o.placed_at,
      customerName: o.customer_name || "Guest",
      source: o.source,
      items: summary,
      subtotal: Number(o.subtotal),
      tax: Number(o.tax_amount),
      total: Number(o.total),
      status: o.status,
    };
  });
}

// ---------- Profile ----------

import type { Profile } from "./database.types";

export async function getMyProfile(): Promise<Profile | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProfile(patch: Partial<Profile>): Promise<Profile> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not authenticated");
  const { data, error } = await supabase.from("profiles").update(patch).eq("id", uid).select("*").single();
  if (error) throw error;
  return data;
}

// ---------- Dashboard analytics ----------

export interface DailyPoint {
  label: string;   // e.g. "Mon"
  orders: number;
  revenue: number;
}

export interface HourlyPoint {
  label: string;   // e.g. "8 AM"
  value: number;
}

export interface DashboardAnalytics {
  daily: DailyPoint[];
  hourly: HourlyPoint[];
  topItems: { name: string; qty: number; revenue: number }[];
  peak: { label: string; value: number } | null;
}

/** Build daily series (last N days), an hourly histogram, and top items from paid orders. */
export async function getDashboardAnalytics(businessId: string, days = 7): Promise<DashboardAnalytics> {
  const since = new Date();
  since.setDate(since.getDate() - (days - 1));
  since.setHours(0, 0, 0, 0);

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id,total,payment_status,placed_at")
    .eq("business_id", businessId)
    .gte("placed_at", since.toISOString());
  if (error) throw error;

  const paid = (orders ?? []).filter((o) => o.payment_status === "SUCCESS");

  // Daily buckets
  const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const daily: DailyPoint[] = [];
  const dayIndex = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toDateString();
    dayIndex.set(key, i);
    daily.push({ label: dayFmt.format(d), orders: 0, revenue: 0 });
  }

  // Hourly buckets 8..22
  const hours = Array.from({ length: 15 }, (_, i) => i + 8); // 8 AM - 10 PM
  const hourly: HourlyPoint[] = hours.map((h) => ({
    label: `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`,
    value: 0,
  }));

  for (const o of paid) {
    const d = new Date(o.placed_at);
    const di = dayIndex.get(d.toDateString());
    if (di != null) {
      daily[di].orders += 1;
      daily[di].revenue += Number(o.total);
    }
    const hi = hours.indexOf(d.getHours());
    if (hi >= 0) hourly[hi].value += 1;
  }

  // Top items
  const topItems: DashboardAnalytics["topItems"] = [];
  if (paid.length > 0) {
    const { data: oi } = await supabase
      .from("order_items")
      .select("item_name,quantity,line_total,order_id")
      .in("order_id", paid.map((o) => o.id));
    const map = new Map<string, { qty: number; revenue: number }>();
    for (const r of oi ?? []) {
      const cur = map.get(r.item_name) ?? { qty: 0, revenue: 0 };
      cur.qty += r.quantity;
      cur.revenue += Number(r.line_total);
      map.set(r.item_name, cur);
    }
    for (const [name, v] of map) topItems.push({ name, qty: v.qty, revenue: v.revenue });
    topItems.sort((a, b) => b.qty - a.qty);
  }

  const peakHour = hourly.reduce<{ label: string; value: number } | null>(
    (best, h) => (!best || h.value > best.value ? { label: h.label, value: h.value } : best),
    null
  );

  return { daily, hourly, topItems: topItems.slice(0, 5), peak: peakHour && peakHour.value > 0 ? peakHour : null };
}

// ---------- Dashboard (analytics-only) data ----------

import type { OrderStatus as OrderStatusT } from "./database.types";

export interface KpiTrend {
  value: number;
  /** percent change vs the comparison period; null when no baseline */
  deltaPct: number | null;
}

export interface DashboardData {
  kpis: {
    orders: KpiTrend;
    revenue: KpiTrend;
    itemsSold: KpiTrend;
    avgOrderValue: KpiTrend;
  };
  statusCounts: Record<OrderStatusT, number>;
  totalOrders: number;
  source: { qr: number; kiosk: number };
  daily: DailyPoint[];     // for Sales Overview + Revenue Trend over the selected range
  hourly: HourlyPoint[];   // peak hours (today-ish range)
  peak: { label: string; value: number } | null;
  topItems: { name: string; qty: number; revenue: number }[];
}

const EMPTY_STATUS: Record<OrderStatusT, number> = {
  NEW: 0, ACCEPTED: 0, PREPARING: 0, READY: 0, COMPLETED: 0, CANCELLED: 0,
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function itemsSoldForOrderIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { data } = await supabase.from("order_items").select("quantity,order_id").in("order_id", ids);
  return (data ?? []).reduce((s, r) => s + r.quantity, 0);
}

/**
 * One call powering the analytics-only dashboard. Everything derives from real
 * order rows for this business — no invented numbers.
 *
 * `rangeDays`: window for Sales Overview / Revenue Trend (1 = today, else N days).
 * KPIs always compare today vs yesterday regardless of the chart range.
 */
export async function getDashboardData(businessId: string, rangeDays = 7): Promise<DashboardData> {
  // Pull enough history to cover both the chart range and yesterday.
  const spanDays = Math.max(rangeDays, 2);
  const since = new Date();
  since.setDate(since.getDate() - (spanDays - 1));
  since.setHours(0, 0, 0, 0);

  const { data: ordersRaw, error } = await supabase
    .from("orders")
    .select("id,total,status,payment_status,source,placed_at")
    .eq("business_id", businessId)
    .gte("placed_at", since.toISOString());
  if (error) throw error;
  const orders = ordersRaw ?? [];

  const today = startOfToday();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const paid = orders.filter((o) => o.payment_status === "SUCCESS");
  const paidToday = paid.filter((o) => new Date(o.placed_at) >= today);
  const paidYesterday = paid.filter((o) => {
    const t = new Date(o.placed_at);
    return t >= yesterday && t < today;
  });

  const revToday = paidToday.reduce((s, o) => s + Number(o.total), 0);
  const revYest = paidYesterday.reduce((s, o) => s + Number(o.total), 0);
  const itemsToday = await itemsSoldForOrderIds(paidToday.map((o) => o.id));
  const itemsYest = await itemsSoldForOrderIds(paidYesterday.map((o) => o.id));
  const aovToday = paidToday.length ? revToday / paidToday.length : 0;
  const aovYest = paidYesterday.length ? revYest / paidYesterday.length : 0;

  const delta = (now: number, prev: number): number | null =>
    prev === 0 ? (now > 0 ? 100 : null) : Math.round(((now - prev) / prev) * 100);

  // Status breakdown across the whole window (analytics overview).
  const statusCounts = { ...EMPTY_STATUS };
  for (const o of orders) statusCounts[o.status as OrderStatusT]++;

  // Source split (paid orders in window).
  const qr = paid.filter((o) => o.source === "QR").length;
  const kiosk = paid.filter((o) => o.source === "KIOSK").length;

  // Daily series over the selected chart range.
  const chartSince = new Date();
  chartSince.setDate(chartSince.getDate() - (rangeDays - 1));
  chartSince.setHours(0, 0, 0, 0);
  const dayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short" });
  const daily: DailyPoint[] = [];
  const dayIndex = new Map<string, number>();
  for (let i = 0; i < rangeDays; i++) {
    const d = new Date(chartSince);
    d.setDate(chartSince.getDate() + i);
    dayIndex.set(d.toDateString(), i);
    daily.push({ label: rangeDays === 1 ? "Today" : dayFmt.format(d), orders: 0, revenue: 0 });
  }
  for (const o of paid) {
    const di = dayIndex.get(new Date(o.placed_at).toDateString());
    if (di != null) {
      daily[di].orders += 1;
      daily[di].revenue += Number(o.total);
    }
  }

  // Hourly histogram (8 AM–10 PM) over the window.
  const hoursList = Array.from({ length: 15 }, (_, i) => i + 8);
  const hourly: HourlyPoint[] = hoursList.map((h) => ({
    label: `${((h + 11) % 12) + 1} ${h < 12 ? "AM" : "PM"}`,
    value: 0,
  }));
  for (const o of paid) {
    const hi = hoursList.indexOf(new Date(o.placed_at).getHours());
    if (hi >= 0) hourly[hi].value += 1;
  }
  const peak = hourly.reduce<{ label: string; value: number } | null>(
    (best, h) => (!best || h.value > best.value ? { label: h.label, value: h.value } : best),
    null
  );

  // Top items over the window.
  const topItems: { name: string; qty: number; revenue: number }[] = [];
  if (paid.length > 0) {
    const { data: oi } = await supabase
      .from("order_items")
      .select("item_name,quantity,line_total,order_id")
      .in("order_id", paid.map((o) => o.id));
    const map = new Map<string, { qty: number; revenue: number }>();
    for (const r of oi ?? []) {
      const cur = map.get(r.item_name) ?? { qty: 0, revenue: 0 };
      cur.qty += r.quantity;
      cur.revenue += Number(r.line_total);
      map.set(r.item_name, cur);
    }
    for (const [name, v] of map) topItems.push({ name, qty: v.qty, revenue: v.revenue });
    topItems.sort((a, b) => b.qty - a.qty);
  }

  return {
    kpis: {
      orders: { value: paidToday.length, deltaPct: delta(paidToday.length, paidYesterday.length) },
      revenue: { value: revToday, deltaPct: delta(revToday, revYest) },
      itemsSold: { value: itemsToday, deltaPct: delta(itemsToday, itemsYest) },
      avgOrderValue: { value: aovToday, deltaPct: delta(aovToday, aovYest) },
    },
    statusCounts,
    totalOrders: orders.length,
    source: { qr, kiosk },
    daily,
    hourly,
    peak: peak && peak.value > 0 ? peak : null,
    topItems: topItems.slice(0, 5),
  };
}
