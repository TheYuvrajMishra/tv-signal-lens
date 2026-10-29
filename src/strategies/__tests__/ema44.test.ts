import { describe, it, expect } from "vitest";
import { createEma44 } from "../ema44";
import type { Candle } from "../../core/parser";
const c = (t: number, close: number, open = close): Candle => ({ t, o: open, h: Math.max(open, close), l: Math.min(open, close), c: close, v: 1 });
describe("ema44", () => {
  it("emits BUY on bullish cross above EMA and SELL on bearish cross below", () => {
    const candles = [10, 10, 10, 10, 20, 20, 5].map((v, i) => c(i, v, i === 4 ? 11 : i === 6 ? 19 : v));
    const sigs = createEma44(3).evaluate(candles);
    expect(sigs.map((s) => s.type)).toContain("BUY");
    expect(sigs.map((s) => s.type)).toContain("SELL");
    expect(sigs[0].reason).toMatch(/EMA3/);
  });
  it("does not signal on a cross with a non-confirming candle", () => {
    const candles = [10, 10, 10, 20].map((v, i) => c(i, v, i === 3 ? 30 : v));
    expect(createEma44(3).evaluate(candles)).toEqual([]);
  });
  it("emits nothing without enough data", () => {
    expect(createEma44(44).evaluate([c(1, 10)])).toEqual([]);
  });
});
