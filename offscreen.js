chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "read-clipboard") return;
  navigator.clipboard
    .readText()
    .then((text) => sendResponse({ ok: true, text }))
    .catch((err) =>
      sendResponse({ ok: false, error: err?.message || String(err) }),
    );
  return true; // keep channel open for async response
});
