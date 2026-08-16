chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "translate") return;
  translateToEnglish(msg.word)
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // keep channel open for the async response
});

async function translateToEnglish(word) {
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=" +
    encodeURIComponent(word);
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return {
    translation: (data[0] || [])
      .map((seg) => seg[0])
      .join("")
      .trim(),
    lang: data[2] || "auto",
  };
}

// ---------- Due-count badge ----------
chrome.storage.onChanged.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);
chrome.runtime.onStartup.addListener(updateBadge);

async function updateBadge() {
  const { words = [] } = await chrome.storage.sync.get({ words: [] });
  const now = Date.now();
  const due = words.filter(
    (w) => w.box === undefined || (w.due || 0) <= now,
  ).length;
  await chrome.action.setBadgeText({
    text: due ? String(Math.min(due, 99)) : "",
  });
  await chrome.action.setBadgeBackgroundColor({ color: "#f5a623" });
}
