import type { Candle } from "./types";
async function fetchJson(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, { headers, next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}
async function binancePage(base: string, symbol: string, interval: string, endTime?: number): Promise<Candle[]> {
  const url = new URL(`${base}/api/v3/klines`);
  url.searchParams.set("symbol", symbol.toUpperCase()); url.searchParams.set("interval", interval); url.searchParams.set("limit", "1000");
  if (endTime) url.searchParams.set("endTime", String(endTime));
  const arr = await fetchJson(url.toString()) as unknown[][];
  if (!Array.isArray(arr)) throw new Error("binance unavailable");
  return arr.map((k) => ({ t: Math.floor(Number(k[0]) / 1000), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]), v: Number(k[5]) }));
}
async function binanceBackfill(base: string, symbol: string, interval: string, target: number): Promise<Candle[]> {
  const all: Candle[] = []; let endTime: number | undefined;
  while (all.length < target) {
    const page = await binancePage(base, symbol, interval, endTime);
    if (!page.length) break;
    all.unshift(...page);
    if (page.length < 1000) break;
    endTime = page[0].t * 1000 - 1;
  }
  return all.slice(-target);
}
const KRAKEN_PAIR: Record<string, string> = { BTCUSDT: "XBTUSD", ETHUSDT: "ETHUSD", SOLUSDT: "SOLUSD", XRPUSDT: "XRPUSD", LTCUSDT: "LTCUSD", DOGEUSDT: "DOGEUSD" };
const KRAKEN_MIN: Record<string, number> = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };
async function krakenBackfill(symbol: string, interval: string, target: number): Promise<Candle[]> {
  const pair = KRAKEN_PAIR[symbol.toUpperCase()]; const min = KRAKEN_MIN[interval];
  if (!pair || !min) throw new Error("kraken: no pair");
  const all: Candle[] = []; let since: number | undefined;
  while (all.length < target) {
    const url = new URL("https://api.kraken.com/0/public/OHLC");
    url.searchParams.set("pair", pair); url.searchParams.set("interval", String(min));
    if (since) url.searchParams.set("since", String(since));
    const data = await fetchJson(url.toString()) as { error?: string[]; result?: Record<string, unknown[]> };
    if (data.error?.length) throw new Error("kraken: " + data.error.join(","));
    const rows = Object.values(data.result ?? {}).find((v) => Array.isArray(v)) as unknown[][] | undefined;
    if (!rows?.length) break;
    const page: Candle[] = rows.map((r) => ({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[6]) }));
    all.unshift(...page);
    if (rows.length < 100) break;
    since = page[0].t - min * 60;
    if (all.length > target + 720) break;
  }
  return all.slice(-target);
}
const YAHOO_TICKER: Record<string, string> = { XAUUSD: "GC=F", GOLD: "GC=F", BTCUSDT: "BTC-USD", ETHUSDT: "ETH-USD", SOLUSDT: "SOL-USD" };
const YAHOO_RANGE: Record<string, string> = { "1m": "7d", "5m": "60d", "15m": "60d", "1h": "730d", "4h": "730d", "1d": "max" };
async function yahooBackfill(symbol: string, interval: string): Promise<Candle[]> {
  const ticker = YAHOO_TICKER[symbol.toUpperCase()]; if (!ticker) throw new Error("yahoo: no ticker");
  const data = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${YAHOO_RANGE[interval] ?? "60d"}`, { "User-Agent": "Mozilla/5.0" }) as any;
  const r = data?.chart?.result?.[0]; if (!r) throw new Error("yahoo: no result");
  const q = r.indicators?.quote?.[0]; const ts: number[] = r.timestamp ?? []; const out: Candle[] = [];
  ts.forEach((t: number, i: number) => {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if ([o, h, l, c].every(Number.isFinite)) out.push({ t, o, h, l, c, v: q.volume?.[i] ?? 0 });
  });
  if (!out.length) throw new Error("yahoo: empty");
  return out;
}
export async function backfillAuto(symbol: string, interval: string, target = 5000): Promise<{ candles: Candle[]; source: string }> {
  const attempts = [
    { name: "binance", fn: () => binanceBackfill("https://api.binance.com", symbol, interval, target) },
    { name: "binance.us", fn: () => binanceBackfill("https://api.binance.us", symbol, interval, target) },
    { name: "kraken", fn: () => krakenBackfill(symbol, interval, target) },
    { name: "yahoo", fn: () => yahooBackfill(symbol, interval) },
  ];
  const errors: string[] = [];
  for (const a of attempts) {
    try { const candles = await a.fn(); if (candles.length) return { candles, source: a.name }; }
    catch (e) { errors.push(`${a.name}: ${String(e)}`); }
  }
  throw new Error("All history sources failed: " + errors.join(" | "));
}
export function isBinanceSymbol(symbol: string): boolean { return /^[A-Z0-9]{4,12}USDT$/.test(symbol.toUpperCase()); }
