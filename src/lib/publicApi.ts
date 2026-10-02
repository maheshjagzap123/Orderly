import { supabase } from "./supabase";
import { parsePublicPath } from "./format";
import type { Business, Category, Item, Order, OrderItem } from "./database.types";

/**
 * Fetch a business by its public URL segment, which is "<slug>-<public_code>".
 * Resolution order:
 *   1. by public_code (unguessable) — the normal, secure path
 *   2. by exact slug (legacy links / already-printed QRs before 0007)
 * Accepts either a combined "slug-code" segment or a bare slug.
 */
export async function getBusinessBySlug(segment: string): Promise<Business | null> {
  const { slug, code } = parsePublicPath(segment);

  // 1. Preferred: resolve by the unguessable public_code.
  //    This can fail with "column does not exist" if migration 0007 hasn't been
  //    applied yet — in that case we silently fall back to slug lookups below.
  if (code) {
    const byCode = await supabase.from("businesses").select("*").eq("public_code", code).maybeSingle();
    if (!byCode.error && byCode.data) return byCode.data;
    // If the error is anything other than a missing column, surface it is still
    // unnecessary — we have robust slug fallbacks, so just continue.
  }

  // 2. Fallback: treat the whole segment as a plain slug (legacy / pre-0007).
  const bySlug = await supabase.from("businesses").select("*").eq("slug", segment).maybeSingle();
  if (!bySlug.error && bySlug.data) return bySlug.data;

  // 3. Last resort: the parsed slug portion (segment was "slug-code" but code
  //    didn't match — e.g. pre-0007 DB where the code column doesn't exist).
  if (code) {
    const bySlugPart = await supabase.from("businesses").select("*").eq("slug", slug).maybeSingle();
    if (!bySlugPart.error && bySlugPart.data) return bySlugPart.data;
  }

  // Nothing matched. Surface a slug error only if every lookup errored (real
  // connectivity/permission problem), otherwise it's simply "not found".
  if (bySlug.error) throw bySlug.error;
  return null;
}

export interface Menu {
  categories: Category[];
  items: Item[];
}

/** Fetch the active menu (categories + items) for a business. */
export async function getMenu(businessId: string): Promise<Menu> {
  const [catsRes, itemsRes] = await Promise.all([
    supabase
      .from("categories")
      .select("*")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("display_order", { ascending: true }),
    supabase
      .from("items")
      .select("*")
      .eq("business_id", businessId)
      .order("display_order", { ascending: true }),
  ]);
  if (catsRes.error) throw catsRes.error;
  if (itemsRes.error) throw itemsRes.error;
  return { categories: catsRes.data ?? [], items: itemsRes.data ?? [] };
}

export interface CartLineInput {
  item_id: string;
  quantity: number;
}

/** Reason an order could not be placed, used by the customer UI to react precisely. */
export type OrderBlockReason =
  | "STORE_CLOSED"
  | "ITEM_UNAVAILABLE"
  | "PRICE_CHANGED"
  | "EMPTY_CART";

/** Thrown by revalidation / placeOrder so the UI can show the right recovery screen. */
export class OrderError extends Error {
  reason: OrderBlockReason;
  constructor(reason: OrderBlockReason, message: string) {
    super(message);
    this.name = "OrderError";
    this.reason = reason;
  }
}

export interface PriceChange {
  itemId: string;
  name: string;
  oldPrice: number;
  newPrice: number;
}

export interface RevalidateResult {
  ok: boolean;
  storeOpen: boolean;
  /** item ids that are gone or sold out, with their names for messaging */
  unavailable: { itemId: string; name: string }[];
  /** price differences between the client cart and current DB prices */
  priceChanges: PriceChange[];
  /** fresh item rows keyed by id (authoritative prices/availability) */
  freshItems: Record<string, Item>;
}

/**
 * Revalidate a cart against the live DB *before* payment, without creating anything.
 * Used to detect sold-out items and price changes so the customer can review.
 * The browser cart is never trusted for money — this is a UX pre-check; the real
 * recalculation still happens in placeOrder / the payment Edge Function.
 */
export async function revalidateCart(
  businessId: string,
  lines: { item_id: string; quantity: number; clientPrice: number }[]
): Promise<RevalidateResult> {
  const { data: business, error: bizErr } = await supabase
    .from("businesses")
    .select("is_open,accepting_orders")
    .eq("id", businessId)
    .maybeSingle();
  if (bizErr) throw bizErr;

  const storeOpen = Boolean(business?.is_open && business?.accepting_orders);

  const ids = lines.map((l) => l.item_id);
  const { data: items, error: itemsErr } = await supabase
    .from("items")
    .select("*")
    .in("id", ids)
    .eq("business_id", businessId);
  if (itemsErr) throw itemsErr;

  const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
  const freshItems: Record<string, Item> = {};
  const unavailable: { itemId: string; name: string }[] = [];
  const priceChanges: PriceChange[] = [];

  for (const line of lines) {
    const item = itemMap.get(line.item_id);
    if (!item || !item.is_available) {
      unavailable.push({ itemId: line.item_id, name: item?.name ?? "An item" });
      continue;
    }
    freshItems[item.id] = item;
    if (Number(item.price) !== Number(line.clientPrice)) {
      priceChanges.push({
        itemId: item.id,
        name: item.name,
        oldPrice: Number(line.clientPrice),
        newPrice: Number(item.price),
      });
    }
  }

  return {
    ok: storeOpen && unavailable.length === 0 && priceChanges.length === 0,
    storeOpen,
    unavailable,
    priceChanges,
    freshItems,
  };
}

export interface PlacedOrder {
  order: Order;
  orderNumber: number;
  /** Secure, non-guessable token for public tracking links. */
  trackToken: string | null;
}

/**
 * Create an order with server-recalculated totals.
 *
 * SECURITY: prices are re-read from the DB here, never trusted from the client.
 * For the dev build we immediately "mark paid" by calling assign_order_number()
 * (the RPC that stamps a human order number + marks payment SUCCESS). When Razorpay
 * is wired, this confirmation step moves into the webhook Edge Function instead.
 */
export async function placeOrder(args: {
  businessId: string;
  source: "QR" | "KIOSK";
  customerName?: string | null;
  lines: CartLineInput[];
}): Promise<PlacedOrder> {
  const { businessId, source, customerName, lines } = args;
  if (lines.length === 0) throw new OrderError("EMPTY_CART", "Cart is empty");

  // Prefer the server-authoritative RPC (migration 0006): one secure call that
  // recomputes money from DB prices, creates order+items+payment, confirms it,
  // and returns the number + token. Works even though anon can't SELECT orders.
  const rpc = await supabase.rpc("place_order_dev", {
    p_business_id: businessId,
    p_source: source,
    p_customer_name: customerName?.trim() || null,
    p_lines: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
  });

  if (!rpc.error) {
    const row = Array.isArray(rpc.data) ? rpc.data[0] : null;
    if (!row) throw new Error("Order could not be created");
    return {
      order: { id: row.order_id } as Order,
      orderNumber: row.order_number as number,
      trackToken: (row.track_token as string) ?? null,
    };
  }

  // Map known RPC exceptions to the precise customer recovery screens.
  const msg = rpc.error.message || "";
  if (/STORE_CLOSED/.test(msg)) throw new OrderError("STORE_CLOSED", "This stall is not accepting orders right now");
  if (/ITEM_UNAVAILABLE/.test(msg)) throw new OrderError("ITEM_UNAVAILABLE", "An item is no longer available");

  // If the RPC doesn't exist yet (pre-0006 DB), fall back to the legacy
  // browser-side multi-insert flow.
  if (!/function .*place_order_dev.* does not exist/i.test(msg) && rpc.error.code !== "42883") {
    throw rpc.error;
  }
  return placeOrderLegacy(args);
}

/** Legacy client-side order placement (pre-0006 fallback). */
async function placeOrderLegacy(args: {
  businessId: string;
  source: "QR" | "KIOSK";
  customerName?: string | null;
  lines: CartLineInput[];
}): Promise<PlacedOrder> {
  const { businessId, source, customerName, lines } = args;

  const { data: business, error: bizErr } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();
  if (bizErr) throw bizErr;
  if (!business) throw new Error("Business not found");
  if (!business.is_open || !business.accepting_orders) {
    throw new OrderError("STORE_CLOSED", "This stall is not accepting orders right now");
  }

  const itemIds = lines.map((l) => l.item_id);
  const { data: items, error: itemsErr } = await supabase
    .from("items")
    .select("*")
    .in("id", itemIds)
    .eq("business_id", businessId);
  if (itemsErr) throw itemsErr;

  const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
  let subtotal = 0;
  const resolved = lines.map((l) => {
    const item = itemMap.get(l.item_id);
    if (!item) throw new OrderError("ITEM_UNAVAILABLE", "An item is no longer available");
    if (!item.is_available) throw new OrderError("ITEM_UNAVAILABLE", `${item.name} is sold out`);
    if (l.quantity <= 0) throw new Error("Invalid quantity");
    const lineTotal = Number(item.price) * l.quantity;
    subtotal += lineTotal;
    return { item, quantity: l.quantity, lineTotal };
  });

  const taxAmount = +(subtotal * (Number(business.tax_percent) / 100)).toFixed(2);
  const total = +(subtotal + taxAmount).toFixed(2);

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({ business_id: businessId, source, customer_name: customerName?.trim() || null, subtotal, tax_amount: taxAmount, total })
    .select("*")
    .single();
  if (orderErr) throw orderErr;

  const orderItems = resolved.map((r) => ({
    order_id: order.id, item_id: r.item.id, item_name: r.item.name,
    unit_price: Number(r.item.price), quantity: r.quantity, line_total: r.lineTotal,
  }));
  const { error: oiErr } = await supabase.from("order_items").insert(orderItems);
  if (oiErr) throw oiErr;

  const { error: payErr } = await supabase.from("payments").insert({ order_id: order.id, business_id: businessId, amount: total, gateway: "dev" });
  if (payErr) throw payErr;

  const { data: num, error: rpcErr } = await supabase.rpc("assign_order_number", { p_order_id: order.id });
  if (rpcErr) throw rpcErr;

  const trackToken = (order as Order & { track_token?: string }).track_token ?? null;
  return { order, orderNumber: num as number, trackToken };
}

export interface OrderTracking {
  orderNumber: number | null;
  status: Order["status"];
  paymentStatus: Order["payment_status"];
  customerName: string | null;
  subtotal: number;
  taxAmount: number;
  total: number;
  placedAt: string;
  cancelReason: string | null;
  businessId: string;
  businessName: string;
  businessSlug: string;
  businessPublicCode: string | null;
  prepTimeMin: number | null;
  prepTimeMax: number | null;
  items: { item_name: string; unit_price: number; quantity: number; line_total: number }[];
}

/**
 * Fetch public order tracking by secure token. Uses SECURITY DEFINER RPCs
 * (migration 0006) that expose only safe, customer-facing fields — never
 * payment gateway references or internal ids.
 */
export async function getOrderTrackingByToken(token: string): Promise<OrderTracking | null> {
  const { data, error } = await supabase.rpc("get_order_tracking", { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;

  const { data: itemsData, error: itemsErr } = await supabase.rpc("get_order_items_tracking", {
    p_token: token,
  });
  if (itemsErr) throw itemsErr;

  return {
    orderNumber: row.order_number,
    status: row.status,
    paymentStatus: row.payment_status,
    customerName: row.customer_name,
    subtotal: Number(row.subtotal),
    taxAmount: Number(row.tax_amount),
    total: Number(row.total),
    placedAt: row.placed_at,
    cancelReason: row.cancel_reason,
    businessId: row.business_id,
    businessName: row.business_name,
    businessSlug: row.business_slug,
    businessPublicCode: row.business_public_code,
    prepTimeMin: row.prep_time_min,
    prepTimeMax: row.prep_time_max,
    items: itemsData ?? [],
  };
}

/** Read an order + its items by order number for a business (confirmation / tracking). */
export async function getOrderByNumber(
  businessId: string,
  orderNumber: number
): Promise<{ order: Order; items: OrderItem[] } | null> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("business_id", businessId)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (error) throw error;
  if (!order) return null;

  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);
  if (itemsErr) throw itemsErr;

  return { order, items: items ?? [] };
}
