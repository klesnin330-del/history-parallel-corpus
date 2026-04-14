export function tokenSimilarity(aTok, bTok) {
  // 0..1
  if (!aTok || !bTok) return 0;

  const la = normLemma(aTok.lemma);
  const lb = normLemma(bTok.lemma);
  if (la && lb && la === lb) return 1.0;

  const a = normPhonetic(aTok.form);
  const b = normPhonetic(bTok.form);
  return similarity(a, b);
}

export function classifyPair(masterTok, otherTok) {
  // Возвращает:
  // { label: "Идентично|Пропуск|Графическое/Фон.|Морфологическое|Синтаксическое|Лексическое",
  //   types: Set(["graphic","phonetic","morph","syntax","lexical"]) }
  if (!otherTok) return { label: "Пропуск", types: new Set() };

  const A = normGraphic(masterTok?.form);
  const B = normGraphic(otherTok?.form);

  if (A && B && A === B) return { label: "Идентично", types: new Set() };

  const sim = similarity(normPhonetic(masterTok?.form), normPhonetic(otherTok?.form));
  const la = normLemma(masterTok?.lemma);
  const lb = normLemma(otherTok?.lemma);
  const lemmaEq = la && lb && la === lb;

  // “Графическое/Фон.” — если формы достаточно близки
  if (sim >= 0.78) {
    return { label: "Графическое/Фон.", types: new Set(["graphic", "phonetic"]) };
  }

  // Если лемма совпадает, но формы не близки → “Морфологическое”
  if (lemmaEq) {
    return { label: "Морфологическое", types: new Set(["morph"]) };
  }

  // “Синтаксическое” на уровне одного слова почти не детектируется,
  // оставим тип как резерв, но здесь не используем.
  return { label: "Лексическое", types: new Set(["lexical"]) };
}

function normGraphic(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normLemma(s) {
  return normGraphic(s);
}

function normPhonetic(s) {
  let t = normGraphic(s);

  // приведение частых графем (упрощённо, чтобы попадать в “Графическое/Фон.”)
  const map = [
    [/ѣ/g, "е"], [/і/g, "и"], [/ѳ/g, "ф"], [/ѵ/g, "и"],
    [/ꙗ/g, "я"], [/ꙋ/g, "у"], [/ѫ/g, "у"], [/ѧ/g, "я"],
    [/ѯ/g, "кс"], [/ѱ/g, "пс"],
    [/ѡ/g, "о"],
  ];
  for (const [re, rep] of map) t = t.replace(re, rep);

  // убираем финальные редуцированные (грубая нормализация)
  t = t.replace(/ъ\b/g, "").replace(/ь\b/g, "");
  return t.replace(/\s+/g, " ").trim();
}

function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const aa = a.slice(0, 80);
  const bb = b.slice(0, 80);
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
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev.set(curr);
  }
  return prev[m];
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}