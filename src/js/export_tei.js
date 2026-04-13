function esc(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

export function exportParallelTEI(payload) {
  // payload: { masterId, witnesses:[{id,name,segments}], alignment }
  const { masterId, witnesses, alignment } = payload;

  const master = witnesses.find(w => w.id === masterId);
  if (!master) throw new Error("Master not found for export");

  // назначим xml:id каждому сегменту
  const segIds = {}; // witnessId -> array xml:id
  for (const w of witnesses) {
    segIds[w.id] = w.segments.map((_, i) => `w_${w.id}_s${String(i+1).padStart(4,"0")}`);
  }

  // строим linkGrp: по master-индексу берём соответствующие сегменты
  const links = [];
  const mCount = master.segments.length;

  for (let i = 0; i < mCount; i++) {
    const targets = [];
    targets.push(`#${segIds[master.id][i]}`);

    for (const w of witnesses) {
      if (w.id === master.id) continue;
      const map = alignment[w.id];
      if (!map) continue;
      const j = map[i];
      if (j !== null && j !== undefined && j >= 0 && j < segIds[w.id].length) {
        targets.push(`#${segIds[w.id][j]}`);
      }
    }

    if (targets.length >= 2) {
      links.push(`<link target="${targets.join(" ")}"/>`);
    }
  }

  // witness divs with segments
  const witDivs = witnesses.map(w => {
    const blocks = w.segments.map((s, i) => {
      const pb = s.pb ? ` n="${esc(s.pb)}"` : "";
      return `<ab xml:id="${segIds[w.id][i]}"><pb${pb}/> ${esc(s.text)}</ab>`;
    }).join("\n");

    return `
      <div type="witness" xml:id="w_${esc(w.id)}">
        <head>${esc(w.name)}</head>
        ${blocks}
      </div>
    `;
  }).join("\n");

  const tei = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt>
        <title>Параллельный корпус списков: Притча о блудном сыне (Лк 15:11–32)</title>
      </titleStmt>
      <publicationStmt>
        <p>Создано учебной программой для демонстрации параллельного корпуса (выравнивание списков).</p>
      </publicationStmt>
      <sourceDesc>
        <p>Источник: загруженные пользователем XML‑TEI списки.</p>
      </sourceDesc>
    </fileDesc>
  </teiHeader>

  <text>
    <body>
      ${witDivs}
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
  return tei;
}