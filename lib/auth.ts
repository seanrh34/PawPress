import { redirect } from 'next/navigation';
import { createClient } from './supabase-server';

export interface UserProfile {
  id: string;
  email: string;
  role: 'master' | 'admin';
  display_name?: string | null;
  created_at: string;
  created_by?: string | null;
  updated_at?: string;
}

/**
 * Get the current authenticated user session
 * Returns null if not authenticated
 * Note: For security-critical operations, use getUser() instead
 */
export async function getSession() {
  const supabase = await createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  
  return session;
}

/**
 * Get the current authenticated user (verified with Auth server)
 * More secure than getSession() - use for security-critical operations
 * Returns null if not authenticated or token is invalid
 */
export async function getUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('Error getting user:', error);
    return null;
  }
  
  return user;
}

/**
 * Get the current user's profile with role information
 * Returns null if not authenticated or profile not found
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const user = await getUser();
  
  if (!user) {
    return null;
  }
  
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  
  if (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
  
  return data;
}

/**
 * Require authentication - redirects to login if not authenticated
 * Use in Server Components and Route Handlers
 */
export async function requireAuth() {
  const user = await getUser();
  
  if (!user) {
    redirect('/admin/login');
  }
  
  return user;
}

/**
 * Require master role - redirects to admin dashboard if not master
 * Use in Server Components and Route Handlers for master-only features
 */
export async function requireMaster() {
  const user = await requireAuth();
  const profile = await getUserProfile();
  
  if (!profile || profile.role !== 'master') {
    redirect('/admin');
  }
  
  return { user, profile };
}

/**
 * Check if the current user is the master account
 * Uses the MASTER_ACCOUNT_EMAIL environment variable
 */
export async function isMasterAccount(): Promise<boolean> {
  const user = await getUser();
  
  if (!user) {
    return false;
  }
  
  const masterEmail = process.env.MASTER_ACCOUNT_EMAIL;
  return user.email === masterEmail;
}

/**
 * Get all user profiles with display names from auth.users (for master account)
 */
export async function getAllUserProfiles(): Promise<UserProfile[]> {
  await requireMaster();
  
  const supabase = await createClient();
  
  // Get profiles from user_profiles table
  const { data: profiles, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching user profiles:', error);
    return [];
  }
  
  // Get auth users to fetch display names (requires admin client)
  const { createAdminClient } = await import('./supabase-admin');
  const adminClient = createAdminClient();
  const { data: { users }, error: usersError } = await adminClient.auth.admin.listUsers();
  
  if (usersError) {
    console.error('Error fetching auth users:', usersError);
    return [];
  }
  
  // Merge profiles with display names from auth users
  return profiles.map(profile => {
    const authUser = users.find(u => u.id === profile.id);
    return {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      display_name: authUser?.user_metadata?.display_name || null,
      created_at: profile.created_at,
    };
  });
}
