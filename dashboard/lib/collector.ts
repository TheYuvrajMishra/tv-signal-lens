// Server-side auto-collector: once a symbol/interval is tracked, poll Binance
// every minute (or the interval, whichever is longer) and persist new candles.
// Started lazily from the API route so it runs while the Next server runs,
// even if the browser tab is closed. Browser WS updates are the fast path;
// this is the durable fallback that guarantees past+live data keeps storing.
import { loadSet, upsertCandles } from "./store";
import { isBinanceSymbol } from "./history";
async function fetchLatest(symbol: string, interval: string) {
  for (const base of ["https://api.binance.com", "https://api.binance.us"]) {
    try {
      const res = await fetch(`${base}/api/v3/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&limit=5`);
      if (!res.ok) continue;
      const arr = await res.json() as unknown[][];
      return arr.map((k) => ({ t: Math.floor(Number(k[0]) / 1000), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]) }));
    } catch { /* try next base */ }
  }
  return [];
}
const timers = new Map<string, ReturnType<typeof setInterval>>();
export function track(symbol: string, interval: string) {
  const key = `${symbol.toUpperCase()}_${interval}`;
  if (timers.has(key) || !isBinanceSymbol(symbol)) return;
  const poll = async () => {
    try {
      const latest = await fetchLatest(symbol, interval);
      if (latest.length) await upsertCandles(symbol, interval, latest);
    } catch (e) { console.warn("[collector]", key, String(e)); }
  };
  void poll();
  timers.set(key, setInterval(poll, 60_000));
  void loadSet(symbol, interval);
}
