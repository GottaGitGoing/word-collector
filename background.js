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

// ---------- Offscreen clipboard helper ----------
async function ensureOffscreenDocument() {
  if (chrome.offscreen.hasDocument) {
    if (await chrome.offscreen.hasDocument()) return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["CLIPBOARD"],
      justification: "Read text from the clipboard",
    });
  } catch (e) {
    // Older Chrome without hasDocument(): "already created" is fine
    if (!/single offscreen|already/i.test(String(e?.message || e))) throw e;
  }
}

async function readClipboard() {
  await ensureOffscreenDocument();
  const res = await chrome.runtime.sendMessage({ type: "read-clipboard" });
  if (!res?.ok) throw new Error(res?.error || "Clipboard read failed");
  return res.text;
}

// ---------- Clipboard hotkey ----------
function flashBadge(text) {
  chrome.action.setBadgeBackgroundColor({ color: "#2f7d4f" });
  chrome.action.setBadgeText({ text });
  setTimeout(updateBadge, 2500); // restore due-count badge
}

function notify(title, message) {
  chrome.notifications.create(
    { type: "basic", iconUrl: "icon128.png", title, message },
    () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[Word Collector] notification skipped:",
          chrome.runtime.lastError.message,
        );
      }
    },
  );
}

chrome.commands.onCommand.addListener(async (command) => {
  console.log("[Word Collector] command received:", command);
  if (command !== "save-clipboard") return;

  try {
    const text = await readClipboard();
    const word = String(text)
      .trim()
      .replace(/[^\p{L}\p{M}'’\-]/gu, "")
      .replace(/^['’\-]+|['’\-]+$/g, "");

    if (!word || word.length > 45 || /\s/.test(word)) {
      flashBadge("✕");
      notify(
        "Word Collector",
        "No valid word in clipboard — highlight a word and press Ctrl+C first.",
      );
      return;
    }

    const res = await translateToEnglish(word);
    if (!res?.translation) {
      flashBadge("✕");
      notify("Word Collector", "Translation failed.");
      return;
    }

    const { words = [] } = await chrome.storage.sync.get({ words: [] });
    if (words.some((w) => w.word.toLowerCase() === word.toLowerCase())) {
      flashBadge("=");
      notify("Word Collector", `"${word}" is already in your list.`);
      return;
    }

    words.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      word,
      translation: res.translation,
      lang: res.lang,
      url: "clipboard",
      savedAt: new Date().toISOString(),
    });
    await chrome.storage.sync.set({ words });

    flashBadge("✓");
    notify("Word saved!", `${word} → ${res.translation}`);
  } catch (err) {
    console.error("[Word Collector] hotkey save failed:", err);
    flashBadge("!");
    notify("Word Collector", "Could not read the clipboard.");
  }
});
