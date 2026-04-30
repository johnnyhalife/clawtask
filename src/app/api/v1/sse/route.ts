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

      // Cleanup on close
      const cleanup = () => {
        clearInterval(heartbeat);
        remove();
      };

      // When stream is cancelled (client disconnect)
      return cleanup;
    },
    cancel() {
      // cleanup handled above
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
