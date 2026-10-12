import { describe, expect, it } from 'vitest';
import {
  actionForLockResponse,
  backoffDelay,
  editLockReducer,
  initialEditorLockState,
  lockAllowsSave,
  type EditorLockState,
  type PublicLock,
} from '../editLock';

const USER_LOCK: PublicLock = {
  session_id: 'session-1',
  holder: { kind: 'user', label: 'alice@example.com', user_id: 'user-1' },
  acquired_at: '2026-10-12T10:00:00.000Z',
  expires_at: '2026-10-12T10:02:00.000Z',
};

const AGENT_LOCK: PublicLock = {
  holder: { kind: 'agent', label: 'agent "weekly-writer" (alice@example.com)', user_id: 'user-1' },
  acquired_at: '2026-10-12T10:02:00.000Z',
  expires_at: '2026-10-12T10:17:00.000Z',
};

describe('editLockReducer', () => {
  it('starts idle and locks are unknown', () => {
    expect(initialEditorLockState).toMatchObject({
      status: 'idle',
      locking: 'enabled',
      sessionId: null,
    });
  });

  it('records acquisition', () => {
    const state = editLockReducer(initialEditorLockState, {
      type: 'acquired',
      lock: USER_LOCK,
      sessionId: 'session-1',
    });
    expect(state).toMatchObject({
      status: 'held',
      sessionId: 'session-1',
      holder: USER_LOCK.holder,
      locking: 'enabled',
    });
    expect(lockAllowsSave(state)).toBe(true);
  });

  it('blocks saving when someone else holds the lock', () => {
    const state = editLockReducer(initialEditorLockState, {
      type: 'blocked',
      lock: AGENT_LOCK,
    });
    expect(state.status).toBe('blocked');
    expect(state.holder).toEqual(AGENT_LOCK.holder);
    expect(lockAllowsSave(state)).toBe(false);
  });

  it('allows a takeover from blocked (force acquire succeeds)', () => {
    const blocked = editLockReducer(initialEditorLockState, {
      type: 'blocked',
      lock: AGENT_LOCK,
    });
    const taken = editLockReducer(blocked, {
      type: 'acquired',
      lock: USER_LOCK,
      sessionId: 'session-2',
    });
    expect(taken.status).toBe('held');
    expect(taken.sessionId).toBe('session-2');
    expect(lockAllowsSave(taken)).toBe(true);
  });

  it('treats a blocking response received while held as a lost lock', () => {
    const held = editLockReducer(initialEditorLockState, {
      type: 'acquired',
      lock: USER_LOCK,
      sessionId: 'session-1',
    });
    const lost = editLockReducer(held, { type: 'blocked', lock: AGENT_LOCK });
    expect(lost.status).toBe('lost');
    expect(lost.holder).toEqual(AGENT_LOCK.holder);
    expect(lockAllowsSave(lost)).toBe(false);
  });

  it('records a heartbeat loss explicitly', () => {
    const lost = editLockReducer(initialEditorLockState, {
      type: 'lost',
      lock: AGENT_LOCK,
    });
    expect(lost.status).toBe('lost');
    expect(lost.holder).toEqual(AGENT_LOCK.holder);
    expect(lockAllowsSave(lost)).toBe(false);
  });

  it('degrades to unavailable and keeps saving possible', () => {
    const state = editLockReducer(initialEditorLockState, { type: 'unavailable' });
    expect(state).toMatchObject({ status: 'unavailable', locking: 'unavailable', sessionId: null });
    expect(lockAllowsSave(state)).toBe(true);
  });

  it('clears state on release', () => {
    const held = editLockReducer(initialEditorLockState, {
      type: 'acquired',
      lock: USER_LOCK,
      sessionId: 'session-1',
    });
    expect(editLockReducer(held, { type: 'released' })).toEqual(initialEditorLockState);
  });

  it('records a lock-endpoint failure as an error that still allows saving', () => {
    const state = editLockReducer(initialEditorLockState, { type: 'error' });
    expect(state).toMatchObject({
      status: 'error',
      locking: 'enabled',
      sessionId: null,
      holder: null,
    });
    expect(lockAllowsSave(state)).toBe(true);
  });

  it('drops out of a held state after a failure so Save becomes available', () => {
    const held = editLockReducer(initialEditorLockState, {
      type: 'acquired',
      lock: USER_LOCK,
      sessionId: 'session-1',
    });
    const errored = editLockReducer(held, { type: 'error' });
    expect(errored.status).toBe('error');
    expect(errored.sessionId).toBeNull();
    expect(lockAllowsSave(errored)).toBe(true);
  });

  it('recovers from error when an acquire later succeeds', () => {
    const errored = editLockReducer(initialEditorLockState, { type: 'error' });
    const recovered = editLockReducer(errored, {
      type: 'acquired',
      lock: USER_LOCK,
      sessionId: 'session-2',
    });
    expect(recovered.status).toBe('held');
    expect(lockAllowsSave(recovered)).toBe(true);
  });
});

describe('backoffDelay', () => {
  it('doubles from 15s and caps at 60s', () => {
    expect(backoffDelay(1)).toBe(15_000);
    expect(backoffDelay(2)).toBe(30_000);
    expect(backoffDelay(3)).toBe(60_000);
    expect(backoffDelay(4)).toBe(60_000);
    expect(backoffDelay(0)).toBe(15_000);
  });
});

describe('actionForLockResponse', () => {
  it('maps an acquired response', () => {
    const action = actionForLockResponse({
      locking: 'enabled',
      acquired: true,
      lock: USER_LOCK,
    });
    expect(action).toEqual({ type: 'acquired', lock: USER_LOCK, sessionId: 'session-1' });
  });

  it('maps a blocked response to blocked when we were not holding', () => {
    const action = actionForLockResponse({
      locking: 'enabled',
      acquired: false,
      lock: AGENT_LOCK,
    });
    expect(action).toEqual({ type: 'blocked', lock: AGENT_LOCK });
  });

  it('maps a blocked response to lost when we thought we held it', () => {
    const action = actionForLockResponse(
      { locking: 'enabled', acquired: false, lock: AGENT_LOCK },
      { wasHolding: true },
    );
    expect(action).toEqual({ type: 'lost', lock: AGENT_LOCK });
  });

  it('maps unavailable', () => {
    expect(
      actionForLockResponse({ locking: 'unavailable', acquired: false, lock: null }),
    ).toEqual({ type: 'unavailable' });
  });

  it('auto-acquires when a poll finds the lock freed', () => {
    // Blocked, then the same poll returns an acquisition.
    const blocked: EditorLockState = editLockReducer(initialEditorLockState, {
      type: 'blocked',
      lock: AGENT_LOCK,
    });
    const action = actionForLockResponse({
      locking: 'enabled',
      acquired: true,
      lock: USER_LOCK,
    });
    expect(action).not.toBeNull();
    const freed = editLockReducer(blocked, action!);
    expect(freed.status).toBe('held');
  });

  it('returns null for an empty enabled response', () => {
    expect(
      actionForLockResponse({ locking: 'enabled', acquired: false, lock: null }),
    ).toBeNull();
  });
});
