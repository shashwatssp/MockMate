import { supabase } from './supabase';

export const signInWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;
  return data;
};

export const signUpWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      // Redirect the confirmation email link back to this app's origin instead
      // of the Supabase "Site URL" (which must not be left at localhost).
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });

  if (error) throw error;
  return data;
};

export const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

// Exchange the token returned by the Supabase email redirect link for a session.
// Supports both the PKCE `code` flow and the legacy hash-token flow, and clears the
// auth params from the URL so the callback URL doesn't leak tokens into history.
export const handleAuthCallback = async (): Promise<boolean> => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  }

  const hash = new URLSearchParams(window.location.hash.slice(1));
  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');

  if (access_token && refresh_token) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw error;
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  }

  return false;
};

export const resetPassword = async (email: string) => {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    // The recovery email link carries this code; we pick it up on /reset-password
    // via handleAuthCallback() (PKCE code exchange).
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
  return data;
};

export const updatePassword = async (password: string) => {
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data;
};
