# tv-signal-lens

Chrome MV3 extension (TypeScript, Vite, no framework) for `tradingview.com/chart/*`.
It captures live candle data from the chart, runs a pluggable strategy, and shows
BUY/SELL signals in an on-page panel. Seed strategy: 44 EMA.

## Install

1. `npm install && npm run build`
2. Open `chrome://extensions`, enable Developer mode.
3. **Load unpacked** and select the `dist/` folder.
4. Open a TradingView chart page. The floating panel appears top-right.

## Architecture

```
MAIN-world content script (document_start)
  patches window.WebSocket before TradingView loads
  parses "~m~<len>~m~<json>" frames, ignores "~h~" heartbeats
  extracts timescale_update / du series -> Candle {t,o,h,l,c,v}
  --window.postMessage (namespaced, origin-checked)-->
Isolated content script (bridge)
  CandleStore (upsert by timestamp, last 5000)
  DOM fallback after 10s without WS data (legend OHLC via MutationObserver)
  strategy evaluation on closed candles only; forming candle = "pending"
  shadow-DOM panel + chrome.storage.sync settings
Background service worker: browser notifications only
```

Data source is shown in the panel as a badge: **WS** or **DOM**.
The panel shows symbol, timeframe, last price, EMA44, bias (BUY/SELL/NEUTRAL),
the last 20 signals, and: *Not financial advice.*

## How to add a strategy

1. Create one file, e.g. `src/strategies/my-strategy.ts`, exporting a `Strategy`
   (`src/strategies/types.ts`): `{ id, name, params, evaluate(candles) }`.
2. Add one line to the registry in `src/strategies/index.ts`.
3. Add a test under `src/strategies/__tests__/` and run `npm test`.

The EMA44 seed: BUY when close crosses above EMA44 on a bullish candle,
SELL when close crosses below EMA44 on a bearish candle. Signals are confirmed
only on closed candles.

## Known limits

- TradingView may change its WebSocket protocol or DOM at any time; the DOM
  fallback is best-effort (legend values, minute-bucketed timestamps).
- For personal use. Respect TradingView's Terms of Service.
- Signals are not financial advice.
