import { NextResponse } from 'next/server';
import { crossOriginResponse } from '@/lib/api/webLock';
import { createClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const denied = crossOriginResponse(request);
  if (denied) return denied;

  try {
    const supabase = await createClient();

    // Sign out the user
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Logout error:', error);
      return NextResponse.json(
        { error: 'Failed to log out' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected logout error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
