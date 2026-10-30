import { promises as fs } from "node:fs";
import path from "node:path";
import type { Candle, StoredSet } from "./types";
import { notifyStore } from "./stream";
const DATA_DIR = path.join(process.cwd(), "data");
const MAX = 20000;
export function keyFor(symbol: string, interval: string) { return `${symbol.toUpperCase()}_${interval}`; }
function fileFor(symbol: string, interval: string) { return path.join(DATA_DIR, `${keyFor(symbol, interval)}.json`); }
// In-memory cache so every request doesn't re-read disk; disk is the source of truth.
const cache = new Map<string, StoredSet>();
export async function loadSet(symbol: string, interval: string): Promise<StoredSet> {
  const key = keyFor(symbol, interval);
  if (cache.has(key)) return cache.get(key)!;
  try {
    const raw = await fs.readFile(fileFor(symbol, interval), "utf8");
    const parsed = JSON.parse(raw) as StoredSet;
    parsed.candles.sort((a, b) => a.t - b.t);
    cache.set(key, parsed); return parsed;
  } catch {
    const empty: StoredSet = { symbol: symbol.toUpperCase(), interval, updatedAt: 0, candles: [] };
    cache.set(key, empty); return empty;
  }
}
export async function saveSet(set: StoredSet): Promise<void> {
  set.candles.sort((a, b) => a.t - b.t);
  if (set.candles.length > MAX) set.candles = set.candles.slice(-MAX);
  set.updatedAt = Date.now();
  cache.set(keyFor(set.symbol, set.interval), set);
  notifyStore(set.symbol, set.interval, set.candles.length, set.candles[set.candles.length - 1]?.t ?? null);
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = fileFor(set.symbol, set.interval) + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(set));
  await fs.rename(tmp, fileFor(set.symbol, set.interval));
}
/** Upsert by timestamp (live updates to the forming candle replace the old one) and persist. */
export async function upsertCandles(symbol: string, interval: string, incoming: Candle[]): Promise<StoredSet> {
  const set = await loadSet(symbol, interval);
  const map = new Map(set.candles.map((c) => [c.t, c]));
  for (const c of incoming) if (Number.isFinite(c.t) && Number.isFinite(c.c)) map.set(c.t, c);
  set.candles = [...map.values()];
  await saveSet(set);
  return set;
}
export async function listSets(): Promise<{ symbol: string; interval: string; count: number; updatedAt: number; firstT: number | null; lastT: number | null }[]> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const files = (await fs.readdir(DATA_DIR)).filter((f) => f.endsWith(".json"));
  const out = [];
  for (const f of files) {
    try {
      const set = JSON.parse(await fs.readFile(path.join(DATA_DIR, f), "utf8")) as StoredSet;
      out.push({ symbol: set.symbol, interval: set.interval, count: set.candles.length, updatedAt: set.updatedAt, firstT: set.candles[0]?.t ?? null, lastT: set.candles[set.candles.length - 1]?.t ?? null });
    } catch { /* ignore corrupt file */ }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}
