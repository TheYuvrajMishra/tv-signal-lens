import { NextRequest } from "next/server";
import { subscribe } from "@/lib/stream";
import { normalizeInterval, normalizeSymbol } from "@/lib/intervals";
export const dynamic = "force-dynamic";
// Realtime SSE: the dashboard opens this stream and reloads candles the
// moment the extension posts new ones — no 30s polling delay.
export async function GET(req: NextRequest) {
  const symbol = normalizeSymbol(req.nextUrl.searchParams.get("symbol") || "BTCUSDT");
  const interval = normalizeInterval(req.nextUrl.searchParams.get("interval") || "1m");
  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "connected", symbol, interval })}\n\n`));
      unsub = subscribe((info) => {
        if (info.symbol === symbol && info.interval === interval) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "update", ...info })}\n\n`));
        }
      });
      const ping = setInterval(() => { try { controller.enqueue(encoder.encode(`: ping\n\n`)); } catch { clearInterval(ping); } }, 15000);
      (controller as unknown as { _ping: ReturnType<typeof setInterval> })._ping = ping;
    },
    cancel() { unsub?.(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "Access-Control-Allow-Origin": "*" } });
}
