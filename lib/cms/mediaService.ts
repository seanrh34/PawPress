import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from './errors';

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const EXTENSION_BY_TYPE: Record<AllowedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let result = '';
  for (let i = offset; i < offset + length; i += 1) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.byteLength < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

/**
 * Identify an image from its magic bytes. Returns null when the bytes don't
 * match any supported image format.
 */
export function detectImageType(bytes: Uint8Array): string | null {
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }

  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
    return 'image/jpeg';
  }

  if (bytes.byteLength >= 6) {
    const gifHeader = ascii(bytes, 0, 6);
    if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
      return 'image/gif';
    }
  }

  if (
    bytes.byteLength >= 12 &&
    ascii(bytes, 0, 4) === 'RIFF' &&
    ascii(bytes, 8, 4) === 'WEBP'
  ) {
    return 'image/webp';
  }

  if (bytes.byteLength >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
    const brand = ascii(bytes, 8, 4);
    if (brand === 'avif' || brand === 'avis') {
      return 'image/avif';
    }
  }

  return null;
}

export interface UploadedImage {
  url: string;
  content_type: string;
  size: number;
}

export async function uploadImage(
  db: SupabaseClient,
  bytes: Uint8Array,
  declaredType: string,
): Promise<UploadedImage> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw ApiError.payloadTooLarge('File exceeds the maximum size of 4 MB');
  }

  const detected = detectImageType(bytes);
  const declared = declaredType === 'image/jpg' ? 'image/jpeg' : declaredType;

  if (
    !detected ||
    !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(detected) ||
    detected !== declared
  ) {
    throw ApiError.unsupportedMediaType('Unsupported image type');
  }

  const contentType = detected as AllowedImageType;
  const extension = EXTENSION_BY_TYPE[contentType];
  const path = `${Date.now()}-${randomUUID()}.${extension}`;

  const bucket = db.storage.from('post-images');
  const { data, error } = await bucket.upload(path, bytes, {
    contentType,
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    console.error('Failed to upload image:', error);
    throw ApiError.internal();
  }

  const {
    data: { publicUrl },
  } = bucket.getPublicUrl(data.path);

  return {
    url: publicUrl,
    content_type: contentType,
    size: bytes.byteLength,
  };
}
