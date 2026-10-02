import { supabase } from "./supabase";
import { placeOrder, type CartLineInput } from "./publicApi";

/** True when a Razorpay key is configured (switches off dev auto-confirm). */
export const razorpayEnabled = Boolean(import.meta.env.VITE_RAZORPAY_KEY_ID);

interface PayArgs {
  businessId: string;
  source: "QR" | "KIOSK";
  customerName?: string | null;
  lines: CartLineInput[];
}

export interface PayResult {
  orderNumber: number;
  /** Secure tracking token when available (dev path). */
  trackToken?: string | null;
}

/** How a payment ended, so the checkout UI can show the right screen. */
export type PaymentFailureKind = "CANCELLED" | "FAILED" | "TIMEOUT";

export class PaymentError extends Error {
  kind: PaymentFailureKind;
  constructor(kind: PaymentFailureKind, message: string) {
    super(message);
    this.name = "PaymentError";
    this.kind = kind;
  }
}

/**
 * Pay for a cart.
 * - Dev (no Razorpay key): server recalculates + auto-confirms via placeOrder().
 * - Production (Razorpay key present): create-payment Edge Function makes a
 *   Razorpay order, Checkout opens, and the webhook confirms the order.
 */
export async function payForCart(args: PayArgs): Promise<PayResult> {
  if (!razorpayEnabled) {
    const { orderNumber, trackToken } = await placeOrder(args);
    return { orderNumber, trackToken };
  }
  return payWithRazorpay(args);
}

async function payWithRazorpay(args: PayArgs): Promise<PayResult> {
  // 1. Ask our Edge Function to create a Razorpay order (amount computed server-side).
  const { data, error } = await supabase.functions.invoke("create-payment", { body: args });
  if (error) throw error;
  const { razorpayOrderId, amount, currency, keyId, orderId } = data as {
    razorpayOrderId: string; amount: number; currency: string; keyId: string; orderId: string;
  };

  await loadRazorpayScript();

  // 2. Open Razorpay Checkout and wait for completion.
  await new Promise<void>((resolve, reject) => {
    // @ts-expect-error - Razorpay is injected by the external script
    const rzp = new window.Razorpay({
      key: keyId,
      order_id: razorpayOrderId,
      amount,
      currency,
      name: "Orderly",
      description: "Order payment",
      prefill: { name: args.customerName ?? "" },
      handler: () => resolve(),
      modal: { ondismiss: () => reject(new PaymentError("CANCELLED", "Payment cancelled")) },
    });
    rzp.open();
  });

  // 3. The webhook confirms + assigns the order number. Poll for it.
  const orderNumber = await waitForOrderNumber(orderId);
  return { orderNumber };
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.getElementById("razorpay-sdk")) return resolve();
    const s = document.createElement("script");
    s.id = "razorpay-sdk";
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load payment SDK"));
    document.body.appendChild(s);
  });
}

/**
 * Poll the order until the webhook assigns its number (or time out).
 * Uses the SECURITY DEFINER get_order_confirmation RPC (migration 0006) by the
 * known order id, so it works without a table-wide anon SELECT on orders. Falls
 * back to a direct select for DBs where 0006 isn't applied yet.
 */
async function waitForOrderNumber(orderId: string, tries = 20, delayMs = 1000): Promise<number> {
  for (let i = 0; i < tries; i++) {
    let orderNumber: number | null = null;
    let paymentStatus: string | null = null;

    const rpc = await supabase.rpc("get_order_confirmation", { p_order_id: orderId });
    if (!rpc.error && Array.isArray(rpc.data) && rpc.data[0]) {
      orderNumber = rpc.data[0].order_number;
      paymentStatus = rpc.data[0].payment_status;
    } else {
      // Fallback for pre-0006 databases.
      const { data } = await supabase.from("orders").select("order_number,payment_status").eq("id", orderId).maybeSingle();
      orderNumber = data?.order_number ?? null;
      paymentStatus = data?.payment_status ?? null;
    }

    if (orderNumber != null) return orderNumber;
    if (paymentStatus === "FAILED") throw new PaymentError("FAILED", "Payment failed");
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new PaymentError("TIMEOUT", "Payment is taking longer than expected. Check your order history shortly.");
}
