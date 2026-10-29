import { describe, it, expect } from "vitest";
import { parseMessage, splitFrames } from "../parser";
describe("parser", () => {
  it("splits concatenated ~m~ frames and ignores heartbeats", () => {
    const a = JSON.stringify({ m: "du", p: ["s", { sds_1: { s: [{ i: 0, v: [1000, 1, 2, 0.5, 1.5, 10] }] } }] });
    const raw = `~m~${a.length}~m~${a}~h~123~m~${a.length}~m~${a}`;
    expect(splitFrames(raw).length).toBe(2);
    expect(parseMessage(raw)).toHaveLength(2);
    expect(parseMessage(raw)[0]).toEqual({ t: 1000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 });
  });
  it("ignores non-candle frames", () => {
    expect(parseMessage(JSON.stringify({ m: "quote_completed", p: [] }))).toEqual([]);
    expect(parseMessage("~h~1")).toEqual([]);
  });
});
