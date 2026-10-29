// Service worker: notifications + parameter sweep (runs here, not on the page, so it can't freeze the chart).
import { runSweep } from "./core/sweep";
import type { Candle } from "./core/parser";
import type { TradeParams } from "./core/trade-model";

chrome.runtime.onMessage.addListener((msg: { type?: string; title?: string; message?: string; candles?: Candle[]; params?: TradeParams }, _sender, sendResponse) => {
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
