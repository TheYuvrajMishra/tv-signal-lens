export interface Candle { t: number; o: number; h: number; l: number; c: number; v: number; }
export interface TvFrame { m: string; p: unknown[]; }

/** Split TradingView "~m~<len>~m~<payload>" streams; also accept a bare JSON frame. */
export function splitFrames(raw: string): string[] {
  if (!raw) return [];
  // Delimiters are ~m~<len>~m~ (payload follows) and ~h~<n> (heartbeat, no payload).
  const re = /~m~\d+~m~|~h~\d+/g;
  const out: string[] = []; let match: RegExpExecArray | null; let isMsg = false; let start = 0;
  while ((match = re.exec(raw))) {
    if (isMsg) { const s = raw.slice(start, match.index).trim(); if (s) out.push(s); }
    isMsg = match[0].startsWith("~m~"); start = match.index + match[0].length;
  }
  if (isMsg) { const s = raw.slice(start).trim(); if (s) out.push(s); }
  return out.length || raw.startsWith("~h~") ? out : [raw];
}

export function parseFrame(text: string): TvFrame | null {
  if (!text || text.startsWith("~h~")) return null;
  try { const j = JSON.parse(text) as TvFrame; return j && typeof j.m === "string" && Array.isArray(j.p) ? j : null; }
  catch { return null; }
}

function isNum(n: unknown): n is number { return typeof n === "number" && Number.isFinite(n); }

/** Extract candles from timescale_update / du frames: p[1][series].s[].v = [t,o,h,l,c,v] */
export function extractCandles(frame: TvFrame): Candle[] {
  if (frame.m !== "timescale_update" && frame.m !== "du") return [];
  const series = frame.p?.[1];
  if (!series || typeof series !== "object") return [];
  const out: Candle[] = [];
  for (const s of Object.values(series as Record<string, unknown>)) {
    const rows = (s as { s?: unknown })?.s;
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const v = (row as { v?: unknown })?.v;
      if (!Array.isArray(v) || v.length < 6 || !v.slice(0, 6).every(isNum)) continue;
      out.push({ t: v[0], o: v[1], h: v[2], l: v[3], c: v[4], v: v[5] });
    }
  }
  return out;
}

export function parseMessage(raw: string): Candle[] {
  const out: Candle[] = [];
  for (const part of splitFrames(raw)) {
    const f = parseFrame(part); if (f) out.push(...extractCandles(f));
  }
  return out;
}
