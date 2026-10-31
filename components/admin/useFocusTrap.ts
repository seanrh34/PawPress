'use client';

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps keyboard focus inside `containerRef` while `active` is true: moves
 * focus to the first focusable element on open (or the container itself),
 * keeps Tab/Shift+Tab cycling inside, and restores focus on close to the
 * element focused before opening, or to `returnFocusRef` when given.
 * Escape handling and overlay clicks stay the caller's job.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  returnFocusRef?: RefObject<HTMLElement | null>,
) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const returnFocusTarget = returnFocusRef?.current ?? null;

    // Move focus into the container.
    const focusables = container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusables && focusables.length > 0 ? focusables[0] : null;
    (first ?? container)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !container) return;
      const items = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);
      if (items.length === 0) return;

      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === firstItem || current === container)) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (current === lastItem || current === container)) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      (returnFocusTarget ?? previouslyFocused)?.focus?.();
    };
  }, [active, returnFocusRef]);

  return containerRef;
}
