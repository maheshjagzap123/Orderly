import { supabase } from "./supabase";
import type { Business, Category, Item, Order, OrderItem } from "./database.types";

/** Fetch a business by its public slug (anon-readable). */
export async function getBusinessBySlug(slug: string): Promise<Business | null> {
  const { data, error } = await supabase
    .from("businesses")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data;
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

export interface PlacedOrder {
  order: Order;
  orderNumber: number;
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
  if (lines.length === 0) throw new Error("Cart is empty");

  // 1. Re-read business (tax + open/accepting state) and the exact items.
  const { data: business, error: bizErr } = await supabase
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();
  if (bizErr) throw bizErr;
  if (!business) throw new Error("Business not found");
  if (!business.is_open || !business.accepting_orders) {
    throw new Error("This stall is not accepting orders right now");
  }

  const itemIds = lines.map((l) => l.item_id);
  const { data: items, error: itemsErr } = await supabase
    .from("items")
    .select("*")
    .in("id", itemIds)
    .eq("business_id", businessId);
  if (itemsErr) throw itemsErr;

  const itemMap = new Map((items ?? []).map((i) => [i.id, i]));

  // 2. Compute totals server-side (from DB prices), validate availability.
  let subtotal = 0;
  const resolved = lines.map((l) => {
    const item = itemMap.get(l.item_id);
    if (!item) throw new Error("An item is no longer available");
    if (!item.is_available) throw new Error(`${item.name} is sold out`);
    if (l.quantity <= 0) throw new Error("Invalid quantity");
    const lineTotal = Number(item.price) * l.quantity;
    subtotal += lineTotal;
    return { item, quantity: l.quantity, lineTotal };
  });

  const taxAmount = +(subtotal * (Number(business.tax_percent) / 100)).toFixed(2);
  const total = +(subtotal + taxAmount).toFixed(2);

  // 3. Create the order (status NEW, payment INITIATED).
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      business_id: businessId,
      source,
      customer_name: customerName?.trim() || null,
      subtotal,
      tax_amount: taxAmount,
      total,
    })
    .select("*")
    .single();
  if (orderErr) throw orderErr;

  // 4. Create order_items with price snapshots.
  const orderItems = resolved.map((r) => ({
    order_id: order.id,
    item_id: r.item.id,
    item_name: r.item.name,
    unit_price: Number(r.item.price),
    quantity: r.quantity,
    line_total: r.lineTotal,
  }));
  const { error: oiErr } = await supabase.from("order_items").insert(orderItems);
  if (oiErr) throw oiErr;

  // 5. Create a payment row (pending).
  const { error: payErr } = await supabase.from("payments").insert({
    order_id: order.id,
    business_id: businessId,
    amount: total,
    gateway: "dev",
  });
  if (payErr) throw payErr;

  // 6. DEV: confirm immediately via the RPC (assigns order number + marks SUCCESS).
  //    Replace with webhook-driven confirmation when Razorpay is live.
  const { data: num, error: rpcErr } = await supabase.rpc("assign_order_number", {
    p_order_id: order.id,
  });
  if (rpcErr) throw rpcErr;

  return { order, orderNumber: num as number };
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
