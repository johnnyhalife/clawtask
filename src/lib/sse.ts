import { SseEvent } from '@/types';

type SseWriter = (event: SseEvent) => void;

// Anchor to globalThis so all Next.js module instances share the same Set.
// Without this, dev-mode hot-reload creates separate instances of this module
// and broadcastSse() can't reach writers registered in a different instance.
declare global {
  // eslint-disable-next-line no-var
  var __clawtask_sse_writers: Set<SseWriter> | undefined;
}

function getWriters(): Set<SseWriter> {
  if (!globalThis.__clawtask_sse_writers) {
    globalThis.__clawtask_sse_writers = new Set();
  }
  return globalThis.__clawtask_sse_writers;
}

export function addSseWriter(writer: SseWriter): () => void {
  const writers = getWriters();
  writers.add(writer);
  return () => writers.delete(writer);
}

export function broadcastSse(event: SseEvent) {
  for (const writer of getWriters()) {
    try {
      writer(event);
    } catch {
      // Writer disconnected — will be cleaned up on its own cancel
    }
  }
}
