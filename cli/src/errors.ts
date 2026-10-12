export const EXIT = {
  OK: 0,
  INTERNAL: 1,
  USAGE: 2,
  AUTH: 3,
  NOT_FOUND: 4,
  CONFLICT: 5,
  VALIDATION: 6,
  NETWORK: 7,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export interface CliErrorOptions {
  code?: string;
  details?: unknown;
  status?: number;
}

export class CliError extends Error {
  readonly exitCode: ExitCode;
  readonly code?: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(message: string, exitCode: ExitCode, options: CliErrorOptions = {}) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.code = options.code;
    this.details = options.details;
    this.status = options.status;
  }
}

export function usageError(message: string, details?: unknown): CliError {
  return new CliError(message, EXIT.USAGE, { code: 'usage', details });
}

export function networkError(message: string, details?: unknown): CliError {
  return new CliError(message, EXIT.NETWORK, { code: 'network', details });
}

const CODE_EXIT: Record<string, ExitCode> = {
  unauthorized: EXIT.AUTH,
  forbidden: EXIT.AUTH,
  not_found: EXIT.NOT_FOUND,
  conflict: EXIT.CONFLICT,
  validation_failed: EXIT.VALIDATION,
  payload_too_large: EXIT.VALIDATION,
  unsupported_media_type: EXIT.VALIDATION,
  internal: EXIT.INTERNAL,
};

export function exitCodeForStatus(status: number): ExitCode {
  if (status === 401 || status === 403) return EXIT.AUTH;
  if (status === 404) return EXIT.NOT_FOUND;
  if (status === 409) return EXIT.CONFLICT;
  if (status === 400 || status === 413 || status === 415) return EXIT.VALIDATION;
  if (status >= 500) return EXIT.INTERNAL;
  if (status >= 400) return EXIT.VALIDATION;
  return EXIT.INTERNAL;
}

export function exitCodeForError(status: number | undefined, code: string | undefined): ExitCode {
  if (code && CODE_EXIT[code] !== undefined) return CODE_EXIT[code];
  if (status !== undefined) return exitCodeForStatus(status);
  return EXIT.INTERNAL;
}
