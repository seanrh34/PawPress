import { ZodError } from 'zod';
import { ApiError, fromZodError, toResponse } from '@/lib/cms/errors';
import { assertScope, type Scope } from '@/lib/cms/permissions';
import {
  assertSameOrigin,
  getSessionAuth,
  getTokenAuth,
  type AuthContext,
} from '@/lib/auth/context';

export type RouteParams = Record<string, string>;

export interface ApiRouteContext<P extends RouteParams = RouteParams> {
  params?: Promise<P>;
}

export interface ApiHandlerContext<P extends RouteParams = RouteParams> {
  auth: AuthContext;
  params: P;
}

export type ApiHandler<P extends RouteParams = RouteParams> = (
  req: Request,
  ctx: ApiHandlerContext<P>,
) => Response | Promise<Response>;

export interface WithApiOptions {
  auth: 'token' | 'session';
  scope?: Scope;
}

function isReadMethod(method: string): boolean {
  const normalized = method.toUpperCase();
  return normalized === 'GET' || normalized === 'HEAD';
}

/**
 * Wraps a route handler with authentication, optional scope enforcement and the
 * v1 error contract. Auth and scope checks run before the handler so a failing
 * request never reaches application code.
 */
export function withApi<P extends RouteParams = RouteParams>(
  handler: ApiHandler<P>,
  options: WithApiOptions,
) {
  return async (
    req: Request,
    routeCtx?: ApiRouteContext<P>,
  ): Promise<Response> => {
    try {
      const auth =
        options.auth === 'token'
          ? await getTokenAuth(req)
          : await getSessionAuth();

      if (options.auth === 'session' && !isReadMethod(req.method)) {
        assertSameOrigin(req);
      }

      if (options.scope) {
        assertScope(auth, options.scope);
      }

      const params = routeCtx?.params ? await routeCtx.params : ({} as P);

      return await handler(req, { auth, params });
    } catch (error) {
      return toApiResponse(error);
    }
  };
}

function toApiResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return toResponse(error);
  }

  if (error instanceof ZodError) {
    return toResponse(fromZodError(error));
  }

  if (error instanceof SyntaxError) {
    return toResponse(ApiError.validation('Invalid JSON body'));
  }

  console.error('Unhandled API error:', error);
  return toResponse(ApiError.internal());
}

/**
 * Emits one audit log line for a successful v1 mutation. Never includes
 * content, tokens or headers.
 */
export function audit(
  ctx: ApiHandlerContext,
  action: string,
  resource: string,
  id: string,
): void {
  const { auth } = ctx;
  const tokenId = auth.via === 'token' ? auth.tokenId : null;

  console.info(
    JSON.stringify({
      evt: 'pawpress.audit',
      action,
      resource,
      id,
      userId: auth.userId,
      tokenId,
      ts: new Date().toISOString(),
    }),
  );
}
