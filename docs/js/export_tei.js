function esc(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function tokId(witnessId, i) {
  return `w_${witnessId}_tok${String(i + 1).padStart(6, "0")}`;
}

export function exportParallelTEIWords(payload) {
  const { masterId, witnesses, alignment } = payload;

  const master = witnesses.find(w => w.id === masterId);
  if (!master) throw new Error("Master not found for export");

  const witnessDivs = witnesses.map(w => {
    let lastSheet = null;

    const body = w.words.map((t, i) => {
      const wid = tokId(w.id, i);
      const lemma = t.lemma ? ` lemma="${esc(t.lemma)}"` : "";

      let pb = "";
      if (t.sheet !== null && t.sheet !== undefined && t.sheet !== lastSheet) {
        pb = `<pb n="${esc(String(t.sheet))}"/> `;
        lastSheet = t.sheet;
      }

      return `${pb}<w xml:id="${esc(wid)}"${lemma}>${esc(t.form || "")}</w>`;
    }).join("\n");

    return `
      <div type="witness" xml:id="w_${esc(w.id)}">
        <head>${esc(w.name)}</head>
        <ab>
${body}
        </ab>
      </div>
    `;
  }).join("\n");

  const links = [];
  const mCount = master.words.length;

  for (let i = 0; i < mCount; i++) {
    const targets = [`#${tokId(master.id, i)}`];

    for (const w of witnesses) {
      if (w.id === master.id) continue;
      const map = alignment?.[w.id];
      if (!map) continue;

      const j = map[i];
      if (j === null || j === undefined) continue;
      if (j < 0 || j >= w.words.length) continue;

      targets.push(`#${tokId(w.id, j)}`);
    }

    if (targets.length >= 2) links.push(`<link target="${targets.join(" ")}"/>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Параллельный корпус списков: Притча о блудном сыне (Лк 15:11–32)</title>
      </titleStmt>
      <publicationStmt>
        <p>Экспортировано из учебной программы (выравнивание по словам).</p>
      </publicationStmt>
      <sourceDesc>
        <p>Источник: загруженные пользователем XML‑TEI списки.</p>
      </sourceDesc>
    </fileDesc>
  </teiHeader>

  <text>
    <body>
      ${witnessDivs}
    </body>
  </text>

  <standOff>
    <listWit>
      ${witnesses.map(w => `<witness xml:id="w_${esc(w.id)}">${esc(w.name)}</witness>`).join("\n")}
    </listWit>
    <linkGrp type="alignment" targFunc="parallel">
      ${links.join("\n")}
    </linkGrp>
  </standOff>
</TEI>
`;
}