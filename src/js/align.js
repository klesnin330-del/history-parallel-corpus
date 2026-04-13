// Автовыравнивание witness -> master на уровне сегментов (строки).
// Возвращает mapping: array length masterCount, где mapping[i] = индекс в witnessSegments или null.

export async function alignWitnessToMaster(masterSegs, witnessSegs) {
  const n = masterSegs.length;
  const m = witnessSegs.length;

  // Если слишком большие, используем быстрый greedy
  if (n * m > 60000) {
    return greedyAlign(masterSegs, witnessSegs);
  }

  // DP глобальное выравнивание (Needleman-Wunsch)
  const gap = 0.65; // штраф за пропуск
  const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const bt = Array.from({ length: n + 1 }, () => new Int8Array(m + 1)); // 1=diag,2=up,3=left

  for (let i = 1; i <= n; i++) {
    dp[i][0] = dp[i - 1][0] + gap;
    bt[i][0] = 2;
  }
  for (let j = 1; j <= m; j++) {
    dp[0][j] = dp[0][j - 1] + gap;
    bt[0][j] = 3;
  }

  for (let i = 1; i <= n; i++) {
    const a = norm(masterSegs[i - 1].text);
    for (let j = 1; j <= m; j++) {
      const b = norm(witnessSegs[j - 1].text);

      const sim = similarity(a, b);        // 0..1
      const costMatch = (1.0 - sim);       // 0..1

      const diag = dp[i - 1][j - 1] + costMatch;
      const up = dp[i - 1][j] + gap;       // пропуск в witness
      const left = dp[i][j - 1] + gap;     // пропуск в master

      let best = diag;
      let dir = 1;
      if (up < best) { best = up; dir = 2; }
      if (left < best) { best = left; dir = 3; }

      dp[i][j] = best;
      bt[i][j] = dir;
    }
  }

  // backtrack
  const mapping = Array(n).fill(null);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const dir = bt[i][j];
    if (dir === 1) {
      // match i-1 with j-1
      mapping[i - 1] = j - 1;
      i--; j--;
    } else if (dir === 2) {
      // master has gap (no witness)
      mapping[i - 1] = null;
      i--;
    } else {
      // witness gap
      j--;
    }
  }

  return mapping;
}

function greedyAlign(masterSegs, witnessSegs) {
  const mapping = Array(masterSegs.length).fill(null);
  let j = 0;

  for (let i = 0; i < masterSegs.length; i++) {
    const a = norm(masterSegs[i].text);
    let bestJ = null;
    let best = -1;

    // окно поиска
    const start = Math.max(0, j - 3);
    const end = Math.min(witnessSegs.length - 1, j + 12);

    for (let k = start; k <= end; k++) {
      const b = norm(witnessSegs[k].text);
      const s = similarity(a, b);
      if (s > best) { best = s; bestJ = k; }
    }

    if (bestJ !== null && best > 0.20) {
      mapping[i] = bestJ;
      j = bestJ + 1;
    } else {
      mapping[i] = null;
    }
  }
  return mapping;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  // ограничим длину, чтобы DP не тормозил
  const aa = a.slice(0, 240);
  const bb = b.slice(0, 240);

  const d = levenshtein(aa, bb);
  const maxLen = Math.max(aa.length, bb.length);
  return maxLen === 0 ? 1 : (1 - d / maxLen);
}

function levenshtein(a, b) {
  const n = a.length, m = b.length;
  if (n === 0) return m;
  if (m === 0) return n;

  const prev = new Uint16Array(m + 1);
  const curr = new Uint16Array(m + 1);

  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      const x = prev[j] + 1;
      const y = curr[j - 1] + 1;
      const z = prev[j - 1] + cost;
      curr[j] = Math.min(x, y, z);
    }
    prev.set(curr);
  }
  return prev[m];
}