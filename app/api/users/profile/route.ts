import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';

// PUT update own profile
export async function PUT(request: NextRequest) {
  try {
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { display_name } = await request.json();

    const supabase = await createClient();

    // Update user metadata in auth.users
    const { data, error } = await supabase.auth.updateUser({
      data: {
        display_name: display_name || null,
      },
    });

    if (error) {
      console.error('Error updating profile:', error);
      return NextResponse.json(
        { error: error.message || 'Failed to update profile' },
        { status: 500 }
      );
    }

    // Fetch updated profile info
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return NextResponse.json({
      success: true,
      profile: {
        ...profile,
        display_name: data.user?.user_metadata?.display_name || null,
      },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
