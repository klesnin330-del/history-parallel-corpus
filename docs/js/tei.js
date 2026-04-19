export function parseTEIToTokens(xmlText) {
  const titleMatch = xmlText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Без названия';
  
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const err = doc.querySelector("parsererror");
  if (err) return { title: title + ' (ошибка парсинга XML)', tokens: [] };

  const tokens = [];
  const walk = (node) => {
    if (!node) return;
    if (node.nodeType === 1) { // ELEMENT_NODE
      const name = node.localName.toLowerCase();
      if (name === 'w') {
        const id = node.getAttribute('xml:id') || node.getAttribute('id') || '';
        const lemma = node.getAttribute('lemma') || '';
        // Склеиваем текст внутри <w>, игнорируя <lb/> и лишние пробелы
        let form = '';
        const tw = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        let tNode;
        while ((tNode = tw.nextNode())) form += tNode.nodeValue.replace(/\s+/g, '');
        form = form.trim();
        const idx = tokens.length;
        tokens.push({ id, form, lemma, rawIndex: idx });
      } else {
        for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
      }
    }
  };
  const textEl = doc.querySelector('text') || doc.documentElement;
  walk(textEl);
  return { title, tokens };
}