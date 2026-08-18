chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "translate") return;
  translateToEnglish(msg.word)
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((err) => sendResponse({ ok: false, error: String(err) }));
  return true; // keep channel open for the async response
});

async function googleTranslate(word) {
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

async function translateToEnglish(word) {
  try {
    return await googleTranslate(word);
  } catch (e) {
    console.warn("Google failed, trying MyMemory:", e);
    return await myMemory(word);
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
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${SOURCE_LANG}|en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.responseStatus !== 200)
    throw new Error(data.responseDetails || "MyMemory error");
  return { translation: data.responseData.translatedText, lang: SOURCE_LANG };
}
