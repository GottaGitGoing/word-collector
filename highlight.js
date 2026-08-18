// Highlights saved words on the page, colored by mastery level (Leitner box).
(() => {
  let wordMap = new Map(); // lowercased word -> saved entry
  let wordRegex = null;
  let scanTimer = null;
  let rebuildTimer = null;
  let pendingRoots = [];

  const SKIP =
    'script,style,noscript,textarea,select,iframe,canvas,svg,code,pre,.wc-tooltip,.wc-hl,[contenteditable="true"]';

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function buildRegex() {
    if (!wordMap.size) {
      wordRegex = null;
      return;
    }
    const alts = [...wordMap.keys()]
      .sort((a, b) => b.length - a.length)
      .map(escRe)
      .join("|");
    wordRegex = new RegExp(
      `(?<![\\p{L}\\p{M}])(?:${alts})(?![\\p{L}\\p{M}])`,
      "giu",
    );
  }

  function masteryClass(entry) {
    const box = entry?.box;
    return box === undefined ? "wc-m0" : "wc-m" + Math.min(Math.max(box, 1), 6);
  }

  function wrapMatches(node) {
    const text = node.nodeValue;
    if (!text || !wordRegex) return;
    wordRegex.lastIndex = 0;
    let m,
      lastIdx = 0,
      found = false;
    const frag = document.createDocumentFragment();
    while ((m = wordRegex.exec(text))) {
      found = true;
      if (m.index > lastIdx)
        frag.appendChild(document.createTextNode(text.slice(lastIdx, m.index)));
      const entry = wordMap.get(m[0].toLowerCase());
      const span = document.createElement("span");
      span.className = "wc-hl " + masteryClass(entry);
      span.textContent = m[0];
      if (entry?.translation) {
        span.title = `${entry.translation} · ${entry.box === undefined ? "new word" : "box " + entry.box}`;
      }
      frag.appendChild(span);
      lastIdx = m.index + m[0].length;
    }
    if (!found) return;
    if (lastIdx < text.length)
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    node.parentNode.replaceChild(frag, node);
  }

  function scan(root) {
    if (!wordRegex || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest(SKIP)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(wrapMatches);
  }

  function clearHighlights() {
    document.querySelectorAll("span.wc-hl").forEach((span) => {
      const parent = span.parentNode;
      parent.replaceChild(document.createTextNode(span.textContent), span);
      parent.normalize();
    });
  }

  function rebuild(words) {
    wordMap = new Map(words.map((w) => [w.word.toLowerCase(), w]));
    buildRegex();
    clearHighlights();
    if (document.body) scan(document.body);
  }

  // Debounce: grading a card in the review tab fires storage changes rapidly
  function scheduleRebuild(words) {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => rebuild(words), 300);
  }

  // Infinite scroll / SPAs: scan newly added subtrees (debounced)
  const observer = new MutationObserver((muts) => {
    let added = false;
    for (const mut of muts) {
      for (const n of mut.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList.contains("wc-hl") || n.classList.contains("wc-tooltip"))
          continue;
        if (n.parentElement?.closest(".wc-hl,.wc-tooltip")) continue;
        pendingRoots.push(n);
        added = true;
      }
    }
    if (added) {
      const roots = pendingRoots;
      pendingRoots = [];
      clearTimeout(scanTimer);
      scanTimer = setTimeout(() => {
        roots
          .filter(
            (r) =>
              r.isConnected && !roots.some((o) => o !== r && o.contains(r)),
          )
          .forEach((r) => scan(r));
      }, 250);
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Init + live sync
  chrome.storage.sync.get({ words: [] }, ({ words }) => rebuild(words));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.words)
      scheduleRebuild(changes.words.newValue || []);
  });
})();
