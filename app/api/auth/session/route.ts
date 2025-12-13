import { NextResponse } from 'next/server';
import { getSession, getUserProfile } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }

    const profile = await getUserProfile();

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        role: profile?.role || null,
        display_name: session.user.user_metadata?.display_name || null,
      },
    });
  } catch (error) {
    console.error('Error checking session:', error);
    return NextResponse.json({ authenticated: false });
  }
}
