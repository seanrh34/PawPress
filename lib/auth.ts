import { redirect } from 'next/navigation';
import { createClient } from './supabase-server';

export interface UserProfile {
  id: string;
  email: string;
  role: 'master' | 'admin';
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

/**
 * Get the current authenticated user session
 * Returns null if not authenticated
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
 * Get the current user's profile with role information
 * Returns null if not authenticated or profile not found
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const session = await getSession();
  
  if (!session) {
    return null;
  }
  
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', session.user.id)
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
  const session = await getSession();
  
  if (!session) {
    redirect('/admin/login');
  }
  
  return session;
}

/**
 * Require master role - redirects to admin dashboard if not master
 * Use in Server Components and Route Handlers for master-only features
 */
export async function requireMaster() {
  const session = await requireAuth();
  const profile = await getUserProfile();
  
  if (!profile || profile.role !== 'master') {
    redirect('/admin');
  }
  
  return { session, profile };
}

/**
 * Check if the current user is the master account
 * Uses the MASTER_ACCOUNT_EMAIL environment variable
 */
export async function isMasterAccount(): Promise<boolean> {
  const session = await getSession();
  
  if (!session) {
    return false;
  }
  
  const masterEmail = process.env.MASTER_ACCOUNT_EMAIL;
  return session.user.email === masterEmail;
}

/**
 * Get all user profiles (for master account)
 */
export async function getAllUserProfiles(): Promise<UserProfile[]> {
  await requireMaster();
  
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching user profiles:', error);
    return [];
  }
  
  return data || [];
}
