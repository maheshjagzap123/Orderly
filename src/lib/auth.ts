import { supabase } from "./supabase";

/** Sign in with email + password (dev auth method). */
export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
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
