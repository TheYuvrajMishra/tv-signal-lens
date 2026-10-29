import type { Candle } from "./parser";
export class CandleStore {
  private map = new Map<number, Candle>();
  constructor(private max = 5000) {}
  /** Upsert: a live update to the forming candle replaces the previous one. */
  upsert(candles: Candle[]): void {
    for (const c of candles) this.map.set(c.t, { ...c });
    while (this.map.size > this.max) {
      const oldest = Math.min(...this.map.keys());
      this.map.delete(oldest);
    }
  }
  all(): Candle[] { return [...this.map.values()].sort((a, b) => a.t - b.t); }
  closed(): Candle[] { const a = this.all(); return a.slice(0, -1); } // last = forming
  last(): Candle | undefined { const a = this.all(); return a[a.length - 1]; }
  size(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
}
