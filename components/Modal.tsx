import React, { useEffect, useId } from "react";
import { FiX } from "react-icons/fi";
import { useFocusTrap } from "@/components/admin/useFocusTrap";

interface CustomModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}

export default function Modal({
  title,
  isOpen,
  onClose,
  children,
  footer,
}: CustomModalProps) {
  const panelRef = useFocusTrap<HTMLDivElement>(isOpen);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
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
