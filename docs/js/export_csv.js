function esc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function tokId(wid, i) { return `w_${wid}_t${i+1}`; }

export function exportParallelTEI(payload) {
  const { masterId, witnesses, mapping } = payload;
  const master = witnesses.find(w => w.id === masterId);
  if (!master) throw new Error("Master not found");

  const witnessDivs = witnesses.map(w => {
    const body = w.tokens.map((t, i) => {
      const wid = tokId(w.id, i);
      const lemma = t.lemma ? ` lemma="${esc(t.lemma)}"` : '';
      return `<w xml:id="${esc(wid)}"${lemma}>${esc(t.form || '')}</w>`;
    }).join('\n');
    return `<div type="witness" xml:id="w_${esc(w.id)}">\n<head>${esc(w.name)}</head>\n<ab>\n${body}\n</ab>\n</div>`;
  }).join('\n');

  const links = [];
  for (let i = 0; i < master.tokens.length; i++) {
    const targets = [`#${tokId(master.id, i)}`];
    for (const w of witnesses) {
      if (w.id === master.id) continue;
      const map = mapping?.[w.id];
      if (!map) continue;
      const j = map[i];
      if (j !== null && j !== undefined && j >= 0 && j < w.tokens.length) {
        targets.push(`#${tokId(w.id, j)}`);
      }
    }
    if (targets.length > 1) links.push(`<link target="${targets.join(' ')}"/>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>Параллельный корпус: Притча о блудном сыне</title></titleStmt>
      <publicationStmt><p>Экспорт из учебного проекта.</p></publicationStmt>
      <sourceDesc><p>Списки загружены пользователем.</p></sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      ${witnessDivs}
    </body>
  </text>
  <standOff>
    <listWit>
      ${witnesses.map(w => `<witness xml:id="w_${esc(w.id)}">${esc(w.name)}</witness>`).join('\n')}
    </listWit>
    <linkGrp type="alignment" targFunc="parallel">
      ${links.join('\n')}
    </linkGrp>
  </standOff>
</TEI>`;
}