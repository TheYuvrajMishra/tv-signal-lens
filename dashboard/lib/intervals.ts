/** TradingView timeframes -> dashboard intervals, and exchange-prefixed symbols -> plain symbols. */
export function normalizeInterval(raw: string): string {
  const m: Record<string, string> = { "1": "1m", "3": "3m", "5": "5m", "15": "15m", "30": "30m", "60": "1h", "120": "2h", "240": "4h", "D": "1d", "1D": "1d", "W": "1w" };
  return m[raw] ?? raw;
}
export function normalizeSymbol(raw: string): string {
  return raw.split(":").pop()!.replace(/[/\-_]/g, "").toUpperCase();
}
