export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number; }
export interface Signal { t: number; type: "BUY" | "SELL"; price: number; reason: string; }
export interface StoredSet { symbol: string; interval: string; updatedAt: number; candles: Candle[]; }
