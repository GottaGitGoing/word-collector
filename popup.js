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

// Changes for language selection on popup
const LANGS = [
  ["auto", "🌐 Auto-detect"],
  ["nl", "Dutch"],
  ["fr", "French"],
  ["de", "German"],
  ["es", "Spanish"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["en", "English"],
  ["sv", "Swedish"],
  ["da", "Danish"],
  ["no", "Norwegian"],
  ["fi", "Finnish"],
  ["pl", "Polish"],
  ["cs", "Czech"],
  ["ro", "Romanian"],
  ["hu", "Hungarian"],
  ["tr", "Turkish"],
  ["ru", "Russian"],
  ["uk", "Ukrainian"],
  ["el", "Greek"],
  ["he", "Hebrew"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["id", "Indonesian"],
  ["vi", "Vietnamese"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
];
const langLabel = (code) => LANGS.find(([c]) => c === code)?.[1] || code;

let langEditing = null;
let statusTimer = null;
function setStatus(msg) {
  clearTimeout(statusTimer);
  countEl.textContent = msg;
  statusTimer = setTimeout(() => {
    countEl.textContent = `${words.length} ${words.length === 1 ? "word" : "words"}`;
  }, 3000);
}

function editLang(w, badgeEl) {
  if (langEditing) return;
  langEditing = w.id;

  const select = document.createElement("select");
  select.className = "langEdit";
  const current = w.lang || "auto";
  const hasCurrent = LANGS.some(([c]) => c === current);
  for (const [code, name] of LANGS) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    opt.selected = hasCurrent ? code === current : code === "auto";
    select.add(opt);
  }
  if (!hasCurrent && current !== "auto") {
    const opt = document.createElement("option");
    opt.value = current;
    opt.textContent = current;
    opt.selected = true;
    select.add(opt);
  }

  badgeEl.replaceWith(select);
  select.focus();
  select.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      langEditing = null;
      render();
    }
  });
  select.addEventListener("blur", () => {
    if (langEditing === w.id) {
      langEditing = null;
      render();
    }
  });
  select.addEventListener("change", async () => {
    langEditing = null;
    select.disabled = true;
    await applyLangChange(w.id, select.value);
  });
}

async function applyLangChange(id, lang) {
  const entry = words.find((x) => x.id === id);
  if (!entry) return;
  setStatus("Re-translating…");

  let res;
  try {
    res = await chrome.runtime.sendMessage({
      type: "translate",
      word: entry.word,
      from: lang === "auto" ? undefined : lang,
    });
  } catch (e) {
    res = { ok: false, error: String(e) };
  }

  chrome.storage.sync.get({ words: [] }, ({ words: fresh }) => {
    const i = fresh.findIndex((x) => x.id === id);
    if (i === -1) return;
    const updated = { ...fresh[i] };
    updated.lang =
      lang === "auto" ? (res?.ok && res.lang ? res.lang : "auto") : lang;
    if (res?.ok && res.translation) updated.translation = res.translation;
    fresh[i] = updated;
    chrome.storage.sync.set({ words: fresh }); // triggers render() via onChanged
  });

  setStatus(
    res?.ok
      ? `Tag → ${langLabel(lang)} · translation updated`
      : `Tag → ${langLabel(lang)}, but re-translation failed`,
  );
}
// end changes for lang selection on popup

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
    li.dataset.id = w.id; // ?

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
      const badge = document.createElement("button");
      badge.className = "lang";
      badge.textContent = w.lang || "?";
      badge.title = "Change language tag";
      badge.addEventListener("click", () => editLang(w, badge));
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
