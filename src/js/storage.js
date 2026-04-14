export function downloadTextFile(text, filename, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadJSON(obj, filename) {
  const text = JSON.stringify(obj, null, 2);
  downloadTextFile(text, filename, "application/json;charset=utf-8");
}

export function loadJSONFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try { resolve(JSON.parse(fr.result)); }
      catch (e) { reject(e); }
    };
    fr.onerror = reject;
    fr.readAsText(file);
  });
}