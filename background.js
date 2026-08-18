chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "translate") return;
  translateToEnglish(msg.word, msg.from)
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((err) => {
      console.warn("[Word Collector] translation failed:", err);
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
  return true; // keep channel open for async respn?
});

async function googleTranslate(word, from) {
  const sl = from && from !== "auto" ? from : "auto";
  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" +
    sl +
    "&tl=en&dt=t&q=" +
    encodeURIComponent(word);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    const translation = (data[0] || [])
      .map((seg) => seg[0])
      .join("")
      .trim();
    if (!translation) throw new Error("empty response");
    return { translation, lang: sl === "auto" ? data[2] || "auto" : sl };
  } finally {
    clearTimeout(timer);
  }
}

async function translateToEnglish(word, from) {
  try {
    return await googleTranslate(word, from);
  } catch (e) {
    if (typeof myMemory === "function") {
      console.warn("[Word Collector] Google failed, trying MyMemory:", e);
      return await myMemory(word, from);
    }
    throw e;
  }
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

// Set your source language: es, fr, de, tr, pt, ja, ...
const SOURCE_LANG = "fr";

async function myMemory(word) {
  const src = from && from !== "auto" ? from : SOURCE_LANG;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${src}|en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.responseStatus !== 200)
    throw new Error(data.responseDetails || "MyMemory error");
  return { translation: data.responseData.translatedText, lang: src };
}
