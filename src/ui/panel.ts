export interface PanelSignal { t: number; type: string; price: number; reason: string; }
export interface PanelBacktest {
  trades: number; wins: number; losses: number; open: number; winRate: number; avgR: number;
  expectancy: number; profitFactor: number; totalR: number; maxDrawdown: number; maxConsecutiveLosses: number;
  long: { trades: number; wins: number; losses: number; totalR: number };
  short: { trades: number; wins: number; losses: number; totalR: number };
}
export interface PanelState {
  symbol: string; timeframe: string; lastPrice: number | null; ema: number | null; emaPeriod: number;
  bias: "BUY" | "SELL" | "NEUTRAL"; signals: PanelSignal[]; pending: string | null;
  source: "WS" | "DOM"; count: number; drawMode: string | null;
  backtest: PanelBacktest | null; equityCurve: number[]; sweep: { top5: { emaPeriod: number; rr: number; expectancy: number; winRate: number; trades: number; totalR: number }[]; note: string } | null;
  firstT: number | null; lastT: number | null;
}
let host: HTMLElement | null = null; let root: ShadowRoot | null = null; let collapsed = false;
let activeTab: "signals" | "backtest" = "signals";
export function isPanelAttached(): boolean { return !!host && host.isConnected; }
function ensure(): ShadowRoot {
  if (root && host && host.isConnected) return root;
  host = null; root = null;
  host = document.createElement("div");
  host.id = "tv-signal-lens-panel";
  Object.assign(host.style, { position: "fixed", top: "16px", right: "16px", zIndex: "2147483647" });
  (document.documentElement || document.body).appendChild(host);
  root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `.box{width:320px;background:#0f1115;color:#e8eaf0;border:1px solid #2a2e39;border-radius:12px;font:12px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)}
  .head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:move;background:#171a21;border-radius:12px 12px 0 0}
  .head b{font-size:13px}.badge{font-size:10px;padding:2px 6px;border-radius:99px;background:#263142;color:#9cc3ff}
  .tabs{display:flex;gap:6px;padding:8px 12px 0}.tabs button{flex:1}.tabs button.on{background:#f0b90b;color:#111;border-color:#f0b90b;font-weight:700}
  button{background:#222633;color:#fff;border:1px solid #333;border-radius:6px;cursor:pointer;padding:2px 8px}
  .body{padding:10px 12px;display:grid;gap:6px}.row{display:flex;justify-content:space-between}
  .buy{color:#26a69a}.sell{color:#ef5350}.grid{max-height:220px;overflow:auto;display:grid;gap:4px}
  .sig{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #222;padding-top:4px}
  .sig small{color:#9aa0aa}.disc{font-size:10px;color:#9aa0aa}.warn{color:#f0b90b}`;
  root.appendChild(style);
  const box = document.createElement("div"); box.className = "box"; root.appendChild(box);
  let sx = 0, sy = 0, ox = 0, oy = 0;
  box.addEventListener("pointerdown", (e) => {
    const head = (e.target as HTMLElement).closest(".head"); if (!head || !host) return;
    sx = e.clientX; sy = e.clientY; const r = host.getBoundingClientRect(); ox = r.left; oy = r.top;
    const move = (ev: PointerEvent) => { if (host) { host.style.left = `${ox + ev.clientX - sx}px`; host.style.top = `${oy + ev.clientY - sy}px`; host.style.right = "auto"; } };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  });
  return root;
}
const fmt = (t: number) => new Date(t * 1000).toLocaleTimeString();
const num = (n: number, d = 2) => Number.isFinite(n) ? n.toFixed(d) : "—";
function equitySvg(curve: number[]): string {
  if (curve.length < 2) return "<small>No equity data yet.</small>";
  const w = 280, h = 60, min = Math.min(...curve, 0), max = Math.max(...curve, 0), span = max - min || 1;
  const pts = curve.map((v, i) => `${(i / (curve.length - 1)) * w},${h - ((v - min) / span) * (h - 8) - 4}`).join(" ");
  const stroke = curve[curve.length - 1] >= 0 ? "#26a69a" : "#ef5350";
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.5"/></svg>`;
}
export function renderPanel(s: PanelState): void {
  const r = ensure(); const box = r.querySelector(".box") as HTMLElement;
  const last20 = s.signals.slice(-20).reverse();
  const bt = s.backtest;
  const days = s.firstT && s.lastT ? ((s.lastT - s.firstT) / 86400).toFixed(1) : null;
  const backtestBody = !bt ? `<small>Loading backtest… scroll the chart left to load more history.</small>` : `
    <div class="row"><span>Trades</span><b>${bt.trades}</b></div>
    <div class="row"><span>Wins / Losses / Open</span><b>${bt.wins} / ${bt.losses} / ${bt.open}</b></div>
    <div class="row"><span>Win rate</span><b>${(bt.winRate * 100).toFixed(1)}%</b></div>
    <div class="row"><span>Avg R / Expectancy</span><b>${num(bt.avgR)}R / ${num(bt.expectancy)}R</b></div>
    <div class="row"><span>Profit factor</span><b>${bt.profitFactor === Number.POSITIVE_INFINITY ? "∞" : num(bt.profitFactor)}</b></div>
    <div class="row"><span>Total R / Max DD</span><b>${num(bt.totalR)}R / ${num(bt.maxDrawdown)}R</b></div>
    <div class="row"><span>Max consec. losses</span><b>${bt.maxConsecutiveLosses}</b></div>
    <div class="row"><span>Long</span><b>${bt.long.trades} trades, ${num(bt.long.totalR)}R</b></div>
    <div class="row"><span>Short</span><b>${bt.short.trades} trades, ${num(bt.short.totalR)}R</b></div>
    ${bt.trades < 30 ? `<div class="warn">Sample too small, results unreliable.</div>` : ""}
    <div><b>Equity curve (R)</b>${equitySvg(s.equityCurve)}</div>
    <div><b>Sweep top 5 (EMA × RR, by expectancy)</b>
      ${s.sweep ? `<div class="grid">${s.sweep.top5.map((x) => `<div class="sig"><span>EMA${x.emaPeriod} RR 1:${x.rr}</span><span>${num(x.expectancy)}R</span><small>${(x.winRate * 100).toFixed(0)}% · ${x.trades} trades</small></div>`).join("")}</div><small>${s.sweep.note}</small>` : "<small>Computing sweep…</small>"}
    </div>`;
  box.innerHTML = `<div class="head"><b>TV Signal Lens</b><span><span class="badge">${s.source}</span> <span class="badge">${s.drawMode ?? "—"}</span> <button data-a="collapse">${collapsed ? "+" : "−"}</button></span></div>
  ${collapsed ? "" : `<div class="tabs"><button data-tab="signals" class="${activeTab === "signals" ? "on" : ""}">Signals</button><button data-tab="backtest" class="${activeTab === "backtest" ? "on" : ""}">Backtest</button></div>
  <div class="body">
    ${activeTab === "signals" ? `
    <div class="row"><span>${s.symbol || "—"} ${s.timeframe || ""}</span><span>${s.count} candles</span></div>
    <div class="row"><span>Last</span><b>${s.lastPrice ?? "—"}</b></div>
    <div class="row"><span>EMA${s.emaPeriod}</span><b>${s.ema?.toFixed(4) ?? "—"}</b></div>
    <div class="row"><span>Bias</span><b class="${s.bias.toLowerCase()}">${s.bias}</b></div>
    ${s.pending ? `<div class="row"><span>Pending</span><span>${s.pending}</span></div>` : ""}
    <div><b>Last signals</b><div class="grid">${last20.length ? last20.map((x) => `<div class="sig"><span class="${x.type.toLowerCase()}">${x.type}</span><span>${x.price}</span><small>${fmt(x.t)}</small><small>${x.reason}</small></div>`).join("") : "<small>No confirmed signals yet.</small>"}</div></div>`
    : `<div class="row"><span>${s.symbol || "—"} ${s.timeframe || ""}</span><span>${s.count} candles</span></div>
    <div><small>Based on ${s.count} candles${days ? ` (${days}d)` : ""}. Scroll the chart left to load more history.</small></div>
    ${backtestBody}`}
    <div class="disc">Not financial advice. No fees/slippage beyond the spread param.</div>
  </div>`}`;
  box.querySelector('[data-a="collapse"]')?.addEventListener("click", () => { collapsed = !collapsed; renderPanel(s); });
  box.querySelectorAll("[data-tab]").forEach((el) => el.addEventListener("click", () => { activeTab = (el as HTMLElement).dataset.tab as "signals" | "backtest"; renderPanel(s); }));
}
export function hidePanel(): void { host?.remove(); host = null; root = null; }
