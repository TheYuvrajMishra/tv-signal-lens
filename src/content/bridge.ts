import { CandleStore } from "../core/candle-store";
import { lastEma } from "../core/ema";
import type { Candle } from "../core/parser";
import { createEma44 } from "../strategies/ema44";
import { pendingSignal } from "../strategies/types";
import { runBacktest, type BacktestResult } from "../core/backtest";
import { buildTrade, DEFAULT_TRADE_PARAMS, type Trade, type TradeParams } from "../core/trade-model";
import type { SweepResult } from "../core/sweep";
import { renderPanel, hidePanel, isPanelAttached, type PanelState } from "../ui/panel";

const NS = "tv-signal-lens";
const store = new CandleStore(5000);
let mode: "WS" | "DOM" = "WS";
let drawMode: string | null = null;
let lastWsAt = 0; let symbol = ""; let timeframe = "";
let emaPeriod = 44; let showPanel = true; let sound = false; let notify = false; let drawEnabled = true;
let tradeParams: TradeParams = { ...DEFAULT_TRADE_PARAMS };
let lastNotifiedKey = "";
let cachedBacktest: BacktestResult | null = null;
let cachedKey = "";
let sweepResult: SweepResult | null = null;
let sweepInFlight = false; let lastSweepAt = 0; let lastSweepKey = "";
let drawSuppressed = false; let lastDrawSig = ""; let clearToken = 0;
let dashboardFeed = true; let dashboardUrl = "http://localhost:3000";
let lastFeedAt = 0; let fedKey = ""; let fedClosedCount = 0;
// Realtime feed to the dashboard in the same repo: full history once per
// symbol/timeframe, then only the last candles (throttled to 2s) so the
// dashboard chart moves in realtime without spamming localhost.
function feedDashboard(all: Candle[], closedCount: number) {
  if (!dashboardFeed || !symbol) return;
  const key = `${symbol}|${timeframe}`;
  const now = Date.now();
  const isNewKey = key !== fedKey;
  if (!isNewKey && closedCount === fedClosedCount && now - lastFeedAt < 2000) return;
  fedKey = key; fedClosedCount = closedCount; lastFeedAt = now;
  const candles = isNewKey ? all : all.slice(-20);
  chrome.runtime.sendMessage({ type: "tvsl-dashboard-feed", url: dashboardUrl, symbol, interval: timeframe, candles }).catch(() => {});
}

export function symbolFromDom(): { symbol: string; timeframe: string } {
  const param = new URL(location.href).searchParams.get("symbol");
  const parts = (document.title || "").split(/\s+/).filter(Boolean);
  const domSym = document.querySelector('[data-name="legend-source-title"]')?.textContent?.trim();
  return { symbol: param || domSym || parts[0]?.replace(/,$/, "") || "", timeframe: parts[1]?.replace(/,$/, "") || "" };
}
function legendOhlc(): Candle | null {
  const text = [...document.querySelectorAll('[data-name="legend-source-item"]')].map((el) => el.textContent ?? "").join(" ");
  const labelled = text.match(/O\s*([\d,]+\.?\d*)\s*H\s*([\d,]+\.?\d*)\s*L\s*([\d,]+\.?\d*)\s*C\s*([\d,]+\.?\d*)/);
  const nums = labelled ? labelled.slice(1).map((s) => Number(s.replace(/,/g, "")))
    : [...text.matchAll(/-?\d[\d,]*\.?\d*/g)].map((m) => Number(m[0].replace(/,/g, ""))).filter(Number.isFinite);
  if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) return null;
  const [o, h, l, c] = nums.slice(0, 4);
  return { t: Math.floor(Date.now() / 60000) * 60, o, h, l, c, v: 0 };
}
function paramKey(): string {
  return JSON.stringify([emaPeriod, tradeParams]);
}
function maybeSweep(closed: Candle[]) {
  const key = paramKey() + "|" + closed.length;
  // Recompute sweep when params change or ~20 more candles arrive, at most every 5s.
  const bucketChanged = Math.floor(closed.length / 20) !== Math.floor((Number(lastSweepKey.split("|").pop()) || 0) / 20);
  if (sweepInFlight || key === lastSweepKey || (!bucketChanged && lastSweepKey && Date.now() - lastSweepAt < 5000)) {
    if (!lastSweepKey) { /* first run below */ } else return;
  }
  if (closed.length < 30) return;
  sweepInFlight = true; lastSweepAt = Date.now();
  chrome.runtime.sendMessage({ type: "tvsl-sweep", candles: closed, params: tradeParams }, (res: { result?: SweepResult; error?: string } | undefined) => {
    sweepInFlight = false;
    if (res?.result) { sweepResult = res.result; lastSweepKey = key; refreshPanel(); }
    else if (res?.error) console.warn("[tv-signal-lens] sweep failed:", res.error);
  });
}
function forwardDraw(trades: Trade[], liveTrade: Trade | null, liveT: number) {
  const all = liveTrade ? [...trades, liveTrade] : trades;
  const sig = all.map((t) => `${t.id}:${t.result}`).join(",");
  if (drawSuppressed) {
    if (sig !== lastDrawSig) drawSuppressed = false; else return;
  }
  lastDrawSig = sig;
  window.postMessage({
    source: NS, type: "tvsl-draw", trades: all, liveT,
    drawEnabled, maxDrawn: tradeParams.maxDrawn, symbol, timeframe, clear: false,
  }, window.location.origin);
}
function refreshPanel() {
  const all = store.all(); const closed = store.closed(); const forming = store.last();
  const strategy = createEma44(emaPeriod);
  const signals = strategy.evaluate(closed);
  const ema = lastEma(closed.map((c) => c.c), emaPeriod);
  const lastClosed = closed[closed.length - 1];
  const bias = !lastClosed || ema === null ? "NEUTRAL" : lastClosed.c > ema ? "BUY" : lastClosed.c < ema ? "SELL" : "NEUTRAL";
  const pending = pendingSignal(forming, ema);
  // Incremental recompute: only when a candle closes or params change.
  const key = `${closed.length}|${paramKey()}`;
  if (key !== cachedKey) { cachedBacktest = runBacktest(closed, signals, tradeParams); cachedKey = key; }
  // Live/pending trade: entry = forming close, SL/TP from params (unconfirmed, OPEN).
  let liveTrade: Trade | null = null;
  if (pending && forming) {
    const sig = { t: forming.t, type: pending.type, price: forming.c, reason: pending.reason };
    liveTrade = buildTrade(sig, all, all.length - 1, tradeParams);
  }
  const state: PanelState = {
    symbol, timeframe, lastPrice: forming?.c ?? null, ema, emaPeriod, bias,
    signals, pending: pending ? `${pending.type} @ ${pending.price} (pending)` : null,
    source: mode, count: all.length, drawMode,
    backtest: cachedBacktest?.stats ?? null, equityCurve: cachedBacktest?.equityCurve ?? [0],
    sweep: sweepResult, firstT: all[0]?.t ?? null, lastT: forming?.t ?? null,
  };
  if (showPanel) renderPanel(state); else hidePanel();
  if (cachedBacktest) forwardDraw(cachedBacktest.trades, liveTrade, forming?.t ?? Math.floor(Date.now() / 1000));
  feedDashboard(all, closed.length);
  maybeSweep(closed);
  const latest = signals[signals.length - 1];
  const sigKey = latest ? `${latest.t}-${latest.type}` : "";
  if (latest && sigKey !== lastNotifiedKey) {
    lastNotifiedKey = sigKey;
    if (sound) { try { const ctx = new AudioContext(); const o = ctx.createOscillator(); o.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.15); } catch { /* audio unavailable */ } }
    if (notify) chrome.runtime.sendMessage({ type: "tvsl-notify", title: `TV Signal Lens: ${latest.type}`, message: `${symbol} ${latest.type} @ ${latest.price}` }).catch(() => {});
  }
  chrome.runtime.sendMessage({ type: "tvsl-state", symbol, timeframe, count: all.length, source: mode }).catch(() => {});
}
window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.origin !== window.location.origin) return;
  const d = ev.data as { source?: string; type?: string; candles?: Candle[]; symbol?: string; timeframe?: string; mode?: string };
  if (!d || d.source !== NS) return;
  if (d.type === "tvsl-draw-mode" && d.mode) { if (drawMode !== d.mode) { drawMode = d.mode; refreshPanel(); } return; }
  if (d.type === "candles" && Array.isArray(d.candles)) {
    mode = "WS"; lastWsAt = Date.now(); symbol = d.symbol || symbol; timeframe = d.timeframe || timeframe;
    store.upsert(d.candles); refreshPanel();
  } else if (d.type === "ready") { const s = symbolFromDom(); symbol = s.symbol; timeframe = s.timeframe; refreshPanel(); }
});
setTimeout(() => {
  if (lastWsAt) return;
  mode = "DOM"; console.info("[tv-signal-lens] No WS data in 10s — using DOM fallback (legend OHLC).");
  const apply = () => { const c = legendOhlc(); if (c) { store.upsert([c]); refreshPanel(); } };
  if (document.body) new MutationObserver(apply).observe(document.body, { subtree: true, childList: true, characterData: true });
  apply();
}, 10_000);
function applyStorage(v: Record<string, unknown>) {
  if (typeof v.emaPeriod === "number") emaPeriod = v.emaPeriod;
  if (typeof v.panel === "boolean") showPanel = v.panel;
  if (typeof v.sound === "boolean") sound = v.sound;
  if (typeof v.notify === "boolean") notify = v.notify;
  if (typeof v.draw === "boolean") drawEnabled = v.draw;
  if (typeof v.rr === "number") tradeParams.rr = v.rr;
  if (typeof v.slMode === "string") tradeParams.slMode = v.slMode as "atr" | "swing";
  if (typeof v.atrPeriod === "number") tradeParams.atrPeriod = v.atrPeriod;
  if (typeof v.atrMult === "number") tradeParams.atrMult = v.atrMult;
  if (typeof v.swingLookback === "number") tradeParams.swingLookback = v.swingLookback;
  if (typeof v.spread === "number") tradeParams.spread = v.spread;
  if (typeof v.maxDrawn === "number") tradeParams.maxDrawn = v.maxDrawn;
  if (typeof v.dashboardFeed === "boolean") dashboardFeed = v.dashboardFeed;
  if (typeof v.dashboardUrl === "string" && v.dashboardUrl) dashboardUrl = v.dashboardUrl;
}
chrome.storage.sync.get(["emaPeriod", "panel", "sound", "notify", "draw", "rr", "slMode", "atrPeriod", "atrMult", "swingLookback", "spread", "maxDrawn", "dashboardFeed", "dashboardUrl"], (v) => {
  applyStorage(v); console.info("[tv-signal-lens] settings loaded, showPanel =", showPanel); refreshPanel();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.clearDrawingsAt?.newValue && changes.clearDrawingsAt.newValue !== clearToken) {
    clearToken = changes.clearDrawingsAt.newValue as number;
    drawSuppressed = true;
    window.postMessage({ source: NS, type: "tvsl-draw", trades: [], liveT: 0, drawEnabled, maxDrawn: tradeParams.maxDrawn, symbol, timeframe, clear: true }, window.location.origin);
    return;
  }
  const v: Record<string, unknown> = {};
  for (const [k, ch] of Object.entries(changes)) v[k] = ch.newValue;
  applyStorage(v); cachedKey = ""; refreshPanel();
});
export { store };
{
  const s = symbolFromDom(); symbol = s.symbol; timeframe = s.timeframe;
  console.info("[tv-signal-lens] bridge loaded, waiting for WS data...");
  refreshPanel();
}
setInterval(() => { if (showPanel && !isPanelAttached()) { console.info("[tv-signal-lens] panel was detached, re-mounting"); refreshPanel(); } }, 1000);
