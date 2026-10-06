import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertLocalImageFile,
  assertLocalImagesExist,
  imageRefForPath,
  isLocalImagePath,
  MAX_IMAGE_BYTES,
  rewriteMarkdownImages,
  scanLocalImages,
  uniqueByAbsolutePath,
} from '../src/images';
import { makeTempDir, writeTempFile } from './helpers';

async function makeImage(baseDir: string, relative: string): Promise<string> {
  const absolute = join(baseDir, relative);
  await mkdir(join(absolute, '..'), { recursive: true });
  await writeTempFile(baseDir, relative, 'binary');
  return absolute;
}

describe('scanLocalImages', () => {
  it('resolves relative paths against the markdown directory', async () => {
    const dir = await makeTempDir();
    const refs = scanLocalImages('![a](img/a.png)', null, dir);
    expect(refs).toHaveLength(1);
    expect(refs[0]?.absolutePath).toBe(resolve(dir, 'img/a.png'));
    expect(refs[0]?.mime).toBe('image/png');
  });

  it('dedupes by absolute path', () => {
    const refs = scanLocalImages('![a](img/a.png)\n![again](./img/a.png)', null, '/tmp/base');
    expect(uniqueByAbsolutePath(refs)).toHaveLength(1);
  });

  it('skips remote, data, protocol-relative, site-relative and fragment paths', () => {
    const markdown = [
      '![r](https://cdn.example/a.png)',
      '![d](data:image/png;base64,AAAA)',
      '![p](//cdn.example/a.png)',
      '![s](/images/cat.png)',
      '![f](#anchor)',
    ].join('\n');
    expect(scanLocalImages(markdown, null, '/tmp/base')).toHaveLength(0);
    expect(isLocalImagePath('http://x/y.png')).toBe(false);
    expect(isLocalImagePath('data:image/png,xxx')).toBe(false);
    expect(isLocalImagePath('//cdn.example/a.png')).toBe(false);
    expect(isLocalImagePath('/images/cat.png')).toBe(false);
    expect(isLocalImagePath('/uploads/x.png')).toBe(false);
    expect(isLocalImagePath('#anchor')).toBe(false);
    expect(isLocalImagePath('img/a.png')).toBe(true);
    expect(isLocalImagePath('../assets/x.png')).toBe(true);
  });

  it('leaves site-relative and absolute paths untouched, including featured_image', () => {
    const refs = scanLocalImages('![s](/images/cat.png)', '/images/cover.png', '/tmp/base');
    expect(refs).toHaveLength(0);
  });

  it('skips images inside fenced code blocks', () => {
    const markdown = ['![a](img/a.png)', '```md', '![b](img/b.png)', '```', '![c](img/c.png)'].join(
      '\n',
    );
    const refs = scanLocalImages(markdown, null, '/tmp/base');
    expect(refs.map((ref) => ref.original)).toEqual(['img/a.png', 'img/c.png']);
  });

  it('includes a local featured image', () => {
    const refs = scanLocalImages('body', 'cover/pic.webp', '/tmp/base');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.kind).toBe('featured');
    expect(refs[0]?.absolutePath).toBe(resolve('/tmp/base', 'cover/pic.webp'));
  });
});

describe('assertLocalImagesExist', () => {
  it('rejects unsupported extensions', async () => {
    const refs = scanLocalImages('![a](img/a.bmp)', null, '/tmp/base');
    await expect(assertLocalImagesExist(refs)).rejects.toThrowError(/unsupported image type/);
  });

  it('rejects missing files', async () => {
    const dir = await makeTempDir();
    const refs = scanLocalImages('![a](img/missing.png)', null, dir);
    await expect(assertLocalImagesExist(refs)).rejects.toThrowError(/local image not found/);
  });

  it('accepts existing supported files', async () => {
    const dir = await makeTempDir();
    await makeImage(dir, 'img/a.png');
    const refs = scanLocalImages('![a](img/a.png)', null, dir);
    await expect(assertLocalImagesExist(refs)).resolves.toBeUndefined();
  });
});

describe('assertLocalImagesExist path safety', () => {
  it('rejects a path that escapes the content directory', async () => {
    const dir = await makeTempDir();
    const sub = join(dir, 'sub');
    await mkdir(sub, { recursive: true });
    await writeTempFile(dir, 'outside.png', 'x');
    const refs = scanLocalImages('![a](../outside.png)', null, sub);
    await expect(assertLocalImagesExist(refs)).rejects.toMatchObject({
      exitCode: 2,
    });
  });

  it('allows an escaping path with allowOutsideDir', async () => {
    const dir = await makeTempDir();
    const sub = join(dir, 'sub');
    await mkdir(sub, { recursive: true });
    await writeTempFile(dir, 'outside.png', 'x');
    const refs = scanLocalImages('![a](../outside.png)', null, sub);
    await expect(
      assertLocalImagesExist(refs, { allowOutsideDir: true }),
    ).resolves.toBeUndefined();
  });

  it('rejects a symlinked image', async () => {
    const dir = await makeTempDir();
    await writeTempFile(dir, 'real.png', 'x');
    await symlink(join(dir, 'real.png'), join(dir, 'link.png'));
    const refs = scanLocalImages('![a](link.png)', null, dir);
    await expect(assertLocalImagesExist(refs)).rejects.toThrowError(
      /symbolic link/,
    );
  });

  it('rejects a file over the 4 MB limit with exit 6', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'big.png'), Buffer.alloc(MAX_IMAGE_BYTES + 1));
    const refs = scanLocalImages('![a](big.png)', null, dir);
    const error = await assertLocalImagesExist(refs).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ exitCode: 6, code: 'validation_failed' });
    expect((error as Error).message).toMatch(/too large/);
  });

  it('accepts a file exactly at the limit', async () => {
    const dir = await makeTempDir();
    await writeFile(join(dir, 'exact.png'), Buffer.alloc(MAX_IMAGE_BYTES));
    const refs = scanLocalImages('![a](exact.png)', null, dir);
    await expect(assertLocalImagesExist(refs)).resolves.toBeUndefined();
  });

  it('rejects a symlink through assertLocalImageFile directly', async () => {
    const dir = await makeTempDir();
    await writeTempFile(dir, 'real.png', 'x');
    await symlink(join(dir, 'real.png'), join(dir, 'link.png'));
    await expect(
      assertLocalImageFile(imageRefForPath(join(dir, 'link.png'))),
    ).rejects.toThrowError(/symbolic link/);
  });
});

describe('scanLocalImages performance', () => {
  it('handles a hostile run of image markers quickly', () => {
    const input = '!['.repeat(100_000);
    const start = performance.now();
    scanLocalImages(input, null, '/tmp/base');
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(2000);
  });
});

describe('rewriteMarkdownImages', () => {
  it('replaces only references present in the map and not in fences', () => {
    const markdown = ['![a](img/a.png)', '```', '![b](img/b.png)', '```'].join('\n');
    const urls = new Map([
      ['img/a.png', 'https://cdn/a.png'],
      ['img/b.png', 'https://cdn/b.png'],
    ]);
    expect(rewriteMarkdownImages(markdown, urls)).toBe(
      ['![a](https://cdn/a.png)', '```', '![b](img/b.png)', '```'].join('\n'),
    );
  });

  it('preserves the optional title', () => {
    const out = rewriteMarkdownImages('![a](img/a.png "title")', new Map([['img/a.png', 'https://cdn/a.png']]));
    expect(out).toBe('![a](https://cdn/a.png "title")');
  });
});
