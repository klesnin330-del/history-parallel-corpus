export function classifyPair(masterTok, otherTok) {
  const safeTypes = new Set();
  if (!otherTok) return { label: "Пропуск", types: safeTypes };
  if (!masterTok || !masterTok.form) return { label: "Не определено", types: safeTypes };

  const normA = normalizeGraphic(masterTok.form);
  const normB = normalizeGraphic(otherTok.form);
  if (normA === normB && normA !== '') return { label: "Идентично", types: safeTypes };

  const simForm = similarity(normalizePhonetic(masterTok.form), normalizePhonetic(otherTok.form));
  const normLemmaA = normalizeGraphic(masterTok.lemma || '');
  const normLemmaB = normalizeGraphic(otherTok.lemma || '');
  const lemmaEq = normLemmaA && normLemmaB && normLemmaA === normLemmaB;

  if (simForm >= 0.78) {
    safeTypes.add("graphic"); safeTypes.add("phonetic");
    return { label: "Графическое/Фонетическое", types: safeTypes };
  }
  if (lemmaEq) {
    safeTypes.add("morph");
    return { label: "Морфологическое", types: safeTypes };
  }
  safeTypes.add("lexical");
  return { label: "Лексическое", types: safeTypes };
}

function normalizeGraphic(s) {
  return String(s || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').trim();
}

function normalizePhonetic(s) {
  let t = normalizeGraphic(s);
  const map = [
    [/ѣ/g, 'е'], [/ѳ/g, 'ф'], [/ѵ/g, 'и'], [/ꙗ/g, 'я'],
    [/ꙋ/g, 'у'], [/ѫ/g, 'у'], [/ѧ/g, 'я'], [/ѯ/g, 'кс'],
    [/ѱ/g, 'пс'], [/ѡ/g, 'о'], [/ꙑ/g, 'ы']
  ];
  for (const [re, rep] of map) t = t.replace(re, rep);
  t = t.replace(/ъ\b/g, '').replace(/ь\b/g, '');
  return t;
}

export function tokenSimilarity(a, b) {
  if (!a || !b) return 0;
  const la = normalizeGraphic(a.lemma || '');
  const lb = normalizeGraphic(b.lemma || '');
  if (la && lb && la === lb) return 1.0;
  return similarity(normalizePhonetic(a.form), normalizePhonetic(b.form));
}

function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const d = levenshtein(a.slice(0, 60), b.slice(0, 60));
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : (1 - d / max);
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
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}