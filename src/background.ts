// Service worker: relays panel state / notifications only; no candle storage here.
chrome.runtime.onMessage.addListener((msg: { type?: string; title?: string; message?: string }) => {
  if (msg.type === "tvsl-notify" && msg.title && msg.message) {
    chrome.notifications.create({ type: "basic", iconUrl: "icon.png", title: msg.title, message: msg.message });
  }
});
