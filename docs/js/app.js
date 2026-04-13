import { parseTEIToSegments } from "./tei.js";
import { alignWitnessToMaster } from "./align.js";
import { classifyAndDiff } from "./variants.js";
import { exportParallelTEI } from "./export_tei.js";
import { downloadTextFile, downloadJSON, loadJSONFile } from "./storage.js";

const state = {
  witnesses: [],       // { id, name, fileName, teiText, segmentsAll, range:{from,to}, visible, isMaster }
  masterId: null,
  // alignment[witnessId] = array length masterSegments.length with indices into that witness segmentsFiltered (or null)
  alignment: {},
  // cache filtered segments for each witness
  filtered: {},        // witnessId -> segments in range
  order: [],           // ordered witness ids (visible order)
  variantFilters: new Set(["graphic","phonetic","morph","syntax","lexical"]),
  variantMode: "any",
  search: ""
};

const elFileInput = document.getElementById("fileInput");
const elWitnessList = document.getElementById("witnessList");
const elBtnAlign = document.getElementById("btnAlign");
const elBtnClear = document.getElementById("btnClear");
const elBtnSaveProject = document.getElementById("btnSaveProject");
const elProjectInput = document.getElementById("projectInput");
const elBtnExportTEI = document.getElementById("btnExportTEI");
const elStatus = document.getElementById("status");
const elTableWrap = document.getElementById("tableWrap");
const elSearchBox = document.getElementById("searchBox");
const elVariantMode = document.getElementById("variantMode");
const elTypeFilters = Array.from(document.querySelectorAll(".typeFilter"));

const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const helpCloseBackdrop = document.getElementById("helpCloseBackdrop");
const helpCloseX = document.getElementById("helpCloseX");

function setStatus(text) {
  elStatus.textContent = text;
}

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function getWitness(id) {
  return state.witnesses.find(w => w.id === id);
}

function masterWitness() {
  return getWitness(state.masterId);
}

function pbToNum(pb) {
  // пытаемся вытащить число из pb (например "117", "117r", "117–119" и т.п.)
  const m = String(pb ?? "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function filterSegmentsByRange(segments, range) {
  const fromN = pbToNum(range.from);
  const toN = pbToNum(range.to);
  if (!fromN || !toN) return segments;

  const lo = Math.min(fromN, toN);
  const hi = Math.max(fromN, toN);

  return segments.filter(s => {
    const n = pbToNum(s.pb);
    if (!n) return true; // если pb не распознался — не режем
    return n >= lo && n <= hi;
  });
}

function recomputeFiltered() {
  state.filtered = {};
  for (const w of state.witnesses) {
    state.filtered[w.id] = filterSegmentsByRange(w.segmentsAll, w.range || {from:"",to:""});
  }
}

function ensureOrder() {
  const ids = state.witnesses.map(w => w.id);
  if (!state.order.length) state.order = [...ids];
  // добавить отсутствующие
  for (const id of ids) if (!state.order.includes(id)) state.order.push(id);
  // убрать лишние
  state.order = state.order.filter(id => ids.includes(id));
}

function canAlign() {
  return state.witnesses.length >= 2 && !!state.masterId;
}

function updateButtons() {
  const ok = canAlign();
  elBtnAlign.disabled = !ok;
  elBtnClear.disabled = state.witnesses.length === 0;
  elBtnSaveProject.disabled = state.witnesses.length === 0;
  elBtnExportTEI.disabled = Object.keys(state.alignment).length === 0;
}

function renderWitnessList() {
  ensureOrder();
  elWitnessList.innerHTML = "";

  for (const id of state.order) {
    const w = getWitness(id);
    if (!w) continue;

    const div = document.createElement("div");
    div.className = "witness";

    const title = document.createElement("div");
    title.className = "witness__title";
    title.textContent = w.name || w.fileName;
    div.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "witness__meta";

    // visible checkbox
    const vis = document.createElement("label");
    vis.className = "label";
    vis.innerHTML = `<input type="checkbox" ${w.visible ? "checked":""}/> Показ`;
    vis.querySelector("input").addEventListener("change", (e) => {
      w.visible = e.target.checked;
      renderTable();
    });
    meta.appendChild(vis);

    // master radio
    const master = document.createElement("label");
    master.className = "label";
    master.innerHTML = `<input type="radio" name="masterRadio" ${w.id===state.masterId?"checked":""}/> Master`;
    master.querySelector("input").addEventListener("change", () => {
      state.masterId = w.id;
      // пересоберём alignment? пока нет — пользователь нажмёт align
      renderWitnessList();
      setStatus(`Master: ${w.name}. Нажми «Автовыравнивание».`);
      updateButtons();
      renderTable();
    });
    meta.appendChild(master);

    // range inputs
    const from = document.createElement("input");
    from.className = "smallInput";
    from.placeholder = "лист от";
    from.value = w.range?.from ?? "";
    from.addEventListener("change", () => {
      w.range = w.range || {from:"",to:""};
      w.range.from = from.value.trim();
      recomputeFiltered();
      setStatus("Диапазоны обновлены. Нажми «Автовыравнивание», чтобы пересчитать.");
      renderTable();
    });

    const to = document.createElement("input");
    to.className = "smallInput";
    to.placeholder = "лист до";
    to.value = w.range?.to ?? "";
    to.addEventListener("change", () => {
      w.range = w.range || {from:"",to:""};
      w.range.to = to.value.trim();
      recomputeFiltered();
      setStatus("Диапазоны обновлены. Нажми «Автовыравнивание», чтобы пересчитать.");
      renderTable();
    });

    meta.appendChild(document.createTextNode("Листы: "));
    meta.appendChild(from);
    meta.appendChild(to);

    // order buttons
    const orderBtns = document.createElement("div");
    orderBtns.className = "orderBtns";
    const up = document.createElement("button");
    up.textContent = "↑";
    const down = document.createElement("button");
    down.textContent = "↓";
    up.addEventListener("click", () => {
      const i = state.order.indexOf(w.id);
      if (i > 0) {
        [state.order[i-1], state.order[i]] = [state.order[i], state.order[i-1]];
        renderWitnessList();
        renderTable();
      }
    });
    down.addEventListener("click", () => {
      const i = state.order.indexOf(w.id);
      if (i >= 0 && i < state.order.length-1) {
        [state.order[i+1], state.order[i]] = [state.order[i], state.order[i+1]];
        renderWitnessList();
        renderTable();
      }
    });
    orderBtns.appendChild(up);
    orderBtns.appendChild(down);
    meta.appendChild(orderBtns);

    div.appendChild(meta);

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = `Сегментов всего: ${w.segmentsAll.length}, в диапазоне: ${state.filtered[w.id]?.length ?? 0}`;
    div.appendChild(tag);

    elWitnessList.appendChild(div);
  }
}

function getVisibleWitnessesOrdered() {
  return state.order
    .map(id => getWitness(id))
    .filter(Boolean)
    .filter(w => w.visible);
}

function rowPassesVariantFilter(rowTypes) {
  if (state.variantMode === "off") return true;

  const selected = state.variantFilters;
  const types = rowTypes; // Set
  if (types.size === 0) return false;

  if (state.variantMode === "any") {
    for (const t of types) if (selected.has(t)) return true;
    return false;
  }

  // all: все найденные типы должны входить в выбранные
  for (const t of types) if (!selected.has(t)) return false;
  return true;
}

function renderTable() {
  const master = masterWitness();
  if (!master) {
    elTableWrap.innerHTML = `<div style="padding:12px;color:#666;">Выбери Master.</div>`;
    return;
  }

  const visibles = getVisibleWitnessesOrdered();
  if (visibles.length === 0) {
    elTableWrap.innerHTML = `<div style="padding:12px;color:#666;">Выбери, какие списки показывать (галочка «Показ»).</div>`;
    return;
  }

  const mSeg = state.filtered[master.id] || [];
  const hasAlignment = Object.keys(state.alignment).length > 0;

  // поиск по master
  let rows = mSeg.map((seg, i) => ({ seg, i }));
  const q = state.search.trim().toLowerCase();
  if (q) {
    rows = rows.filter(r => (r.seg.text || "").toLowerCase().includes(q));
  }

  const table = document.createElement("table");
  table.className = "table";

  // header
  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  const th0 = document.createElement("th");
  th0.textContent = "№ / лист";
  trh.appendChild(th0);

  for (const w of visibles) {
    const th = document.createElement("th");
    th.innerHTML = `<div>${w.name}</div><div class="tag">${w.id===state.masterId?"MASTER":""}</div>`;
    trh.appendChild(th);
  }

  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const r of rows) {
    const i = r.i;
    const tr = document.createElement("tr");

    const td0 = document.createElement("td");
    td0.innerHTML = `<div><b>${i+1}</b></div><div class="tag">лист: ${r.seg.pb ?? "?"}</div>`;
    tr.appendChild(td0);

    // compute row types for filtering
    let rowTypes = new Set();

    for (const w of visibles) {
      const td = document.createElement("td");

      let txt = "";
      let types = new Set();
      let diffHtml = "";

      if (w.id === master.id) {
        txt = r.seg.text;
        diffHtml = escapeHtml(txt);
      } else if (hasAlignment && state.alignment[w.id]) {
        const idx = state.alignment[w.id][i];
        const wSegs = state.filtered[w.id] || [];
        const other = (idx === null || idx === undefined) ? null : wSegs[idx];
        txt = other ? other.text : "";
        const res = classifyAndDiff(r.seg.text, txt);
        types = res.types;
        diffHtml = res.html;
        for (const t of types) rowTypes.add(t);
      } else {
        // пока без alignment: пробуем индексно (черновик)
        const wSegs = state.filtered[w.id] || [];
        const other = wSegs[i];
        txt = other ? other.text : "";
        const res = classifyAndDiff(r.seg.text, txt);
        types = res.types;
        diffHtml = res.html;
        for (const t of types) rowTypes.add(t);
      }

      td.innerHTML = `<div class="cellText">${diffHtml}</div>`;

      if (w.id !== master.id) {
        const tools = document.createElement("div");
        tools.className = "cellTools";

        const up = document.createElement("button");
        up.className = "shiftBtn";
        up.textContent = "▲";

        const down = document.createElement("button");
        down.className = "shiftBtn";
        down.textContent = "▼";

        up.addEventListener("click", () => shiftAlignment(w.id, i, -1));
        down.addEventListener("click", () => shiftAlignment(w.id, i, +1));

        tools.appendChild(up);
        tools.appendChild(down);

        const badges = document.createElement("div");
        badges.className = "badgeRow";
        for (const t of types) {
          const b = document.createElement("span");
          b.className = "badge";
          b.textContent = t;
          badges.appendChild(b);
        }

        td.appendChild(tools);
        td.appendChild(badges);
      }

      tr.appendChild(td);
    }

    // фильтрация по типам разночтений
    if (rowPassesVariantFilter(rowTypes)) {
      tbody.appendChild(tr);
    }
  }

  table.appendChild(tbody);

  elTableWrap.innerHTML = "";
  elTableWrap.appendChild(table);
}

function shiftAlignment(witnessId, masterRowIndex, delta) {
  if (!state.alignment[witnessId]) return;
  const w = getWitness(witnessId);
  const wSegs = state.filtered[witnessId] || [];
  const curr = state.alignment[witnessId][masterRowIndex];

  let next = (curr === null || curr === undefined) ? null : curr + delta;
  if (next !== null) {
    if (next < 0) next = 0;
    if (next >= wSegs.length) next = wSegs.length - 1;
  }

  state.alignment[witnessId][masterRowIndex] = next;
  renderTable();
}

async function doAlign() {
  const master = masterWitness();
  if (!master) return;

  recomputeFiltered();
  const mSeg = state.filtered[master.id] || [];
  if (mSeg.length === 0) {
    setStatus("У Master нет сегментов в заданном диапазоне листов.");
    return;
  }

  setStatus("Автовыравнивание… (может занять время)");
  state.alignment = {};

  for (const w of state.witnesses) {
    if (w.id === master.id) continue;

    const wSeg = state.filtered[w.id] || [];
    const mapping = await alignWitnessToMaster(mSeg, wSeg);
    state.alignment[w.id] = mapping;
  }

  setStatus("Готово: выравнивание построено. Можно править ▲/▼ и фильтровать разночтения.");
  updateButtons();
  renderTable();
}

function clearAll() {
  state.witnesses = [];
  state.masterId = null;
  state.alignment = {};
  state.filtered = {};
  state.order = [];
  state.search = "";
  elSearchBox.value = "";
  setStatus("Сброшено.");
  renderWitnessList();
  renderTable();
  updateButtons();
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsText(file);
  });
}

async function handleFiles(files) {
  setStatus("Чтение файлов…");
  for (const f of files) {
    const text = await readFileAsText(f);
    const parsed = parseTEIToSegments(text);

    const w = {
      id: uid(),
      name: parsed.title || f.name,
      fileName: f.name,
      teiText: text,
      segmentsAll: parsed.segments,
      range: { from: "", to: "" },
      visible: true,
      isMaster: false
    };

    state.witnesses.push(w);
  }

  // master по умолчанию — первый
  if (!state.masterId && state.witnesses.length) {
    state.masterId = state.witnesses[0].id;
  }

  recomputeFiltered();
  ensureOrder();
  renderWitnessList();
  renderTable();
  updateButtons();

  setStatus("Файлы загружены. Выбери Master и диапазоны листов, затем нажми «Автовыравнивание».");
}

function collectProject() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    witnesses: state.witnesses.map(w => ({
      id: w.id,
      name: w.name,
      fileName: w.fileName,
      teiText: w.teiText,         // чтобы можно было продолжить без повторной загрузки
      range: w.range,
      visible: w.visible
    })),
    masterId: state.masterId,
    order: state.order,
    alignment: state.alignment,
    variantFilters: Array.from(state.variantFilters),
    variantMode: state.variantMode,
    search: state.search
  };
}

async function loadProject(obj) {
  clearAll();
  setStatus("Загрузка проекта…");

  // восстановим witnesses и распарсим TEI
  for (const w0 of obj.witnesses) {
    const parsed = parseTEIToSegments(w0.teiText);
    state.witnesses.push({
      id: w0.id,
      name: w0.name || parsed.title || w0.fileName,
      fileName: w0.fileName,
      teiText: w0.teiText,
      segmentsAll: parsed.segments,
      range: w0.range || {from:"",to:""},
      visible: (w0.visible !== false),
      isMaster: false
    });
  }

  state.masterId = obj.masterId || (state.witnesses[0]?.id ?? null);
  state.order = obj.order || [];
  state.alignment = obj.alignment || {};
  state.variantFilters = new Set(obj.variantFilters || ["graphic","phonetic","morph","syntax","lexical"]);
  state.variantMode = obj.variantMode || "any";
  state.search = obj.search || "";
  elSearchBox.value = state.search;

  elVariantMode.value = state.variantMode;
  for (const cb of elTypeFilters) cb.checked = state.variantFilters.has(cb.value);

  recomputeFiltered();
  ensureOrder();
  renderWitnessList();
  renderTable();
  updateButtons();

  setStatus("Проект загружен.");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function wireUI() {
  elFileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    await handleFiles(files);
    elFileInput.value = "";
  });

  elBtnAlign.addEventListener("click", doAlign);
  elBtnClear.addEventListener("click", clearAll);

  elSearchBox.addEventListener("input", () => {
    state.search = elSearchBox.value;
    renderTable();
  });

  elVariantMode.addEventListener("change", () => {
    state.variantMode = elVariantMode.value;
    renderTable();
  });

  for (const cb of elTypeFilters) {
    cb.addEventListener("change", () => {
      if (cb.checked) state.variantFilters.add(cb.value);
      else state.variantFilters.delete(cb.value);
      renderTable();
    });
  }

  elBtnSaveProject.addEventListener("click", () => {
    const obj = collectProject();
    downloadJSON(obj, "alignment_project.json");
  });

  elProjectInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const obj = await loadJSONFile(file);
    await loadProject(obj);
    elProjectInput.value = "";
  });

  elBtnExportTEI.addEventListener("click", () => {
    const master = masterWitness();
    if (!master) return;

    const visibles = getVisibleWitnessesOrdered();
    const payload = {
      masterId: state.masterId,
      witnesses: visibles.map(w => ({
        id: w.id,
        name: w.name,
        segments: state.filtered[w.id] || []
      })),
      alignment: state.alignment
    };

    const tei = exportParallelTEI(payload);
    downloadTextFile(tei, "parallel_corpus_alignment.tei.xml", "application/xml;charset=utf-8");
  });

  // help
  const openHelp = () => {
    helpModal.classList.remove("hidden");
    helpModal.setAttribute("aria-hidden", "false");
  };
  const closeHelp = () => {
    helpModal.classList.add("hidden");
    helpModal.setAttribute("aria-hidden", "true");
  };

  helpBtn.addEventListener("click", openHelp);
  helpCloseBackdrop.addEventListener("click", closeHelp);
  helpCloseX.addEventListener("click", closeHelp);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHelp();
  });
}

wireUI();
updateButtons();
renderTable();