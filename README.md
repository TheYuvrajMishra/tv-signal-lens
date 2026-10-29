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

## Drawing signals on the chart

Toggle **Draw on chart** in the popup (or **Clear drawings** to remove them).
The bridge forwards backtest trades + the live/pending trade to a MAIN-world
script (`src/content/draw-main.ts`), which draws them as native Long/Short
Position boxes:

- **API mode** (badge `API`): uses TradingView's internal
  `window.TradingViewApi.activeChart()` (polled up to 30s) and
  `createMultipointShape` with `long_position` / `short_position`, profit and
  stop levels in price distance, plus a BUY/SELL arrow on the signal candle.
  If a position shape can't express the levels, it composes green TP / red SL
  rectangles plus an `RR 1:2 | TP … | SL …` text label instead. Closed trades
  get a green `WIN +2R` / red `LOSS -1R` label.
- **OVERLAY mode** (badge `OVERLAY`): if the API is unavailable after 30s, a
  transparent, pointer-events-none `<canvas>` over the chart draws the same
  boxes (time -> x from the visible range / trade span, price -> y from the
  price span), redrawn on a requestAnimationFrame loop + resize.

Only the last `maxDrawn` trades (default 15) plus the live/pending one are
drawn, each trade is drawn once (tradeId -> shapeId map, no duplicates), and
drawings are cleared on symbol/timeframe change or via the popup button.

## Backtest

The panel's **Backtest** tab runs the active strategy over all loaded closed
candles (one position at a time, overlapping signals skipped) and shows:
trades, wins, losses, open, win rate, avg R, expectancy, profit factor,
total R, max drawdown (R), max consecutive losses, long/short breakdown, and
an inline-SVG equity curve (cumulative R).

### Trade model assumptions

- Entry = open of the candle after the signal (live: current close).
- SL: ATR mode = entry ∓ `atrMult × ATR(atrPeriod)`; swing mode = last
  `swingLookback` candles' low (BUY) / high (SELL).
- TP = entry ± `rr × |entry − SL|`. First TP/SL touch wins; both touched in
  one candle counts as SL (conservative). Unresolved trades stay OPEN.
- rMultiple is +rr on a win, −1 on a loss, minus `spread / |entry − SL|`.
  No fees or slippage beyond the spread param.
- The sweep (background service worker, so the page doesn't freeze) tries
  EMA periods [20, 34, 44, 55, 100] × RR [1, 1.5, 2, 3] and shows the top 5 by
  expectancy. Those results **may be overfit** — they were picked after
  seeing the same history.
- Fewer than 30 trades shows: "Sample too small, results unreliable."
- Backtest recomputes when a candle closes, and fully on strategy/param change.
- Dataset note: "Based on N candles (Xd). Scroll the chart left to load more
  history." — only the candles TradingView has actually loaded are tested.

## Known limits (updated)

- TradingView may change its WebSocket protocol, DOM, or internal chart API
  at any time; the internal API is undocumented and may be absent, in which
  case the canvas overlay is used. The overlay's time/price mapping is
  approximate (no access to the chart's exact scale).
- Content scripts are built as single self-contained files
  (`scripts/build-content.mjs`) because classic content scripts cannot use
  `import` — `scripts/check-content.mjs` fails the build if one slips in.
- For personal use. Respect TradingView's Terms of Service.
- Signals are not financial advice.
