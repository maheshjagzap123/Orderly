// Supabase Edge Function: razorpay-webhook
//
// Receives Razorpay webhooks, verifies the HMAC-SHA256 signature, is idempotent,
// and confirms the order ONLY after a verified payment. This is the single place
// an order becomes paid + gets its human order number (via assign_order_number).
//
// Deploy:  supabase functions deploy razorpay-webhook --no-verify-jwt
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   RAZORPAY_WEBHOOK_SECRET   (set the same value in Razorpay dashboard -> Webhooks)
//
// In Razorpay: add webhook URL
//   https://<project-ref>.functions.supabase.co/razorpay-webhook
// subscribe to events: payment.captured, payment.failed, order.paid

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")!;

  // 1. Verify signature (HMAC-SHA256 of the raw body).
  const valid = await verify(raw, signature, secret);
  if (!valid) return new Response("Invalid signature", { status: 401 });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const event = JSON.parse(raw);
  const eventId = req.headers.get("x-razorpay-event-id") ?? event?.payload?.payment?.entity?.id;
  const type: string = event?.event ?? "";

  try {
    const payment = event?.payload?.payment?.entity;
    const rzpOrderId: string | undefined = payment?.order_id ?? event?.payload?.order?.entity?.id;
    if (!rzpOrderId) return new Response("No order ref", { status: 200 }); // ack, nothing to do

    // Find our payment row by gateway reference.
    const { data: pay } = await admin
      .from("payments").select("*").eq("gateway_ref", rzpOrderId).maybeSingle();
    if (!pay) return new Response("Unknown order", { status: 200 });

    // 2. Idempotency: if we've already processed this event, ack and stop.
    if (eventId && pay.gateway_event_id === eventId) {
      return new Response("Already processed", { status: 200 });
    }

    if (type === "payment.captured" || type === "order.paid") {
      // Mark payment success + record event id (idempotency).
      await admin.from("payments").update({
        status: "SUCCESS", gateway_event_id: eventId ?? pay.gateway_event_id,
      }).eq("id", pay.id);

      // Confirm order + assign human number (only if not already confirmed).
      const { data: order } = await admin
        .from("orders").select("order_number").eq("id", pay.order_id).maybeSingle();
      if (order && order.order_number == null) {
        await admin.rpc("assign_order_number", { p_order_id: pay.order_id });
      }
    } else if (type === "payment.failed") {
      await admin.from("payments").update({
        status: "FAILED", gateway_event_id: eventId ?? pay.gateway_event_id,
      }).eq("id", pay.id);
      await admin.from("orders").update({ payment_status: "FAILED" }).eq("id", pay.order_id);
    }

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error("webhook error", e);
    // Return 200 to avoid infinite retries on our own bug, but log it.
    return new Response("handled", { status: 200 });
  }
});

/** Verify Razorpay HMAC-SHA256 signature of the raw payload. */
async function verify(payload: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const expected = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time-ish compare
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
