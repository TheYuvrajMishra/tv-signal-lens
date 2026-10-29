import { describe, it, expect } from "vitest";
import { emaSeries } from "../ema";
describe("ema", () => {
  it("seeds with SMA and applies k=2/(n+1)", () => {
    const s = emaSeries([10, 20, 30, 40], 3);
    expect(s[0]).toBeNull(); expect(s[1]).toBeNull();
    expect(s[2]).toBeCloseTo(20, 10); // SMA(10,20,30)
    expect(s[3]).toBeCloseTo(30, 10); // 40*0.5 + 20*0.5
  });
  it("returns all null when not enough data", () => {
    expect(emaSeries([1, 2], 44)).toEqual([null, null]);
  });
});
