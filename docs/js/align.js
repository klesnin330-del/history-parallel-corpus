import { tokenSimilarity } from "./variants.js";

export function alignTokens(master, witness) {
  const n = master.length, m = witness.length;
  if (n === 0) return [];
  if (m === 0) return Array(n).fill(null);

  const GAP = 0.65;
  const dp = Array.from({ length: n + 1 }, () => new Float32Array(m + 1));
  const bt = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1=diag, 2=up, 3=left

  for (let i = 1; i <= n; i++) { dp[i][0] = dp[i-1][0] + GAP; bt[i][0] = 2; }
  for (let j = 1; j <= m; j++) { dp[0][j] = dp[0][j-1] + GAP; bt[0][j] = 3; }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = 1.0 - tokenSimilarity(master[i-1], witness[j-1]);
      const diag = dp[i-1][j-1] + cost;
      const up = dp[i-1][j] + GAP;
      const left = dp[i][j-1] + GAP;
      if (diag <= up && diag <= left) { dp[i][j] = diag; bt[i][j] = 1; }
      else if (up <= left) { dp[i][j] = up; bt[i][j] = 2; }
      else { dp[i][j] = left; bt[i][j] = 3; }
    }
  }

  const mapping = Array(n).fill(null);
  let i = n, j = m;
  while (i > 0 || j > 0) {
    const dir = bt[i][j];
    if (dir === 1) { mapping[i-1] = j-1; i--; j--; }
    else if (dir === 2) { i--; }
    else { j--; }
  }
  return mapping;
}

export function shiftMapping(mapping, idx, delta, witnessLen) {
  const curr = mapping[idx];
  let base = curr !== null ? curr : idx;
  let next = base + delta;
  if (next < 0) next = 0;
  if (next >= witnessLen) next = witnessLen - 1;
  mapping[idx] = next;
}