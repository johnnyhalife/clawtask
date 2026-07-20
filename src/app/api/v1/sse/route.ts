import { addSseWriter } from '@/lib/sse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      controller.enqueue(encoder.encode('data: {"type":"connected"}\n\n'));

      const remove = addSseWriter((event) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Stash cleanup on the controller so cancel() can reach it.
      // NOTE: start()'s return value is NOT a cancel hook per the Streams spec —
      // only cancel() fires on client disconnect. Returning cleanup here was a
      // no-op leak: the heartbeat timer and SSE writer closure lived forever.
      (controller as any)._cleanup = () => {
        clearInterval(heartbeat);
        remove();
      };
    },
    cancel(reason) {
      const c = this as unknown as { _cleanup?: () => void };
      c._cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
