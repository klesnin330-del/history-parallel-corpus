import { classifyPair } from "./variants.js";

function csvEscape(value) {
  const s = String(value ?? "");
  return `"${s.replaceAll('"', '""')}"`;
}

export function buildComparisonCSV(masterFileName, witnessFileName, masterWords, witnessWords, mapping) {
  const header = [
    "ID",
    `ЭТАЛОН (${masterFileName})`,
    "Лемма",
    `Слово (${witnessFileName})`,
    `Тип (${witnessFileName})`
  ].join(",");

  const lines = [header];

  for (let i = 0; i < masterWords.length; i++) {
    const mTok = masterWords[i];
    const j = mapping?.[i];
    const wTok = (j === null || j === undefined) ? null : witnessWords[j];

    const lemma = mTok.lemma || "";
    const wForm = wTok ? wTok.form : "---";
    const cls = classifyPair(mTok, wTok);

    lines.push([
      csvEscape(mTok.id || ""),
      csvEscape(mTok.form || ""),
      csvEscape(lemma),
      csvEscape(wForm),
      csvEscape(cls.label)
    ].join(","));
  }

  return lines.join("\n");
}