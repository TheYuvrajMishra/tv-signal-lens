import type { Candle } from "./parser";
import type { Signal } from "../strategies/types";

export interface TradeParams {
  rr: number; slMode: "atr" | "swing"; atrPeriod: number; atrMult: number;
  swingLookback: number; spread: number; maxDrawn: number;
}
export const DEFAULT_TRADE_PARAMS: TradeParams = {
  rr: 2, slMode: "atr", atrPeriod: 14, atrMult: 1.5, swingLookback: 5, spread: 0, maxDrawn: 15,
};
export interface Trade {
  id: string; signalT: number; side: "BUY" | "SELL";
  entryT: number; entry: number; sl: number; tp: number; rr: number;
  exitT: number | null; exitPrice: number | null;
  result: "WIN" | "LOSS" | "OPEN"; rMultiple: number;
  entryIndex: number; exitIndex: number | null;
}
export function trueRange(cur: Candle, prev: Candle | undefined): number {
  if (!prev) return cur.h - cur.l;
  return Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c));
}
/** Wilder ATR: first value = SMA of TR, then smoothed. Null if not enough candles. */
export function atr(candles: Candle[], period: number): number | null {
  if (period < 2 || candles.length < period + 1) return null;
  const trs = candles.map((c, i) => trueRange(c, candles[i - 1]));
  let a = trs.slice(1, period + 1).reduce((x, y) => x + y, 0) / period;
  for (let i = period + 1; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}
function swingLevel(candles: Candle[], signalIndex: number, lookback: number, side: "BUY" | "SELL"): number | null {
  const window = candles.slice(Math.max(0, signalIndex - lookback + 1), signalIndex + 1);
  if (!window.length) return null;
  return side === "BUY" ? Math.min(...window.map((c) => c.l)) : Math.max(...window.map((c) => c.h));
}
/** Entry = open of next candle (or live close if signal is the last candle). */
export function buildTrade(signal: Signal, candles: Candle[], signalIndex: number, params: TradeParams): Trade | null {
  const entryIndex = signalIndex + 1;
  const entryCandle = candles[entryIndex];
  const live = !entryCandle;
  const entry = live ? signal.price : entryCandle.o;
  const entryT = live ? signal.t : entryCandle.t;
  let sl: number;
  if (params.slMode === "swing") {
    const level = swingLevel(candles, signalIndex, params.swingLookback, signal.type);
    if (level === null) return null;
    // Swing level is the extreme itself; keep a small buffer equal to the spread so SL is not exactly on the wick.
    sl = signal.type === "BUY" ? level - params.spread : level + params.spread;
  } else {
    const a = atr(candles.slice(0, signalIndex + 1), params.atrPeriod);
    if (a === null) return null;
    sl = signal.type === "BUY" ? entry - params.atrMult * a : entry + params.atrMult * a;
  }
  const risk = Math.abs(entry - sl);
  if (risk <= 0) return null;
  const tp = signal.type === "BUY" ? entry + params.rr * risk : entry - params.rr * risk;
  return {
    id: `${signal.t}-${signal.type}`, signalT: signal.t, side: signal.type,
    entryT, entry, sl, tp, rr: params.rr, exitT: null, exitPrice: null,
    result: "OPEN", rMultiple: 0, entryIndex: live ? signalIndex : entryIndex, exitIndex: null,
  };
}
function spreadR(params: TradeParams, risk: number): number {
  return risk > 0 ? params.spread / risk : 0;
}
/** Walk candles from entryIndex; first TP/SL touch wins, both in one candle = SL (conservative). */
export function simulateTrade(trade: Trade, candles: Candle[], params: TradeParams): Trade {
  const risk = Math.abs(trade.entry - trade.sl);
  const cost = spreadR(params, risk);
  for (let i = trade.entryIndex; i < candles.length; i++) {
    const c = candles[i];
    const hitSl = trade.side === "BUY" ? c.l <= trade.sl : c.h >= trade.sl;
    const hitTp = trade.side === "BUY" ? c.h >= trade.tp : c.l <= trade.tp;
    if (hitSl) return { ...trade, exitT: c.t, exitPrice: trade.sl, result: "LOSS", rMultiple: -1 - cost, exitIndex: i };
    if (hitTp) return { ...trade, exitT: c.t, exitPrice: trade.tp, result: "WIN", rMultiple: trade.rr - cost, exitIndex: i };
  }
  return trade; // unresolved: OPEN, rMultiple 0
}
