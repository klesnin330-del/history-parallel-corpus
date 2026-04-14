import { tokenSimilarity } from "./variants.js";

export function alignWordsToMaster(masterWords, witnessWords) {
  const n = masterWords.length;
  const m = witnessWords.length;
  if (n === 0) return [];
  if (m === 0) return Array(n).fill(null);

  const cells = (n + 1) * (m + 1);
  if (cells > 4_500_000) return greedyAlign(masterWords, witnessWords);

  const GAP = 0.70;

  const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const bt = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 diag,2 up,3 left

  for (let i = 1; i <= n; i++) { dp[i][0] = dp[i - 1][0] + GAP; bt[i][0] = 2; }
  for (let j = 1; j <= m; j++) { dp[0][j] = dp[0][j - 1] + GAP; bt[0][j] = 3; }

  function matchCost(a, b) {
    const sim = tokenSimilarity(a, b);
    return 1.0 - sim;
  }

  for (let i = 1; i <= n; i++) {
    const a = masterWords[i - 1];
    for (let j = 1; j <= m; j++) {
      const b = witnessWords[j - 1];

      const diag = dp[i - 1][j - 1] + matchCost(a, b);
      const up = dp[i - 1][j] + GAP;
      const left = dp[i][j - 1] + GAP;

      let best = diag, dir = 1;
      if (up < best) { best = up; dir = 2; }
      if (left < best) { best = left; dir = 3; }

      dp[i][j] = best;
      bt[i][j] = dir;
    }
  }

  const mapping = Array(n).fill(null);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const dir = bt[i][j];
    if (dir === 1) { mapping[i - 1] = j - 1; i--; j--; }
    else if (dir === 2) { mapping[i - 1] = null; i--; }
    else { j--; }
  }

  // Постфильтр слабых совпадений
  for (let k = 0; k < mapping.length; k++) {
    const j2 = mapping[k];
    if (j2 === null || j2 === undefined) continue;

    const sim = tokenSimilarity(masterWords[k], witnessWords[j2]);

    const la = normLemma(masterWords[k].lemma);
    const lb = normLemma(witnessWords[j2].lemma);
    const lemmaEq = la && lb && la === lb;

    if (!lemmaEq && sim < 0.34) mapping[k] = null;
  }

  return mapping;
}

export function shiftMapping(mapping, masterIndex, delta, witnessLen) {
  const curr = mapping[masterIndex];

  let base = curr;
  if (base === null || base === undefined) {
    base = Math.min(Math.max(masterIndex, 0), Math.max(0, witnessLen - 1));
  }

  let next = base + delta;
  if (next < 0) next = 0;
  if (next >= witnessLen) next = witnessLen - 1;

  mapping[masterIndex] = next;
}

function greedyAlign(masterWords, witnessWords) {
  const mapping = Array(masterWords.length).fill(null);
  let j = 0;

  for (let i = 0; i < masterWords.length; i++) {
    const a = masterWords[i];
    let bestJ = null;
    let bestSim = -1;

    const start = Math.max(0, j - 10);
    const end = Math.min(witnessWords.length - 1, j + 80);

    for (let k = start; k <= end; k++) {
      const sim = tokenSimilarity(a, witnessWords[k]);
      if (sim > bestSim) { bestSim = sim; bestJ = k; }
    }

    if (bestJ !== null && bestSim >= 0.50) {
      mapping[i] = bestJ;
      j = bestJ + 1;
    } else {
      mapping[i] = null;
    }
  }

  return mapping;
}

function normLemma(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}