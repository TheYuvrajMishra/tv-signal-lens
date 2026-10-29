import type { Candle } from "../core/parser";
export interface Signal { t: number; type: "BUY" | "SELL"; price: number; reason: string; }
export interface Strategy {
  id: string; name: string; params: Record<string, number>;
  evaluate(candles: Candle[]): Signal[];
}
export type Pending = { type: "BUY" | "SELL"; price: number; reason: string } | null;
/** Pending (unconfirmed) signal from the forming candle vs the last closed EMA. */
export function pendingSignal(forming: Candle | undefined, ema: number | null): Pending {
  if (!forming || ema === null) return null;
  if (forming.c > ema && forming.c > forming.o) return { type: "BUY", price: forming.c, reason: "Forming close above EMA, bullish" };
  if (forming.c < ema && forming.c < forming.o) return { type: "SELL", price: forming.c, reason: "Forming close below EMA, bearish" };
  return null;
}
