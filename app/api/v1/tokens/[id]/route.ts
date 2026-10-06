import { NextResponse } from 'next/server';
import { withApi, audit } from '@/lib/api/withApi';
import { AppMetadataTokenStore } from '@/lib/auth/tokenStore';
import { ApiError } from '@/lib/cms/errors';
import { createAdminClient } from '@/lib/supabase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const DELETE = withApi<{ id: string }>(
  async (_req, ctx) => {
    const admin = createAdminClient();
    const store = new AppMetadataTokenStore(admin);
    const tokenId = ctx.params.id;

    const revoked = await store.revoke(ctx.auth.userId, tokenId);
    if (!revoked) {
      throw ApiError.notFound('Token not found');
    }

    audit(ctx, 'token.revoke', 'token', tokenId);

    return NextResponse.json({ deleted: true, id: tokenId });
  },
  { auth: 'session' },
);
