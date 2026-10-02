import { supabase } from "./supabase";

/** Sign in with email + password (dev auth method). */
export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

/**
 * Register a new vendor account with email + password.
 * Depending on the Supabase project's email-confirmation setting, this either
 * returns an active session immediately or requires the vendor to confirm via
 * email first (data.session will be null in that case).
 */
export async function signUpWithPassword(email: string, password: string, fullName?: string) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: fullName ? { full_name: fullName } : undefined,
      emailRedirectTo: `${window.location.origin}/vendor`,
    },
  });
}

/** Send a password-reset email. The link lands on /vendor/reset-password. */
export async function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/vendor/reset-password`,
  });
}

/** Set a new password for the currently-authenticated (recovery) session. */
export async function updatePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword });
}

/** Send a passwordless magic link to the given email. */
export async function signInWithMagicLink(email: string) {
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}/vendor` },
  });
}

/** Sign the vendor out. */
export async function signOut() {
  return supabase.auth.signOut();
}
