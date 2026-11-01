// Leitura de T + código de ferramenta (BMAN) a partir das palavras do OCR.
// Funciona pros dois formatos:
//  - tela do PROGRAMA da máquina: "(T38 BMAN-900 BROCA TOPO...)"
//  - TABELA de ferramentas (coluna "N." = T-01, coluna "Cod. fer." =
//    BMAN-0714), onde o código pode ficar um pouco acima ou abaixo do T
//    na mesma linha da tabela.
// Pareia pela POSIÇÃO na foto (código à direita do T, na mesma altura)
// e cai pra leitura linha a linha quando não tem posição.

const STRIP = /^[|[\]{}()"'`´:;,.«»\/!]+|[|[\]{}()"'`´:;,.«»\/!]+$/g;

function cleanText(t) {
  return String(t || '').toUpperCase().replace(STRIP, '').trim();
}
// letras que o OCR troca por número na parte numérica
function fixDigits(s) {
  return s.replace(/[OQD]/g, '0').replace(/[IL|]/g, '1').replace(/S/g, '5').replace(/B/g, '8').replace(/Z/g, '2');
}
function prefixLooksLikeBman(p) {
  if (p === 'BMAN') return true;
  if (p.length !== 4) return false;
  let diff = 0;
  for (let i = 0; i < 4; i++) if (p[i] !== 'BMAN'[i]) diff++;
  return diff <= 1; // PMAN, BMAM, 8MAN...
}

/** "BMAN-0714", "BMAN0714", "BMAN-O773", "PMAN-0755" → "BMAN-0714" */
export function parseCode(text) {
  const t = cleanText(text).replace(/[\s_.]/g, '-');
  const m = t.match(/^([A-Z8]{3,6})-?([0-9OQDILSBZ|]{2,5})$/);
  if (!m) return null;
  let prefix = m[1].replace(/^8/, 'B');
  const digits = fixDigits(m[2]);
  if (!/^\d{2,5}$/.test(digits)) return null;
  if (prefixLooksLikeBman(prefix)) prefix = 'BMAN';
  // outro prefixo: só se parecer código de verdade (letras reais, 3+ dígitos)
  else if (prefix.length < 3 || digits.length < 3 || !/[AEIOU]/.test(prefix) || /^(.)\1+$/.test(prefix) || /^[IL]+$/.test(prefix)) return null;
  return `${prefix}-${digits}`;
}

/** "T-01", "T01", "T 1", "T-O1", e o T lido como 7/1/I com hífen ("7-08") → "T01" */
export function parseSlot(text) {
  const t = cleanText(text);
  let m = t.match(/^T[-\s]?([0-9OQDIL]{1,2})$/);
  if (!m) m = t.match(/^[71I]-([0-9OQDIL]{1,2})$/);
  if (!m) return null;
  const d = fixDigits(m[1]);
  if (!/^\d{1,2}$/.test(d)) return null;
  const n = parseInt(d, 10);
  if (n < 1 || n > 99) return null;
  return `T${String(n).padStart(2, '0')}`;
}

function box(w) {
  const b = w.bbox || w;
  return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, yc: (b.y0 + b.y1) / 2, h: Math.max(1, b.y1 - b.y0) };
}

/** Pareamento por posição. words: [{ text, bbox:{x0,y0,x1,y1} }] */
export function pairByPosition(words) {
  const ws = (words || []).filter((w) => w && w.text && w.bbox).map((w) => ({ text: w.text, b: box(w) }));
  // junta "BMAN" + "0709" (e "T" + "18") quando o OCR separou em duas
  // palavras: procura o vizinho mais próximo à direita, na mesma altura
  const used = new Set();
  const merged = [];
  ws.forEach((cur, i) => {
    if (used.has(i)) return;
    if (!parseCode(cur.text) && !parseSlot(cur.text)) {
      let best = -1;
      let bestGap = Infinity;
      ws.forEach((n, j) => {
        if (j === i || used.has(j)) return;
        const gap = n.b.x0 - cur.b.x1;
        if (gap < -2 || gap > Math.max(cur.b.h, n.b.h) * 1.5) return;
        if (Math.abs(cur.b.yc - n.b.yc) > Math.min(cur.b.h, n.b.h) * 0.6) return;
        if (gap < bestGap) { bestGap = gap; best = j; }
      });
      if (best >= 0) {
        const n = ws[best];
        const joined = `${cleanText(cur.text)}-${cleanText(n.text)}`;
        if (parseCode(joined) || parseSlot(joined)) {
          used.add(i); used.add(best);
          merged.push({ text: joined, b: { x0: cur.b.x0, y0: Math.min(cur.b.y0, n.b.y0), x1: n.b.x1, y1: Math.max(cur.b.y1, n.b.y1), yc: (cur.b.yc + n.b.yc) / 2, h: Math.max(cur.b.h, n.b.h) } });
          return;
        }
      }
    }
    used.add(i);
    merged.push(cur);
  });

  const slots = [];
  const codes = [];
  merged.forEach((w) => {
    const s = parseSlot(w.text);
    if (s) { slots.push({ slot: s, b: w.b }); return; }
    const c = parseCode(w.text);
    if (c) codes.push({ code: c, b: w.b, used: false });
  });

  // todos os pares possíveis (código à direita, altura parecida), do mais
  // alinhado pro menos; cada T e cada código só entram uma vez
  // Distância entre linhas da tabela (mediana entre T's seguidos): o código
  // tem que estar a menos de ~meia linha do T, senão é da linha vizinha.
  function medianGap(list) {
    const ys = list.map((x) => x.b.yc).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 2) gaps.push(ys[i] - ys[i - 1]);
    gaps.sort((a, b) => a - b);
    return gaps.length >= 2 ? gaps[Math.floor(gaps.length / 2)] : null;
  }
  // usa o menor espaçamento visto (T's ou códigos), já que o OCR pode
  // pular linhas de uma das colunas
  const pitches = [medianGap(slots), medianGap(codes)].filter(Boolean);
  const pitch = pitches.length ? Math.min(...pitches) : null;
  const cands = [];
  slots.forEach((s, si) => codes.forEach((c, ci) => {
    if (c.b.x0 < s.b.x1 - s.b.h) return;
    const dy = Math.abs(c.b.yc - s.b.yc);
    const tol = pitch ? pitch * 0.45 : Math.max(s.b.h, c.b.h) * 1.2;
    if (dy > tol) return;
    cands.push({ si, ci, dy, dx: c.b.x0 - s.b.x1 });
  }));
  cands.sort((a, b) => a.dy - b.dy || a.dx - b.dx);
  const usedS = new Set();
  const usedC = new Set();
  const out = [];
  cands.forEach(({ si, ci }) => {
    if (usedS.has(si) || usedC.has(ci)) return;
    usedS.add(si); usedC.add(ci);
    out.push({ slot: slots[si].slot, bman: codes[ci].code, y: slots[si].b.yc });
  });
  // T sem código ao lado (ferramenta que não tem BMAN, ou código que o
  // OCR não leu): entra mesmo assim, com o código em branco pra conferir
  slots.forEach((s, si) => { if (!usedS.has(si)) out.push({ slot: s.slot, bman: '', y: s.b.yc }); });
  out.sort((a, b) => a.y - b.y);
  return out.map(({ slot, bman }) => ({ slot, bman }));
}

/** Junta listas de {slot,bman}: um por slot, preferindo o que tem código. */
export function mergeBySlot(...lists) {
  const map = new Map();
  lists.flat().forEach((r) => {
    if (!r || !r.slot) return;
    const cur = map.get(r.slot);
    if (!cur) map.set(r.slot, { ...r, bman: r.bman || '' });
    else if (!cur.bman && r.bman) map.set(r.slot, { ...r });
  });
  return Array.from(map.values());
}

/** Leitura linha a linha (formato da tela do programa). */
export function pairByLines(text) {
  const out = [];
  (text || '').split('\n').forEach((line) => {
    const up = line.toUpperCase();
    const m = up.match(/\bT[-\s]?([0-9O]{1,3})\b\D{0,15}?([A-Z8]{3,6}[-\s]?[0-9O]{2,5})/);
    const slot = m ? parseSlot(`T${m[1]}`) : null;
    const bman = m ? parseCode(m[2]) : null;
    if (slot && bman) { out.push({ slot, bman }); return; }
    // linha com T mas sem código (ex: ferramenta sem BMAN no programa)
    const t = up.match(/\bT[-\s]?([0-9O]{1,2})\b/);
    const s2 = t ? parseSlot(`T${t[1]}`) : null;
    if (s2) out.push({ slot: s2, bman: '' });
  });
  return out;
}

/** Junta as duas leituras: posição primeiro, linhas completam o que faltou. */
export function parseToolPairs(words, text) {
  return mergeBySlot(pairByPosition(words), pairByLines(text));
}
