const $ = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
const keys = ["strategy", "emaPeriod", "sound", "panel", "notify", "draw", "rr", "slMode", "atrPeriod", "atrMult", "swingLookback", "spread", "maxDrawn", "dashboardFeed", "dashboardUrl"];
chrome.storage.sync.get(keys, (v) => {
  ($("strategy") as HTMLSelectElement).value = (v.strategy as string) ?? "ema44";
  ($("emaPeriod") as HTMLInputElement).value = String((v.emaPeriod as number) ?? 44);
  ($("sound") as HTMLInputElement).checked = Boolean(v.sound);
  ($("panel") as HTMLInputElement).checked = v.panel !== false;
  ($("notify") as HTMLInputElement).checked = Boolean(v.notify);
  ($("draw") as HTMLInputElement).checked = v.draw !== false;
  ($("rr") as HTMLInputElement).value = String((v.rr as number) ?? 2);
  ($("slMode") as HTMLSelectElement).value = (v.slMode as string) ?? "atr";
  ($("atrPeriod") as HTMLInputElement).value = String((v.atrPeriod as number) ?? 14);
  ($("atrMult") as HTMLInputElement).value = String((v.atrMult as number) ?? 1.5);
  ($("swingLookback") as HTMLInputElement).value = String((v.swingLookback as number) ?? 5);
  ($("spread") as HTMLInputElement).value = String((v.spread as number) ?? 0);
  ($("maxDrawn") as HTMLInputElement).value = String((v.maxDrawn as number) ?? 15);
  ($("dashboardFeed") as HTMLInputElement).checked = v.dashboardFeed !== false;
  ($("dashboardUrl") as HTMLInputElement).value = (v.dashboardUrl as string) ?? "http://localhost:3000";
});
document.getElementById("save")?.addEventListener("click", () => {
  chrome.storage.sync.set({
    strategy: ($("strategy") as HTMLSelectElement).value,
    emaPeriod: Math.min(500, Math.max(2, Number(($("emaPeriod") as HTMLInputElement).value) || 44)),
    sound: ($("sound") as HTMLInputElement).checked,
    panel: ($("panel") as HTMLInputElement).checked,
    notify: ($("notify") as HTMLInputElement).checked,
    draw: ($("draw") as HTMLInputElement).checked,
    rr: Number(($("rr") as HTMLInputElement).value) || 2,
    slMode: ($("slMode") as HTMLSelectElement).value,
    atrPeriod: Number(($("atrPeriod") as HTMLInputElement).value) || 14,
    atrMult: Number(($("atrMult") as HTMLInputElement).value) || 1.5,
    swingLookback: Number(($("swingLookback") as HTMLInputElement).value) || 5,
    spread: Number(($("spread") as HTMLInputElement).value) || 0,
    maxDrawn: Math.min(50, Math.max(1, Number(($("maxDrawn") as HTMLInputElement).value) || 15)),
    dashboardFeed: ($("dashboardFeed") as HTMLInputElement).checked,
    dashboardUrl: (($("dashboardUrl") as HTMLInputElement).value || "http://localhost:3000").replace(/\/$/, ""),
  }, () => { const st = document.getElementById("status"); if (st) st.textContent = "Saved."; });
});
document.getElementById("clearDrawings")?.addEventListener("click", () => {
  chrome.storage.sync.set({ clearDrawingsAt: Date.now() }, () => {
    const st = document.getElementById("status"); if (st) st.textContent = "Drawings cleared.";
  });
});
