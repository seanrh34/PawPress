import { NextRequest, NextResponse } from 'next/server';
import { requireMaster } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

// GET all user profiles (master only)
export async function GET() {
  try {
    await requireMaster();
    
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 403 }
    );
  }
}

// POST create new admin account (master only)
export async function POST(request: NextRequest) {
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

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
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
      // RoladminClientelete the auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
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
