let tooltip = null;
let hideTimer = null;

document.addEventListener("dblclick", (e) => {
  if (tooltip && tooltip.contains(e.target)) return;

  const word = cleanWord(window.getSelection().toString());
  if (!word || word.length > 45 || /\s/.test(word)) return; // single words only

  showTooltip(word, e.clientX, e.clientY);
});

document.addEventListener("mousedown", (e) => {
  if (tooltip && !tooltip.contains(e.target)) removeTooltip();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") removeTooltip();
});

function cleanWord(raw) {
  return raw
    .trim()
    .replace(/[^\p{L}\p{M}'’\-]/gu, "") // keep letters/marks only
    .replace(/^['’\-]+|['’\-]+$/g, ""); // trim stray punctuation
}

function showTooltip(word, x, y) {
  removeTooltip();

  tooltip = document.createElement("div");
  tooltip.className = "wc-tooltip";
  tooltip.innerHTML = `
    <div class="wc-word"></div>
    <div class="wc-translation">Translating…</div>
    <div class="wc-actions">
      <button class="wc-save">💾 Save</button>
      <button class="wc-cancel">Cancel</button>
    </div>`;
  tooltip.querySelector(".wc-word").textContent = word;
  document.body.appendChild(tooltip);

  // Position near the cursor, clamped to the viewport
  const pad = 8;
  tooltip.style.left =
    Math.max(pad, Math.min(x, innerWidth - tooltip.offsetWidth - pad)) + "px";
  tooltip.style.top =
    Math.max(pad, Math.min(y + 14, innerHeight - tooltip.offsetHeight - pad)) +
    "px";

  tooltip.querySelector(".wc-save").addEventListener("click", () => {
    const t = tooltip.querySelector(".wc-translation");
    saveWord(word, t.dataset.translation || "", t.dataset.lang || "", t);
  });
  tooltip.querySelector(".wc-cancel").addEventListener("click", removeTooltip);

  chrome.runtime.sendMessage({ type: "translate", word }, (res) => {
    if (!tooltip) return;
    const el = tooltip.querySelector(".wc-translation");
    if (chrome.runtime.lastError || !res?.ok) {
      el.textContent = "⚠ Translation failed";
      return;
    }
    el.textContent = `→ ${res.translation}`;
    el.dataset.translation = res.translation;
    el.dataset.lang = res.lang;
  });

  hideTimer = setTimeout(removeTooltip, 15000);
}

function saveWord(word, translation, lang, statusEl) {
  chrome.storage.sync.get({ words: [] }, ({ words }) => {
    const dup = words.some(
      (w) =>
        w.word.toLowerCase() === word.toLowerCase() &&
        (w.translation || "") === translation,
    );
    if (dup) {
      statusEl.textContent = "Already in your list";
      return;
    }
    words.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      word,
      translation,
      lang,
      url: location.href,
      savedAt: new Date().toISOString(),
    });
    chrome.storage.sync.set({ words }, () => {
      if (statusEl.isConnected) statusEl.textContent = "✓ Saved!";
      setTimeout(removeTooltip, 700);
    });
  });
}

function removeTooltip() {
  clearTimeout(hideTimer);
  tooltip?.remove();
  tooltip = null;
}
