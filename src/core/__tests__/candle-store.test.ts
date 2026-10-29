import { describe, it, expect } from "vitest";
import { CandleStore } from "../candle-store";
const c = (t: number, close: number) => ({ t, o: close, h: close, l: close, c: close, v: 1 });
describe("CandleStore", () => {
  it("upserts by timestamp (forming candle replaces previous)", () => {
    const s = new CandleStore(); s.upsert([c(1, 10), c(2, 20)]); s.upsert([c(2, 21)]);
    expect(s.size()).toBe(2); expect(s.last()?.c).toBe(21);
  });
  it("sorts by time and caps at max", () => {
    const s = new CandleStore(3); s.upsert([c(3, 3), c(1, 1), c(2, 2), c(4, 4)]);
    expect(s.all().map((x) => x.t)).toEqual([2, 3, 4]);
  });
  it("closed() excludes the forming candle", () => {
    const s = new CandleStore(); s.upsert([c(1, 1), c(2, 2)]);
    expect(s.closed().map((x) => x.t)).toEqual([1]);
  });
});
