export interface PanelSignal { t: number; type: string; price: number; reason: string; }
export interface PanelState {
  symbol: string; timeframe: string; lastPrice: number | null; ema: number | null; emaPeriod: number;
  bias: "BUY" | "SELL" | "NEUTRAL"; signals: PanelSignal[]; pending: string | null;
  source: "WS" | "DOM"; count: number;
}
let host: HTMLElement | null = null; let root: ShadowRoot | null = null; let collapsed = false;
function ensure(): ShadowRoot {
  if (root) return root;
  host = document.createElement("div");
  host.id = "tv-signal-lens-panel";
  Object.assign(host.style, { position: "fixed", top: "16px", right: "16px", zIndex: "2147483647" });
  document.body.appendChild(host);
  root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `.box{width:300px;background:#0f1115;color:#e8eaf0;border:1px solid #2a2e39;border-radius:12px;font:12px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.5)}
  .head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;cursor:move;background:#171a21;border-radius:12px 12px 0 0}
  .head b{font-size:13px}.badge{font-size:10px;padding:2px 6px;border-radius:99px;background:#263142;color:#9cc3ff}
  button{background:#222633;color:#fff;border:1px solid #333;border-radius:6px;cursor:pointer;padding:2px 8px}
  .body{padding:10px 12px;display:grid;gap:6px}.row{display:flex;justify-content:space-between}
  .buy{color:#26a69a}.sell{color:#ef5350}.grid{max-height:220px;overflow:auto;display:grid;gap:4px}
  .sig{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #222;padding-top:4px}
  .sig small{color:#9aa0aa}.disc{font-size:10px;color:#9aa0aa}`;
  root.appendChild(style);
  const box = document.createElement("div"); box.className = "box"; root.appendChild(box);
  // Drag by header
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
export function renderPanel(s: PanelState): void {
  const r = ensure(); const box = r.querySelector(".box") as HTMLElement;
  const last20 = s.signals.slice(-20).reverse();
  box.innerHTML = `<div class="head"><b>TV Signal Lens</b><span><span class="badge">${s.source}</span> <button data-a="collapse">${collapsed ? "+" : "−"}</button></span></div>
  ${collapsed ? "" : `<div class="body">
    <div class="row"><span>${s.symbol || "—"} ${s.timeframe || ""}</span><span>${s.count} candles</span></div>
    <div class="row"><span>Last</span><b>${s.lastPrice ?? "—"}</b></div>
    <div class="row"><span>EMA${s.emaPeriod}</span><b>${s.ema?.toFixed(4) ?? "—"}</b></div>
    <div class="row"><span>Bias</span><b class="${s.bias.toLowerCase()}">${s.bias}</b></div>
    ${s.pending ? `<div class="row"><span>Pending</span><span>${s.pending}</span></div>` : ""}
    <div><b>Last signals</b><div class="grid">${last20.length ? last20.map((x) => `<div class="sig"><span class="${x.type.toLowerCase()}">${x.type}</span><span>${x.price}</span><small>${fmt(x.t)}</small><small>${x.reason}</small></div>`).join("") : "<small>No confirmed signals yet.</small>"}</div></div>
    <div class="disc">Not financial advice.</div>
  </div>`}`;
  box.querySelector('[data-a="collapse"]')?.addEventListener("click", () => { collapsed = !collapsed; renderPanel(s); });
}
export function hidePanel(): void { host?.remove(); host = null; root = null; }
