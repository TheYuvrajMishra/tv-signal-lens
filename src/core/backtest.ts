import type { Candle } from "./parser";
import type { Signal } from "../strategies/types";
import { buildTrade, simulateTrade, type Trade, type TradeParams } from "./trade-model";

export interface SideStats { trades: number; wins: number; losses: number; totalR: number; }
export interface BacktestResult {
  trades: Trade[]; stats: {
    trades: number; wins: number; losses: number; open: number; winRate: number;
    avgR: number; expectancy: number; profitFactor: number; totalR: number;
    maxDrawdown: number; maxConsecutiveLosses: number;
    long: SideStats; short: SideStats;
  };
  equityCurve: number[];
}
const emptySide = (): SideStats => ({ trades: 0, wins: 0, losses: 0, totalR: 0 });
export function runBacktest(candles: Candle[], signals: Signal[], params: TradeParams): BacktestResult {
  const trades: Trade[] = [];
  let busyUntil = -1; // entryIndex must be > busyUntil
  const candleIndex = new Map<number, number>(candles.map((c, i) => [c.t, i]));
  for (const sig of signals) {
    const si = candleIndex.get(sig.t); if (si === undefined) continue;
    const entryIndex = si + 1;
    if (entryIndex <= busyUntil) continue; // skip overlapping, one position at a time
    const built = buildTrade(sig, candles, si, params); if (!built) continue;
    const done = simulateTrade(built, candles, params);
    trades.push(done);
    busyUntil = done.exitIndex !== null ? done.exitIndex : Number.POSITIVE_INFINITY;
  }
  const closed = trades.filter((t) => t.result !== "OPEN");
  const wins = closed.filter((t) => t.result === "WIN");
  const losses = closed.filter((t) => t.result === "LOSS");
  const pos = wins.reduce((s, t) => s + t.rMultiple, 0);
  const neg = losses.reduce((s, t) => s + Math.abs(t.rMultiple), 0);
  const totalR = closed.reduce((s, t) => s + t.rMultiple, 0);
  const equityCurve: number[] = [0]; let eq = 0; let peak = 0; let maxDd = 0;
  for (const t of closed) { eq += t.rMultiple; equityCurve.push(eq); peak = Math.max(peak, eq); maxDd = Math.max(maxDd, peak - eq); }
  let maxConsec = 0; let run = 0;
  for (const t of closed) { run = t.result === "LOSS" ? run + 1 : 0; maxConsec = Math.max(maxConsec, run); }
  const side = (side: "BUY" | "SELL"): SideStats => {
    const s = emptySide();
    for (const t of closed.filter((x) => x.side === side)) {
      s.trades++; if (t.result === "WIN") s.wins++; if (t.result === "LOSS") s.losses++; s.totalR += t.rMultiple;
    }
    return s;
  };
  return {
    trades,
    stats: {
      trades: trades.length, wins: wins.length, losses: losses.length,
      open: trades.length - closed.length,
      winRate: closed.length ? wins.length / closed.length : 0,
      avgR: closed.length ? totalR / closed.length : 0,
      expectancy: closed.length ? totalR / closed.length : 0,
      profitFactor: neg === 0 ? (pos > 0 ? Number.POSITIVE_INFINITY : 0) : pos / neg,
      totalR, maxDrawdown: maxDd, maxConsecutiveLosses: maxConsec,
      long: side("BUY"), short: side("SELL"),
    },
    equityCurve,
  };
}
