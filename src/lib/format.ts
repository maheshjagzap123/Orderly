/** Format a number as Indian Rupees, e.g. 262.5 -> "₹262.50". */
export function formatINR(amount: number): string {
  return "₹" + amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Format a time range like "10:00 AM - 11:00 PM" from "HH:MM" strings. */
export function formatHours(open: string | null, close: string | null): string {
  if (!open || !close) return "Hours not set";
  return `${to12h(open)} - ${to12h(close)}`;
}

function to12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${period}`;
}

/** Slugify a business name into a URL-safe public slug. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}
