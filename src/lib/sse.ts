import { SseEvent } from '@/types';

// In-memory set of SSE response writers
type SseWriter = (event: SseEvent) => void;

const writers = new Set<SseWriter>();

export function addSseWriter(writer: SseWriter): () => void {
  writers.add(writer);
  return () => writers.delete(writer);
}

export function broadcastSse(event: SseEvent) {
  for (const writer of writers) {
    try {
      writer(event);
    } catch {
      // Writer may have disconnected
    }
  }
}
