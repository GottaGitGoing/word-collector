const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const countEl = document.getElementById("count");
let words = [];

chrome.storage.sync.get({ words: [] }, (data) => {
  words = data.words;
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.words) {
    words = changes.words.newValue || [];
    render();
  }
});

searchEl.addEventListener("input", render);

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const filtered = words.filter(
    (w) =>
      !q ||
      w.word.toLowerCase().includes(q) ||
      (w.translation || "").toLowerCase().includes(q),
  );

  countEl.textContent = `${words.length} ${words.length === 1 ? "word" : "words"}`;
  listEl.replaceChildren();

  if (!filtered.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = words.length
      ? "No matches."
      : "Double-click any word on a page to save it.";
    listEl.appendChild(li);
    return;
  }

  for (const w of filtered) {
    const li = document.createElement("li");
    li.className = "item";

    const wordEl = document.createElement("div");
    wordEl.className = "word";
    wordEl.textContent = w.word;
    if (w.lang) {
      const badge = document.createElement("span");
      badge.className = "lang";
      badge.textContent = w.lang;
      wordEl.appendChild(badge);
    }

    const trEl = document.createElement("div");
    trEl.className = "translation";
    trEl.textContent = w.translation || "—";

    const del = document.createElement("button");
    del.className = "delete";
    del.textContent = "✕";
    del.title = "Remove";
    del.onclick = () =>
      chrome.storage.sync.set({ words: words.filter((x) => x.id !== w.id) });

    li.append(wordEl, trEl, del);
    listEl.appendChild(li);
  }
}

document.getElementById("export").addEventListener("click", () => {
  if (!words.length) return;
  const esc = (s) => `"${String(s ?? "").replaceAll('"', '""')}"`;
  const csv = [
    "word,translation,language,url,date",
    ...words.map((w) =>
      [w.word, w.translation, w.lang, w.url, w.savedAt].map(esc).join(","),
    ),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "my-words.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});
