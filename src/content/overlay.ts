// Canvas overlay fallback: transparent, pointer-events none, drawn over the
// chart area when TradingViewApi is unavailable. Time -> x via the visible
// time range (activeChart().getVisibleRange() when present, else the drawn
// trades' time span); price -> y via the visible price range (trades' price
// span, padded). Redrawn on requestAnimationFrame + resize.
export type OverlayTrade = {
  id: string; side: "BUY" | "SELL"; entryT: number; entry: number; sl: number; tp: number; rr: number;
  exitT: number | null; exitPrice: number | null; result: "WIN" | "LOSS" | "OPEN"; rMultiple: number;
};
let canvas: HTMLCanvasElement | null = null;
let trades: OverlayTrade[] = [];
let liveT = 0;
let raf = 0;
let visibleRange: { from: number; to: number } | null = null;
export function setOverlayRange(r: { from: number; to: number } | null) { visibleRange = r; }
function ensureCanvas(): HTMLCanvasElement {
  if (canvas && canvas.isConnected) return canvas;
  canvas = document.createElement("canvas");
  canvas.id = "tv-signal-lens-overlay";
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "2147483646" });
  (document.documentElement || document.body).appendChild(canvas);
  return canvas;
}
function draw() {
  const cv = ensureCanvas();
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth, h = window.innerHeight;
  if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const ctx = cv.getContext("2d"); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  if (!trades.length) return;
  // Chart pane is the bulk of the window; keep a margin for axes/toolbars.
  const left = 60, right = w - 80, top = 60, bottom = h - 60;
  const tMin = visibleRange?.from ?? Math.min(...trades.map((t) => t.entryT));
  const tMax = visibleRange?.to ?? Math.max(...trades.map((t) => t.exitT ?? liveT), liveT);
  const prices = trades.flatMap((t) => [t.entry, t.sl, t.tp]);
  let pMin = Math.min(...prices), pMax = Math.max(...prices);
  const pad = (pMax - pMin) * 0.1 || 1; pMin -= pad; pMax += pad;
  const x = (t: number) => left + ((t - tMin) / Math.max(1, tMax - tMin)) * (right - left);
  const y = (p: number) => bottom - ((p - pMin) / Math.max(1e-9, pMax - pMin)) * (bottom - top);
  for (const t of trades.slice(-15)) {
    const x1 = x(t.entryT), x2 = x(t.exitT ?? liveT);
    const win = t.result === "WIN", loss = t.result === "LOSS";
    ctx.fillStyle = "rgba(38,166,154,0.18)"; ctx.fillRect(x1, y(Math.max(t.entry, t.tp)), x2 - x1, Math.abs(y(t.tp) - y(t.entry)));
    ctx.fillStyle = "rgba(239,83,80,0.18)"; ctx.fillRect(x1, y(Math.max(t.entry, t.sl)), x2 - x1, Math.abs(y(t.sl) - y(t.entry)));
    ctx.strokeStyle = win ? "#26a69a" : loss ? "#ef5350" : "#9cc3ff"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x1, y(t.entry)); ctx.lineTo(x2, y(t.entry)); ctx.stroke();
    ctx.fillStyle = win ? "#26a69a" : loss ? "#ef5350" : "#e8eaf0";
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(`${t.side} RR 1:${t.rr} | TP ${t.tp.toFixed(2)} | SL ${t.sl.toFixed(2)}${t.result !== "OPEN" ? ` | ${t.result} ${t.rMultiple.toFixed(2)}R` : ""}`, x1 + 4, y(t.entry) - 6);
    ctx.fillText(t.side === "BUY" ? "▲" : "▼", x1 - 5, y(t.entry) + 4);
  }
}
export function setOverlayTrades(next: OverlayTrade[], live: number) {
  trades = next; liveT = live;
  if (!raf) { const loop = () => { draw(); raf = requestAnimationFrame(loop); }; raf = requestAnimationFrame(loop); }
}
export function clearOverlay() {
  trades = [];
  if (raf) cancelAnimationFrame(raf); raf = 0;
  canvas?.remove(); canvas = null;
}
window.addEventListener("resize", () => draw());
