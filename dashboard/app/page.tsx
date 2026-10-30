"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Candle } from "@/lib/types";
import { emaSeries, rsi, emaCrossSignals, backtest } from "@/lib/indicators";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"];
const INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"];

export default function Dashboard() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [custom, setCustom] = useState("");
  const [interval, setTf] = useState("1m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [status, setStatus] = useState("Loading…");
  const [stored, setStored] = useState<{ symbol: string; interval: string; count: number; firstT: number | null; lastT: number | null }[]>([]);
  const [show, setShow] = useState({ ema20: true, ema44: true, ema100: false, volume: true, rsi: true });
  const [allowBackfill, setAllowBackfill] = useState(false);
  const [liveAt, setLiveAt] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const rsiRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<any>(null);
  const candlesRef = useRef<Candle[]>([]);
  candlesRef.current = candles;

  const load = useCallback(async (sym: string, iv: string) => {
    setStatus("Loading stored candles…");
    try {
      const q = allowBackfill ? "&backfill=1" : "";
      const res = await fetch(`/api/candles?symbol=${sym}&interval=${iv}${q}`);
      const data = await res.json();
      setCandles(data.candles ?? []);
      setStatus(data.candles?.length ? `Live from extension: ${data.candles.length} candles stored` : "Waiting for extension… open a TradingView chart with tv-signal-lens + Dashboard feed ON");
      if (data.candles?.length) setLiveAt(Date.now());
      const list = await fetch(`/api/candles?list=1`).then((r) => r.json());
      setStored(list.sets ?? []);
    } catch (e) { setStatus(`Load failed: ${String(e)}`); }
  }, []);
  useEffect(() => { load(symbol, interval); }, [symbol, interval, load, allowBackfill]);

  // REALTIME from the extension: SSE pushes the moment the extension posts
  // new candles to /api/candles. No Binance WS, no Binance backfill by default.
  useEffect(() => {
    const es = new EventSource(`/api/stream?symbol=${symbol}&interval=${interval}`);
    es.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type !== "update") return;
        const data = await fetch(`/api/candles?symbol=${symbol}&interval=${interval}`).then((r) => r.json());
        if (data.candles?.length) { setCandles(data.candles); setLiveAt(Date.now()); setStatus(`Live from extension: ${data.candles.length} candles stored`); }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [symbol, interval]);

  // Fallback poll (SSE is primary) for extension-ingested candles.
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const data = await fetch(`/api/candles?symbol=${symbol}&interval=${interval}`).then((r) => r.json());
        if (data.candles?.length && data.candles.length !== candlesRef.current.length) setCandles(data.candles);
      } catch { /* ignore */ }
    }, 5_000);
    return () => clearInterval(id);
  }, [symbol, interval]);

  // Chart (lightweight-charts, client only)
  useEffect(() => {
    let chart: any, candleSeries: any, ema20: any, ema44: any, ema100: any, vol: any, rsiChart: any, rsiSeries: any;
    let dead = false;
    (async () => {
      const mod = await import("lightweight-charts");
      if (dead || !chartRef.current) return;
      chart = mod.createChart(chartRef.current, { width: chartRef.current.clientWidth || 900, height: 420, layout: { background: { color: "#0f1115" }, textColor: "#e8eaf0" }, grid: { vertLines: { color: "#1c1f27" }, horzLines: { color: "#1c1f27" } }, timeScale: { timeVisible: true } });
      candleSeries = chart.addCandlestickSeries({ upColor: "#26a69a", downColor: "#ef5350", wickUpColor: "#26a69a", wickDownColor: "#ef5350" });
      ema20 = chart.addLineSeries({ color: "#f0b90b", lineWidth: 1 }); ema44 = chart.addLineSeries({ color: "#9cc3ff", lineWidth: 1 }); ema100 = chart.addLineSeries({ color: "#ab47bc", lineWidth: 1 });
      vol = chart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "" });
      chart.priceScale("").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      if (rsiRef.current) {
        rsiChart = mod.createChart(rsiRef.current, { width: rsiRef.current.clientWidth || 900, height: 120, layout: { background: { color: "#0f1115" }, textColor: "#e8eaf0" } });
        rsiSeries = rsiChart.addLineSeries({ color: "#f0b90b", lineWidth: 1 });
      }
      seriesRef.current = { chart, candleSeries, ema20, ema44, ema100, vol, rsiChart, rsiSeries };
      updateChart();
    })();
    function updateChart() {
      if (!seriesRef.current) return;
      const cs = candlesRef.current;
      seriesRef.current.candleSeries.setData(cs.map((c) => ({ time: c.t as any, open: c.o, high: c.h, low: c.l, close: c.c })));
      const closes = cs.map((c) => c.c);
      const setLine = (s: any, series: (number | null)[], on: boolean) => s.setData(on ? cs.map((c, i) => ({ time: c.t as any, value: series[i] ?? NaN })).filter((x) => Number.isFinite(x.value)) : []);
      setLine(seriesRef.current.ema20, emaSeries(closes, 20), show.ema20);
      setLine(seriesRef.current.ema44, emaSeries(closes, 44), show.ema44);
      setLine(seriesRef.current.ema100, emaSeries(closes, 100), show.ema100);
      seriesRef.current.vol.setData(show.volume ? cs.map((c) => ({ time: c.t as any, value: c.v, color: c.c >= c.o ? "#26a69a55" : "#ef535055" })) : []);
      if (seriesRef.current.rsiSeries) seriesRef.current.rsiSeries.setData(show.rsi ? cs.map((c, i) => ({ time: c.t as any, value: rsi(closes, 14)[i] ?? NaN })).filter((x) => Number.isFinite(x.value)) : []);
      const sigs = emaCrossSignals(cs, 44);
      seriesRef.current.candleSeries.setMarkers(sigs.slice(-50).map((s) => ({ time: s.t as any, position: s.type === "BUY" ? "belowBar" : "aboveBar", color: s.type === "BUY" ? "#26a69a" : "#ef5350", shape: s.type === "BUY" ? "arrowUp" : "arrowDown", text: s.type })));
    }
    updateChart();
    const t = setInterval(updateChart, 1000);
    return () => { dead = true; clearInterval(t); chart?.remove(); rsiChart?.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval, show]);

  const signals = emaCrossSignals(candles, 44);
  const bt = backtest(candles, signals, 2, 1.5);
  const last = candles[candles.length - 1];
  const ema44v = emaSeries(candles.map((c) => c.c), 44).filter((x) => x !== null).pop() ?? null;
  const bias = !last || ema44v === null ? "NEUTRAL" : last.c > ema44v ? "BUY" : "SELL";
  const days = candles.length > 1 ? ((candles[candles.length - 1].t - candles[0].t) / 86400).toFixed(1) : "0";
  const eq = bt.equity; const eqMin = Math.min(...eq, 0), eqMax = Math.max(...eq, 0), eqSpan = eqMax - eqMin || 1;
  const eqPts = eq.map((v, i) => `${(i / Math.max(1, eq.length - 1)) * 280},${60 - ((v - eqMin) / eqSpan) * 52 - 4}`).join(" ");

  return (
    <main style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: "0 0 4px" }}>TV Dashboard</h1>
      <p style={{ color: "#9aa0aa", marginTop: 0 }}>{status} · Past data is stored automatically on disk (<code>data/</code>) and survives restarts.</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {SYMBOLS.map((s) => <button key={s} onClick={() => setSymbol(s)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #333", background: symbol === s ? "#f0b90b" : "#1c1f27", color: symbol === s ? "#111" : "#fff", cursor: "pointer", fontWeight: symbol === s ? 700 : 400 }}>{s}</button>)}
        <input placeholder="Custom symbol, e.g. XAUUSD" value={custom} onChange={(e) => setCustom(e.target.value.toUpperCase())} style={{ padding: 6, background: "#1c1f27", color: "#fff", border: "1px solid #333", borderRadius: 6 }} />
        <button onClick={() => custom && setSymbol(custom)} style={{ padding: "6px 10px", borderRadius: 6, background: "#263142", color: "#fff", border: "1px solid #333", cursor: "pointer" }}>Use custom</button>
        <select value={interval} onChange={(e) => setTf(e.target.value)} style={{ padding: 6, background: "#1c1f27", color: "#fff", border: "1px solid #333", borderRadius: 6 }}>{INTERVALS.map((i) => <option key={i}>{i}</option>)}</select>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ background: liveAt && Date.now() - liveAt < 30000 ? "#26a69a22" : "#222633", border: "1px solid #333", borderRadius: 99, padding: "4px 10px", fontSize: 12 }}>
          {liveAt ? `● LIVE from extension${liveAt ? ` · updated ${new Date(liveAt).toLocaleTimeString()}` : ""}` : "○ Waiting for extension"}
        </span>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}><input type="checkbox" checked={allowBackfill} onChange={(e) => setAllowBackfill(e.target.checked)} /> Allow Binance backfill (only if no extension data)</label>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, margin: "12px 0" }}>
        {[["Symbol / TF", `${symbol} ${interval}`], ["Candles stored", `${candles.length} (${days}d)`], ["Last price", last ? last.c.toLocaleString() : "—"], ["EMA44", ema44v ? ema44v.toFixed(2) : "—"], ["Bias", bias], ["Signals", `${signals.length}`], ["Backtest win rate", `${(bt.stats.winRate * 100).toFixed(1)}%`], ["Backtest total R", `${bt.stats.totalR.toFixed(2)}R`]].map(([k, v]) => (
          <div key={k} style={{ background: "#171a21", border: "1px solid #2a2e39", borderRadius: 10, padding: 10 }}><div style={{ color: "#9aa0aa", fontSize: 12 }}>{k}</div><b>{v}</b></div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        {(["ema20", "ema44", "ema100", "volume", "rsi"] as const).map((k) => (
          <label key={k} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={show[k]} onChange={(e) => setShow({ ...show, [k]: e.target.checked })} />{k.toUpperCase()}</label>
        ))}
        <a href={`/api/export?symbol=${symbol}&interval=${interval}`} style={{ color: "#9cc3ff" }}>Export stored JSON ↓</a>
      </div>
      <div ref={chartRef} style={{ width: "100%", height: 420 }} />
      {show.rsi && <><div style={{ marginTop: 8, color: "#9aa0aa", fontSize: 12 }}>RSI (14)</div><div ref={rsiRef} style={{ width: "100%", height: 120 }} /></>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <section><h3>Last signals (EMA44 cross)</h3>{signals.slice(-20).reverse().map((s) => <div key={s.t + s.type} style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid #222", padding: "4px 0" }}><span style={{ color: s.type === "BUY" ? "#26a69a" : "#ef5350" }}>{s.type}</span><span>{s.price}</span><small style={{ color: "#9aa0aa" }}>{new Date(s.t * 1000).toLocaleString()}</small></div>)}{signals.length === 0 && <p style={{ color: "#9aa0aa" }}>No signals yet on this dataset.</p>}</section>
        <section><h3>Backtest (EMA44, RR 1:2, ATR SL)</h3>
          <p>Trades {bt.stats.trades} · Wins {bt.stats.wins} · Losses {bt.stats.losses} · Avg R {bt.stats.avgR.toFixed(2)} · Expectancy {bt.stats.expectancy.toFixed(2)}R · Profit factor {bt.stats.profitFactor === Infinity ? "∞" : bt.stats.profitFactor.toFixed(2)} · Max DD {bt.stats.maxDrawdown.toFixed(2)}R</p>
          {bt.stats.trades < 30 && <p style={{ color: "#f0b90b" }}>Sample too small, results unreliable.</p>}
          <svg width="280" height="60" viewBox="0 0 280 60"><polyline points={eqPts} fill="none" stroke={bt.stats.totalR >= 0 ? "#26a69a" : "#ef5350"} strokeWidth="1.5" /></svg>
          <h4>Stored datasets (on disk)</h4>
          {stored.map((s) => <div key={s.symbol + s.interval} style={{ fontSize: 13, borderTop: "1px solid #222", padding: "4px 0" }}>{s.symbol} {s.interval} — {s.count} candles{s.firstT ? ` · ${new Date(s.firstT * 1000).toLocaleDateString()} → ${s.lastT ? new Date(s.lastT * 1000).toLocaleDateString() : ""}` : ""}</div>)}
        </section>
      </div>
      <section style={{ marginTop: 16, background: "#171a21", border: "1px solid #2a2e39", borderRadius: 10, padding: 12 }}>
        <h3 style={{ marginTop: 0 }}>How the realtime extension feed works</h3>
        <ol>
          <li>Open a TradingView chart with the <b>tv-signal-lens</b> extension, open its popup, turn <b>Dashboard feed</b> ON (dashboard URL defaults to <code>http://localhost:3000</code>), and click Save.</li>
          <li>The extension captures live candles in realtime and posts them to this dashboard&apos;s <code>/api/candles</code> — upserted by timestamp and saved to <code>dashboard/data/{"{SYMBOL}_{INTERVAL}.json"}</code> automatically.</li>
          <li>This page holds an SSE stream (<code>/api/stream</code>) and updates the chart the moment a new candle arrives — no manual refresh, no Binance needed.</li>
          <li>Binance backfill is OFF by default and only runs if you tick &quot;Allow Binance backfill&quot; and the store is empty. For TradingView symbols like XAUUSD, the extension is the only feed.</li>
        </ol>
        <p style={{ color: "#9aa0aa", fontSize: 12 }}>Not financial advice. No fees/slippage beyond the spread param in the extension backtest.</p>
      </section>
    </main>
  );
}
