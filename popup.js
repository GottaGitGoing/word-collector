const listEl = document.getElementById("list");
const searchEl = document.getElementById("search");
const countEl = document.getElementById("count");
const dueInfoEl = document.getElementById("dueInfo");
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

const openReview = (mode) =>
  chrome.tabs.create({
    url: chrome.runtime.getURL("review.html" + (mode ? "?mode=" + mode : "")),
  });

document.getElementById("reviewDue").onclick = () => openReview("due");
document.getElementById("practice").onclick = () => {
  if (words.length) openReview("practice");
};

function countDue() {
  const now = Date.now();
  return words.filter((w) => w.box === undefined || (w.due || 0) <= now).length;
}

function render() {
  const due = countDue();
  dueInfoEl.replaceChildren();
  const b = document.createElement("b");
  b.textContent = due;
  dueInfoEl.append(b, " due for review");
  document.getElementById("practice").disabled = !words.length;

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

    if (w.box !== undefined) {
      const box = document.createElement("span");
      box.className = "box";
      box.textContent = "B" + w.box;
      box.title = `${w.correct || 0} correct · ${w.wrong || 0} missed · weight ${(w.weight || 1).toFixed(1)}`;
      wordEl.appendChild(box);
    }
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
    "word,translation,language,box,weight,correct,wrong,url,date",
    ...words.map((w) =>
      [
        w.word,
        w.translation,
        w.lang,
        w.box ?? "",
        w.weight ?? "",
        w.correct || 0,
        w.wrong || 0,
        w.url,
        w.savedAt,
      ]
        .map(esc)
        .join(","),
    ),
  ].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "my-words.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});
