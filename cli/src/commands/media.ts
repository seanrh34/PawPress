import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { parseOptions } from '../args';
import { usageError } from '../errors';
import { mimeForPath } from '../images';
import { makeClient } from '../runtime';
import type { Context } from '../runtime';
import type { MediaResponse } from '../types';

export async function mediaCommand(ctx: Context, args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'upload':
      return mediaUpload(ctx, rest);
    case undefined:
      throw usageError('media requires a subcommand: upload');
    default:
      throw usageError(`unknown media subcommand: ${sub}`);
  }
}

async function mediaUpload(ctx: Context, args: string[]): Promise<void> {
  const { out } = ctx;
  const { positionals } = parseOptions(args, {}, true);
  const [path, ...extra] = positionals;
  if (!path) throw usageError('media upload requires a <path>');
  if (extra.length > 0) throw usageError('media upload accepts a single <path>');

  const mime = mimeForPath(path);
  if (!mime) {
    throw usageError(
      `unsupported image type for ${path} (allowed: png, jpg, jpeg, webp, gif, avif)`,
    );
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(path);
  } catch {
    throw usageError(`could not read file: ${path}`);
  }

  const client = await makeClient(ctx);
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const media = (await client.uploadImage(blob, basename(path))) as MediaResponse;
  if (out.json) out.jsonDoc(media);
  else out.line(media.url);
}
