export function classifyAndDiff(masterText, otherText) {
  const a = String(masterText || "");
  const b = String(otherText || "");

  const types = classify(a, b);
  const html = diffHtml(a, b);
  return { types, html };
}

// --- Типы разночтений (эвристики) ---
function classify(a, b) {
  const types = new Set();
  if (!a && !b) return types;
  if (a === b) return types;

  const gA = normGraphic(a);
  const gB = normGraphic(b);

  // 1) графические: различается исходный, но совпадает после "граф-нормализации"
  if (gA === gB) {
    types.add("graphic");
    return types;
  }

  const pA = normPhonetic(a);
  const pB = normPhonetic(b);

  // 2) фонетические: совпадает после "фон-нормализации"
  if (pA === pB) {
    types.add("phonetic");
    return types;
  }

  // 3) синтаксические: те же токены, но порядок другой
  const tokA = tokens(pA);
  const tokB = tokens(pB);
  if (tokA.length && tokB.length) {
    const sortedA = [...tokA].sort().join(" ");
    const sortedB = [...tokB].sort().join(" ");
    if (sortedA === sortedB && tokA.join(" ") !== tokB.join(" ")) {
      types.add("syntax");
      return types;
    }
  }

  // 4) морфологические: очень похожие слова (малое расстояние), но не совпали полностью
  if (tokA.length && tokB.length && tokA.length === tokB.length) {
    let close = 0;
    for (let i = 0; i < tokA.length; i++) {
      const s = similarity(tokA[i], tokB[i]);
      if (s > 0.72) close++;
    }
    if (close / tokA.length > 0.6) {
      types.add("morph");
      return types;
    }
  }

  // 5) иначе лексические
  types.add("lexical");
  return types;
}

function tokens(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^а-яёѣіѳѵꙗꙋ0-9\s\-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function normGraphic(s) {
  // убираем “графические” вариации
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")      // диакритика
    .replace(/\s+/g, " ")
    .trim();
}

function normPhonetic(s) {
  // грубая нормализация исторической графики
  let t = normGraphic(s);

  const map = [
    [/ѣ/g, "е"],
    [/і/g, "и"],
    [/ѳ/g, "ф"],
    [/ѵ/g, "и"],
    [/ꙗ/g, "я"],
    [/ꙋ/g, "у"],
    [/ѫ/g, "у"],
    [/ѧ/g, "я"],
    [/ѯ/g, "кс"],
    [/ѱ/g, "пс"],
  ];
  for (const [re, rep] of map) t = t.replace(re, rep);

  // редуцированные в конце слов (очень грубо)
  t = t.replace(/ъ\b/g, "");
  t = t.replace(/ь\b/g, "");

  t = t.replace(/\s+/g, " ").trim();
  return t;
}

// --- Подсветка различий (упрощённый diff) ---
function diffHtml(a, b) {
  // если один пустой
  if (!a && b) return `<span class="diffIns">${escapeHtml(b)}</span>`;
  if (a && !b) return `<span class="diffDel">${escapeHtml(a)}</span>`;
  if (a === b) return escapeHtml(a);

  // слово-уровень diff: LCS по токенам
  const A = a.split(/\s+/);
  const B = b.split(/\s+/);

  const lcs = lcsTable(A, B);
  const out = [];

  let i = A.length, j = B.length;
  while (i > 0 && j > 0) {
    if (A[i - 1] === B[j - 1]) {
      out.push(escapeHtml(A[i - 1]));
      i--; j--;
    } else if (lcs[i - 1][j] >= lcs[i][j - 1]) {
      out.push(`<span class="diffDel">${escapeHtml(A[i - 1])}</span>`);
      i--;
    } else {
      out.push(`<span class="diffIns">${escapeHtml(B[j - 1])}</span>`);
      j--;
    }
  }
  while (i > 0) { out.push(`<span class="diffDel">${escapeHtml(A[i - 1])}</span>`); i--; }
  while (j > 0) { out.push(`<span class="diffIns">${escapeHtml(B[j - 1])}</span>`); j--; }

  out.reverse();
  return out.join(" ");
}

function lcsTable(A, B) {
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = (A[i - 1] === B[j - 1])
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const aa = a.slice(0, 60);
  const bb = b.slice(0, 60);
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
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
    }
    prev.set(curr);
  }
  return prev[m];
}