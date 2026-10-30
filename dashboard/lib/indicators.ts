import type { Candle, Signal } from "./types";
export function emaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (period < 2 || closes.length < period) return out;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < closes.length; i++) { ema = closes[i] * k + ema * (1 - k); out[i] = ema; }
  return out;
}
export function rsi(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; if (d > 0) gain += d; else loss -= d; }
  let avgG = gain / period, avgL = loss / period;
  out[period] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL);
  }
  return out;
}
export function atr(candles: Candle[], period = 14): number | null {
  if (candles.length < period + 1) return null;
  const tr = candles.map((c, i) => i === 0 ? c.h - c.l : Math.max(c.h - c.l, Math.abs(c.h - candles[i - 1].c), Math.abs(c.l - candles[i - 1].c)));
  let a = tr.slice(1, period + 1).reduce((x, y) => x + y, 0) / period;
  for (let i = period + 1; i < tr.length; i++) a = (a * (period - 1) + tr[i]) / period;
  return a;
}
export function emaCrossSignals(candles: Candle[], period = 44): Signal[] {
  const closes = candles.map((c) => c.c);
  const emas = emaSeries(closes, period);
  const out: Signal[] = [];
  for (let i = 1; i < candles.length - 1; i++) { // closed candles only: last is forming
    const pe = emas[i - 1], e = emas[i]; if (pe === null || e === null) continue;
    const prev = candles[i - 1], cur = candles[i];
    if (prev.c <= pe && cur.c > e && cur.c > cur.o) out.push({ t: cur.t, type: "BUY", price: cur.c, reason: `Close crossed above EMA${period}, bullish` });
    else if (prev.c >= pe && cur.c < e && cur.c < cur.o) out.push({ t: cur.t, type: "SELL", price: cur.c, reason: `Close crossed below EMA${period}, bearish` });
  }
  return out;
}
export interface BacktestStats { trades: number; wins: number; losses: number; open: number; winRate: number; avgR: number; expectancy: number; profitFactor: number; totalR: number; maxDrawdown: number; }
export function backtest(candles: Candle[], signals: Signal[], rr = 2, atrMult = 1.5): { stats: BacktestStats; equity: number[] } {
  const closed = candles.slice(0, -1);
  const idx = new Map(closed.map((c, i) => [c.t, i]));
  let busy = -1; const rs: number[] = [];
  for (const s of signals) {
    const si = idx.get(s.t); if (si === undefined || si + 1 <= busy) continue;
    const entry = closed[si + 1]?.o; if (entry === undefined) continue;
    const a = atr(closed.slice(0, si + 1), 14); if (a === null) continue;
    const sl = s.type === "BUY" ? entry - atrMult * a : entry + atrMult * a;
    const tp = s.type === "BUY" ? entry + rr * Math.abs(entry - sl) : entry - rr * Math.abs(entry - sl);
    let done: number | null = null; let exitIdx = -1;
    for (let i = si + 1; i < closed.length; i++) {
      const c = closed[i];
      const hitSl = s.type === "BUY" ? c.l <= sl : c.h >= sl;
      const hitTp = s.type === "BUY" ? c.h >= tp : c.l <= tp;
      if (hitSl) { done = -1; exitIdx = i; break; }
      if (hitTp) { done = rr; exitIdx = i; break; }
    }
    if (done === null) { busy = Number.POSITIVE_INFINITY; rs.push(0); continue; }
    rs.push(done); busy = exitIdx;
  }
  const closedRs = rs.filter((r) => r !== 0 || true);
  const wins = rs.filter((r) => r > 0).length, losses = rs.filter((r) => r < 0).length;
  const pos = rs.filter((r) => r > 0).reduce((x, y) => x + y, 0), neg = rs.filter((r) => r < 0).reduce((x, y) => x + Math.abs(y), 0);
  const totalR = rs.reduce((x, y) => x + y, 0);
  const equity = [0]; let eq = 0, peak = 0, dd = 0;
  for (const r of rs) { eq += r; equity.push(eq); peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  return { stats: { trades: rs.length, wins, losses, open: 0, winRate: wins + losses ? wins / (wins + losses) : 0, avgR: rs.length ? totalR / rs.length : 0, expectancy: rs.length ? totalR / rs.length : 0, profitFactor: neg === 0 ? (pos > 0 ? Number.POSITIVE_INFINITY : 0) : pos / neg, totalR, maxDrawdown: dd }, equity };
}
