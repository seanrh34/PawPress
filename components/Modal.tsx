import React, { useEffect, useId, useRef } from "react";
import { FiX } from "react-icons/fi";

interface CustomModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({
  title,
  isOpen,
  onClose,
  children,
  footer,
}: CustomModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Move focus into the dialog.
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      // Return focus to the trigger.
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;

    // Keep Tab cycling inside the dialog.
    const focusables = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.offsetParent !== null);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || active === panelRef.current)) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-copy/40 p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="admin-card relative max-h-[90vh] w-full max-w-md overflow-y-auto outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-rail pb-4">
          <h2 id={titleId} className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-copy-muted transition-colors hover:bg-surface-subtle hover:text-copy"
            aria-label="Close"
          >
            <FiX size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="py-4">{children}</div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-rail pt-4">
          {footer}
        </div>
      </div>
    </div>
  );
}
