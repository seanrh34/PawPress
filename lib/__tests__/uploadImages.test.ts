import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase-admin', () => ({
  createAdminClient: () => {
    throw new Error('storage must not be reached');
  },
}));

import { fetchExternalImage, isBlockedAddress } from '@/lib/uploadImages';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    '::ffff:127.0.0.1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe('fetchExternalImage', () => {
  it.each([
    'http://127.0.0.1/a.png',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::1]/a.png',
    'http://localhost/a.png',
  ])('refuses the internal address %s', async (url) => {
    await expect(fetchExternalImage(url)).rejects.toThrow(/internal address/);
  });

  it('refuses non-http schemes', async () => {
    await expect(fetchExternalImage('file:///etc/passwd')).rejects.toThrow(/scheme/);
  });
});
