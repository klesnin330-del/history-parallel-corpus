// 🔥 АБСОЛЮТНАЯ ОЧИСТКА: удаляет ВСЕ надстрочные знаки, титла, диакритику и пунктуацию
function cleanBaseText(s) {
  if (!s) return "";
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    // 1. Удаляем ВСЕ комбинирующие символы Unicode (категория Mark: Mn, Mc, Me)
    // Это покрывает титла (҃), каморы, еры, ударения, придыхания и любые другие "закорючки"
    .replace(/\p{M}/gu, "")
    // 2. Фоллбэк-регулярка для старых движков (если \p{M} не поддерживается)
    .replace(/[\u0300-\u036f\u0483-\u0489\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g, "")
    // 3. Убираем прилипшую пунктуацию, скобки и пробелы
    .replace(/[-–—.,;:!?«»""„‟‹›(){}\[\]\s]/g, "")
    // 4. Whitelist: оставляем ТОЛЬКО буквы кириллицы (включая старославянские) и цифры
    .replace(/[^а-яёa-z0-9ѣѫѧѳѵꙗѯѱѡꙑії]/gi, "")
    .trim();
}

export function tokenSimilarity(aTok, bTok) {
  if (!aTok || !bTok) return 0;
  const la = cleanBaseText(aTok.lemma);
  const lb = cleanBaseText(bTok.lemma);
  if (la && lb && la === lb) return 1.0;
  return similarity(cleanBaseText(aTok.form), cleanBaseText(bTok.form));
}

export function classifyPair(masterTok, otherTok) {
  if (!otherTok) return { label: "Пропуск", types: new Set() };

  const A = cleanBaseText(masterTok?.form);
  const B = cleanBaseText(otherTok?.form);

  // 1️⃣ Строгая идентичность (после тотального удаления надстрочных знаков)
  if (A && B && A === B) {
    return { label: "Идентично", types: new Set() };
  }

  // 2️⃣ Фонетико-графическое сходство (считается на уже очищенных строках)
  const sim = similarity(A, B);

  // 3️⃣ Лемматическое сравнение (тоже очищенное)
  const la = cleanBaseText(masterTok?.lemma);
  const lb = cleanBaseText(otherTok?.lemma);
  const lemmaEq = la && lb && la === lb;

  // 📊 Логика классификации (от точного к общему)
  if (sim >= 0.72) {
    return { label: "Графическое/Фонетическое", types: new Set(["graphic", "phonetic"]) };
  }
  if (lemmaEq) {
    return { label: "Морфологическое", types: new Set(["morph"]) };
  }
  return { label: "Лексическое", types: new Set(["lexical"]) };
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
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}