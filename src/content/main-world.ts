// MAIN world, document_start: patch WebSocket before TradingView loads.
import { parseMessage } from "../core/parser";
const NS = "tv-signal-lens";
const OrigWS = window.WebSocket;
type WS = WebSocket & { __tslPatched?: boolean };

function symbolFromPage(): { symbol: string; timeframe: string } {
  const url = new URL(location.href);
  const symbol = url.searchParams.get("symbol") || document.title.split(" ")[0] || "";
  // TradingView titles look like "BTCUSDT 1h ..." — second token is often the interval.
  const timeframe = document.title.split(" ")[1] || "";
  return { symbol, timeframe };
}

function relay(candles: ReturnType<typeof parseMessage>) {
  if (!candles.length) return;
  window.postMessage({ source: NS, type: "candles", candles, ...symbolFromPage() }, window.location.origin);
}

class PatchedWS extends OrigWS {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    const self = this as unknown as WS;
    if (String(url).includes("data.tradingview.com") && !self.__tslPatched) {
      self.__tslPatched = true;
      this.addEventListener("message", (ev: MessageEvent) => {
        if (typeof ev.data !== "string") return;
        try { relay(parseMessage(ev.data)); } catch { /* ignore malformed frames */ }
      });
    }
  }
}
// Keep instanceof / static surface compatible.
Object.setPrototypeOf(PatchedWS, OrigWS);
(window as unknown as { WebSocket: typeof WebSocket }).WebSocket = PatchedWS as unknown as typeof WebSocket;
window.postMessage({ source: NS, type: "ready", ...symbolFromPage() }, window.location.origin);
