/**
 * Shared validation utilities with consistent, user-friendly messages.
 * Each validator returns an error string, or null when the value is valid.
 */

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return "Email is required.";
  // Simple, permissive email shape check.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) return "Password is required.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  return null;
}

export function validateRequired(value: string, label: string): string | null {
  if (!value.trim()) return `${label} is required.`;
  return null;
}

export function validateBusinessName(value: string): string | null {
  const v = value.trim();
  if (!v) return "Business name is required.";
  if (v.length < 2) return "Business name is too short.";
  if (v.length > 80) return "Business name is too long (max 80 characters).";
  return null;
}

export function validatePrice(value: string | number): string | null {
  const n = Number(value);
  if (value === "" || Number.isNaN(n)) return "Enter a valid price.";
  if (n < 0) return "Price cannot be negative.";
  return null;
}

export function validatePrepTime(value: string | number): string | null {
  if (value === "" || value == null) return null; // optional
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return "Preparation time must be a whole number of minutes.";
  return null;
}

export function validatePincode(value: string): string | null {
  const v = value.trim();
  if (!v) return null; // optional
  if (!/^\d{6}$/.test(v)) return "Pincode must be 6 digits.";
  return null;
}

export function validateTaxPercent(value: string | number): string | null {
  const n = Number(value);
  if (value === "" || Number.isNaN(n)) return "Enter a valid tax percentage.";
  if (n < 0 || n > 100) return "Tax must be between 0 and 100.";
  return null;
}
