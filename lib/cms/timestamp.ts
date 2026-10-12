/**
 * Strict ISO-8601 timestamp parsing for scheduled publishing.
 *
 * `Date.parse` silently normalises impossible dates (`2026-02-31` becomes
 * March 3rd) and accepts local times without an offset. Scheduling must reject
 * both: a timestamp has to carry an explicit `Z`/offset and name a real
 * instant. We validate the shape, then round-trip the parsed UTC components to
 * reject rollovers (`2026-02-31`, `T24:00:00`).
 */

const STRICT_ISO_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|z|[+-]\d{2}:\d{2})$/;

function offsetMinutes(offset: string): number | null {
  if (offset === 'Z' || offset === 'z') {
    return 0;
  }
  const match = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!match) {
    return null;
  }
  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) {
    return null;
  }
  const total = hours * 60 + minutes;
  return match[1] === '-' ? -total : total;
}

/**
 * Parses a strict ISO-8601 timestamp with an explicit offset or `Z`, or returns
 * `null` for anything else (missing offset, impossible date, out-of-range
 * components, or a non-string input).
 */
export function parseStrictIsoTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string') {
    return null;
  }

  const match = STRICT_ISO_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr, fracStr, offset] =
    match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const minutes = offsetMinutes(offset);
  if (minutes === null) {
    return null;
  }

  const millis = fracStr === undefined ? 0 : Number(`0.${fracStr}`) * 1000;
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second, millis) -
    minutes * 60_000;
  const date = new Date(utcMs);

  // Reject rollovers: the local date/time named by the input must survive the
  // UTC conversion (e.g. Feb 31 would have rolled into March).
  const localMs = utcMs + minutes * 60_000;
  const local = new Date(localMs);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day ||
    local.getUTCHours() !== hour ||
    local.getUTCMinutes() !== minute ||
    local.getUTCSeconds() !== second
  ) {
    return null;
  }

  return date;
}
