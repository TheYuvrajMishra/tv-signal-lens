/** EMA series aligned to input closes; first value is the SMA of the first `period` closes. */
export function emaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (period < 2 || closes.length < period) return out;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = ema;
  for (let i = period; i < closes.length; i++) { ema = closes[i] * k + ema * (1 - k); out[i] = ema; }
  return out;
}
export function lastEma(closes: number[], period: number): number | null {
  const s = emaSeries(closes, period); return s[s.length - 1] ?? null;
}
