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

/**
 * Build the public URL path segment for a business: "<slug>-<public_code>".
 * Readable but unguessable. Falls back to just the slug when no code exists
 * (e.g. legacy rows before migration 0007).
 */
export function publicPath(business: { slug: string; public_code?: string | null }): string {
  return business.public_code ? `${business.slug}-${business.public_code}` : business.slug;
}

/**
 * Parse a public path segment back into its parts. The code is the last
 * hyphen-separated token when it looks like a 4–12 char base36 code; otherwise
 * the whole segment is treated as a legacy slug (code = null).
 */
export function parsePublicPath(segment: string): { slug: string; code: string | null } {
  const idx = segment.lastIndexOf("-");
  if (idx > 0) {
    const maybeCode = segment.slice(idx + 1);
    if (/^[a-z0-9]{4,12}$/.test(maybeCode)) {
      return { slug: segment.slice(0, idx), code: maybeCode };
    }
  }
  return { slug: segment, code: null };
}
