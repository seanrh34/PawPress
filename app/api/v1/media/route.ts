import { NextResponse } from 'next/server';
import { audit, withApi } from '@/lib/api/withApi';
import { ApiError } from '@/lib/cms/errors';
import { MAX_UPLOAD_BYTES, uploadImage } from '@/lib/cms/mediaService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withApi(
  async (req, ctx) => {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw ApiError.validation('Expected a multipart form body');
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
      throw ApiError.validation('A file field is required', {
        fields: { file: ['A file field is required'] },
      });
    }

    // Check the declared size before reading any bytes so an oversized upload
    // is rejected without buffering it.
    if (file.size > MAX_UPLOAD_BYTES) {
      throw ApiError.payloadTooLarge('File exceeds the maximum size of 4 MB');
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await uploadImage(ctx.auth.db, bytes, file.type);

    // The audit id is the storage path, never the file contents or URL query.
    audit(ctx, 'media.upload', 'media', new URL(result.url).pathname);

    return NextResponse.json(result, { status: 201 });
  },
  { auth: 'token', scope: 'media:upload' },
);
