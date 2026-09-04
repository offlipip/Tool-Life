import { createWorker } from 'tesseract.js';

// O worker é reaproveitado entre leituras (evita recarregar o modelo
// toda hora). Ele baixa o modelo de idioma (~10-15MB) da internet na
// primeira leitura; depois disso o service worker mantém em cache.
let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      await worker.setParameters({
        // A tela só mostra dígitos, "#" e ".", então restringir o
        // alfabeto ajuda MUITO a acurácia nesse tipo de leitura.
        tessedit_char_whitelist: '#0123456789.',
        // PSM 11 = "sparse text": bom para texto espalhado em blocos,
        // como as duas tabelas lado a lado da tela do painel.
        tessedit_pageseg_mode: '11',
      });
      return worker;
    })();
  }
  return workerPromise;
}

/**
 * Redimensiona e prepara a foto (escala de cinza + esticar o contraste)
 * antes de mandar pro OCR. Isso ajuda bastante com reflexo de luz e
 * fotos meio escuras/desbotadas.
 */
async function preprocess(file, maxDim = 1800) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('read_failed'));
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('image_load_failed'));
    el.src = dataUrl;
  });

  let w = img.width;
  let h = img.height;
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = ((d[i] - min) / range) * 255;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(imageData, 0, 0);

  return canvas;
}

/**
 * A tela mostra pares "#NNN   VALOR" lado a lado em duas tabelas (por
 * isso não dá pra simplesmente ler o texto de cima a baixo). Em vez
 * disso, pega a posição (x,y) de cada palavra reconhecida e casa cada
 * "#NNN" com o número mais próximo à direita, na mesma altura da linha.
 */
function parseRows(words) {
  const clean = words
    .map((w) => ({ text: (w.text || '').trim(), confidence: w.confidence, bbox: w.bbox }))
    .filter((w) => w.text.length > 0 && w.bbox);

  // Às vezes o "#" sai como uma palavra separada dos dígitos — junta de
  // novo quando eles estão colados um no outro.
  const merged = [];
  for (let i = 0; i < clean.length; i++) {
    const cur = clean[i];
    const next = clean[i + 1];
    if (cur.text === '#' && next && /^\d+$/.test(next.text) && next.bbox.x0 - cur.bbox.x1 < 20) {
      merged.push({
        text: '#' + next.text,
        confidence: Math.min(cur.confidence, next.confidence),
        bbox: {
          x0: cur.bbox.x0,
          x1: next.bbox.x1,
          y0: Math.min(cur.bbox.y0, next.bbox.y0),
          y1: Math.max(cur.bbox.y1, next.bbox.y1),
        },
      });
      i++;
    } else {
      merged.push(cur);
    }
  }

  const labels = merged.filter((w) => /^#\d{1,4}$/.test(w.text));
  const values = merged.filter((w) => !w.text.startsWith('#') && /^\d{1,4}\.?\d*$/.test(w.text));

  const yCenter = (w) => (w.bbox.y0 + w.bbox.y1) / 2;
  const rowHeight = (w) => Math.max(1, w.bbox.y1 - w.bbox.y0);

  const readings = [];
  labels.forEach((label) => {
    const num = parseInt(label.text.slice(1), 10);
    const tol = Math.max(12, rowHeight(label) * 0.7);
    const candidates = values
      .filter((v) => Math.abs(yCenter(v) - yCenter(label)) < tol && v.bbox.x0 > label.bbox.x0)
      .sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (candidates.length === 0) return;

    const value = candidates[0];
    const raw = value.text.endsWith('.') ? value.text.slice(0, -1) : value.text;
    const num2 = parseFloat(raw);
    if (isNaN(num2)) return;

    const score = Math.min(label.confidence ?? 0, value.confidence ?? 0);
    readings.push({ num, value: num2, confidence: score >= 75 ? 'high' : 'low' });
  });

  return readings;
}

/**
 * Lê uma foto da tela "VARIAVEL MACRO" e devolve os pares
 * { num, value, confidence } encontrados. num é o número após o "#".
 */
export async function readPanelPhoto(file) {
  const canvas = await preprocess(file);
  const worker = await getWorker();
  const { data } = await worker.recognize(canvas);
  const words = (data.words || []).map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox }));
  return parseRows(words);
}
