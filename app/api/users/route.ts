import { NextRequest, NextResponse } from 'next/server';
import { crossOriginResponse } from '@/lib/api/webLock';
import { requireMaster, getAllUserProfiles } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

const MIN_PASSWORD_LENGTH = 12;

// GET all user profiles (master only)
export async function GET() {
  try {
    const profiles = await getAllUserProfiles();
    return NextResponse.json(profiles);
  } catch (error) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 403 }
    );
  }
}

// POST create new admin account (master only)
export async function POST(request: NextRequest) {
  const denied = crossOriginResponse(request);
  if (denied) return denied;

  try {
    const { user } = await requireMaster();
    const { email, password, display_name } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Create user in Supabase Auth using Admin API
    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        display_name: display_name || null,
      },
    });

    if (authError) {
      console.error('Error creating user:', authError);
      return NextResponse.json(
        { error: authError.message || 'Failed to create user' },
        { status: 500 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Create profile in user_profiles table
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .insert([
        {
          id: authData.user.id,
          email,
          role: 'admin',
          created_by: user.id,
        },
      ])
      .select()
      .single();

    if (profileError) {
      // Roll back: delete the auth user if profile creation fails
      await adminClient.auth.admin.deleteUser(authData.user.id);
      console.error('Error creating profile:', profileError);
      return NextResponse.json(
        { error: profileError.message || 'Failed to create user profile' },
        { status: 500 }
      );
    }

    return NextResponse.json(profileData, { status: 201 });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Unauthorized or unexpected error' },
      { status: 403 }
    );
  }
}
