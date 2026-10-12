import { describe, expect, it, vi } from 'vitest';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  detectImageType,
  uploadImage,
} from '../mediaService';
import { makeDb } from './fakeDb';

function bytesFrom(text: string): Uint8Array {
  return Uint8Array.from([...text].map((char) => char.charCodeAt(0)));
}

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF87 = bytesFrom('GIF87a').slice();
const GIF89 = new Uint8Array([...bytesFrom('GIF89a'), 0x00]);
const WEBP = new Uint8Array([
  ...bytesFrom('RIFF'),
  0x24, 0x00, 0x00, 0x00,
  ...bytesFrom('WEBP'),
]);
const AVIF = new Uint8Array([
  0x00, 0x00, 0x00, 0x20,
  ...bytesFrom('ftypavif'),
]);

describe('detectImageType', () => {
  it('recognises PNG', () => {
    expect(detectImageType(PNG)).toBe('image/png');
  });

  it('recognises JPEG', () => {
    expect(detectImageType(JPEG)).toBe('image/jpeg');
  });

  it('recognises both GIF signatures', () => {
    expect(detectImageType(GIF87)).toBe('image/gif');
    expect(detectImageType(GIF89)).toBe('image/gif');
  });

  it('recognises WEBP via the RIFF/WEBP container', () => {
    expect(detectImageType(WEBP)).toBe('image/webp');
  });

  it('recognises AVIF and AVIS brands', () => {
    expect(detectImageType(AVIF)).toBe('image/avif');
    const avis = new Uint8Array([
      0x00, 0x00, 0x00, 0x20,
      ...bytesFrom('ftypavis'),
    ]);
    expect(detectImageType(avis)).toBe('image/avif');
  });

  it('returns null for unknown content', () => {
    expect(detectImageType(Uint8Array.from([0x00, 0x01, 0x02]))).toBeNull();
    expect(detectImageType(new Uint8Array(0))).toBeNull();
  });
});

describe('uploadImage', () => {
  it('rejects files over the size limit', async () => {
    const db = makeDb();
    const tooBig = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    await expect(
      uploadImage(db.client, tooBig, 'image/png'),
    ).rejects.toMatchObject({ code: 'payload_too_large' });
    expect(db.uploads).toHaveLength(0);
  });

  it('rejects a declared type that does not match the bytes', async () => {
    const db = makeDb();
    await expect(
      uploadImage(db.client, PNG, 'image/jpeg'),
    ).rejects.toMatchObject({ code: 'unsupported_media_type' });
  });

  it('rejects unrecognised bytes', async () => {
    const db = makeDb();
    await expect(
      uploadImage(db.client, Uint8Array.from([1, 2, 3, 4]), 'image/png'),
    ).rejects.toMatchObject({ code: 'unsupported_media_type' });
  });

  it('accepts image/jpg as an alias for image/jpeg', async () => {
    const db = makeDb();
    db.setUploadResult({ data: { path: 'abc.jpg' }, error: null });

    const result = await uploadImage(db.client, JPEG, 'image/jpg');
    expect(result.content_type).toBe('image/jpeg');
  });

  it('uploads to post-images with a generated name', async () => {
    const db = makeDb();
    db.setUploadResult({ data: { path: 'abc.png' }, error: null });

    const result = await uploadImage(db.client, PNG, 'image/png');

    expect(result).toEqual({
      url: 'https://cdn.test/post-images/abc.png',
      content_type: 'image/png',
      size: PNG.byteLength,
    });
    expect(db.uploads).toHaveLength(1);
    expect(db.uploads[0].bucket).toBe('post-images');
    expect(db.uploads[0].path).toMatch(/^\d+-[0-9a-f-]+\.png$/);
    expect(db.uploads[0].options).toMatchObject({ contentType: 'image/png' });
  });

  it('maps storage failures to internal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = makeDb();
    db.setUploadResult({ error: { message: 'storage down' } });

    await expect(uploadImage(db.client, PNG, 'image/png')).rejects.toMatchObject(
      { code: 'internal' },
    );
  });

  it('knows the full allow-list', () => {
    expect([...ALLOWED_IMAGE_TYPES]).toEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/gif',
      'image/avif',
    ]);
  });
});
