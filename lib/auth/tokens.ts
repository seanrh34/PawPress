import { SignJWT, jwtVerify } from 'jose';
import { ApiError } from '@/lib/cms/errors';
import { isScope, type Scope } from '@/lib/cms/permissions';

export const DEFAULT_TOKEN_DAYS = 30;
export const MAX_TOKEN_DAYS = 90;
export const MAX_ACTIVE_TOKENS = 10;

const TOKEN_PREFIX = 'pp_';
const ISSUER = 'pawpress';
const ALGORITHM = 'HS256';
const MIN_SECRET_BYTES = 32;
const SECRET_ENV = 'PAWPRESS_TOKEN_SECRET';

let warnedAboutSecret = false;

/**
 * The HMAC key used to sign personal access tokens, read from
 * `PAWPRESS_TOKEN_SECRET`. Returns null (and warns once per process) when the
 * variable is missing or shorter than 32 UTF-8 bytes. The value is never logged.
 */
export function getTokenSecret(): Uint8Array | null {
  const raw = process.env[SECRET_ENV];
  const secret = raw ? new TextEncoder().encode(raw) : null;

  if (!secret || secret.length < MIN_SECRET_BYTES) {
    if (!warnedAboutSecret) {
      warnedAboutSecret = true;
      console.error(
        `${SECRET_ENV} is missing or shorter than ${MIN_SECRET_BYTES} bytes; token authentication is disabled.`,
      );
    }
    return null;
  }

  return secret;
}

export interface MintTokenInput {
  userId: string;
  tokenId: string;
  scopes: readonly Scope[];
  expiresAt: Date;
}

/**
 * Mints a personal access token: `pp_` followed by an HS256 compact JWS with
 * `iss`, `sub`, `jti`, `scp`, `iat` and `exp` claims.
 */
export async function mintToken(input: MintTokenInput): Promise<string> {
  const secret = getTokenSecret();
  if (!secret) {
    throw ApiError.internal();
  }

  const issuedAt = Math.floor(Date.now() / 1000);

  const jws = await new SignJWT({ scp: [...input.scopes] })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setSubject(input.userId)
    .setJti(input.tokenId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(Math.floor(input.expiresAt.getTime() / 1000))
    .sign(secret);

  return `${TOKEN_PREFIX}${jws}`;
}

export interface VerifiedToken {
  userId: string;
  tokenId: string;
  scopes: Scope[];
  exp: number;
}

/**
 * Verifies a raw `pp_…` token. Returns null for any failure (no secret, missing
 * prefix, bad signature, wrong issuer, expired, malformed); never throws and
 * never logs the token.
 */
export async function verifyToken(raw: string): Promise<VerifiedToken | null> {
  try {
    if (typeof raw !== 'string' || !raw.startsWith(TOKEN_PREFIX)) {
      return null;
    }

    const secret = getTokenSecret();
    if (!secret) {
      return null;
    }

    const { payload } = await jwtVerify(
      raw.slice(TOKEN_PREFIX.length),
      secret,
      {
        algorithms: [ALGORITHM],
        issuer: ISSUER,
        requiredClaims: ['sub', 'jti', 'exp', 'iat'],
      },
    );

    const { sub, jti, exp } = payload;
    if (
      typeof sub !== 'string' ||
      typeof jti !== 'string' ||
      typeof exp !== 'number'
    ) {
      return null;
    }

    const scopes = Array.isArray(payload.scp)
      ? payload.scp.filter(isScope)
      : [];

    return { userId: sub, tokenId: jti, scopes, exp };
  } catch {
    return null;
  }
}
