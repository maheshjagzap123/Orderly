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
    const { orderNumber } = await placeOrder(args);
    return { orderNumber };
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

/** Poll the order until the webhook assigns its number (or time out). */
async function waitForOrderNumber(orderId: string, tries = 20, delayMs = 1000): Promise<number> {
  for (let i = 0; i < tries; i++) {
    const { data } = await supabase.from("orders").select("order_number,payment_status").eq("id", orderId).maybeSingle();
    if (data?.order_number != null) return data.order_number;
    if (data?.payment_status === "FAILED") throw new PaymentError("FAILED", "Payment failed");
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new PaymentError("TIMEOUT", "Payment is taking longer than expected. Check your order history shortly.");
}
