export interface ErrorPayload {
  message: string;
  code?: string;
  details?: unknown;
}

export interface Output {
  readonly json: boolean;
  jsonDoc(value: unknown): void;
  line(text?: string): void;
  raw(text: string): void;
  note(text: string): void;
  error(payload: ErrorPayload): void;
  table(headers: string[], rows: string[][]): void;
}

export interface OutputOptions {
  json: boolean;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

/**
 * Removes ASCII control characters (except tab and newline) from text that
 * originated on the server (holder labels, error messages, titles) before it is
 * written to a human terminal, so a crafted value can't emit escape sequences.
 * JSON output is left untouched (JSON.stringify already escapes it).
 */
export function stripControlChars(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0x09 || code === 0x0a || (code >= 0x20 && code !== 0x7f)) {
      out += char;
    }
  }
  return out;
}

export function createOutput(options: OutputOptions): Output {
  const { json, stdout, stderr } = options;

  return {
    json,
    jsonDoc(value) {
      stdout(`${JSON.stringify(value)}\n`);
    },
    line(text = '') {
      stdout(`${stripControlChars(text)}\n`);
    },
    raw(text) {
      stdout(text);
    },
    note(text) {
      stderr(`${stripControlChars(text)}\n`);
    },
    error(payload) {
      if (json) {
        const error: Record<string, unknown> = { message: payload.message };
        if (payload.code) error.code = payload.code;
        if (payload.details !== undefined) error.details = payload.details;
        stderr(`${JSON.stringify({ error })}\n`);
        return;
      }
      stderr(`error: ${stripControlChars(payload.message)}\n`);
      for (const [field, messages] of validationFields(payload.details)) {
        stderr(
          `  ${stripControlChars(field)}: ${messages
            .map(stripControlChars)
            .join(', ')}\n`,
        );
      }
    },
    table(headers, rows) {
      const safeHeaders = headers.map(stripControlChars);
      const safeRows = rows.map((row) => row.map(stripControlChars));
      stdout(`${formatTable(safeHeaders, safeRows)}\n`);
    },
  };
}

function validationFields(details: unknown): Array<[string, string[]]> {
  if (!isRecord(details)) return [];
  const fields = isRecord(details.fields) ? details.fields : undefined;
  if (!fields) return [];
  const out: Array<[string, string[]]> = [];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      out.push([key, value.map((v) => String(v))]);
    } else if (typeof value === 'string') {
      out.push([key, [value]]);
    }
  }
  return out;
}

export function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => (row[index] ?? '').length),
    ),
  );
  const renderRow = (cells: string[]) =>
    cells
      .map((cell, index) => (cell ?? '').padEnd(widths[index] ?? 0))
      .join('  ')
      .trimEnd();
  const lines = [renderRow(headers)];
  for (const row of rows) lines.push(renderRow(row));
  return lines.join('\n');
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
