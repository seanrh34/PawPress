import { NextResponse } from 'next/server';
import { withApi, audit } from '@/lib/api/withApi';
import { createToken } from '@/lib/auth/tokenService';
import { AppMetadataTokenStore } from '@/lib/auth/tokenStore';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApi(
  async (_req, ctx) => {
    const admin = createAdminClient();
    const store = new AppMetadataTokenStore(admin);
    const items = await store.list(ctx.auth.userId);
    return NextResponse.json({ items });
  },
  { auth: 'session' },
);

export const POST = withApi(
  async (req, ctx) => {
    const body = await req.json();

    const admin = createAdminClient();
    const store = new AppMetadataTokenStore(admin);

    const { token, meta } = await createToken({
      store,
      userId: ctx.auth.userId,
      role: ctx.auth.role,
      input: body,
    });

    audit(ctx, 'token.create', 'token', meta.id);

    return NextResponse.json({ token, meta }, { status: 201 });
  },
  { auth: 'session' },
);
