import { supabase, supabaseConfigured, SUPABASE_SETUP_MESSAGE } from '../../lib/supabase';

function requireSupabase() {
  if (!supabaseConfigured) throw new Error(SUPABASE_SETUP_MESSAGE);
}

export async function signInAdmin(email, password) {
  requireSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const { data: authorized, error: authorizationError } = await supabase.rpc('is_property_admin');
  if (authorizationError || !authorized) {
    await supabase.auth.signOut();
    throw new Error('This account is not authorized to manage properties.');
  }
  return data;
}

export async function getAdminAccess(session) {
  if (!session || !supabaseConfigured) return false;
  const { data, error } = await supabase.rpc('is_property_admin');
  if (error) throw error;
  return Boolean(data);
}

