import { describe, it, expect } from "vitest";
import { runBacktest } from "../backtest";
import { DEFAULT_TRADE_PARAMS } from "../trade-model";
import type { Candle } from "../parser";
import type { Signal } from "../../strategies/types";
const c = (t: number, o: number, h: number, l: number, cl: number): Candle => ({ t, o, h, l, c: cl, v: 1 });
const swing = { ...DEFAULT_TRADE_PARAMS, slMode: "swing" as const, swingLookback: 5, rr: 2 };
const flat = (n: number, start = 0) => Array.from({ length: n }, (_, i) => c(start + i, 100, 101, 99, 100));
const sig = (t: number, type: "BUY" | "SELL"): Signal => ({ t, type, price: 100, reason: "x" });
describe("backtest", () => {
  it("win: swing SL 99, TP 102, equity [0, 2]", () => {
    const candles = [...flat(10), c(10, 100, 102, 100, 101)];
    const r = runBacktest(candles, [sig(9, "BUY")], swing);
    expect(r.stats.wins).toBe(1); expect(r.stats.totalR).toBe(2); expect(r.equityCurve).toEqual([0, 2]);
  });
  it("win then loss: profit factor 2, max drawdown 1R, win rate 0.5", () => {
    const candles = [
      ...flat(10),                    // 0-9
      c(10, 100, 102, 100, 101),      // BUY TP hit -> +2R
      c(11, 100, 101, 99, 100),       // SELL signal candle
      c(12, 100, 102, 99, 100),       // SELL SL 101 hit -> -1R
    ];
    const r = runBacktest(candles, [sig(9, "BUY"), sig(11, "SELL")], swing);
    expect(r.stats).toMatchObject({ trades: 2, wins: 1, losses: 1, totalR: 1, winRate: 0.5, profitFactor: 2, maxDrawdown: 1, maxConsecutiveLosses: 1 });
    expect(r.equityCurve).toEqual([0, 2, 1]);
    expect(r.stats.long.trades).toBe(1); expect(r.stats.short.trades).toBe(1);
  });
  it("skips overlapping trades while one is still open", () => {
    const candles = [...flat(10), c(10, 100, 100.5, 99.5, 100), c(11, 100, 100.5, 99.5, 100)];
    const r = runBacktest(candles, [sig(9, "BUY"), sig(10, "BUY")], swing);
    expect(r.trades.length).toBe(1); expect(r.stats.open).toBe(1);
  });
});
