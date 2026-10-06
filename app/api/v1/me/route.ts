import { NextResponse } from 'next/server';
import { withApi } from '@/lib/api/withApi';
import { AppMetadataTokenStore } from '@/lib/auth/tokenStore';
import { ApiError } from '@/lib/cms/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withApi(
  async (_req, ctx) => {
    const { auth } = ctx;
    if (auth.via !== 'token') {
      throw ApiError.unauthorized();
    }

    const store = new AppMetadataTokenStore(auth.db);
    const items = await store.list(auth.userId);
    const meta = items.find((token) => token.id === auth.tokenId);

    if (!meta) {
      throw ApiError.unauthorized();
    }

    return NextResponse.json({
      user: { id: auth.userId, email: auth.email, role: auth.role },
      token: {
        id: meta.id,
        name: meta.name,
        scopes: auth.scopes,
        expires_at: meta.expires_at,
      },
    });
  },
  { auth: 'token' },
);
