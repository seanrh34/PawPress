import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { SerializedEditorState } from 'lexical';
import { createAdminClient } from './supabase-admin';
import { MAX_UPLOAD_BYTES, detectImageType, uploadImage } from './cms/mediaService';

// SERVER-ONLY: this module uses the Supabase service-role client, which bypasses
// RLS. It must only be imported from server-side code (route handlers / server
// components) after the caller has performed its auth check. NEVER import this
// module from a 'use client' component.

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REMOTE_IMAGES = 20;

/**
 * Addresses a server-side fetch must never reach: loopback, private, link-local
 * (cloud metadata), CGNAT, multicast and reserved ranges, for IPv4 and IPv6.
 */
const BLOCKED_ADDRESSES = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 3],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv4');
}
// IPv4-mapped IPv6 (::ffff:a.b.c.d) is matched against the IPv4 rules above.
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  BLOCKED_ADDRESSES.addSubnet(network, prefix, 'ipv6');
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  return BLOCKED_ADDRESSES.check(address, family === 6 ? 'ipv6' : 'ipv4');
}

/**
 * DNS lookup that refuses internal addresses. It runs at connect time, so the
 * checked address is the one actually used (no DNS-rebinding gap).
 */
const safeLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '', 0);
      return;
    }
    const list = addresses as LookupAddress[];
    const blocked = list.find((entry) => isBlockedAddress(entry.address));
    if (list.length === 0 || blocked) {
      callback(new Error('Refusing to fetch an internal address'), '', 0);
      return;
    }
    if (options.all) {
      (callback as unknown as (err: null, all: LookupAddress[]) => void)(null, list);
    } else {
      callback(null, list[0].address, list[0].family);
    }
  });
};

/**
 * Downloads an external http(s) image: no redirects, a timeout, at most
 * MAX_UPLOAD_BYTES, and only to public addresses.
 */
export function fetchExternalImage(imageUrl: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(imageUrl);
    } catch {
      reject(new Error('Invalid image URL'));
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      reject(new Error('Unsupported image URL scheme'));
      return;
    }
    // IP literals skip DNS, so check them here.
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) !== 0 && isBlockedAddress(host)) {
      reject(new Error('Refusing to fetch an internal address'));
      return;
    }

    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(
      url,
      { lookup: safeLookup, timeout: FETCH_TIMEOUT_MS, headers: { Accept: 'image/*' } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Image fetch failed with HTTP ${res.statusCode}`));
          return;
        }
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
          res.destroy();
          reject(new Error('Image exceeds the maximum size'));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_UPLOAD_BYTES) {
            res.destroy();
            reject(new Error('Image exceeds the maximum size'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new Error('Image fetch timed out')));
    req.on('error', reject);
  });
}

/**
 * Uploads image bytes through the media service, which enforces the size
 * limit and stores only real PNG/JPEG/GIF/WebP/AVIF files (by magic bytes).
 */
async function storeImage(bytes: Uint8Array): Promise<string> {
  const detected = detectImageType(bytes) ?? '';
  const { url } = await uploadImage(createAdminClient(), bytes, detected);
  return url;
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const payload = comma === -1 ? '' : dataUrl.slice(comma + 1);
  // base64 is 4/3 the size of the bytes; reject before decoding.
  if (payload.length > Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 4) {
    throw new Error('Image exceeds the maximum size');
  }
  return new Uint8Array(Buffer.from(payload, 'base64'));
}

/**
 * Recursively find all image nodes in the Lexical editor state
 */
interface NodeLike {
  type?: unknown;
  src?: unknown;
  children?: unknown;
}

function findImageNodes(node: NodeLike): string[] {
  const imageUrls: string[] = [];

  if (node.type === 'image' && typeof node.src === 'string' && node.src) {
    imageUrls.push(node.src);
  }

  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) {
      imageUrls.push(...findImageNodes(child));
    }
  }

  return imageUrls;
}

/**
 * Replace blob URLs with permanent URLs in the editor state
 */
function replaceImageUrls(node: NodeLike, urlMap: Map<string, string>): NodeLike {
  if (node.type === 'image' && typeof node.src === 'string' && urlMap.has(node.src)) {
    return {
      ...node,
      src: urlMap.get(node.src)
    };
  }

  if (node.children && Array.isArray(node.children)) {
    return {
      ...node,
      children: node.children.map((child: NodeLike) => replaceImageUrls(child, urlMap))
    };
  }

  return node;
}

/**
 * Process Lexical editor state: upload base64 images and download/re-upload external URLs
 * Note: All images (base64 and external URLs) will be uploaded to Supabase Storage
 * @param editorState - The Lexical SerializedEditorState
 * @returns Updated editor state with permanent image URLs from Supabase
 */
export async function processAndUploadImages(editorState: SerializedEditorState): Promise<SerializedEditorState> {
  try {
    const imageUrls = [...new Set(findImageNodes(editorState.root as NodeLike))];
    if (imageUrls.length === 0) {
      return editorState;
    }

    // Get Supabase storage URL to detect already-uploaded images
    const supabaseStorageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/post-images/`
      : '';

    const urlMap = new Map<string, string>();
    let remoteFetches = 0;

    for (const imageUrl of imageUrls) {
      try {
        if (imageUrl.startsWith('data:image/')) {
          urlMap.set(imageUrl, await storeImage(decodeDataUrl(imageUrl)));
        } else if (supabaseStorageUrl && imageUrl.startsWith(supabaseStorageUrl)) {
          // Already uploaded to our Supabase Storage - skip
          continue;
        } else if (/^https?:\/\//i.test(imageUrl)) {
          if (remoteFetches >= MAX_REMOTE_IMAGES) continue;
          remoteFetches += 1;
          urlMap.set(imageUrl, await storeImage(await fetchExternalImage(imageUrl)));
        }
      } catch (error) {
        // Keep the original URL if upload fails. Log only the reason: the URL
        // may be a large data: URI.
        console.error(
          'Failed to upload image:',
          error instanceof Error ? error.message : error,
        );
      }
    }

    return {
      ...editorState,
      root: replaceImageUrls(editorState.root as NodeLike, urlMap) as SerializedEditorState['root'],
    };
  } catch (error) {
    console.error('Error processing images:', error);
    // Return original state if processing fails
    return editorState;
  }
}
