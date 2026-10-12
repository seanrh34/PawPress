import { describe, expect, it } from 'vitest';
import { parseStrictIsoTimestamp } from '../timestamp';

describe('parseStrictIsoTimestamp', () => {
  it('parses a Z timestamp', () => {
    expect(parseStrictIsoTimestamp('2026-07-01T01:00:00Z')?.toISOString()).toBe(
      '2026-07-01T01:00:00.000Z',
    );
  });

  it('parses an explicit offset and applies it', () => {
    expect(
      parseStrictIsoTimestamp('2026-07-01T09:00:00+08:00')?.toISOString(),
    ).toBe('2026-07-01T01:00:00.000Z');
  });

  it('parses fractional seconds', () => {
    expect(
      parseStrictIsoTimestamp('2026-07-01T01:00:00.500Z')?.toISOString(),
    ).toBe('2026-07-01T01:00:00.500Z');
  });

  it('rejects a timestamp without an offset', () => {
    expect(parseStrictIsoTimestamp('2026-07-01T09:00:00')).toBeNull();
  });

  it('rejects impossible calendar dates instead of rolling them over', () => {
    expect(parseStrictIsoTimestamp('2026-02-31T00:00:00Z')).toBeNull();
    expect(parseStrictIsoTimestamp('2026-04-31T00:00:00Z')).toBeNull();
    expect(parseStrictIsoTimestamp('2025-02-29T00:00:00Z')).toBeNull();
  });

  it('rejects out-of-range time components', () => {
    expect(parseStrictIsoTimestamp('2026-07-01T24:00:00Z')).toBeNull();
    expect(parseStrictIsoTimestamp('2026-07-01T23:60:00Z')).toBeNull();
    expect(parseStrictIsoTimestamp('2026-07-01T23:00:60Z')).toBeNull();
  });

  it('accepts a leap day on a leap year', () => {
    expect(parseStrictIsoTimestamp('2024-02-29T00:00:00Z')?.toISOString()).toBe(
      '2024-02-29T00:00:00.000Z',
    );
  });

  it('rejects non-strings and malformed input', () => {
    expect(parseStrictIsoTimestamp(undefined)).toBeNull();
    expect(parseStrictIsoTimestamp(null)).toBeNull();
    expect(parseStrictIsoTimestamp(1700000000000)).toBeNull();
    expect(parseStrictIsoTimestamp('not-a-date')).toBeNull();
    expect(parseStrictIsoTimestamp('2026-07-01')).toBeNull();
  });
});
