'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

/** Initial loads, edits and activity never follow; only appended comments may. */
export function useDetailScroll(comments: { id: string }[]) {
  const contentRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(false);
  const previous = useRef<Set<string> | null>(null);
  const followOwnSend = useRef(false);
  const attachContent = useCallback((node: HTMLDivElement | null) => {
    // Reset at attachment, before the replacement owner can receive a user scroll.
    if (contentRef.current !== node) {
      nearBottom.current = false;
      contentRef.current = node;
    }
  }, []);
  const jumpToLatest = useCallback(() => {
    const node = contentRef.current;
    if (node) node.scrollTo({ top: node.scrollHeight, behavior: 'instant' });
  }, []);
  const onScroll = useCallback(() => {
    const node = contentRef.current;
    if (node) nearBottom.current = node.scrollHeight - node.clientHeight - node.scrollTop <= 80;
  }, []);
  useLayoutEffect(() => {
    const ids = new Set(comments.map(comment => comment.id));
    const appended = previous.current !== null && comments.some(comment => !previous.current!.has(comment.id));
    if (followOwnSend.current || (appended && nearBottom.current)) jumpToLatest();
    followOwnSend.current = false;
    previous.current = ids;
  }, [comments, jumpToLatest]);
  return { contentRef: attachContent, onScroll, jumpToLatest, followOwnSend };
}
