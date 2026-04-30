'use client';

import { useEffect, useRef } from 'react';
import { SseEvent } from '@/types';

export function useSse(onEvent: (event: SseEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let es: EventSource;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource('/api/v1/sse');

      es.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.type && parsed.type !== 'connected') {
            onEventRef.current(parsed as SseEvent);
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      es?.close();
    };
  }, []);
}
