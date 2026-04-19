import { parseTEIToTokens } from "./tei.js";
import { alignTokens, shiftMapping } from "./align.js";
import { classifyPair, escapeHtml, tokenSimilarity } from "./variants.js";
import { exportParallelTEI } from "./export_tei.js";
import { downloadTextFile, downloadJSON, loadJSONFile } from "./storage.js";

const state = {
  witnesses: [],
  masterId: null,
  order: [],
  mapping: {},
  variantFilters: new Set(["graphic", "phonetic", "morph", "syntax", "lexical"]),
  variantMode: "off"
};

const els = {
  fileInput: document.getElementById("fileInput"),
  witnessList: document.getElementById("witnessList"),
  btnAlign: document.getElementById("btnAlign"),
  btnClear: document.getElementById("btnClear"),
  btnSave: document.getElementById("btnSaveProject"),
  projectInput: document.getElementById("projectInput"),
  btnExport: document.getElementById("btnExportTEI"),
  status: document.getElementById("status"),
  tableWrap: document.getElementById("tableWrap"),
  contextPane: document.getElementById("contextPane"),
  variantMode: document.getElementById("variantMode"),
  typeFilters: Array.from(document.querySelectorAll(".typeFilter") || []),
  helpBtn: document.getElementById("helpBtn"),
  helpModal: document.getElementById("helpModal")
};

function uid() { return Math.random().toString(36).substr(2, 9) + Date.now().toString(36); }
function setStatus(msg) { els.status.textContent = msg; }
function getWitness(id) { return state.witnesses.find(w => w.id === id); }
function masterWitness() { return getWitness(state.masterId); }

function updateButtons() {
  els.btnAlign.disabled = !(state.witnesses.length >= 2 && state.masterId);
  els.btnClear.disabled = state.witnesses.length === 0;
  els.btnSave.disabled = state.witnesses.length === 0;
  els.btnExport.disabled = Object.keys(state.mapping).length === 0;
}

function renderWitnessList() {
  els.witnessList.innerHTML = '';
  state.order = state.witnesses.map(w => w.id);
  for (const id of state.order) {
    const w = getWitness(id);
    if (!w) continue;
    const div = document.createElement('div');
    div.className = 'witness' + (w.id === state.masterId ? ' active' : '');
    div.innerHTML = `
      <div class="witness__title">${escapeHtml(w.name || w.fileName)}</div>
      <div class="witness__meta">
        <label class="label"><input type="checkbox" class="visCb" ${w.visible ? 'checked' : ''}> Видимость</label>
        <label class="label"><input type="radio" name="masterRadio" ${w.id === state.masterId ? 'checked' : ''}> Master</label>
        <div class="orderBtns"><button class="upBtn">↑</button><button class="downBtn">↓</button></div>
      </div>
      <div class="tag">Слов: ${w.tokensAll.length}</div>
    `;
    div.querySelector('.visCb').addEventListener('change', e => { w.visible = e.target.checked; renderTable(); });
    div.querySelector('input[name="masterRadio"]').addEventListener('change', () => {
      state.masterId = w.id; state.mapping = {}; renderWitnessList(); renderTable(); updateButtons();
    });
    div.querySelector('.upBtn').addEventListener('click', () => {
      const i = state.order.indexOf(w.id);
      if (i > 0) { [state.order[i-1], state.order[i]] = [state.order[i], state.order[i-1]]; renderWitnessList(); renderTable(); }
    });
    div.querySelector('.downBtn').addEventListener('click', () => {
      const i = state.order.indexOf(w.id);
      if (i < state.order.length - 1) { [state.order[i], state.order[i+1]] = [state.order[i+1], state.order[i]]; renderWitnessList(); renderTable(); }
    });
    els.witnessList.appendChild(div);
  }
}

function showContext(witnessId, tokenIndex) {
  const w = getWitness(witnessId);
  if (!w || tokenIndex === null) {
    els.contextPane.classList.add('hidden');
    return;
  }
  const start = Math.max(0, tokenIndex - 10);
  const end = Math.min(w.tokensAll.length, tokenIndex + 11);
  const slice = w.tokensAll.slice(start, end);
  const html = slice.map((t, i) => {
    const isTarget = (start + i) === tokenIndex;
    return `<span class="${isTarget ? 'contextPane__highlight' : ''}">${escapeHtml(t.form)}</span>`;
  }).join(' ');
  els.contextPane.innerHTML = `
    <div class="contextPane__title">Контекст: ${escapeHtml(w.name)} (исходный индекс #${tokenIndex + 1})</div>
    <div class="contextPane__text">... ${html} ...</div>
  `;
  els.contextPane.classList.remove('hidden');
  els.contextPane.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderTable() {
  els.contextPane.classList.add('hidden');
  const master = masterWitness();
  if (!master) {
    els.tableWrap.innerHTML = '<div style="padding:12px;color:#666;">Выберите Master.</div>';
    return;
  }
  const mTokens = master.tokensAll;
  if (mTokens.length === 0) {
    els.tableWrap.innerHTML = '<div style="padding:12px;color:#666;">Нет слов для отображения.</div>';
    return;
  }
  const visibles = state.order.map(id => getWitness(id)).filter(w => w && w.visible);
  const hasMap = Object.keys(state.mapping).length > 0;

  const table = document.createElement('table');
  table.className = 'table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  trh.innerHTML = '<th>№</th><th>ЭТАЛОН</th><th>Лемма</th>';
  for (const w of visibles) {
    if (w.id === master.id) continue;
    trh.innerHTML += `<th>${escapeHtml(w.name)}<br><span class="tag">${escapeHtml(w.fileName)}</span></th>`;
  }
  thead.appendChild(trh);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let i = 0; i < mTokens.length; i++) {
    const mTok = mTokens[i];
    let rowTypes = new Set();
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><b>${i+1}</b></td><td><div class="cellText" data-wid="${master.id}" data-tidx="${mTok.rawIndex}">${escapeHtml(mTok.form)}</div></td><td><div class="cellText">${escapeHtml(mTok.lemma)}</div></td>`;

    for (const w of visibles) {
      if (w.id === master.id) continue;
      const td = document.createElement('td');
      const wTokens = w.tokensAll;
      let j = hasMap && state.mapping[w.id] ? state.mapping[w.id][i] : null;
      const wTok = (j === null || j === undefined || j < 0 || j >= wTokens.length) ? null : wTokens[j];
      const cls = classifyPair(mTok, wTok);
      
      // 🔒 БЕЗОПАСНАЯ ИТЕРАЦИЯ (исправляет вашу ошибку)
      if (cls.types) {
        for (const t of cls.types) rowTypes.add(t);
      }

      const wordText = wTok ? wTok.form : '---';
      td.innerHTML = `
        <div class="cellText" data-wid="${w.id}" data-tidx="${wTok ? wTok.rawIndex : 'null'}">${escapeHtml(wordText)}</div>
        <div class="cellTools">
          <button class="shiftBtn" title="Назад">◀</button>
          <button class="shiftBtn" title="Вперёд">▶</button>
          <div class="badgeRow"><span class="badge ${cls.types?.size ? Array.from(cls.types)[0] : ''}">${cls.label}</span></div>
        </div>
      `;
      td.querySelector('.cellText').addEventListener('click', () => showContext(w.id, wTok ? wTok.rawIndex : null));
      td.querySelector('.shiftBtn[title="Назад"]').addEventListener('click', () => {
        if (!state.mapping[w.id]) state.mapping[w.id] = Array(mTokens.length).fill(null);
        shiftMapping(state.mapping[w.id], i, -1, wTokens.length);
        renderTable();
      });
      td.querySelector('.shiftBtn[title="Вперёд"]').addEventListener('click', () => {
        if (!state.mapping[w.id]) state.mapping[w.id] = Array(mTokens.length).fill(null);
        shiftMapping(state.mapping[w.id], i, 1, wTokens.length);
        renderTable();
      });
      tr.appendChild(td);
    }

    tr.querySelector('.cellText').addEventListener('click', () => showContext(master.id, mTok.rawIndex));

    const pass = state.variantMode === 'off' || (rowTypes.size > 0 && [...rowTypes].some(t => state.variantFilters.has(t)));
    if (pass) tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  els.tableWrap.innerHTML = '';
  els.tableWrap.appendChild(table);
}

async function doAlign() {
  const master = masterWitness();
  if (!master) return;
  setStatus("Выравнивание...");
  state.mapping = {};
  for (const w of state.witnesses) {
    if (w.id === master.id) continue;
    state.mapping[w.id] = alignTokens(master.tokensAll, w.tokensAll);
  }
  setStatus("Готово. Используйте ◀/▶ для ручной правки. Кликните на слово для контекста (±10 слов).");
  renderTable(); updateButtons();
}

function clearAll() {
  state.witnesses = []; state.masterId = null; state.order = []; state.mapping = {};
  setStatus("Сброшено."); renderWitnessList(); renderTable(); updateButtons();
}

async function handleFiles(files) {
  setStatus("Чтение файлов...");
  for (const f of files) {
    const text = await f.text();
    const parsed = parseTEIToTokens(text);
    state.witnesses.push({ id: uid(), name: parsed.title || f.name, fileName: f.name, teiText: text, tokensAll: parsed.tokens, visible: true });
  }
  if (!state.masterId && state.witnesses.length) state.masterId = state.witnesses[0].id;
  renderWitnessList(); renderTable(); updateButtons();
  setStatus("Файлы загружены. Выберите Master и нажмите «Автовыравнивание».");
}

function collectProject() {
  return {
    version: 1, createdAt: new Date().toISOString(),
    witnesses: state.witnesses.map(w => ({ id: w.id, name: w.name, fileName: w.fileName, teiText: w.teiText, visible: w.visible })),
    masterId: state.masterId, order: state.order, mapping: state.mapping,
    variantFilters: Array.from(state.variantFilters), variantMode: state.variantMode
  };
}

async function loadProject(obj) {
  clearAll(); setStatus("Загрузка проекта...");
  for (const w0 of obj.witnesses) {
    const parsed = parseTEIToTokens(w0.teiText);
    state.witnesses.push({ id: w0.id, name: w0.name || parsed.title || w0.fileName, fileName: w0.fileName, teiText: w0.teiText, tokensAll: parsed.tokens, visible: (w0.visible !== false) });
  }
  state.masterId = obj.masterId || state.witnesses[0]?.id;
  state.order = obj.order || []; state.mapping = obj.mapping || {};
  state.variantFilters = new Set(obj.variantFilters || ["graphic","phonetic","morph","syntax","lexical"]);
  state.variantMode = obj.variantMode || "off";
  els.variantMode.value = state.variantMode;
  for (const cb of els.typeFilters || []) cb.checked = state.variantFilters.has(cb.value);
  renderWitnessList(); renderTable(); updateButtons();
  setStatus("Проект загружен.");
}

function wireUI() {
  if (els.fileInput) els.fileInput.addEventListener('change', async e => {
    if (e.target.files.length) { await handleFiles(Array.from(e.target.files)); e.target.value = ''; }
  });
  if (els.btnAlign) els.btnAlign.addEventListener('click', doAlign);
  if (els.btnClear) els.btnClear.addEventListener('click', clearAll);
  if (els.btnSave) els.btnSave.addEventListener('click', () => downloadJSON(collectProject(), "project_history.json"));
  if (els.projectInput) els.projectInput.addEventListener('change', async e => {
    if (e.target.files[0]) { await loadProject(await loadJSONFile(e.target.files[0])); e.target.value = ''; }
  });
  if (els.btnExport) els.btnExport.addEventListener('click', () => {
    const visibles = state.order.map(id => getWitness(id)).filter(w => w && w.visible);
    const payload = { masterId: state.masterId, witnesses: visibles.map(w => ({ id: w.id, name: w.name, tokens: w.tokensAll })), mapping: state.mapping };
    downloadTextFile(exportParallelTEI(payload), "parallel_corpus.tei.xml", "application/xml;charset=utf-8");
  });
  if (els.variantMode) els.variantMode.addEventListener('change', () => { state.variantMode = els.variantMode.value; renderTable(); });
  for (const cb of els.typeFilters || []) {
    cb.addEventListener('change', () => {
      if (cb.checked) state.variantFilters.add(cb.value); else state.variantFilters.delete(cb.value); renderTable();
    });
  }
  
  const openHelp = () => { if(els.helpModal) { els.helpModal.classList.remove('hidden'); els.helpModal.setAttribute('aria-hidden', 'false'); } };
  const closeHelp = () => { if(els.helpModal) { els.helpModal.classList.add('hidden'); els.helpModal.setAttribute('aria-hidden', 'true'); } };
  if (els.helpBtn) els.helpBtn.addEventListener('click', openHelp);
  if (els.helpModal) {
    const closeB = els.helpModal.querySelector('#helpCloseBackdrop');
    const closeX = els.helpModal.querySelector('#helpCloseX');
    if (closeB) closeB.addEventListener('click', closeHelp);
    if (closeX) closeX.addEventListener('click', closeHelp);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHelp(); });
}

wireUI();
renderWitnessList();
renderTable();
updateButtons();