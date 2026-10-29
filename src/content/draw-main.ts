// MAIN world: draws trades on the TradingView chart. No chrome.* APIs here —
// everything arrives via window.postMessage from the isolated bridge.
import { setOverlayTrades, clearOverlay, setOverlayRange } from "./overlay";
const NS = "tv-signal-lens";
type DrawTrade = {
  id: string; side: "BUY" | "SELL"; entryT: number; entry: number; sl: number; tp: number; rr: number;
  exitT: number | null; exitPrice: number | null; result: "WIN" | "LOSS" | "OPEN"; rMultiple: number;
};
type ApiChart = {
  createMultipointShape: (points: { time: number; price: number }[], opts: Record<string, unknown>) => string | null;
  createShape?: (point: { time: number; price: number }, opts: Record<string, unknown>) => string | null;
  removeEntity: (id: string) => void;
  getVisibleRange?: () => { from: number; to: number };
};
type TvApi = { activeChart: () => ApiChart | null };
declare const window: Window & { TradingViewApi?: TvApi };

let chart: ApiChart | null = null;
let apiTimedOut = false;
let mode: "API" | "OVERLAY" | null = null;
let drawEnabled = true;
let maxDrawn = 15;
let symbolKey = "";
const shapeIds = new Map<string, string[]>(); // tradeId -> shape ids
const drawnSig = new Map<string, string>(); // tradeId -> JSON of what was drawn

function reportMode(m: "API" | "OVERLAY") {
  if (mode === m) return;
  mode = m;
  console.info(`[tv-signal-lens] draw mode: ${m}`);
  window.postMessage({ source: NS, type: "tvsl-draw-mode", mode: m }, window.location.origin);
}
function removeTrade(id: string) {
  for (const sid of shapeIds.get(id) ?? []) { try { chart?.removeEntity(sid); } catch { /* already gone */ } }
  shapeIds.delete(id); drawnSig.delete(id);
}
export function clearAllShapes() {
  for (const id of [...shapeIds.keys()]) removeTrade(id);
}
function addShape(tradeId: string, id: string | null | undefined) {
  if (!id) return;
  const list = shapeIds.get(tradeId) ?? []; list.push(id); shapeIds.set(tradeId, list);
}
function fmt(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
function drawViaApi(trade: DrawTrade, liveT: number) {
  if (!chart) return false;
  const exitT = trade.exitT ?? liveT;
  const shape = trade.side === "BUY" ? "long_position" : "short_position";
  try {
    const id = chart.createMultipointShape(
      [{ time: trade.entryT, price: trade.entry }, { time: exitT, price: trade.entry }],
      {
        shape, lock: true, disableSelection: true, text: `${trade.side} RR 1:${trade.rr}`,
        overrides: {
          profitLevel: Math.abs(trade.tp - trade.entry),
          stopLevel: Math.abs(trade.entry - trade.sl),
          // Best-effort account/risk fields; TradingView ignores unknown overrides.
          accountSize: 10000, risk: 1,
          riskDisplayMode: "percentage",
        },
      },
    );
    if (id) { addShape(trade.id, id); return true; }
  } catch { /* fall through to composed shapes */ }
  // Composed fallback: TP zone (green), SL zone (red), RR label, signal arrow.
  try {
    const tpId = chart.createMultipointShape(
      [{ time: trade.entryT, price: trade.entry }, { time: exitT, price: trade.tp }],
      { shape: "rectangle", lock: true, disableSelection: true, overrides: { backgroundColor: "rgba(38,166,154,0.25)", color: "rgba(38,166,154,0.25)" } },
    );
    const slId = chart.createMultipointShape(
      [{ time: trade.entryT, price: trade.entry }, { time: exitT, price: trade.sl }],
      { shape: "rectangle", lock: true, disableSelection: true, overrides: { backgroundColor: "rgba(239,83,80,0.25)", color: "rgba(239,83,80,0.25)" } },
    );
    const labelId = chart.createMultipointShape(
      [{ time: trade.entryT, price: trade.entry }, { time: exitT, price: trade.entry }],
      { shape: "text", lock: true, disableSelection: true, text: `RR 1:${trade.rr} | TP ${fmt(trade.tp)} | SL ${fmt(trade.sl)}` },
    );
    addShape(trade.id, tpId); addShape(trade.id, slId); addShape(trade.id, labelId);
    if (trade.result !== "OPEN" && trade.exitT !== null) {
      const resId = chart.createMultipointShape(
        [{ time: trade.exitT, price: trade.exitPrice ?? trade.entry }, { time: trade.exitT, price: trade.exitPrice ?? trade.entry }],
        { shape: "text", lock: true, disableSelection: true,
          text: trade.result === "WIN" ? `WIN +${trade.rMultiple.toFixed(2)}R` : `LOSS ${trade.rMultiple.toFixed(2)}R` },
      );
      addShape(trade.id, resId);
    }
    return tpId !== null || slId !== null || labelId !== null;
  } catch { return false; }
}
function drawArrow(trade: DrawTrade) {
  if (!chart?.createShape) return;
  try {
    const id = chart.createShape({ time: trade.entryT, price: trade.entry }, {
      shape: trade.side === "BUY" ? "arrow_up" : "arrow_down", lock: true, disableSelection: true,
    });
    addShape(trade.id, id);
  } catch { /* arrows are decorative */ }
}
function drawAll(trades: DrawTrade[], liveT: number) {
  if (!chart) return;
  const visible = trades.slice(-maxDrawn);
  const keep = new Set(visible.map((t) => t.id));
  for (const id of [...shapeIds.keys()]) if (!keep.has(id)) removeTrade(id);
  for (const trade of visible) {
    const sig = JSON.stringify([trade.exitT, trade.result, trade.rMultiple]);
    if (drawnSig.get(trade.id) === sig) continue; // never create duplicates
    removeTrade(trade.id);
    if (drawViaApi(trade, liveT)) { drawArrow(trade); drawnSig.set(trade.id, sig); }
  }
}
let latest: { trades: DrawTrade[]; liveT: number } | null = null;
function applyLatest() {
  if (!latest) return;
  if (!drawEnabled) { clearAllShapes(); clearOverlay(); return; }
  if (chart) { reportMode("API"); drawAll(latest.trades, latest.liveT); }
  else if (apiTimedOut) {
    reportMode("OVERLAY");
    // No chart object here, so the overlay maps time/price from the drawn trades' span
    // (overlay.ts uses activeChart().getVisibleRange() whenever a chart object is supplied).
    setOverlayRange(null);
    setOverlayTrades(latest.trades.slice(-maxDrawn), latest.liveT);
  }
}
window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.origin !== window.location.origin) return;
  const d = ev.data as { source?: string; type?: string; trades?: DrawTrade[]; liveT?: number; drawEnabled?: boolean; maxDrawn?: number; symbol?: string; timeframe?: string; clear?: boolean };
  if (!d || d.source !== NS || d.type !== "tvsl-draw") return;
  const key = `${d.symbol ?? ""}|${d.timeframe ?? ""}`;
  if (symbolKey && key !== symbolKey) clearAllShapes();
  symbolKey = key;
  if (typeof d.drawEnabled === "boolean") drawEnabled = d.drawEnabled;
  if (typeof d.maxDrawn === "number") maxDrawn = d.maxDrawn;
  if (d.clear) { clearAllShapes(); clearOverlay(); latest = null; return; }
  latest = { trades: Array.isArray(d.trades) ? d.trades : [], liveT: d.liveT ?? Math.floor(Date.now() / 1000) };
  applyLatest();
});
// Poll for the internal API (max 30s), then fall back to the canvas overlay.
{
  const started = Date.now();
  const timer = window.setInterval(() => {
    try { chart = window.TradingViewApi?.activeChart() ?? null; } catch { chart = null; }
    if (chart) { window.clearInterval(timer); applyLatest(); }
    else if (Date.now() - started > 30_000) { window.clearInterval(timer); apiTimedOut = true; console.info("[tv-signal-lens] TradingViewApi not available after 30s — using canvas overlay"); applyLatest(); }
  }, 500);
}
export { latest, chart };
