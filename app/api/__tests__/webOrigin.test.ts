import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeRouteDb, type RouteDb } from '@/app/api/v1/__tests__/fakeRouteDb';

const state = vi.hoisted(() => ({
  user: null as unknown,
  client: undefined as unknown,
}));

vi.mock('@/lib/auth', () => ({
  getUser: async () => state.user,
}));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => state.client,
}));

vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => state.client,
  getAuthenticatedSupabaseClient: async () => state.client,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => state.client,
}));

vi.mock('@/lib/uploadImages', () => ({
  processAndUploadImages: async (value: unknown) => value,
}));

import { POST as categoryPost } from '@/app/api/category/route';
import {
  DELETE as categoryDelete,
  PUT as categoryPut,
} from '@/app/api/category/[id]/route';
import { POST as postsPost } from '@/app/api/posts/route';
import { PUT as profilePut } from '@/app/api/users/profile/route';
import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as logoutPost } from '@/app/api/auth/logout/route';

const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const ctx = { params: Promise.resolve({ id: CATEGORY_ID }) };
const EVIL = 'https://evil.test';
const SAME = 'http://test.local';

let db: RouteDb;

function request(url: string, method: string, origin: string | null): NextRequest {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    host: 'test.local',
  };
  if (origin) headers.origin = origin;
  return new NextRequest(url, { method, headers, body: '{}' });
}

beforeEach(() => {
  db = makeRouteDb();
  state.user = { id: 'user-1', email: 'alice@example.com' };
  state.client = db.client;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('legacy cookie routes reject cross-origin mutations', () => {
  it.each([
    ['POST /api/category', () => categoryPost(request(`${SAME}/api/category`, 'POST', EVIL))],
    ['PUT /api/category/:id', () => categoryPut(request(`${SAME}/api/category/${CATEGORY_ID}`, 'PUT', EVIL), ctx)],
    ['DELETE /api/category/:id', () => categoryDelete(request(`${SAME}/api/category/${CATEGORY_ID}`, 'DELETE', EVIL), ctx)],
    ['POST /api/posts', () => postsPost(request(`${SAME}/api/posts`, 'POST', EVIL))],
    ['PUT /api/users/profile', () => profilePut(request(`${SAME}/api/users/profile`, 'PUT', EVIL))],
    ['POST /api/auth/login', () => loginPost(request(`${SAME}/api/auth/login`, 'POST', EVIL))],
    ['POST /api/auth/logout', () => logoutPost(request(`${SAME}/api/auth/logout`, 'POST', EVIL))],
  ])('%s returns 403 for a foreign Origin', async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(403);
    expect(db.calls.filter((c) => c.table !== 'user_profiles')).toEqual([]);
  });

  it('rejects a mutation without an Origin header', async () => {
    const response = await logoutPost(request(`${SAME}/api/auth/logout`, 'POST', null));
    expect(response.status).toBe(403);
  });
});

describe('legacy category writes require an admin profile', () => {
  it('returns 401 without a session', async () => {
    state.user = null;
    const response = await categoryPost(request(`${SAME}/api/category`, 'POST', SAME));
    expect(response.status).toBe(401);
  });

  it('returns 401 for a signed-in user without an admin profile', async () => {
    db.role = 'user';
    const response = await categoryDelete(
      request(`${SAME}/api/category/${CATEGORY_ID}`, 'DELETE', SAME),
      ctx,
    );
    expect(response.status).toBe(401);
    expect(db.calls.filter((c) => c.table === 'categories')).toEqual([]);
  });
});
