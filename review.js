// ---------- Tuning ----------
const SESSION_SIZE = 20; // cards per session
const MAX_FAIL_REPEATS = 3; // max re-shows of a failed card within one session
// Leitner boxes 1..6 → minutes until next review: 10min, 1d, 3d, 7d, 14d, 30d
const BOX_MINUTES = [10, 1440, 4320, 10080, 20160, 43200];

const $ = (s) => document.querySelector(s);
const isNew = (c) => c.box === undefined;
const isDue = (c, now) => isNew(c) || (c.due || 0) <= now;

let queue = [],
  idx = 0,
  revealed = false,
  mode = "due";
const stats = { reviewed: 0, again: 0, good: 0, easy: 0 };

// Weighted sampling without replacement (Efraimidis–Spirakis):
// heavier words are far more likely to be picked for practice.
function weightedSample(cards, k) {
  return cards
    .map((c) => ({
      c,
      key: Math.pow(Math.random(), 1 / Math.max(c.weight || 1, 0.2)),
    }))
    .sort((a, b) => b.key - a.key)
    .slice(0, k)
    .map((x) => x.c);
}

function buildQueue(words, now) {
  if (mode === "practice") return weightedSample(words, SESSION_SIZE);
  // Due cards (incl. unseen), hardest-first
  return words
    .filter((c) => isDue(c, now))
    .sort(
      (a, b) =>
        (b.weight || 1) - (a.weight || 1) || (a.due || 0) - (b.due || 0),
    )
    .slice(0, SESSION_SIZE);
}

function fmtMins(mins) {
  if (mins < 60) return Math.max(1, Math.round(mins)) + " min";
  if (mins < 1440) return Math.round(mins / 60) + " h";
  return Math.round(mins / 1440) + " d";
}

function renderCard() {
  const card = queue[idx];
  revealed = false;
  $("#progressText").textContent = `${idx + 1} / ${queue.length}`;
  $("#progressBar").style.width = (idx / queue.length) * 100 + "%";

  $("#front").textContent = card.word;
  $("#meta").textContent = card.lang ? "from " + card.lang : "";
  $("#back").textContent = card.translation || "(no translation saved)";
  $("#answer").classList.add("hidden");
  $("#grades").classList.add("hidden");
  $("#showBtn").classList.remove("hidden");

  const box = card.box || 0; // 0 = never reviewed
  $("#pAgain").textContent = "1 min";
  $("#pGood").textContent = fmtMins(BOX_MINUTES[Math.min(box + 1, 6) - 1]);
  $("#pEasy").textContent = fmtMins(
    Math.round(BOX_MINUTES[Math.min(box + 2, 6) - 1] * 1.3),
  );
}

function reveal() {
  revealed = true;
  $("#answer").classList.remove("hidden");
  $("#grades").classList.remove("hidden");
  $("#showBtn").classList.add("hidden");
}

function grade(g) {
  if (!revealed) return;
  const card = queue[idx];
  const now = Date.now();
  let mins;

  if (g === "again") {
    // Fail: back to box 1, weight spikes → surfaces more often in the future
    card.box = 1;
    card.weight = Math.min((card.weight || 1) * 2 + 0.5, 20);
    card.streak = 0;
    card.wrong = (card.wrong || 0) + 1;
    card.failsThisSession = (card.failsThisSession || 0) + 1;
    mins = 1;
    stats.again++;
    // Recall reinforcement: re-show shortly within this session
    if (card.failsThisSession < MAX_FAIL_REPEATS) {
      queue.splice(Math.min(idx + 3, queue.length), 0, card);
    }
  } else {
    const bump = g === "easy" ? 2 : 1;
    card.box = Math.min((card.box || 0) + bump, 6);
    card.weight = Math.max(
      (card.weight || 1) * (g === "easy" ? 0.5 : 0.75),
      0.25,
    );
    card.streak = (card.streak || 0) + 1;
    card.correct = (card.correct || 0) + 1;
    card.failsThisSession = 0;
    mins = Math.round(
      BOX_MINUTES[card.box - 1] *
        (g === "easy" ? 1.3 : 1) *
        (0.95 + Math.random() * 0.1),
    );
    stats[g]++;
  }

  card.due = now + mins * 60000;
  stats.reviewed++;
  persistCard(card);
  idx++;
  idx >= queue.length ? showSummary() : renderCard();
}

function persistCard(updated) {
  chrome.storage.sync.get({ words: [] }, ({ words }) => {
    const i = words.findIndex((w) => w.id === updated.id);
    if (i === -1) return;
    const { failsThisSession, ...clean } = updated; // session-only field
    words[i] = { ...words[i], ...clean };
    chrome.storage.sync.set({ words });
  });
}

function show(id) {
  ["card", "empty", "noDue", "summary"].forEach((s) =>
    $("#" + s).classList.toggle("hidden", s !== id),
  );
}

function showSummary() {
  $("#progressBar").style.width = "100%";
  show("summary");
  const graded = stats.again + stats.good + stats.easy;
  $("#sumReviewed").textContent = stats.reviewed;
  $("#sumAcc").textContent =
    (graded ? Math.round(((stats.good + stats.easy) / graded) * 100) : 0) + "%";
  $("#sumAgain").textContent = stats.again;
}

// ---------- init ----------
chrome.storage.sync.get({ words: [] }, ({ words }) => {
  mode =
    new URLSearchParams(location.search).get("mode") === "practice"
      ? "practice"
      : "due";
  $("#modeLabel").textContent =
    mode === "practice" ? "Practice · weighted" : "Review · due cards";

  if (!words.length) return show("empty");
  queue = buildQueue(words, Date.now());
  if (!queue.length) return show("noDue");
  show("card");
  renderCard();
});

$("#showBtn").onclick = reveal;
$("#gAgain").onclick = () => grade("again");
$("#gGood").onclick = () => grade("good");
$("#gEasy").onclick = () => grade("easy");
$("#closeBtn").onclick = () => window.close();
$("#againBtn").onclick = () => location.reload();
$("#doneBtn").onclick = () => window.close();
$("#practiceAnyway").onclick = () => {
  location.search = "?mode=practice";
};

// Keyboard: space = reveal, 1/2/3 = grade
document.addEventListener("keydown", (e) => {
  if ($("#card").classList.contains("hidden")) return;
  if ((e.code === "Space" || e.code === "Enter") && !revealed) {
    e.preventDefault();
    reveal();
  } else if (revealed && e.key === "1") grade("again");
  else if (revealed && e.key === "2") grade("good");
  else if (revealed && e.key === "3") grade("easy");
});
