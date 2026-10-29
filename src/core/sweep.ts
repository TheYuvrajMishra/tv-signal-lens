import type { Candle } from "./parser";
import { runBacktest } from "./backtest";
import { createEma44 } from "../strategies/ema44";
import type { TradeParams } from "./trade-model";

export interface SweepRow { emaPeriod: number; rr: number; expectancy: number; winRate: number; trades: number; totalR: number; }
export interface SweepResult { top5: SweepRow[]; note: string; }
const PERIODS = [20, 34, 44, 55, 100];
const RRS = [1, 1.5, 2, 3];
export function runSweep(candles: Candle[], baseParams: TradeParams): SweepResult {
  const rows: SweepRow[] = [];
  for (const emaPeriod of PERIODS) {
    const signals = createEma44(emaPeriod).evaluate(candles);
    for (const rr of RRS) {
      const r = runBacktest(candles, signals, { ...baseParams, rr });
      rows.push({ emaPeriod, rr, expectancy: r.stats.expectancy, winRate: r.stats.winRate, trades: r.stats.trades, totalR: r.stats.totalR });
    }
  }
  rows.sort((a, b) => b.expectancy - a.expectancy);
  return { top5: rows.slice(0, 5), note: "Top sweep results may be overfit — they were selected after seeing the same history." };
}
