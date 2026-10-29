import { describe, it, expect } from "vitest";
import { buildTrade, simulateTrade, atr, DEFAULT_TRADE_PARAMS, type Trade } from "../trade-model";
import type { Candle } from "../parser";
import type { Signal } from "../../strategies/types";
const c = (t: number, o: number, h: number, l: number, cl: number): Candle => ({ t, o, h, l, c: cl, v: 1 });
// Flat candles give ATR = 10 (h-l), so atrMult 1.5 -> risk 15, rr 2 -> TP distance 30.
const flat = Array.from({ length: 20 }, (_, i) => c(i, 100, 105, 95, 100));
const sig: Signal = { t: 19, type: "BUY", price: 100, reason: "x" };
const buy = (entry: number, sl: number, tp: number, entryIndex = 0): Trade => ({
  id: "t-BUY", signalT: 0, side: "BUY", entryT: 0, entry, sl, tp, rr: 2,
  exitT: null, exitPrice: null, result: "OPEN", rMultiple: 0, entryIndex, exitIndex: null,
});
describe("trade-model", () => {
  it("TP hit wins", () => {
    const t = simulateTrade(buy(100, 90, 120), [c(0, 100, 121, 99, 115)], DEFAULT_TRADE_PARAMS);
    expect(t.result).toBe("WIN"); expect(t.rMultiple).toBe(2); expect(t.exitPrice).toBe(120);
  });
  it("SL hit loses", () => {
    const t = simulateTrade(buy(100, 90, 120), [c(0, 100, 101, 89, 95)], DEFAULT_TRADE_PARAMS);
    expect(t.result).toBe("LOSS"); expect(t.rMultiple).toBe(-1);
  });
  it("same candle both hit counts as SL (conservative)", () => {
    const t = simulateTrade(buy(100, 90, 120), [c(0, 100, 130, 80, 110)], DEFAULT_TRADE_PARAMS);
    expect(t.result).toBe("LOSS");
  });
  it("spread cost reduces R", () => {
    const p = { ...DEFAULT_TRADE_PARAMS, spread: 1 }; // risk 10 -> 0.1R cost
    expect(simulateTrade(buy(100, 90, 120), [c(0, 100, 121, 99, 115)], p).rMultiple).toBeCloseTo(1.9);
    expect(simulateTrade(buy(100, 90, 120), [c(0, 100, 101, 89, 95)], p).rMultiple).toBeCloseTo(-1.1);
  });
  it("ATR SL/TP from signal candle, entry = next open", () => {
    const candles = [...flat, c(20, 102, 103, 101, 102)];
    const t = buildTrade(sig, candles, 19, DEFAULT_TRADE_PARAMS);
    expect(t?.entry).toBe(102); expect(t?.sl).toBeCloseTo(87); expect(t?.tp).toBeCloseTo(132);
  });
  it("ATR is the mean true range on flat candles", () => {
    expect(atr(flat, 14)).toBeCloseTo(10);
  });
  it("swing SL uses last swing low/high", () => {
    const p = { ...DEFAULT_TRADE_PARAMS, slMode: "swing" as const, swingLookback: 5 };
    const t = buildTrade(sig, [...flat, c(20, 102, 103, 101, 102)], 19, p);
    expect(t?.sl).toBe(95); // min low of last 5 flat candles
  });
});
