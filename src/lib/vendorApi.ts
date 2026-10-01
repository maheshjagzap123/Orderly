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

/** Create the business for the current user and mark onboarding complete. */
export async function createBusiness(input: CreateBusinessInput): Promise<Business> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("businesses")
    .insert({ ...input, owner_id: uid, onboarding_complete: true })
    .select("*")
    .single();

  if (error) throw error;
  return data;
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

/** Valid next statuses in the lifecycle. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  NEW: "ACCEPTED",
  ACCEPTED: "PREPARING",
  PREPARING: "READY",
  READY: "COMPLETED",
};

export const NEXT_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  NEW: "Accept",
  ACCEPTED: "Start Preparing",
  PREPARING: "Mark Ready",
  READY: "Complete",
};

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
export async function getOrderItemsFor(orderIds: string[]): Promise<Record<string, OrderItem[]>> {
  if (orderIds.length === 0) return {};
  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);
  if (error) throw error;
  const map: Record<string, OrderItem[]> = {};
  for (const row of data ?? []) {
    (map[row.order_id] ??= []).push(row);
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
export async function uploadMenuImage(businessId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${businessId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("menu-images").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
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
