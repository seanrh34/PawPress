import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mintToken } from '@/lib/auth/tokens';
import type { TokenMeta } from '@/lib/auth/tokenStore';
import type { CategoryRow } from '@/lib/cms/categoryService';
import { MAX_UPLOAD_BYTES } from '@/lib/cms/mediaService';
import { ALL_SCOPES, type Scope } from '@/lib/cms/permissions';
import type { PostRow } from '@/lib/cms/postService';
import { editorPostState } from '@/lib/cms/__tests__/fixtures/editorState';
import { makeRouteDb, type RouteDb } from './fakeRouteDb';

const adminHolder = vi.hoisted(() => ({ client: undefined as unknown }));

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => adminHolder.client,
}));

import { GET as postsGet, POST as postsPost } from '@/app/api/v1/posts/route';
import {
  DELETE as postDelete,
  GET as postGet,
  PATCH as postPatch,
} from '@/app/api/v1/posts/[id]/route';
import { POST as publishPostRoute } from '@/app/api/v1/posts/[id]/publish/route';
import { POST as unpublishPostRoute } from '@/app/api/v1/posts/[id]/unpublish/route';
import {
  GET as categoriesGet,
  POST as categoriesPost,
} from '@/app/api/v1/categories/route';
import {
  DELETE as categoryDelete,
  PATCH as categoryPatch,
} from '@/app/api/v1/categories/[id]/route';
import { POST as mediaPost } from '@/app/api/v1/media/route';

const SECRET = 'pawpress-test-secret-0123456789abcdef';
const USER_ID = 'user-1';
const UUID = '22222222-2222-4222-8222-222222222222';
const CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
const T0 = '2026-01-01T00:00:00.000Z';
const T1 = '2026-01-01T00:00:01.000Z';
const BASE = 'http://test.local/api/v1';

let db: RouteDb;

function categoryRow(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: CATEGORY_ID,
    name: 'News',
    slug: 'news',
    description: 'The news',
    created_at: T0,
    updated_at: T0,
    ...overrides,
  };
}

function postRow(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: UUID,
    title: 'Hello',
    slug: 'hello',
    content_lexical: null,
    content_html: '',
    excerpt: '',
    featured_image_url: null,
    published_at: null,
    created_at: T0,
    updated_at: T0,
    category_id: CATEGORY_ID,
    category: { id: CATEGORY_ID, slug: 'news', name: 'News' },
    ...overrides,
  };
}

function barePostRow(overrides: Partial<PostRow> = {}): PostRow {
  const copy: Partial<PostRow> = { ...postRow(overrides) };
  delete copy.category;
  return copy as PostRow;
}

async function issueToken(scopes: Scope[]): Promise<string> {
  const id = randomUUID();
  const meta: TokenMeta = {
    id,
    name: 'agent',
    scopes: [...scopes],
    created_at: T0,
    expires_at: '2999-01-01T00:00:00.000Z',
  };
  const user = db.users.get(USER_ID);
  if (!user) throw new Error('test user missing');
  const tokens = (user.app_metadata.pawpress_tokens as TokenMeta[]) ?? [];
  user.app_metadata.pawpress_tokens = [...tokens, meta];
  return mintToken({
    userId: USER_ID,
    tokenId: id,
    scopes,
    expiresAt: new Date('2999-01-01T00:00:00.000Z'),
  });
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function authed(url: string, method: string, token: string | null): Request {
  return new Request(url, { method, headers: authHeaders(token) });
}

function authedJson(
  url: string,
  method: string,
  token: string | null,
  body: unknown,
): Request {
  return new Request(url, {
    method,
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function authedRaw(
  url: string,
  method: string,
  token: string | null,
  body: string,
): Request {
  return new Request(url, {
    method,
    headers: { ...authHeaders(token), 'content-type': 'application/json' },
    body,
  });
}

function pngBytes(): Uint8Array<ArrayBuffer> {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function mediaRequest(
  token: string | null,
  value: Blob | string,
): Request {
  const form = new FormData();
  if (typeof value === 'string') {
    form.append('file', value);
  } else {
    form.append('file', value, 'client-name.png');
  }
  return new Request(`${BASE}/media`, {
    method: 'POST',
    headers: authHeaders(token),
    body: form,
  });
}

const ctxFor = (id: string) => ({ params: Promise.resolve({ id }) });

function expectNoWrites(): void {
  for (const method of ['insert', 'update', 'delete']) {
    expect(db.callsFor('posts', method)).toHaveLength(0);
    expect(db.callsFor('categories', method)).toHaveLength(0);
  }
  expect(db.uploads).toHaveLength(0);
}

beforeEach(() => {
  vi.stubEnv('PAWPRESS_TOKEN_SECRET', SECRET);
  db = makeRouteDb();
  db.users.set(USER_ID, {
    id: USER_ID,
    email: 'a@b.c',
    app_metadata: { pawpress_tokens: [] },
  });
  adminHolder.client = db.client;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

interface RouteCase {
  name: string;
  scope: Scope | null;
  successScopes: Scope[];
  missingScopes: Scope[];
  makeRequest(token: string | null): Request;
  invoke(req: Request): Promise<Response>;
  setup(): void;
}

const routeCases: RouteCase[] = [
  {
    name: 'GET /posts',
    scope: 'posts:read',
    successScopes: ['posts:read'],
    missingScopes: ['posts:write'],
    makeRequest: (token) => authed(`${BASE}/posts`, 'GET', token),
    invoke: (req) => postsGet(req),
    setup: () => db.enqueue('posts', { data: [postRow()], count: 1 }),
  },
  {
    name: 'POST /posts',
    scope: 'posts:write',
    successScopes: ['posts:write'],
    missingScopes: ['posts:read'],
    makeRequest: (token) =>
      authedJson(`${BASE}/posts`, 'POST', token, {
        title: 'Hello',
        category: 'news',
        content_markdown: '# Hi',
      }),
    invoke: (req) => postsPost(req),
    setup: () => {
      // Once for the route's category resolution and once for the service's.
      db.enqueue('categories', { data: categoryRow() }, { data: categoryRow() });
      db.enqueue(
        'posts',
        { data: barePostRow() },
        { data: postRow() },
      );
    },
  },
  {
    name: 'GET /posts/:id',
    scope: 'posts:read',
    successScopes: ['posts:read'],
    missingScopes: ['posts:write'],
    makeRequest: (token) => authed(`${BASE}/posts/${UUID}`, 'GET', token),
    invoke: (req) => postGet(req, ctxFor(UUID)),
    setup: () => db.enqueue('posts', { data: postRow() }),
  },
  {
    name: 'PATCH /posts/:id',
    scope: 'posts:write',
    successScopes: ['posts:write'],
    missingScopes: ['posts:read'],
    makeRequest: (token) =>
      authedJson(`${BASE}/posts/${UUID}`, 'PATCH', token, { title: 'New' }),
    invoke: (req) => postPatch(req, ctxFor(UUID)),
    setup: () => {
      db.enqueue(
        'posts',
        { data: postRow() },
        { data: postRow() },
        { data: barePostRow({ title: 'New' }) },
        { data: postRow({ title: 'New' }) },
      );
    },
  },
  {
    name: 'DELETE /posts/:id',
    scope: 'posts:delete',
    successScopes: ['posts:delete'],
    missingScopes: ['posts:write'],
    makeRequest: (token) => authed(`${BASE}/posts/${UUID}`, 'DELETE', token),
    invoke: (req) => postDelete(req, ctxFor(UUID)),
    setup: () => {
      db.enqueue('posts', { data: postRow() }, { data: null });
    },
  },
  {
    name: 'POST /posts/:id/publish',
    scope: 'posts:publish',
    successScopes: ['posts:publish'],
    missingScopes: ['posts:write'],
    makeRequest: (token) =>
      authed(`${BASE}/posts/${UUID}/publish`, 'POST', token),
    invoke: (req) => publishPostRoute(req, ctxFor(UUID)),
    setup: () => {
      db.enqueue(
        'posts',
        { data: postRow() },
        { data: barePostRow({ published_at: T1 }) },
        { data: postRow({ published_at: T1 }) },
      );
    },
  },
  {
    name: 'POST /posts/:id/unpublish',
    scope: 'posts:publish',
    successScopes: ['posts:publish'],
    missingScopes: ['posts:write'],
    makeRequest: (token) =>
      authed(`${BASE}/posts/${UUID}/unpublish`, 'POST', token),
    invoke: (req) => unpublishPostRoute(req, ctxFor(UUID)),
    setup: () => {
      db.enqueue(
        'posts',
        { data: postRow({ published_at: T1 }) },
        { data: barePostRow({ published_at: null }) },
        { data: postRow({ published_at: null }) },
      );
    },
  },
  {
    name: 'GET /categories',
    scope: null,
    successScopes: [...ALL_SCOPES],
    missingScopes: [],
    makeRequest: (token) => authed(`${BASE}/categories`, 'GET', token),
    invoke: (req) => categoriesGet(req),
    setup: () => db.enqueue('categories', { data: [categoryRow()] }),
  },
  {
    name: 'POST /categories',
    scope: 'categories:write',
    successScopes: ['categories:write'],
    missingScopes: ['posts:read'],
    makeRequest: (token) =>
      authedJson(`${BASE}/categories`, 'POST', token, {
        name: 'News',
        slug: 'news',
        description: 'The news',
      }),
    invoke: (req) => categoriesPost(req),
    setup: () => db.enqueue('categories', { data: categoryRow() }),
  },
  {
    name: 'PATCH /categories/:id',
    scope: 'categories:write',
    successScopes: ['categories:write'],
    missingScopes: ['posts:read'],
    makeRequest: (token) =>
      authedJson(`${BASE}/categories/${CATEGORY_ID}`, 'PATCH', token, {
        name: 'Renamed',
      }),
    invoke: (req) => categoryPatch(req, ctxFor(CATEGORY_ID)),
    setup: () =>
      db.enqueue('categories', { data: categoryRow({ name: 'Renamed' }) }),
  },
  {
    name: 'DELETE /categories/:id',
    scope: 'categories:write',
    successScopes: ['categories:write'],
    missingScopes: ['posts:read'],
    makeRequest: (token) =>
      authed(`${BASE}/categories/${CATEGORY_ID}`, 'DELETE', token),
    invoke: (req) => categoryDelete(req, ctxFor(CATEGORY_ID)),
    setup: () => {
      db.enqueue('categories', { data: categoryRow() }, { data: null });
      db.enqueue('posts', { data: [] });
    },
  },
  {
    name: 'POST /media',
    scope: 'media:upload',
    successScopes: ['media:upload'],
    missingScopes: ['posts:read'],
    makeRequest: (token) =>
      mediaRequest(token, new File([pngBytes()], 'x.png', { type: 'image/png' })),
    invoke: (req) => mediaPost(req),
    setup: () =>
      db.setUploadResult({ data: { path: 'generated.png' }, error: null }),
  },
];

describe('v1 scope matrix', () => {
  for (const routeCase of routeCases) {
    describe(routeCase.name, () => {
      it('returns 401 without a token', async () => {
        const response = await routeCase.invoke(routeCase.makeRequest(null));
        expect(response.status).toBe(401);
        expect((await response.json()).error.code).toBe('unauthorized');
      });

      if (routeCase.scope) {
        it(`returns 403 without ${routeCase.scope} and writes nothing`, async () => {
          const token = await issueToken(routeCase.missingScopes);
          const response = await routeCase.invoke(routeCase.makeRequest(token));
          expect(response.status).toBe(403);
          expect((await response.json()).error.code).toBe('forbidden');
          expectNoWrites();
        });
      }

      it('succeeds with the required scope', async () => {
        const token = await issueToken(routeCase.successScopes);
        routeCase.setup();
        const response = await routeCase.invoke(routeCase.makeRequest(token));
        expect(response.status).toBeGreaterThanOrEqual(200);
        expect(response.status).toBeLessThan(300);
      });
    });
  }
});

describe('post update scopes', () => {
  it('rejects PATCH on a published post with only posts:write', async () => {
    const token = await issueToken(['posts:write']);
    db.enqueue('posts', { data: postRow({ published_at: T1 }) });
    const response = await postPatch(
      authedJson(`${BASE}/posts/${UUID}`, 'PATCH', token, { title: 'New' }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(403);
    expectNoWrites();
  });

  it('rejects a status change on a draft with only posts:write', async () => {
    const token = await issueToken(['posts:write']);
    db.enqueue('posts', { data: postRow() });
    const response = await postPatch(
      authedJson(`${BASE}/posts/${UUID}`, 'PATCH', token, {
        status: 'published',
      }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(403);
    expectNoWrites();
  });

  it('allows a status change with posts:publish', async () => {
    const token = await issueToken(['posts:write', 'posts:publish']);
    db.enqueue(
      'posts',
      { data: postRow() },
      { data: postRow() },
      { data: barePostRow({ published_at: T1 }) },
      { data: postRow({ published_at: T1 }) },
    );
    const response = await postPatch(
      authedJson(`${BASE}/posts/${UUID}`, 'PATCH', token, {
        status: 'published',
      }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('published');
    expect(typeof body.published_at).toBe('string');
  });

  it('rejects creating a published post without posts:publish', async () => {
    const token = await issueToken(['posts:write']);
    const response = await postsPost(
      authedJson(`${BASE}/posts`, 'POST', token, {
        title: 'Hello',
        category: 'news',
        content_markdown: '# Hi',
        status: 'published',
      }),
    );
    expect(response.status).toBe(403);
    expectNoWrites();
  });

  it('conflicts on an if_updated_at mismatch with current_updated_at', async () => {
    const token = await issueToken(['posts:write']);
    db.enqueue(
      'posts',
      { data: postRow({ updated_at: T1 }) },
      { data: postRow({ updated_at: T1 }) },
    );
    const response = await postPatch(
      authedJson(`${BASE}/posts/${UUID}`, 'PATCH', token, {
        title: 'New',
        if_updated_at: T0,
      }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('conflict');
    expect(body.error.details.current_updated_at).toBe(T1);
    expect(db.callsFor('posts', 'update')).toHaveLength(0);
  });
});

describe('v1 content validation', () => {
  async function writeToken(): Promise<string> {
    return issueToken(['posts:write']);
  }

  it('rejects a data: image in markdown with unsafe_urls', async () => {
    const token = await writeToken();
    const response = await postsPost(
      authedJson(`${BASE}/posts`, 'POST', token, {
        title: 'Hello',
        category: 'news',
        content_markdown: '![x](data:image/png;base64,AAAA)',
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe('validation_failed');
    expect(body.error.details.unsafe_urls.length).toBeGreaterThan(0);
    expect(body.error.details.fields.content.length).toBeGreaterThan(0);
    expectNoWrites();
  });

  it('rejects a data: image in content_lexical with unsafe_urls', async () => {
    const token = await writeToken();
    const response = await postsPost(
      authedJson(`${BASE}/posts`, 'POST', token, {
        title: 'Hello',
        category: 'news',
        content_lexical: {
          root: {
            type: 'root',
            children: [
              {
                type: 'paragraph',
                children: [
                  {
                    type: 'image',
                    src: 'data:image/png;base64,AAAA',
                    altText: 'x',
                  },
                ],
              },
            ],
          },
        },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.details.unsafe_urls.length).toBeGreaterThan(0);
    expectNoWrites();
  });

  it('rejects a javascript: link', async () => {
    const token = await writeToken();
    const response = await postsPost(
      authedJson(`${BASE}/posts`, 'POST', token, {
        title: 'Hello',
        category: 'news',
        content_lexical: {
          root: {
            type: 'root',
            children: [
              {
                type: 'link',
                url: 'javascript:alert(1)',
                children: [{ type: 'text', text: 'x' }],
              },
            ],
          },
        },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('validation_failed');
    expectNoWrites();
  });

  it('rejects a data: featured_image_url', async () => {
    const token = await writeToken();
    const response = await postsPost(
      authedJson(`${BASE}/posts`, 'POST', token, {
        title: 'Hello',
        category: 'news',
        content_markdown: '# Hi',
        featured_image_url: 'data:image/png;base64,AAAA',
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.details.fields.featured_image_url).toBeDefined();
    expectNoWrites();
  });

  it('rejects both content fields on create', async () => {
    const token = await writeToken();
    const response = await postsPost(
      authedJson(`${BASE}/posts`, 'POST', token, {
        title: 'Hello',
        category: 'news',
        content_markdown: '# Hi',
        content_lexical: { root: { type: 'root', children: [] } },
      }),
    );
    expect(response.status).toBe(400);
    expectNoWrites();
  });

  it('rejects an unknown body key', async () => {
    const token = await writeToken();
    const response = await postsPost(
      authedJson(`${BASE}/posts`, 'POST', token, {
        title: 'Hello',
        category: 'news',
        content_markdown: '# Hi',
        surprise: true,
      }),
    );
    expect(response.status).toBe(400);
    expectNoWrites();
  });

  it('rejects invalid JSON', async () => {
    const token = await writeToken();
    const response = await postsPost(
      authedRaw(`${BASE}/posts`, 'POST', token, 'not-json'),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('validation_failed');
  });

  it('rejects an empty PATCH body', async () => {
    const token = await writeToken();
    const response = await postPatch(
      authedJson(`${BASE}/posts/${UUID}`, 'PATCH', token, {}),
      ctxFor(UUID),
    );
    expect(response.status).toBe(400);
    expect(db.callsFor('posts', 'select')).toHaveLength(0);
  });

  it('rejects if_updated_at alone on PATCH', async () => {
    const token = await writeToken();
    const response = await postPatch(
      authedJson(`${BASE}/posts/${UUID}`, 'PATCH', token, {
        if_updated_at: T0,
      }),
      ctxFor(UUID),
    );
    expect(response.status).toBe(400);
  });
});

describe('post lookups and formats', () => {
  it('looks up by slug', async () => {
    const token = await issueToken(['posts:read']);
    db.enqueue('posts', { data: postRow() });
    const response = await postGet(
      authed(`${BASE}/posts/hello`, 'GET', token),
      ctxFor('hello'),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(UUID);
    expect(db.callsFor('posts', 'eq')[0].args).toEqual(['slug', 'hello']);
  });

  it('looks up by id for a UUID', async () => {
    const token = await issueToken(['posts:read']);
    db.enqueue('posts', { data: postRow() });
    await postGet(authed(`${BASE}/posts/${UUID}`, 'GET', token), ctxFor(UUID));
    expect(db.callsFor('posts', 'eq')[0].args).toEqual(['id', UUID]);
  });

  it('returns markdown content by default', async () => {
    const token = await issueToken(['posts:read']);
    db.enqueue('posts', {
      data: postRow({
        content_lexical: editorPostState,
        content_html: '<p>Hello world</p>',
      }),
    });
    const response = await postGet(
      authed(`${BASE}/posts/${UUID}`, 'GET', token),
      ctxFor(UUID),
    );
    const body = await response.json();
    expect(body.content_format).toBe('markdown');
    expect(typeof body.content).toBe('string');
    expect(body.content).toContain('Hello world');
  });

  it('returns lexical content', async () => {
    const token = await issueToken(['posts:read']);
    db.enqueue('posts', {
      data: postRow({ content_lexical: editorPostState }),
    });
    const response = await postGet(
      authed(`${BASE}/posts/${UUID}?format=lexical`, 'GET', token),
      ctxFor(UUID),
    );
    const body = await response.json();
    expect(body.content_format).toBe('lexical');
    expect(body.content).toEqual(editorPostState);
  });

  it('returns stored html content', async () => {
    const token = await issueToken(['posts:read']);
    db.enqueue('posts', {
      data: postRow({ content_html: '<p>Hello world</p>' }),
    });
    const response = await postGet(
      authed(`${BASE}/posts/${UUID}?format=html`, 'GET', token),
      ctxFor(UUID),
    );
    const body = await response.json();
    expect(body.content_format).toBe('html');
    expect(body.content).toBe('<p>Hello world</p>');
  });

  it('returns 404 for a non-UUID id on PATCH without touching data', async () => {
    const token = await issueToken(['posts:write']);
    const response = await postPatch(
      authedJson(`${BASE}/posts/not-a-uuid`, 'PATCH', token, { title: 'New' }),
      ctxFor('not-a-uuid'),
    );
    expect(response.status).toBe(404);
    expect(db.callsFor('posts', 'select')).toHaveLength(0);
  });

  it('omits content from list responses', async () => {
    const token = await issueToken(['posts:read']);
    db.enqueue('posts', {
      data: [postRow({ content_lexical: editorPostState })],
      count: 1,
    });
    const response = await postsGet(authed(`${BASE}/posts`, 'GET', token));
    const body = await response.json();
    expect(body.items[0]).not.toHaveProperty('content');
    expect(body.items[0]).not.toHaveProperty('content_lexical');
    expect(body.items[0].status).toBe('draft');
  });
});

describe('categories', () => {
  it('conflicts when deleting a category that still has posts', async () => {
    const token = await issueToken(['categories:write']);
    db.enqueue('categories', { data: categoryRow() });
    db.enqueue('posts', { data: [{ id: UUID }] });
    const response = await categoryDelete(
      authed(`${BASE}/categories/${CATEGORY_ID}`, 'DELETE', token),
      ctxFor(CATEGORY_ID),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('conflict');
    expect(db.callsFor('categories', 'delete')).toHaveLength(0);
  });
});

describe('media uploads', () => {
  it('rejects a file over 4 MB without reading its bytes', async () => {
    const token = await issueToken(['media:upload']);
    const arrayBufferSpy = vi.spyOn(File.prototype, 'arrayBuffer');
    const big = new File(
      [new Uint8Array(MAX_UPLOAD_BYTES + 1)],
      'big.png',
      { type: 'image/png' },
    );
    const response = await mediaPost(mediaRequest(token, big));
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('payload_too_large');
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(db.uploads).toHaveLength(0);
  });

  it('rejects bytes whose magic does not match', async () => {
    const token = await issueToken(['media:upload']);
    const response = await mediaPost(
      mediaRequest(
        token,
        new File([new TextEncoder().encode('not an image')], 'x.png', {
          type: 'image/png',
        }),
      ),
    );
    expect(response.status).toBe(415);
    expect((await response.json()).error.code).toBe('unsupported_media_type');
    expect(db.uploads).toHaveLength(0);
  });

  it('rejects a missing or non-file field', async () => {
    const token = await issueToken(['media:upload']);
    const response = await mediaPost(mediaRequest(token, 'just text'));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('validation_failed');
    expect(db.uploads).toHaveLength(0);
  });

  it('uploads a valid image under a server-generated name', async () => {
    const token = await issueToken(['media:upload']);
    db.setUploadResult({ data: { path: 'generated.png' }, error: null });
    const response = await mediaPost(
      mediaRequest(
        token,
        new File([pngBytes()], 'client-name.png', { type: 'image/png' }),
      ),
    );
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({ content_type: 'image/png', size: 8 });
    expect(typeof body.url).toBe('string');
    expect(db.uploads).toHaveLength(1);
    expect(db.uploads[0].bucket).toBe('post-images');
    expect(db.uploads[0].path).toMatch(
      /^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/,
    );
    expect(db.uploads[0].path).not.toContain('client-name');
  });
});

describe('audit logging', () => {
  it('emits an audit line with no content or token, and never logs the token', async () => {
    const infos: string[] = [];
    const others: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((...args: unknown[]) => {
      infos.push(args.map((arg) => String(arg)).join(' '));
    });
    for (const level of ['log', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        others.push(args.map((arg) => String(arg)).join(' '));
      });
    }

    const token = await issueToken(['posts:write']);
    db.enqueue('categories', { data: categoryRow() }, { data: categoryRow() });
    db.enqueue('posts', { data: barePostRow() }, { data: postRow() });

    const response = await postsPost(
      authedJson(`${BASE}/posts`, 'POST', token, {
        title: 'Hello',
        category: 'news',
        content_markdown: 'SECRET_MARKER',
      }),
    );
    expect(response.status).toBe(201);

    const auditLine = infos.find((line) => line.includes('pawpress.audit'));
    expect(auditLine).toBeDefined();
    const parsed = JSON.parse(auditLine as string);
    expect(parsed).toMatchObject({
      evt: 'pawpress.audit',
      action: 'post.create',
      resource: 'post',
      id: UUID,
    });
    expect(auditLine).not.toContain(token);
    expect(auditLine).not.toContain('SECRET_MARKER');

    const allOutput = [...infos, ...others].join('\n');
    expect(allOutput).not.toContain(token);
  });
});

describe('token owner role changes', () => {
  it('rejects a previously valid token once the profile is removed', async () => {
    const token = await issueToken(['posts:read']);
    db.hasProfile = false;
    const response = await postsGet(authed(`${BASE}/posts`, 'GET', token));
    expect(response.status).toBe(401);
  });

  it('rejects a previously valid token once the role is demoted', async () => {
    const token = await issueToken(['posts:read']);
    db.role = 'viewer';
    const response = await postsGet(authed(`${BASE}/posts`, 'GET', token));
    expect(response.status).toBe(401);
  });
});
