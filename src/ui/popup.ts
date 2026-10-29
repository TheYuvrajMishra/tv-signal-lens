import { strategies } from "../strategies/index";
const $ = (id: string) => document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
const strategyEl = $("strategy") as HTMLSelectElement;
for (const s of strategies) { const o = document.createElement("option"); o.value = s.id; o.textContent = s.name; strategyEl.appendChild(o); }
chrome.storage.sync.get(["strategy", "emaPeriod", "sound", "panel", "notify"], (v) => {
  strategyEl.value = (v.strategy as string) ?? strategies[0].id;
  ($("emaPeriod") as HTMLInputElement).value = String((v.emaPeriod as number) ?? 44);
  ($("sound") as HTMLInputElement).checked = Boolean(v.sound);
  ($("panel") as HTMLInputElement).checked = v.panel !== false;
  ($("notify") as HTMLInputElement).checked = Boolean(v.notify);
});
document.getElementById("save")?.addEventListener("click", () => {
  const period = Math.min(500, Math.max(2, Number(($("emaPeriod") as HTMLInputElement).value) || 44));
  chrome.storage.sync.set({
    strategy: strategyEl.value, emaPeriod: period,
    sound: ($("sound") as HTMLInputElement).checked,
    panel: ($("panel") as HTMLInputElement).checked,
    notify: ($("notify") as HTMLInputElement).checked,
  }, () => { const st = document.getElementById("status"); if (st) st.textContent = "Saved."; });
});
