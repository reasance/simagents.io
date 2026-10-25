import { useEffect, useRef, type RefObject } from 'react';
/** Restore focus and contain keyboard navigation while a dialog is open. */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) return;
    document.querySelectorAll<HTMLElement>('[popover]:popover-open').forEach(popover => popover.hidePopover());
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      const modals = [...document.querySelectorAll<HTMLElement>('[role=dialog][aria-modal=true]')].filter(el => el.getClientRects().length > 0 && !el.closest('[inert]'));
      if (modals.length && modals.at(-1) !== ref.current) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const elements = [...(ref.current?.querySelectorAll<HTMLElement>('button, input, select, textarea, summary, iframe, a[href], [tabindex="0"]') ?? [])]
        .filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (!first) { event.preventDefault(); return; }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === ref.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (active === last || active === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown, true);
    return () => { document.removeEventListener('keydown', keydown, true); if (previous?.isConnected && !previous.hasAttribute('disabled') && previous.getClientRects().length > 0 && !previous.closest('[inert]')) previous.focus();
      else [...document.querySelectorAll<HTMLElement>('.topbar .session-controls button, .simulation-tools > summary')].find(el => el.getClientRects().length > 0 && !el.hasAttribute('disabled') && !el.closest('[inert]'))?.focus(); };
  }, [open, ref]);
}
