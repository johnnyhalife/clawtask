'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTaskCollection } from '@/lib/task-collection';
import type { Task } from '@/types';

export function useTaskCollection(url: string) {
  const [result, setResult] = useState<{ url: string; data: { tasks: Task[]; total: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const reload = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    // Disable stale neighbors during refresh; publish only a complete collection.
    setResult(null);
    setError(null);
    try {
      const data = await fetchTaskCollection(url, controller.signal);
      if (!controller.signal.aborted) setResult({ url, data });
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Failed to load issues');
    }
  }, [url]);
  useEffect(() => {
    reload();
    return () => active.current?.abort();
  }, [reload]);
  return { data: result?.url === url ? result.data : null, error, reload };
}
