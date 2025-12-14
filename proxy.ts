import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session if expired - required for Server Components
  await supabase.auth.getSession();

  // Protect all /admin routes except /admin/login
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // Allow access to login page (will show different UI if authenticated)
    if (request.nextUrl.pathname === '/admin/login') {
      return supabaseResponse;
    }

    // Define mutation routes that require secure authentication
    const mutationRoutes = [
      '/admin/posts/new',
      '/admin/users',
      '/admin/profile',
    ];
    const isEditRoute = request.nextUrl.pathname.match(/^\/admin\/posts\/[^/]+\/edit$/);
    const isMutationRoute = mutationRoutes.some(route => 
      request.nextUrl.pathname.startsWith(route)
    ) || isEditRoute;

    // For mutation routes (POST/PUT operations), use secure getUser() validation
    if (isMutationRoute) {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (!user || error) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin/login';
        return NextResponse.redirect(url);
      }
    } else {
      // For read-only routes (like dashboard), use faster getSession()
      const { data: { session }, error } = await supabase.auth.getSession();
      if (!session) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin/login';
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/admin/:path*',
  ],
};
