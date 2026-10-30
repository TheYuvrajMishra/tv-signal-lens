import { NextRequest, NextResponse } from "next/server";
import { loadSet, upsertCandles, listSets } from "@/lib/store";
import { backfillAuto } from "@/lib/history";
import { track } from "@/lib/collector";
import { normalizeInterval, normalizeSymbol } from "@/lib/intervals";
import type { Candle } from "@/lib/types";
export const dynamic = "force-dynamic";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
export async function OPTIONS() { return new NextResponse(null, { headers: CORS }); }
export async function GET(req: NextRequest) {
  const symbol = normalizeSymbol(req.nextUrl.searchParams.get("symbol") || "BTCUSDT");
  const interval = normalizeInterval(req.nextUrl.searchParams.get("interval") || "1m");
  if (req.nextUrl.searchParams.get("list") === "1") return NextResponse.json({ sets: await listSets() }, { headers: CORS });
  let set = await loadSet(symbol, interval);
  // Extension-first: NO automatic Binance backfill by default. The extension
  // is the data feed, in realtime. Backfill only when explicitly requested.
  if (set.candles.length === 0 && req.nextUrl.searchParams.get("backfill") === "1") {
    try {
      const { candles: past, source } = await backfillAuto(symbol, interval, 5000);
      console.info(`[backfill] ${symbol} ${interval}: ${past.length} candles from ${source}`);
      set = await upsertCandles(symbol, interval, past);
      track(symbol, interval);
    } catch (e) { console.warn("[backfill]", String(e)); }
  }
  return NextResponse.json(set, { headers: CORS });
}
export async function POST(req: NextRequest) {
  // Realtime ingest from the tv-signal-lens extension:
  // POST { symbol, interval, candles: [{t,o,h,l,c,v}, ...], source?: "extension" }
  const body = await req.json() as { symbol?: string; interval?: string; candles?: Candle[] };
  if (!body.symbol || !Array.isArray(body.candles) || !body.candles.length) {
    return NextResponse.json({ error: "symbol and candles[] required" }, { status: 400, headers: CORS });
  }
  const interval = normalizeInterval(body.interval || "1m");
  const set = await upsertCandles(normalizeSymbol(body.symbol), interval, body.candles);
  return NextResponse.json({ ok: true, count: set.candles.length, lastT: set.candles[set.candles.length - 1]?.t ?? null }, { headers: CORS });
}
