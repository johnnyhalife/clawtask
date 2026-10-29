'use client';

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

// Render only while open: no document access during SSR and no retained listeners.
export function ChipPopover({ anchor, onDismiss, children }: {
  anchor: RefObject<HTMLButtonElement | null>;
  onDismiss: () => void;
  children: ReactNode;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number; maxHeight: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const place = () => {
      const trigger = anchor.current;
      const panel = menu.current;
      if (!trigger || !panel) return;
      const rect = trigger.getBoundingClientRect();
      const vv = window.visualViewport;
      const x = vv?.offsetLeft ?? 0, y = vv?.offsetTop ?? 0;
      const width = vv?.width ?? window.innerWidth, height = vv?.height ?? window.innerHeight;
      const below = y + height - rect.bottom - 12, above = rect.top - y - 12;
      const down = below >= Math.min(panel.scrollHeight, 240) || below >= above;
      const maxHeight = Math.max(0, down ? below : above);
      const panelWidth = Math.min(180, width - 16);
      setPosition({ left: Math.max(x + 8, Math.min(rect.left, x + width - panelWidth - 8)),
        top: down ? rect.bottom + 4 : rect.top - 4 - Math.min(panel.scrollHeight, maxHeight),
        maxHeight, width: panelWidth });
    };
    place();
    // A scrolling ancestor can move the trigger out of its clip. Dismiss rather
    // than leave a detached overlay. Scrolling options themselves stays local.
    const scroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) onDismiss();
    };
    window.addEventListener('resize', onDismiss);
    document.addEventListener('scroll', scroll, true);
    window.visualViewport?.addEventListener('resize', onDismiss);
    window.visualViewport?.addEventListener('scroll', onDismiss);
    return () => {
      window.removeEventListener('resize', onDismiss);
      document.removeEventListener('scroll', scroll, true);
      window.visualViewport?.removeEventListener('resize', onDismiss);
      window.visualViewport?.removeEventListener('scroll', onDismiss);
    };
  }, [anchor, onDismiss]);

  return createPortal(<>
    <div data-chip-backdrop role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onDismiss(); }} onClick={event => event.stopPropagation()} />
    <div ref={menu} data-chip-popover className="rounded-lg shadow-2xl" style={{
      position: 'fixed', zIndex: 1001, background: 'var(--color-base-150)', border: '1px solid var(--color-base-300)',
      ...position, visibility: position ? 'visible' : 'hidden', overflowY: 'auto', overscrollBehavior: 'contain', whiteSpace: 'nowrap',
    }}>{children}</div>
  </>, document.body);
}
