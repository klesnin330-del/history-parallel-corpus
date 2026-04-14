import { parseTEIToWords } from "./tei.js";
import { alignWordsToMaster, shiftMapping } from "./align.js";
import { classifyPair, escapeHtml } from "./variants.js";
import { exportParallelTEIWords } from "./export_tei.js";
import { buildComparisonCSV } from "./export_csv.js";
import { downloadTextFile, downloadJSON, loadJSONFile } from "./storage.js";

const state = {
  witnesses: [],   // {id,name,fileName,teiText,wordsAll,range:{from,to},visible}
  masterId: null,
  order: [],
  filtered: {},    // witnessId -> words[] in range
  mapping: {},     // witnessId -> mapping array len=masterWordsLen
  variantFilters: new Set(["graphic","phonetic","morph","syntax","lexical"]),
  variantMode: "off",
};

const elFileInput = document.getElementById("fileInput");
const elWitnessList = document.getElementById("witnessList");
const elBtnAlign = document.getElementById("btnAlign");
const elBtnClear = document.getElementById("btnClear");
const elBtnSaveProject = document.getElementById("btnSaveProject");
const elProjectInput = document.getElementById("projectInput");
const elBtnExportTEI = document.getElementById("btnExportTEI");
const elCsvWitnessSelect = document.getElementById("csvWitnessSelect");
const elBtnExportCSV = document.getElementById("btnExportCSV");
const elStatus = document.getElementById("status");
const elTableWrap = document.getElementById("tableWrap");
const elVariantMode = document.getElementById("variantMode");
const elTypeFilters = Array.from(document.querySelectorAll(".typeFilter"));

const helpBtn = document.getElementById("helpBtn");
const helpModal = document.getElementById("helpModal");
const helpCloseBackdrop = document.getElementById("helpCloseBackdrop");
const helpCloseX = document.getElementById("helpCloseX");

function setStatus(t){ elStatus.textContent = t; }
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function getWitness(id){ return state.witnesses.find(w => w.id === id); }
function masterWitness(){ return getWitness(state.masterId); }

function toNum(s) {
  const m = String(s ?? "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function filterWordsBySheets(words, range) {
  const fromN = toNum(range?.from);
  const toN = toNum(range?.to);
  if (!fromN || !toN) return words;

  const lo = Math.min(fromN, toN);
  const hi = Math.max(fromN, toN);

  return words.filter(w => {
    const sh = w.sheet;
    if (sh === null || sh === undefined) return true;
    return sh >= lo && sh <= hi;
  });
}

function recomputeFiltered(){
  state.filtered = {};
  for (const w of state.witnesses) {
    state.filtered[w.id] = filterWordsBySheets(w.wordsAll, w.range || {from:"",to:""});
  }
}

function ensureOrder(){
  const ids = state.witnesses.map(w => w.id);
  if (!state.order.length) state.order = [...ids];
  for (const id of ids) if (!state.order.includes(id)) state.order.push(id);
  state.order = state.order.filter(id => ids.includes(id));
}

function visibleWitnessesOrdered(){
  return state.order.map(id => getWitness(id)).filter(Boolean).filter(w => w.visible);
}

function canAlign(){
  return state.witnesses.length >= 2 && !!state.masterId;
}

function updateButtons(){
  elBtnAlign.disabled = !canAlign();
  elBtnClear.disabled = state.witnesses.length === 0;
  elBtnSaveProject.disabled = state.witnesses.length === 0;
  elBtnExportTEI.disabled = Object.keys(state.mapping).length === 0;
  elBtnExportCSV.disabled = Object.keys(state.mapping).length === 0;
}

function renderCsvSelect(){
  const master = masterWitness();
  elCsvWitnessSelect.innerHTML = "";

  const opts = [];
  for (const w of state.witnesses) {
    if (!master || w.id === master.id) continue;
    opts.push(w);
  }

  if (opts.length === 0) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "Нет списков для сравнения";
    elCsvWitnessSelect.appendChild(o);
    elBtnExportCSV.disabled = true;
    return;
  }

  for (const w of opts) {
    const o = document.createElement("option");
    o.value = w.id;
    o.textContent = w.fileName || w.name;
    elCsvWitnessSelect.appendChild(o);
  }

  elBtnExportCSV.disabled = Object.keys(state.mapping).length === 0;
}

function renderWitnessList(){
  ensureOrder();
  recomputeFiltered();
  elWitnessList.innerHTML = "";

  for (const id of state.order){
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

    const vis = document.createElement("label");
    vis.className = "label";
    vis.innerHTML = `<input type="checkbox" ${w.visible ? "checked":""}/> Показ`;
    vis.querySelector("input").addEventListener("change", (e) => {
      w.visible = e.target.checked;
      renderTable();
    });
    meta.appendChild(vis);

    const master = document.createElement("label");
    master.className = "label";
    master.innerHTML = `<input type="radio" name="masterRadio" ${w.id===state.masterId?"checked":""}/> Master`;
    master.querySelector("input").addEventListener("change", () => {
      state.masterId = w.id;
      state.mapping = {};
      setStatus(`Master выбран: ${w.name}. Пожалуйста, нажмите «Автовыравнивание».`);
      renderWitnessList();
      renderCsvSelect();
      renderTable();
      updateButtons();
    });
    meta.appendChild(master);

    const from = document.createElement("input");
    from.className = "smallInput";
    from.placeholder = "лист от";
    from.value = w.range?.from ?? "";
    from.addEventListener("change", () => {
      w.range = w.range || {from:"",to:""};
      w.range.from = from.value.trim();
      state.mapping = {};
      renderWitnessList();
      renderCsvSelect();
      renderTable();
      updateButtons();
      setStatus("Диапазоны листов обновлены. Пожалуйста, выполните выравнивание повторно.");
    });

    const to = document.createElement("input");
    to.className = "smallInput";
    to.placeholder = "лист до";
    to.value = w.range?.to ?? "";
    to.addEventListener("change", () => {
      w.range = w.range || {from:"",to:""};
      w.range.to = to.value.trim();
      state.mapping = {};
      renderWitnessList();
      renderCsvSelect();
      renderTable();
      updateButtons();
      setStatus("Диапазоны листов обновлены. Пожалуйста, выполните выравнивание повторно.");
    });

    meta.appendChild(document.createTextNode("Листы: "));
    meta.appendChild(from);
    meta.appendChild(to);

    const orderBtns = document.createElement("div");
    orderBtns.className = "orderBtns";
    const up = document.createElement("button"); up.textContent = "↑";
    const down = document.createElement("button"); down.textContent = "↓";
    up.addEventListener("click", () => {
      const i = state.order.indexOf(w.id);
      if (i > 0) {
        [state.order[i-1], state.order[i]] = [state.order[i], state.order[i-1]];
        renderWitnessList(); renderTable();
      }
    });
    down.addEventListener("click", () => {
      const i = state.order.indexOf(w.id);
      if (i >= 0 && i < state.order.length - 1) {
        [state.order[i+1], state.order[i]] = [state.order[i], state.order[i+1]];
        renderWitnessList(); renderTable();
      }
    });
    orderBtns.appendChild(up); orderBtns.appendChild(down);
    meta.appendChild(orderBtns);

    div.appendChild(meta);

    const cntAll = w.wordsAll.length;
    const cntF = state.filtered[w.id]?.length ?? 0;
    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = `Слов всего: ${cntAll}, в диапазоне: ${cntF}`;
    div.appendChild(tag);

    elWitnessList.appendChild(div);
  }
}

function rowPassesVariantFilter(rowTypes){
  if (state.variantMode === "off") return true;
  if (!rowTypes || rowTypes.size === 0) return false;
  for (const t of rowTypes) if (state.variantFilters.has(t)) return true;
  return false;
}

function renderTable(){
  const master = masterWitness();
  if (!master){
    elTableWrap.innerHTML = `<div style="padding:12px;color:#666;">Пожалуйста, выберите Master.</div>`;
    return;
  }

  recomputeFiltered();
  const mWords = state.filtered[master.id] || [];
  const visibles = visibleWitnessesOrdered();

  if (mWords.length === 0){
    elTableWrap.innerHTML = `<div style="padding:12px;color:#666;">У Master нет слов в указанном диапазоне листов.</div>`;
    return;
  }

  if (visibles.length === 0){
    elTableWrap.innerHTML = `<div style="padding:12px;color:#666;">Пожалуйста, включите отображение хотя бы одного списка.</div>`;
    return;
  }

  const hasMapping = Object.keys(state.mapping).length > 0;

  const table = document.createElement("table");
  table.className = "table";

  const thead = document.createElement("thead");
  const trh = document.createElement("tr");

  const th0 = document.createElement("th"); th0.textContent = "№ / лист";
  const th1 = document.createElement("th"); th1.textContent = "ЭТАЛОН";
  const th2 = document.createElement("th"); th2.textContent = "Лемма";
  trh.appendChild(th0); trh.appendChild(th1); trh.appendChild(th2);

  for (const w of visibles){
    if (w.id === master.id) continue;
    const th = document.createElement("th");
    th.innerHTML = `<div>${escapeHtml(w.name)}</div><div class="tag">${escapeHtml(w.fileName || "")}</div>`;
    trh.appendChild(th);
  }

  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (let i = 0; i < mWords.length; i++){
    const mTok = mWords[i];
    const tr = document.createElement("tr");

    const td0 = document.createElement("td");
    td0.innerHTML = `<div><b>${i+1}</b></div><div class="tag">лист: ${escapeHtml(String(mTok.sheet ?? "?"))}</div>`;
    tr.appendChild(td0);

    const tdM = document.createElement("td");
    tdM.innerHTML = `<div class="cellText">${escapeHtml(mTok.form || "")}</div>`;
    tr.appendChild(tdM);

    const tdL = document.createElement("td");
    tdL.innerHTML = `<div class="cellText">${escapeHtml(mTok.lemma || "")}</div>`;
    tr.appendChild(tdL);

    let rowTypes = new Set();

    for (const w of visibles){
      if (w.id === master.id) continue;

      const td = document.createElement("td");
      const wWords = state.filtered[w.id] || [];

      let j = null;
      if (hasMapping && state.mapping[w.id]) j = state.mapping[w.id][i];

      const wTok = (j === null || j === undefined) ? null : wWords[j];
      const cls = classifyPair(mTok, wTok);
      for (const t of cls.types) rowTypes.add(t);

      const wordText = wTok ? wTok.form : "---";
      td.innerHTML = `<div class="cellText">${escapeHtml(wordText)}</div>`;

      const tools = document.createElement("div");
      tools.className = "cellTools";

      const left = document.createElement("button");
      left.className = "shiftBtn";
      left.textContent = "◀";
      left.title = "Сдвинуть соответствие на 1 слово назад";

      const right = document.createElement("button");
      right.className = "shiftBtn";
      right.textContent = "▶";
      right.title = "Сдвинуть соответствие на 1 слово вперёд";

      left.addEventListener("click", () => {
        if (!state.mapping[w.id]) state.mapping[w.id] = Array(mWords.length).fill(null);
        shiftMapping(state.mapping[w.id], i, -1, wWords.length);
        renderTable();
      });
      right.addEventListener("click", () => {
        if (!state.mapping[w.id]) state.mapping[w.id] = Array(mWords.length).fill(null);
        shiftMapping(state.mapping[w.id], i, +1, wWords.length);
        renderTable();
      });

      const badges = document.createElement("div");
      badges.className = "badgeRow";
      const b = document.createElement("span");
      b.className = "badge";
      b.textContent = cls.label;
      badges.appendChild(b);

      tools.appendChild(left);
      tools.appendChild(right);

      td.appendChild(tools);
      td.appendChild(badges);
      tr.appendChild(td);
    }

    if (rowPassesVariantFilter(rowTypes)) tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  elTableWrap.innerHTML = "";
  elTableWrap.appendChild(table);
}

async function doAlign(){
  const master = masterWitness();
  if (!master) return;

  recomputeFiltered();
  const mWords = state.filtered[master.id] || [];
  if (mWords.length === 0) {
    setStatus("У Master нет слов в заданном диапазоне листов.");
    return;
  }

  setStatus("Автовыравнивание…");
  state.mapping = {};

  for (const w of state.witnesses){
    if (w.id === master.id) continue;
    const wWords = state.filtered[w.id] || [];
    state.mapping[w.id] = alignWordsToMaster(mWords, wWords);
  }

  setStatus("Готово: выравнивание построено. При необходимости используйте ◀/▶ для ручной правки.");
  renderWitnessList();
  renderCsvSelect();
  updateButtons();
  renderTable();
}

function clearAll(){
  state.witnesses = [];
  state.masterId = null;
  state.order = [];
  state.filtered = {};
  state.mapping = {};
  setStatus("Сброшено.");
  elCsvWitnessSelect.innerHTML = "";
  renderWitnessList();
  renderTable();
  updateButtons();
}

function readFileAsText(file){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsText(file);
  });
}

async function handleFiles(files){
  setStatus("Чтение файлов…");

  for (const f of files){
    const text = await readFileAsText(f);
    const parsed = parseTEIToWords(text);

    state.witnesses.push({
      id: uid(),
      name: parsed.title || f.name,
      fileName: f.name,
      teiText: text,
      wordsAll: parsed.words,
      range: { from:"", to:"" },
      visible: true
    });
  }

  if (!state.masterId && state.witnesses.length) state.masterId = state.witnesses[0].id;

  ensureOrder();
  recomputeFiltered();
  renderWitnessList();
  renderCsvSelect();
  renderTable();
  updateButtons();

  setStatus("Файлы загружены. Пожалуйста, выберите Master и диапазоны листов, затем нажмите «Автовыравнивание».");
}

function collectProject(){
  return {
    version: 4,
    createdAt: new Date().toISOString(),
    witnesses: state.witnesses.map(w => ({
      id: w.id,
      name: w.name,
      fileName: w.fileName,
      teiText: w.teiText,
      range: w.range,
      visible: w.visible
    })),
    masterId: state.masterId,
    order: state.order,
    mapping: state.mapping,
    variantFilters: Array.from(state.variantFilters),
    variantMode: state.variantMode
  };
}

async function loadProject(obj){
  clearAll();
  setStatus("Загрузка проекта…");

  for (const w0 of obj.witnesses){
    const parsed = parseTEIToWords(w0.teiText);
    state.witnesses.push({
      id: w0.id,
      name: w0.name || parsed.title || w0.fileName,
      fileName: w0.fileName,
      teiText: w0.teiText,
      wordsAll: parsed.words,
      range: w0.range || {from:"",to:""},
      visible: (w0.visible !== false)
    });
  }

  state.masterId = obj.masterId || (state.witnesses[0]?.id ?? null);
  state.order = obj.order || [];
  state.mapping = obj.mapping || {};
  state.variantFilters = new Set(obj.variantFilters || ["graphic","phonetic","morph","syntax","lexical"]);
  state.variantMode = obj.variantMode || "off";

  elVariantMode.value = state.variantMode;
  for (const cb of elTypeFilters) cb.checked = state.variantFilters.has(cb.value);

  ensureOrder();
  recomputeFiltered();
  renderWitnessList();
  renderCsvSelect();
  renderTable();
  updateButtons();

  setStatus("Проект загружен. При необходимости нажмите «Автовыравнивание» для пересчёта.");
}

function wireUI(){
  elFileInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    await handleFiles(files);
    elFileInput.value = "";
  });

  elBtnAlign.addEventListener("click", doAlign);
  elBtnClear.addEventListener("click", clearAll);

  elVariantMode.addEventListener("change", () => {
    state.variantMode = elVariantMode.value;
    renderTable();
  });

  for (const cb of elTypeFilters){
    cb.addEventListener("change", () => {
      if (cb.checked) state.variantFilters.add(cb.value);
      else state.variantFilters.delete(cb.value);
      renderTable();
    });
  }

  elBtnSaveProject.addEventListener("click", () => {
    downloadJSON(collectProject(), "alignment_project.json");
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

    recomputeFiltered();
    const visibles = visibleWitnessesOrdered();

    const payload = {
      masterId: state.masterId,
      witnesses: visibles.map(w => ({
        id: w.id,
        name: w.name,
        words: state.filtered[w.id] || []
      })),
      alignment: state.mapping
    };

    const tei = exportParallelTEIWords(payload);
    downloadTextFile(tei, "parallel_alignment_words.tei.xml", "application/xml;charset=utf-8");
  });

  elBtnExportCSV.addEventListener("click", () => {
    const master = masterWitness();
    if (!master) return;

    const witnessId = elCsvWitnessSelect.value;
    const w = getWitness(witnessId);
    if (!w) return;

    recomputeFiltered();

    const mWords = state.filtered[master.id] || [];
    const wWords = state.filtered[w.id] || [];
    const map = state.mapping[w.id] || Array(mWords.length).fill(null);

    const csv = buildComparisonCSV(
      master.fileName || master.name,
      w.fileName || w.name,
      mWords, wWords, map
    );

    downloadTextFile(
      csv,
      `compare_${master.fileName || "master"}__${w.fileName || "witness"}.csv`,
      "text/csv;charset=utf-8"
    );
  });

  // help
  const openHelp = () => { helpModal.classList.remove("hidden"); helpModal.setAttribute("aria-hidden","false"); };
  const closeHelp = () => { helpModal.classList.add("hidden"); helpModal.setAttribute("aria-hidden","true"); };
  helpBtn.addEventListener("click", openHelp);
  helpCloseBackdrop.addEventListener("click", closeHelp);
  helpCloseX.addEventListener("click", closeHelp);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeHelp(); });
}

wireUI();
renderWitnessList();
renderTable();
updateButtons();