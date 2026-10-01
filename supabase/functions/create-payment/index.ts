// Supabase Edge Function: create-payment
//
// Creates a Razorpay order for a cart, with the amount recomputed SERVER-SIDE
// from current DB prices. Returns the Razorpay order id + key id so the client
// can open Razorpay Checkout. The order is NOT confirmed here — confirmation
// happens only in the verified webhook (razorpay-webhook).
//
// Deploy:  supabase functions deploy create-payment --no-verify-jwt
// Env (supabase secrets set ...):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (service role: bypasses RLS)
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET

import { createClient } from "jsr:@supabase/supabase-js@2";

interface CartLine { item_id: string; quantity: number }
interface Body {
  businessId: string;
  source: "QR" | "KIOSK";
  customerName?: string | null;
  lines: CartLine[];
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = (await req.json()) as Body;
    const { businessId, source, customerName, lines } = body;
    if (!businessId || !lines?.length) {
      return json({ error: "Invalid request" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Recompute amount from DB (never trust the client).
    const { data: business, error: bErr } = await admin
      .from("businesses").select("*").eq("id", businessId).maybeSingle();
    if (bErr || !business) return json({ error: "Business not found" }, 404);
    if (!business.is_open || !business.accepting_orders) {
      return json({ error: "Not accepting orders right now" }, 409);
    }

    const ids = lines.map((l) => l.item_id);
    const { data: items } = await admin
      .from("items").select("*").in("id", ids).eq("business_id", businessId);
    const itemMap = new Map((items ?? []).map((i) => [i.id, i]));

    let subtotal = 0;
    const resolved = lines.map((l) => {
      const item = itemMap.get(l.item_id);
      if (!item) throw new Error("Item unavailable");
      if (!item.is_available) throw new Error(`${item.name} is sold out`);
      if (l.quantity <= 0) throw new Error("Invalid quantity");
      const lineTotal = Number(item.price) * l.quantity;
      subtotal += lineTotal;
      return { item, quantity: l.quantity, lineTotal };
    });
    const taxAmount = +(subtotal * (Number(business.tax_percent) / 100)).toFixed(2);
    const total = +(subtotal + taxAmount).toFixed(2);
    const amountPaise = Math.round(total * 100);

    // Create our order (INITIATED) first so we have an id to attach.
    const { data: order, error: oErr } = await admin.from("orders").insert({
      business_id: businessId, source, customer_name: customerName?.trim() || null,
      subtotal, tax_amount: taxAmount, total, status: "NEW", payment_status: "PENDING",
    }).select("*").single();
    if (oErr) throw oErr;

    await admin.from("order_items").insert(
      resolved.map((r) => ({
        order_id: order.id, item_id: r.item.id, item_name: r.item.name,
        unit_price: Number(r.item.price), quantity: r.quantity, line_total: r.lineTotal,
      })),
    );

    // Create the Razorpay order.
    const keyId = Deno.env.get("RAZORPAY_KEY_ID")!;
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET")!;
    const auth = "Basic " + btoa(`${keyId}:${keySecret}`);
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountPaise, currency: "INR", receipt: order.id,
        notes: { order_id: order.id, business_id: businessId },
      }),
    });
    if (!rzpRes.ok) {
      const t = await rzpRes.text();
      return json({ error: "Gateway error", detail: t }, 502);
    }
    const rzpOrder = await rzpRes.json();

    // Record the pending payment with the gateway reference.
    await admin.from("payments").insert({
      order_id: order.id, business_id: businessId, amount: total,
      gateway: "razorpay", gateway_ref: rzpOrder.id, status: "PENDING",
    });

    return json({
      orderId: order.id,
      razorpayOrderId: rzpOrder.id,
      amount: amountPaise,
      currency: "INR",
      keyId,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 400);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
