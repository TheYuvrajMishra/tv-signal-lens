# TV Dashboard — inside tv-signal-lens (same repo)

Your own screen for live candles, indicators, signals and backtest.
**The extension is the data feed, in realtime.** No Binance needed.

## Run it

```bash
cd dashboard
npm install
npm run dev      # open http://localhost:3000
# or: npm run build && npm start
```

## Realtime extension feed (primary)

1. Open a TradingView chart with the tv-signal-lens extension.
2. In the extension popup, turn **Dashboard feed** ON, dashboard URL
   defaults to `http://localhost:3000`, click Save.
3. The extension captures live candles and posts them (via its background
   service worker, throttled to 2s, full history once per symbol/timeframe)
   to this dashboard's `/api/candles` — upserted by timestamp and saved to
   `dashboard/data/{SYMBOL}_{INTERVAL}.json` automatically.
4. This page holds an SSE stream (`/api/stream`) and updates the chart the
   moment a new candle arrives. A 5s poll is only a fallback.

TradingView timeframes/symbols are normalised on both ends
(`5` → `5m`, `BINANCE:BTCUSDT` → `BTCUSDT`, etc.).

## Storage

- Past + live candles persist on disk in `dashboard/data/`, survive restarts,
  up to 20,000 candles per symbol/timeframe.
- Export stored JSON per symbol/timeframe from the page (`/api/export`).

## Binance backfill (opt-in only, OFF by default)

If the store is empty and you tick "Allow Binance backfill", the server
backfills up to 5,000 candles (Binance → Binance US → Kraken → Yahoo).
For TradingView symbols like XAUUSD, the extension is the only feed —
Yahoo gold futures (`GC=F`) is a proxy, not spot.

## Features

- Candlestick chart (lightweight-charts), EMA20/44/100, volume, RSI,
  EMA44 BUY/SELL markers, last price / EMA44 / bias, signals list,
  backtest stats + equity curve, stored-datasets list.

Not financial advice.
