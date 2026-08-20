// ========== Translation API ==========
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type !== "translate") return;
  translateToEnglish(msg.word, msg.from)
    .then((data) => sendResponse({ ok: true, ...data }))
    .catch((err) => {
      console.warn("[Word Collector] translation failed:", err);
      sendResponse({ ok: false, error: err?.message || String(err) });
    });
  return true; // keep channel open for async response
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

// Set your source language: es, fr, de, tr, pt, ja, ...
const SOURCE_LANG = "fr";

// FIX 1: Added 'from' parameter here
async function myMemory(word, from) {
  const src = from && from !== "auto" ? from : SOURCE_LANG;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${src}|en`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (data.responseStatus !== 200)
    throw new Error(data.responseDetails || "MyMemory error");
  return { translation: data.responseData.translatedText, lang: src };
}

async function translateToEnglish(word, from) {
  try {
    return await googleTranslate(word, from);
  } catch (e) {
    console.warn("[Word Collector] Google failed, trying MyMemory:", e);
    return await myMemory(word, from);
  }
}

// ========== Due-count badge ==========
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

// ========== Clipboard hotkey UI Helpers ==========
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

// ========== Clipboard Hotkey (Alt+S) ==========
chrome.commands.onCommand.addListener(async (command) => {
  console.log("[Word Collector] command received:", command);
  if (command !== "save-clipboard") return;

  // FIX 2: Wrapped the ENTIRE hotkey logic in a single try/catch block
  // so we don't get the unmatched catch syntax error.
  try {
    // 1. Robustly get the active tab (fallback handles the global hotkey "blur" effect)
    let tab = null;
    let tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    tab = tabs[0];

    if (!tab) {
      const lastWindow = await chrome.windows.getLastFocused({
        populate: true,
      });
      if (lastWindow?.tabs) tab = lastWindow.tabs.find((t) => t.active);
    }

    if (!tab) {
      const allActiveTabs = await chrome.tabs.query({ active: true });
      tab = allActiveTabs[0];
    }

    if (!tab) {
      const allWindows = await chrome.windows.getAll({ populate: true });
      if (allWindows.length > 0 && allWindows[0].tabs.length > 0) {
        tab = allWindows[0].tabs[0];
      }
    }

    if (!tab) {
      flashBadge("!");
      notify(
        "Word Collector",
        "Could not find an active tab. (Are you in Incognito?)",
      );
      console.error("[Word Collector] All tab finding methods failed.");
      return;
    }

    console.log("[Word Collector] Found tab ID:", tab.id, "URL:", tab.url);

    // Prevent injecting into browser settings pages
    if (
      tab.url &&
      (tab.url.startsWith("chrome://") ||
        tab.url.startsWith("chrome-extension://") ||
        tab.url.startsWith("edge://"))
    ) {
      flashBadge("!");
      notify(
        "Word Collector",
        "Cannot use hotkey on browser settings pages. Use the popup instead.",
      );
      return;
    }

    // 2. Inject a temporary script into the active tab to read the clipboard.
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async () => {
        try {
          return { ok: true, text: await navigator.clipboard.readText() };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      },
    });

    const clipResult = results?.[0]?.result;
    if (!clipResult?.ok) {
      flashBadge("!");
      notify(
        "Word Collector",
        "Clipboard blocked on this page. Use the popup button instead.",
      );
      console.warn(
        "[Word Collector] Clipboard read blocked:",
        clipResult?.error,
      );
      return;
    }

    const text = clipResult.text;
    const word = String(text)
      .trim()
      .replace(/[^\p{L}\p{M}'’\-]/gu, "")
      .replace(/^['’\-]+|['’\-]+$/g, "");

    if (!word || word.length > 45 || /\s/.test(word)) {
      flashBadge("✕");
      notify(
        "Word Collector",
        "No valid word in clipboard — highlight and copy a word first.",
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
      url: tab.url || "clipboard",
      savedAt: new Date().toISOString(),
    });
    await chrome.storage.sync.set({ words });

    flashBadge("✓");
    notify("Word saved!", `${word} → ${res.translation}`);
  } catch (err) {
    console.error("[Word Collector] hotkey save failed:", err);
    flashBadge("!");
    notify("Word Collector", "Hotkey save failed.");
  }
});
