export function downloadTextFile(text, filename, mime="text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function downloadJSON(obj, filename) {
  downloadTextFile(JSON.stringify(obj, null, 2), filename, "application/json;charset=utf-8");
}

export function loadJSONFile(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { try { res(JSON.parse(fr.result)); } catch(e) { rej(e); } };
    fr.onerror = rej;
    fr.readAsText(file);
  });
}