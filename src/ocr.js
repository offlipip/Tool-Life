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
 * Redimensiona e prepara a foto antes de mandar pro OCR: converte pra
 * escala de cinza, estica o contraste, e depois binariza (preto/branco
 * puro) usando o método de Otsu — ajuda a separar o texto de reflexo e
 * sombra residual que a escala de cinza sozinha ainda deixa passar.
 */
async function preprocess(file, maxDim = 2000) {
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

  // 1) tons de cinza + esticar contraste
  let min = 255;
  let max = 0;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    gray[p] = g;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  const histogram = new Array(256).fill(0);
  for (let p = 0; p < gray.length; p++) {
    const v = Math.round(((gray[p] - min) / range) * 255);
    gray[p] = v;
    histogram[v]++;
  }

  // 2) binariza pelo método de Otsu — acha sozinho o ponto de corte
  // entre "texto" e "fundo" a partir do histograma da própria foto,
  // em vez de um limite fixo que funcionaria bem numa foto e mal noutra.
  const threshold = otsuThreshold(histogram, gray.length);
  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const v = gray[p] > threshold ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function otsuThreshold(histogram, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let sumB = 0;
  let wB = 0;
  let varMax = 0;
  let threshold = 127;
  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * histogram[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = i;
    }
  }
  return threshold;
}

function closeEnoughSameLine(a, b, maxGap) {
  const gap = b.bbox.x0 - a.bbox.x1;
  if (gap < 0 || gap > maxGap) return false;
  const aH = a.bbox.y1 - a.bbox.y0;
  const bH = b.bbox.y1 - b.bbox.y0;
  const tol = Math.max(6, Math.min(aH, bH) * 0.6);
  return Math.abs(((a.bbox.y0 + a.bbox.y1) / 2) - ((b.bbox.y0 + b.bbox.y1) / 2)) < tol;
}

/**
 * Às vezes o Tesseract quebra um número em dois pedaços (ex: "2030."
 * vira "20" + "30."). Todo valor nessa tela termina com ".", então dá
 * pra usar isso como âncora: junta fragmentos vizinhos na mesma linha
 * até achar o ponto final.
 */
function mergeAdjacentValueFragments(tokens) {
  const sorted = [...tokens].sort((a, b) => {
    const ay = (a.bbox.y0 + a.bbox.y1) / 2;
    const by = (b.bbox.y0 + b.bbox.y1) / 2;
    if (Math.abs(ay - by) > 8) return ay - by;
    return a.bbox.x0 - b.bbox.x0;
  });

  const out = [];
  let i = 0;
  while (i < sorted.length) {
    let cur = sorted[i];
    i++;
    if (!cur.text.startsWith('#')) {
      while (
        i < sorted.length &&
        !cur.text.endsWith('.') &&
        !sorted[i].text.startsWith('#') &&
        /^\d+\.?$/.test(sorted[i].text) &&
        closeEnoughSameLine(cur, sorted[i], 14)
      ) {
        const next = sorted[i];
        cur = {
          text: cur.text + next.text,
          confidence: Math.min(cur.confidence, next.confidence),
          bbox: {
            x0: cur.bbox.x0, x1: next.bbox.x1,
            y0: Math.min(cur.bbox.y0, next.bbox.y0), y1: Math.max(cur.bbox.y1, next.bbox.y1),
          },
        };
        i++;
      }
    }
    out.push(cur);
  }
  return out;
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

  const fullyMerged = mergeAdjacentValueFragments(merged);

  const labels = fullyMerged.filter((w) => /^#\d{1,4}$/.test(w.text));
  const values = fullyMerged.filter((w) => !w.text.startsWith('#') && /^\d{1,4}\.?\d*$/.test(w.text));

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
