import { CandleStore } from "../core/candle-store";
import { lastEma } from "../core/ema";
import type { Candle } from "../core/parser";
import { createEma44 } from "../strategies/ema44";
import { pendingSignal } from "../strategies/types";
import { renderPanel, hidePanel, isPanelAttached, type PanelState } from "../ui/panel";

const NS = "tv-signal-lens";
const store = new CandleStore(5000);
let mode: "WS" | "DOM" = "WS";
let lastWsAt = 0; let symbol = ""; let timeframe = "";
let emaPeriod = 44; let showPanel = true; let sound = false; let notify = false;
let lastNotifiedKey = "";

export function symbolFromDom(): { symbol: string; timeframe: string } {
  const param = new URL(location.href).searchParams.get("symbol");
  const parts = (document.title || "").split(/\s+/).filter(Boolean);
  const domSym = document.querySelector('[data-name="legend-source-title"]')?.textContent?.trim();
  return { symbol: param || domSym || parts[0]?.replace(/,$/, "") || "", timeframe: parts[1]?.replace(/,$/, "") || "" };
}
function legendOhlc(): Candle | null {
  const text = [...document.querySelectorAll('[data-name="legend-source-item"]')].map((el) => el.textContent ?? "").join(" ");
  // TradingView legend reads like "O4,026.660 H4,027.855 L4,022.830 C4,024.520" — parse labels first.
  const labelled = text.match(/O\s*([\d,]+\.?\d*)\s*H\s*([\d,]+\.?\d*)\s*L\s*([\d,]+\.?\d*)\s*C\s*([\d,]+\.?\d*)/);
  const nums = labelled ? labelled.slice(1).map((s) => Number(s.replace(/,/g, "")))
    : [...text.matchAll(/-?\d[\d,]*\.?\d*/g)].map((m) => Number(m[0].replace(/,/g, ""))).filter(Number.isFinite);
  if (nums.length < 4 || nums.some((n) => !Number.isFinite(n))) return null;
  const [o, h, l, c] = nums.slice(0, 4);
  return { t: Math.floor(Date.now() / 60000) * 60, o, h, l, c, v: 0 };
}
function refreshPanel() {
  const all = store.all(); const closed = store.closed(); const forming = store.last();
  const strategy = createEma44(emaPeriod);
  const signals = strategy.evaluate(closed);
  const ema = lastEma(closed.map((c) => c.c), emaPeriod);
  const lastClosed = closed[closed.length - 1];
  const bias = !lastClosed || ema === null ? "NEUTRAL" : lastClosed.c > ema ? "BUY" : lastClosed.c < ema ? "SELL" : "NEUTRAL";
  const pending = pendingSignal(forming, ema);
  const state: PanelState = {
    symbol, timeframe, lastPrice: forming?.c ?? null, ema, emaPeriod, bias,
    signals, pending: pending ? `${pending.type} @ ${pending.price} (pending)` : null,
    source: mode, count: all.length,
  };
  if (showPanel) renderPanel(state); else hidePanel();
  const latest = signals[signals.length - 1];
  const key = latest ? `${latest.t}-${latest.type}` : "";
  if (latest && key !== lastNotifiedKey) {
    lastNotifiedKey = key;
    if (sound) { try { const ctx = new AudioContext(); const o = ctx.createOscillator(); o.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.15); } catch { /* audio unavailable */ } }
    if (notify) chrome.runtime.sendMessage({ type: "tvsl-notify", title: `TV Signal Lens: ${latest.type}`, message: `${symbol} ${latest.type} @ ${latest.price}` }).catch(() => {});
  }
  chrome.runtime.sendMessage({ type: "tvsl-state", symbol, timeframe, count: all.length, source: mode }).catch(() => {});
}
window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.origin !== window.location.origin) return;
  const d = ev.data as { source?: string; type?: string; candles?: Candle[]; symbol?: string; timeframe?: string };
  if (!d || d.source !== NS) return;
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
chrome.storage.sync.get(["emaPeriod", "panel", "sound", "notify"], (v) => {
  if (typeof v.emaPeriod === "number") emaPeriod = v.emaPeriod;
  if (typeof v.panel === "boolean") showPanel = v.panel;
  if (typeof v.sound === "boolean") sound = v.sound;
  if (typeof v.notify === "boolean") notify = v.notify;
  console.info("[tv-signal-lens] settings loaded, showPanel =", showPanel);
  refreshPanel();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.emaPeriod?.newValue) emaPeriod = changes.emaPeriod.newValue as number;
  if (typeof changes.panel?.newValue === "boolean") showPanel = changes.panel.newValue;
  if (typeof changes.sound?.newValue === "boolean") sound = changes.sound.newValue;
  if (typeof changes.notify?.newValue === "boolean") notify = changes.notify.newValue;
  refreshPanel();
});
export { store };

// Render immediately so the panel is visible even before the first candle arrives.
{
  const s = symbolFromDom(); symbol = s.symbol; timeframe = s.timeframe;
  console.info("[tv-signal-lens] bridge loaded, waiting for WS data...");
  refreshPanel();
}

setInterval(() => { if (showPanel && !isPanelAttached()) { console.info("[tv-signal-lens] panel was detached, re-mounting"); refreshPanel(); } }, 1000);
