import { NextRequest, NextResponse } from 'next/server';
import { requireMaster } from '@/lib/auth';
import { createClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';

// DELETE user account (master only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireMaster();
    const { id } = await params;

    const supabase = await createClient();
    const adminClient = createAdminClient();

    // Check if user exists and is not master
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (profile.role === 'master') {
      return NextResponse.json(
        { error: 'Cannot delete master account' },
        { status: 403 }
      );
    }

    // Delete user from auth (this will cascade to user_profiles due to foreign key)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(id);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return NextResponse.json(
        { error: deleteError.message || 'Failed to delete user' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json(
      { error: 'Unauthorized or unexpected error' },
      { status: 403 }
    );
  }
}
