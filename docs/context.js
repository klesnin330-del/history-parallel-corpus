export function initContext(tableWrap, panel, metaEl, wordsEl, getState) {
  if (!tableWrap || !panel) return;

  tableWrap.addEventListener('click', (e) => {
    const cell = e.target.closest('.word-clickable');
    if (!cell) return;

    const witnessId = cell.dataset.witness;
    const idx = parseInt(cell.dataset.index, 10);
    if (!witnessId || isNaN(idx)) return;

    const state = getState();
    const witness = state.witnesses.find(w => w.id === witnessId);
    if (!witness) return;

    // Берём отфильтрованные токены (по листам), если есть
    const tokens = state.filtered[witnessId] || witness.tokensAll;
    if (!tokens || tokens.length === 0) return;

    const start = Math.max(0, idx - 10);
    const end = Math.min(tokens.length - 1, idx + 10);
    const slice = tokens.slice(start, end + 1);

    // Мета-информация
    metaEl.innerHTML = `
      <strong>Список:</strong> ${esc(witness.name)} |
      <strong>Слово:</strong> <span class="highlight-word">${esc(tokens[idx].form)}</span> |
      <strong>Позиция:</strong> ${idx + 1} из ${tokens.length}
    `;

    // Рендер контекста
    wordsEl.innerHTML = slice.map((tok, i) => {
      const isTarget = (start + i) === idx;
      return `<span class="${isTarget ? 'ctx-target' : 'ctx-word'}">${esc(tok.form)}</span>`;
    }).join(' ');

    // Показать и прокрутить
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}