export function parseTEIToSegments(xmlText) {
  const title = extractTitle(xmlText);

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    // всё равно попробуем вытащить текст как есть
    return { title: title || "TEI (parse error)", segments: fallbackSegments(xmlText) };
  }

  const textRoot =
    doc.querySelector("text") ||
    doc.querySelector("TEI text") ||
    doc.documentElement;

  const segments = [];
  let currentPb = null;
  let buffer = "";
  let segIndex = 0;

  function flush() {
    const t = normalizeText(buffer);
    if (t) {
      segments.push({
        idx: segIndex++,
        pb: currentPb,
        text: t
      });
    }
    buffer = "";
  }

  function walk(node) {
    if (!node) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node;
      const name = (el.localName || el.nodeName || "").toLowerCase();

      if (name === "pb") {
        // новая страница/лист
        const n = el.getAttribute("n") || el.getAttribute("facs") || el.getAttribute("xml:id") || el.getAttribute("id");
        if (buffer.trim()) flush();
        currentPb = n || currentPb || null;
        return;
      }

      if (name === "lb") {
        // конец строки — сегмент
        flush();
        return;
      }

      // блочные теги: при желании тоже можно флашить (оставим мягко)
      if (["p","ab","div","head"].includes(name)) {
        // добавим пробел, чтобы слова не склеивались
        buffer += " ";
      }

      for (const child of el.childNodes) walk(child);

      if (["p","ab","div"].includes(name)) buffer += " ";
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      buffer += node.nodeValue;
    }
  }

  walk(textRoot);
  flush();

  // если вообще не нашли pb — проставим "?" чтобы фильтр не ломался
  for (const s of segments) {
    if (!s.pb) s.pb = "?";
  }

  return { title, segments };
}

function extractTitle(xmlText) {
  // очень грубо: вытащить <title>...</title>
  const m = xmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return stripTags(m[1]).trim();
}

function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, "");
}

function normalizeText(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
}

function fallbackSegments(xmlText) {
  // если TEI не парсится — делим по строкам
  const lines = xmlText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return lines.slice(0, 400).map((t, i) => ({ idx: i, pb: "?", text: t }));
}