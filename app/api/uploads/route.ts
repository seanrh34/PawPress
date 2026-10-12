import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';

// Server-side only: storage mutations require the service-role client.
export const runtime = 'nodejs';

const BUCKET = 'post-images';
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB
const OBJECT_NAME_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;

interface DetectedImage {
  mime: string;
  ext: string;
}

/** Detect the image type from magic bytes. Never trust client-supplied MIME. */
function detectImageType(buf: Buffer): DetectedImage | null {
  // PNG: 89 50 4E 47
  if (buf.length >= 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }
  // GIF: GIF87a or GIF89a
  if (buf.length >= 6) {
    const sig = buf.toString('latin1', 0, 6);
    if (sig === 'GIF87a' || sig === 'GIF89a') {
      return { mime: 'image/gif', ext: 'gif' };
    }
  }
  // WEBP: RIFF....WEBP
  if (
    buf.length >= 12 &&
    buf.toString('latin1', 0, 4) === 'RIFF' &&
    buf.toString('latin1', 8, 12) === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }
  // AVIF/AVIS: ftypavif or ftypavis at offset 4
  if (buf.length >= 12) {
    const brand = buf.toString('latin1', 4, 12);
    if (brand === 'ftypavif' || brand === 'ftypavis') {
      return { mime: 'image/avif', ext: 'avif' };
    }
  }
  return null;
}

/**
 * Verify the request is authenticated, belongs to an admin/master user and is
 * same-origin. Returns an error response, or null when the request may proceed.
 */
async function authorize(request: NextRequest): Promise<NextResponse | null> {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from('user_profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error || !profile || (profile.role !== 'admin' && profile.role !== 'master')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const origin = request.headers.get('origin');
  if (!origin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const requestHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!requestHost || originHost !== requestHost) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}

// POST multipart form field `file` -> uploads an image and returns its public URL.
export async function POST(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string' || !(file instanceof Blob)) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 4MB limit' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const detected = detectImageType(buffer);
    if (!detected) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 415 });
    }

    const fileName = `featured-${Date.now()}-${crypto.randomUUID()}.${detected.ext}`;
    const admin = createAdminClient();

    const { data, error } = await admin.storage.from(BUCKET).upload(fileName, buffer, {
      contentType: detected.mime,
      cacheControl: '3600',
      upsert: false,
    });

    if (error) {
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(BUCKET).getPublicUrl(data.path);

    return NextResponse.json({ url: publicUrl }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });
  }
}

// DELETE ?url=<public url> -> deletes a single object from our own bucket.
export async function DELETE(request: NextRequest) {
  const denied = await authorize(request);
  if (denied) return denied;

  try {
    const url = request.nextUrl.searchParams.get('url');
    const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

    if (!url || !url.startsWith(prefix)) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const name = url.slice(prefix.length);
    if (!OBJECT_NAME_PATTERN.test(name) || name.includes('..')) {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { error } = await admin.storage.from(BUCKET).remove([name]);

    if (error) {
      return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 });
  }
}
