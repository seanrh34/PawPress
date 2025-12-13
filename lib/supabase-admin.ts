import { createClient } from '@supabase/supabase-js';

/**
 * Creates a Supabase admin client with secret key
 * WARNING: Only use this in server-side code (API routes, Server Components)
 * The secret key bypasses RLS policies - use with caution
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!;

  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SECRET_KEY is not set in environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
