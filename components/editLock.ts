'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';

/**
 * Pure edit-lock state machine for the web editor (docs/cli-api.md §9). The
 * reducer is deliberately free of timers and fetch so it can be unit-tested;
 * `useEditLock` wires it to the lock endpoints.
 */

export type LockHolderKind = 'user' | 'agent';

export interface LockHolder {
  kind: LockHolderKind;
  label: string;
  user_id: string;
}

export interface PublicLock {
  session_id?: string;
  holder: LockHolder;
  acquired_at: string;
  expires_at: string;
}

export type EditLockStatus =
  | 'idle'
  | 'held'
  | 'blocked'
  | 'lost'
  | 'unavailable';

export interface EditorLockState {
  status: EditLockStatus;
  locking: 'enabled' | 'unavailable';
  sessionId: string | null;
  holder: LockHolder | null;
  acquiredAt: string | null;
  expiresAt: string | null;
}

export const initialEditorLockState: EditorLockState = {
  status: 'idle',
  locking: 'enabled',
  sessionId: null,
  holder: null,
  acquiredAt: null,
  expiresAt: null,
};

export type EditLockAction =
  | { type: 'acquired'; lock: PublicLock; sessionId: string }
  | { type: 'blocked'; lock: PublicLock }
  | { type: 'lost'; lock: PublicLock }
  | { type: 'unavailable' }
  | { type: 'released' };

export function editLockReducer(
  state: EditorLockState,
  action: EditLockAction,
): EditorLockState {
  switch (action.type) {
    case 'acquired':
      return {
        status: 'held',
        locking: 'enabled',
        sessionId: action.sessionId,
        holder: action.lock.holder,
        acquiredAt: action.lock.acquired_at,
        expiresAt: action.lock.expires_at,
      };

    case 'blocked':
      // If we believed we held the lock and now someone else does, we were
      // taken over: surface it as a loss rather than a plain "blocked".
      if (state.status === 'held' || state.status === 'lost') {
        return { ...state, status: 'lost', holder: action.lock.holder };
      }
      return {
        status: 'blocked',
        locking: 'enabled',
        sessionId: null,
        holder: action.lock.holder,
        acquiredAt: action.lock.acquired_at,
        expiresAt: action.lock.expires_at,
      };

    case 'lost':
      return {
        ...state,
        status: 'lost',
        holder: action.lock.holder,
        acquiredAt: action.lock.acquired_at,
        expiresAt: action.lock.expires_at,
      };

    case 'unavailable':
      return { ...initialEditorLockState, status: 'unavailable', locking: 'unavailable' };

    case 'released':
      return { ...initialEditorLockState, status: 'idle' };

    default:
      return state;
  }
}

/** Save is allowed while we hold the lock, or when locking is unavailable. */
export function lockAllowsSave(state: EditorLockState): boolean {
  return state.status === 'held' || state.status === 'unavailable';
}

export interface LockResponse {
  locking: 'enabled' | 'unavailable';
  acquired?: boolean;
  lock: PublicLock | null;
}

/** Maps a lock endpoint response to a reducer action, or null if no state change. */
export function actionForLockResponse(
  response: LockResponse,
  options: { wasHolding?: boolean } = {},
): EditLockAction | null {
  if (response.locking === 'unavailable') {
    return { type: 'unavailable' };
  }
  if (response.acquired && response.lock && response.lock.session_id) {
    return { type: 'acquired', lock: response.lock, sessionId: response.lock.session_id };
  }
  if (response.lock) {
    return options.wasHolding
      ? { type: 'lost', lock: response.lock }
      : { type: 'blocked', lock: response.lock };
  }
  return null;
}

export interface UseEditLock {
  state: EditorLockState;
  /** Force-acquire (humans may take over anyone's lock). */
  takeOver: () => Promise<void>;
  /** Best-effort release of our own lock (fire-and-forget via sendBeacon). */
  release: () => void;
  /** Mark the lock as taken over, e.g. after a 409 locked save. */
  markLost: (lock: PublicLock) => void;
}

const HEARTBEAT_MS = 30_000;
const POLL_MS = 15_000;

/**
 * React binding for the lock state machine: acquires on mount, heartbeats while
 * held, polls while blocked (auto-acquiring when the lock frees up), and
 * releases on unmount/pagehide. No-op when `enabled` is false (create mode).
 */
export function useEditLock(
  postId: string | undefined,
  enabled: boolean,
): UseEditLock {
  const [state, dispatch] = useReducer(editLockReducer, initialEditorLockState);
  const sessionRef = useRef<string | null>(null);
  // One session id per editor instance, sent with every acquire. Renewing your
  // own session is idempotent on the server, so overlapping requests (React
  // StrictMode's double mount, a poll racing a takeover) can't block this tab
  // with a lock it created itself.
  const ownSessionRef = useRef<string | null>(null);
  const path = postId ? `/api/posts/${postId}/lock` : null;
  const ownSessionId = () => {
    if (!ownSessionRef.current) ownSessionRef.current = crypto.randomUUID();
    return ownSessionRef.current;
  };

  useEffect(() => {
    sessionRef.current = state.status === 'held' ? state.sessionId : null;
  }, [state.status, state.sessionId]);

  const post = useCallback(
    async (body: Record<string, unknown>): Promise<LockResponse | null> => {
      if (!path) return null;
      try {
        const response = await fetch(path, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) return null;
        return (await response.json()) as LockResponse;
      } catch {
        return null;
      }
    },
    [path],
  );

  const acquire = useCallback(
    async (force: boolean) => {
      const sessionId = ownSessionId();
      const data = await post(
        force ? { session_id: sessionId, force: true } : { session_id: sessionId },
      );
      if (!data) return;
      const action = actionForLockResponse(data, {
        wasHolding: force === false && sessionRef.current !== null,
      });
      if (action) dispatch(action);
    },
    [post],
  );

  // Acquire on mount (edit mode only).
  useEffect(() => {
    if (enabled) void acquire(false);
  }, [enabled, acquire]);

  // Heartbeat while we hold the lock.
  useEffect(() => {
    if (!enabled || state.status !== 'held' || !state.sessionId) return;
    const sessionId = state.sessionId;
    const id = window.setInterval(() => {
      void post({ session_id: sessionId }).then((data) => {
        if (!data) return;
        const action = actionForLockResponse(data, { wasHolding: true });
        if (action) dispatch(action);
      });
    }, HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [enabled, state.status, state.sessionId, post]);

  // Poll while blocked so we acquire the lock as soon as it frees up.
  useEffect(() => {
    if (!enabled || state.status !== 'blocked') return;
    const id = window.setInterval(() => {
      void acquire(false);
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled, state.status, acquire]);

  // Release on unmount and when the page goes away.
  useEffect(() => {
    if (!enabled || !path) return;
    const release = () => {
      const sessionId = sessionRef.current;
      if (!sessionId) return;
      try {
        navigator.sendBeacon(
          `${path}/release`,
          JSON.stringify({ session_id: sessionId }),
        );
      } catch {
        // sendBeacon is best-effort.
      }
    };
    window.addEventListener('pagehide', release);
    window.addEventListener('beforeunload', release);
    return () => {
      window.removeEventListener('pagehide', release);
      window.removeEventListener('beforeunload', release);
      release();
    };
  }, [enabled, path]);

  const takeOver = useCallback(async () => {
    await acquire(true);
  }, [acquire]);

  const release = useCallback(() => {
    const sessionId = sessionRef.current;
    sessionRef.current = null;
    if (sessionId && path) {
      try {
        navigator.sendBeacon(
          `${path}/release`,
          JSON.stringify({ session_id: sessionId }),
        );
      } catch {
        // best-effort
      }
    }
    dispatch({ type: 'released' });
  }, [path]);

  const markLost = useCallback((lock: PublicLock) => {
    dispatch({ type: 'lost', lock });
  }, []);

  return { state, takeOver, release, markLost };
}
