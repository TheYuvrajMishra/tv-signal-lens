// Service worker: notifications + parameter sweep (runs here, not on the page, so it can't freeze the chart).
import { runSweep } from "./core/sweep";
import type { Candle } from "./core/parser";
import type { TradeParams } from "./core/trade-model";

function normalizeSymbol(raw: string): string { return raw.split(":").pop()!.replace(/[/\-_]/g, "").toUpperCase(); }
function normalizeInterval(raw: string): string {
  const m: Record<string, string> = { "1": "1m", "5": "5m", "15": "15m", "60": "1h", "240": "4h", "D": "1d" };
  return m[raw] ?? raw;
}
chrome.runtime.onMessage.addListener((msg: { type?: string; title?: string; message?: string; candles?: Candle[]; params?: TradeParams; url?: string; symbol?: string; interval?: string }, _sender, sendResponse) => {
  if (msg.type === "tvsl-dashboard-feed" && msg.url && msg.symbol && Array.isArray(msg.candles) && msg.candles.length) {
    const base = msg.url.replace(/\/$/, "");
    fetch(`${base}/api/candles`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol: normalizeSymbol(msg.symbol), interval: normalizeInterval(msg.interval || "1m"), candles: msg.candles, source: "extension" }),
    }).catch(() => { /* dashboard not running — silent, next feed retries */ });
    return false;
  }
  if (msg.type === "tvsl-notify" && msg.title && msg.message) {
    chrome.notifications.create({ type: "basic", iconUrl: "icon.png", title: msg.title, message: msg.message });
    return false;
  }
  if (msg.type === "tvsl-sweep" && Array.isArray(msg.candles) && msg.params) {
    try {
      const result = runSweep(msg.candles, msg.params);
      sendResponse({ type: "tvsl-sweep-result", result });
    } catch (e) {
      sendResponse({ type: "tvsl-sweep-result", error: String(e) });
    }
    return true;
  }
  return false;
});
