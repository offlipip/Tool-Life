import { createWorker } from 'tesseract.js';

// Dois workers separados: um afinado pra tabela de números (só dígitos,
// leitura esparsa) e outro pra texto livre (comentário do programa CNC,
// com letras e pontuação) — cada um com a configuração que funciona
// melhor pro seu tipo de conteúdo.
//
// O Tesseract tem três níveis de modelo treinado: "fast" (leve e rápido,
// o padrão da biblioteca), o normal, e "best" (o mais preciso e o mais
// lento/pesado). Usamos o do MEIO — mais preciso que o fast sem o custo
// de tempo do best, que importa porque o app precisa ser mais rápido que
// conferir na mão no painel.
const TESSDATA_NORMAL = 'https://tessdata.projectnaptha.com/4.0.0';

let digitWorkerPromise = null;
let textWorkerPromise = null;

function getDigitWorker() {
  if (!digitWorkerPromise) {
    digitWorkerPromise = (async () => {
      const worker = await createWorker('eng', 1, { langPath: TESSDATA_NORMAL });
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
  return digitWorkerPromise;
}

function getTextWorker() {
  if (!textWorkerPromise) {
    textWorkerPromise = (async () => {
      const worker = await createWorker('eng', 1, { langPath: TESSDATA_NORMAL });
      await worker.setParameters({
        // PSM 6 = bloco uniforme de texto — bom pra linhas de comentário
        // do programa, uma abaixo da outra.
        tessedit_pageseg_mode: '6',
      });
      return worker;
    })();
  }
  return textWorkerPromise;
}

async function loadImageElement(input) {
  const isCanvas = typeof HTMLCanvasElement !== 'undefined' && input instanceof HTMLCanvasElement;
  const dataUrl = isCanvas
    ? input.toDataURL('image/jpeg', 0.95)
    : await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('read_failed'));
      reader.readAsDataURL(input);
    });

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = dataUrl;
  });
}

/**
 * Redimensiona e prepara a foto (escala de cinza + esticar o contraste)
 * antes de mandar pro OCR. Aceita tanto um File (foto original) quanto
 * um HTMLCanvasElement (já recortado na tela de recorte).
 */
async function preprocess(input, maxDim = 1800) {
  const img = await loadImageElement(input);

  let w = img.width;
  let h = img.height;
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  } else if (Math.max(w, h) < 1100) {
    // Recorte pequeno: amplia antes de mandar pro OCR. Texto maior é mais
    // fácil de reconhecer, mesmo que a ampliação não crie detalhe novo.
    const scale = Math.min(2.5, 1400 / Math.max(w, h));
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
 * vira "20" + "30.", ou "70.5" vira "70." + "5").
 *
 * Cuidado aqui: já quebrou uma vez por ser frouxo demais. Um valor que
 * termina em "." normalmente JÁ ESTÁ completo ("763."), então só se
 * continua juntando depois do ponto quando o próximo pedaço é um único
 * dígito colado nele (a casa decimal) — nunca um número inteiro ao lado.
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
      for (;;) {
        const next = sorted[i];
        if (!next || next.text.startsWith('#')) break;
        if (/\.\d+$/.test(cur.text)) break;            // já tem casa decimal: completo
        if (!/^\d+\.?$/.test(next.text)) break;

        const endsWithDot = cur.text.endsWith('.');
        // depois do ponto, só aceita UM dígito bem colado (a casa decimal)
        const maxGap = endsWithDot ? 8 : 14;
        if (endsWithDot && next.text.length !== 1) break;
        if (!closeEnoughSameLine(cur, next, maxGap)) break;

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
 * Aceita um File (foto original) ou um HTMLCanvasElement (recortado).
 */
export async function readPanelPhoto(input) {
  const canvas = await preprocess(input);
  const worker = await getDigitWorker();
  const { data } = await worker.recognize(canvas);
  const words = (data.words || []).map((w) => ({ text: w.text, confidence: w.confidence, bbox: w.bbox }));
  return parseRows(words);
}

/**
 * Lê uma foto da tela do PROGRAMA (comentários tipo "(T38 BMAN-900
 * BROCA TOPO...)") e devolve os pares { slot, bman } encontrados, na
 * ordem em que aparecem. Texto livre é mais difícil de acertar 100% do
 * que a grade de números — trate como um rascunho pra conferir, não
 * como leitura garantida.
 */
export async function readProgramPhoto(input) {
  const canvas = await preprocess(input, 2000);
  const worker = await getTextWorker();
  const { data } = await worker.recognize(canvas);
  const lines = (data.text || '').split('\n');

  const seen = new Set();
  const results = [];
  lines.forEach((line) => {
    const m = line.match(/T\s?(\d{1,3})\D{0,15}?([A-Za-z]{3,6}-?\d{2,5})/);
    if (!m) return;
    const slot = `T${m[1].padStart(2, '0')}`;
    if (seen.has(slot)) return;
    const bman = m[2].toUpperCase().replace(/^([A-Z]+)(\d)/, '$1-$2');
    seen.add(slot);
    results.push({ slot, bman });
  });
  return results;
}
