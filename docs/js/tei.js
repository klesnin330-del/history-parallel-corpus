export function parseTEIToWords(xmlText) {
  const title = extractTitle(xmlText);

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return { title: title || "TEI (parse error)", words: [] };
  }

  const textRoot =
    doc.querySelector("text") ||
    doc.querySelector("TEI text") ||
    doc.documentElement;

  const words = [];
  let currentSheet = null;

  function sheetFromStr(s) {
    const m = String(s ?? "").match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function readWordForm(wEl) {
    // Склеиваем текстовые части слова; <lb/> внутри <w> не даёт пробел.
    let out = "";
    const walker = doc.createTreeWalker(wEl, NodeFilter.SHOW_TEXT, null);

    let node;
    while ((node = walker.nextNode())) {
      const t = String(node.nodeValue ?? "").replace(/\s+/g, " ").trim();
      if (t) out += t;
    }
    return out;
  }

  function readFeats(wEl) {
    const feats = {};
    const fs = wEl.querySelector("fs");
    if (!fs) return feats;

    const fNodes = fs.querySelectorAll("f");
    for (const f of fNodes) {
      const name = f.getAttribute("name");
      if (!name) continue;

      const sym = f.querySelector("symbol");
      const value = sym?.getAttribute("value") || "";

      if (!feats[name]) feats[name] = new Set();
      if (value) feats[name].add(value);
    }

    const out = {};
    for (const k of Object.keys(feats)) out[k] = Array.from(feats[k]).sort();
    return out;
  }

  function walk(node) {
    if (!node) return;

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node;
      const name = (el.localName || el.nodeName || "").toLowerCase();

      if (name === "milestone") {
        const unit = (el.getAttribute("unit") || "").toLowerCase();
        if (unit === "sheet") {
          const sh = sheetFromStr(el.getAttribute("n"));
          if (sh !== null) currentSheet = sh;
        }
      }

      if (name === "pb") {
        const sh = sheetFromStr(el.getAttribute("n"));
        if (sh !== null && currentSheet === null) currentSheet = sh;
      }

      if (name === "w") {
        const id = el.getAttribute("xml:id") || el.getAttribute("id") || "";
        const lemma = el.getAttribute("lemma") || "";
        const form = readWordForm(el);
        const feats = readFeats(el);

        words.push({ id, form, lemma, feats, sheet: currentSheet });
        return;
      }

      for (const child of el.childNodes) walk(child);
      return;
    }
  }

  walk(textRoot);
  return { title, words };
}

function extractTitle(xmlText) {
  const m = String(xmlText || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripTags(m[1]).trim() : "";
}
function stripTags(s) {
  return String(s || "").replace(/<[^>]+>/g, "");
}