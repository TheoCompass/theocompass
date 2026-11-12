"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * The one modal.
 *
 * Three of these existed as three copies of `bg-black/50` + `rounded-lg
 * shadow-xl`, which is the shape a dialog takes when it has not been invited
 * into the design language. The app's grammar is: white plate, hairline rule,
 * 6px corner, depth from a navy scrim rather than from a shadow, and an eyebrow
 * in `.meta` above a serif title.
 *
 * Behaviour is here once so no caller can half-implement it: Escape closes, the
 * scrim closes, focus moves into the panel and returns to the trigger
 * afterwards, Tab stays inside, and `role="dialog"`/`aria-modal` give a screen
 * reader the boundary that `fixed inset-0` gives everyone else. Body scroll is
 * frozen while open, or a phone scrolls the page underneath and the dialog
 * looks stuck.
 */

/** Shared button vocabulary, so a "Restart" cannot be one red and one navy. */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-sm font-medium transition-colors";

export const DIALOG_BUTTON = {
  /** The one action a dialog exists for. */
  primary: `${BUTTON_BASE} bg-accent text-white hover:bg-accent-deep`,
  /** Cancel, Close, and anything reversible. */
  quiet: `${BUTTON_BASE} border border-rule-strong text-ink-soft hover:bg-muted-soft hover:text-ink`,
  /** Destroys saved work. `punch-ink` is the palette's readable red (5.9:1). */
  danger: `${BUTTON_BASE} bg-punch-ink text-white hover:bg-punch-900`,
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * How many dialogs are open right now.
 *
 * The quiz binds `1`–`4`, `Enter`, `N`, `S` and `H` on `window`, so a shortcut
 * typed into a dialog's note field would also tick an answer behind the scrim.
 * One marker on `document.body` covers every dialog at once, instead of each
 * caller threading a "don't listen" flag down to whoever owns the listener.
 */
let openDialogCount = 0;

export function isAnyDialogOpen(): boolean {
  return document.body.dataset.dialogOpen === "true";
}

export function Dialog({
  open,
  onClose,
  eyebrow,
  title,
  children,
  footer,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  /** Two or three words in `.meta` caps, e.g. "Restart". */
  eyebrow: string;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Where focus lands on open. Defaults to the first focusable element. */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const trigger = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    openDialogCount += 1;
    document.body.dataset.dialogOpen = "true";

    // Browsers disagree about when the node is focusable after mount; a frame
    // is enough and avoids focusing inside a not-yet-painted panel.
    const frame = window.requestAnimationFrame(() => {
      const target = initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? panelRef.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = overflow;
      openDialogCount = Math.max(0, openDialogCount - 1);
      if (openDialogCount === 0) delete document.body.dataset.dialogOpen;
      trigger?.focus?.();
    };
  }, [open, initialFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      // `defaultPrevented` lets an inner control (a field that consumes Escape
      // to collapse itself) win without racing the listener order.
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  /** Keep Tab inside: the page behind is still in the tab order otherwise. */
  const trapTab = (event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;
    const focusable = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 overflow-y-auto bg-ink/45 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex min-h-full items-center justify-center p-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          onKeyDown={trapTab}
          className="card animate-fade-in-up w-full max-w-sm outline-none"
        >
          <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div className="min-w-0">
              <p className="meta">{eyebrow}</p>
              <h2 id={titleId} className="mt-1 font-display text-lg leading-tight text-ink">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1.5 -mt-1 shrink-0 p-1.5 text-ink-muted transition-colors hover:bg-muted-soft hover:text-ink"
            >
              <X aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          <div className="px-5 py-4 text-mini leading-relaxed text-ink-soft">{children}</div>

          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-rule px-5 py-3">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
