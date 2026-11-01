// Regras de negócio do Toolpy, separadas da interface: cálculo de vida,
// status, navegação na árvore Célula → Máquina → Operação → Ferramenta
// e montagem das linhas de conferência do OCR.

export const CRITICAL_MAX = 10;
export const WARNING_MAX = 30;

export function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function slotDigits(slot) {
  const m = (slot || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}
export function slotToAtualNum(slot) {
  const d = slotDigits(slot);
  return d === null ? null : 900 + d;
}
export function slotToLimiteNum(slot) {
  const d = slotDigits(slot);
  return d === null ? null : 800 + d;
}
export function compareSlots(a, b) {
  const da = slotDigits(a);
  const db = slotDigits(b);
  if (da !== null && db !== null && da !== db) return da - db;
  return String(a || '').localeCompare(String(b || ''));
}
export const ALL_SLOTS = Array.from({ length: 49 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);

export function desgasteForPreset(preset) {
  return preset === '4cc' ? 1 : 1.5;
}
// Cada ferramenta guarda um desgaste POR BLOCO ({'6cc':1.5,'4cc':1}).
export function getToolDesgaste(tool, preset) {
  const d = tool.desgastePeca;
  if (d && typeof d === 'object') {
    const v = d[preset];
    return (typeof v === 'number' && v > 0) ? v : desgasteForPreset(preset);
  }
  return (typeof d === 'number' && d > 0) ? d : desgasteForPreset(preset);
}
export function isCalibrated(tool, preset) {
  const d = tool.desgastePeca;
  return !!(d && typeof d === 'object' && typeof d[preset] === 'number' && d[preset] > 0);
}

export function computeRemaining(tool, preset) {
  if (tool.isRoutine) return null;
  const desg = getToolDesgaste(tool, preset);
  const vu = parseFloat(tool.vidaUtil);
  const va = parseFloat(tool.vidaAtual);
  if (!desg || desg <= 0 || isNaN(vu) || vu <= 0 || isNaN(va)) return null;
  return Math.floor((vu - va) / desg);
}
export function statusFor(remaining) {
  if (remaining === null) return 'routine';
  if (remaining <= 0) return 'expired';
  if (remaining <= CRITICAL_MAX) return 'critical';
  if (remaining <= WARNING_MAX) return 'warning';
  return 'ok';
}
// Quanto da vida ainda resta (100 = nova, 0 = no limite).
export function lifePct(tool) {
  if (tool.isRoutine) return 100;
  const vu = parseFloat(tool.vidaUtil);
  const va = parseFloat(tool.vidaAtual);
  if (!(vu > 0) || isNaN(va)) return 0;
  return Math.max(0, Math.min(100, 100 - (va / vu) * 100));
}

export function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Desgaste precisa das 2 casas (1.32 ≠ 1.3).
export function fmtDesg(v) {
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return String(Math.round(n * 100) / 100);
}

export function timeAgo(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return null;
  const min = Math.round(diff / 60000);
  if (min < 1) return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

/* Árvore: cada nó tem id único, então dá pra achar qualquer nível direto. */
export function updateCellById(cells, cellId, fn) {
  return cells.map((c) => (c.id === cellId ? fn(c) : c));
}
export function updateMachineById(cells, machineId, fn) {
  return cells.map((c) => ({ ...c, machines: c.machines.map((m) => (m.id === machineId ? fn(m) : m)) }));
}
export function updateOperationById(cells, opId, fn) {
  return cells.map((c) => ({
    ...c,
    machines: c.machines.map((m) => ({ ...m, operations: m.operations.map((o) => (o.id === opId ? fn(o) : o)) })),
  }));
}
export function updateToolById(cells, opId, toolId, fn) {
  return updateOperationById(cells, opId, (o) => ({ ...o, tools: o.tools.map((t) => (t.id === toolId ? fn(t) : t)) }));
}

export function flattenMachines(cells) {
  const out = [];
  cells.forEach((c) => c.machines.forEach((m) => out.push({ cellName: c.name, cellId: c.id, machine: m })));
  return out;
}
export function flattenToolRows(cells) {
  const out = [];
  cells.forEach((c) => c.machines.forEach((m) => m.operations.forEach((o) => o.tools.forEach((t) => {
    out.push({
      cellId: c.id, cellName: c.name, machineId: m.id, machineName: m.name,
      opId: o.id, opName: o.name, pallet: o.pallet, tool: t, preset: c.blockPreset || '6cc',
    });
  }))));
  return out;
}
export function findMachine(cells, machineId) {
  for (const c of cells) {
    const m = c.machines.find((mm) => mm.id === machineId);
    if (m) return { cell: c, machine: m };
  }
  return null;
}
export function findTool(cells, opId, toolId) {
  for (const c of cells) {
    for (const m of c.machines) {
      const o = m.operations.find((oo) => oo.id === opId);
      if (o) {
        const t = o.tools.find((tt) => tt.id === toolId);
        if (t) return { cell: c, machine: m, op: o, tool: t };
      }
    }
  }
  return null;
}
export function cloneOperationsForNewMachine(operations) {
  return operations.map((op) => ({
    id: genId('op'),
    name: op.name,
    pallet: op.pallet ?? null,
    tools: op.tools.map((t) => ({ ...t, id: genId('tool'), vidaAtual: 0, lastUpdated: null })),
  }));
}

/* Copiar de outra máquina: casa cada ferramenta pela operação de mesmo
   nome + slot; se a operação não existir com o mesmo nome, casa só pelo
   slot (quando ele aparece uma vez só na máquina de origem). */
const normName = (s) => String(s || '').trim().toLowerCase();
function calibratedEntries(tool) {
  const d = tool.desgastePeca;
  if (!d || typeof d !== 'object') return {};
  return Object.fromEntries(Object.entries(d).filter(([, v]) => typeof v === 'number' && v > 0));
}
export function planCopy(source, target) {
  const bySlot = {};
  source.operations.forEach((o) => o.tools.forEach((t) => { (bySlot[t.slot] = bySlot[t.slot] || []).push(t); }));
  function match(opName, slot) {
    const so = source.operations.find((o) => normName(o.name) === normName(opName));
    const t = so?.tools.find((x) => x.slot === slot);
    if (t) return t;
    return bySlot[slot]?.length === 1 ? bySlot[slot][0] : null;
  }

  const desgaste = [];
  target.operations.forEach((o) => o.tools.forEach((t) => {
    if (t.isRoutine) return;
    const src = match(o.name, t.slot);
    if (!src) return;
    const entries = calibratedEntries(src);
    const cur = (t.desgastePeca && typeof t.desgastePeca === 'object') ? t.desgastePeca : {};
    Object.entries(entries).forEach(([preset, v]) => {
      if (cur[preset] !== v) desgaste.push({ opId: o.id, toolId: t.id, opName: o.name, slot: t.slot, preset, from: cur[preset] ?? null, to: v });
    });
  }));

  const newTools = [];
  const newOps = [];
  source.operations.forEach((so) => {
    const to = target.operations.find((o) => normName(o.name) === normName(so.name));
    if (!to) { newOps.push(so); so.tools.forEach((t) => newTools.push({ opName: so.name, slot: t.slot, newOp: true })); return; }
    const have = new Set(to.tools.map((t) => t.slot));
    so.tools.forEach((t) => { if (!have.has(t.slot)) newTools.push({ opName: so.name, slot: t.slot, opId: to.id, tool: t }); });
  });

  function apply(machine, { copyDesgaste, copyTools }) {
    let ops = machine.operations;
    if (copyDesgaste) {
      const byTool = {};
      desgaste.forEach((d) => { (byTool[d.toolId] = byTool[d.toolId] || {})[d.preset] = d.to; });
      ops = ops.map((o) => ({ ...o, tools: o.tools.map((t) => (byTool[t.id] ? { ...t, desgastePeca: { ...((t.desgastePeca && typeof t.desgastePeca === 'object') ? t.desgastePeca : {}), ...byTool[t.id] } } : t)) }));
    }
    if (copyTools) {
      const clone = (t) => ({ ...t, id: genId('tool'), vidaAtual: 0, lastUpdated: null });
      ops = ops.map((o) => {
        const add = newTools.filter((n) => n.opId === o.id).map((n) => clone(n.tool));
        return add.length ? { ...o, tools: [...o.tools, ...add].sort((a, b) => compareSlots(a.slot, b.slot)) } : o;
      });
      ops = [...ops, ...newOps.map((so) => ({ id: genId('op'), name: so.name, pallet: so.pallet ?? null, tools: so.tools.map(clone) }))];
    }
    return { ...machine, operations: ops };
  }
  return { desgaste, newTools, apply };
}

/* Anotações: ficam dentro de cada célula; podem citar slots (T02, T03). */
export function notesForSlot(cell, slot) {
  return (cell?.notes || []).filter((n) => (n.slots || []).includes(slot));
}
export function slotsInCell(cell) {
  const set = new Set();
  (cell?.machines || []).forEach((m) => m.operations.forEach((o) => o.tools.forEach((t) => t.slot && set.add(t.slot))));
  return Array.from(set).sort(compareSlots);
}

/* OCR: um salto grande demais entre leituras é sinal de leitura quebrada. */
export function isImplausibleJump(oldVal, newVal) {
  const o = parseFloat(oldVal);
  const n = parseFloat(newVal);
  if (isNaN(o) || isNaN(n)) return false;
  if (n === 0 || o === 0) return false;
  return Math.abs(n - o) > Math.max(30, o * 0.5);
}

// Linhas da conferência pra TODAS as ferramentas de uma máquina.
// readingByNum vazio = digitação manual.
export function buildRowsForMachine(machine, readingByNum) {
  const rows = [];
  machine.operations.forEach((op) => op.tools.forEach((t) => {
    const atualNum = slotToAtualNum(t.slot);
    const atualReading = atualNum !== null ? readingByNum[atualNum] : undefined;
    const limiteNum = t.isRoutine ? null : slotToLimiteNum(t.slot);
    const limiteReading = limiteNum !== null ? readingByNum[limiteNum] : undefined;

    let vidaAtualConfidence = atualReading ? atualReading.confidence : 'missing';
    if (atualReading && isImplausibleJump(t.vidaAtual, atualReading.value)) vidaAtualConfidence = 'low';

    let vidaUtilConfidence = limiteReading ? limiteReading.confidence : 'missing';
    if (limiteReading && !t.isRoutine) {
      const oldVU = parseFloat(t.vidaUtil);
      if (!isNaN(oldVU) && oldVU > 0 && Math.abs(limiteReading.value - oldVU) > 0.01) vidaUtilConfidence = 'low';
    }

    rows.push({
      toolId: t.id, slot: t.slot, opName: op.name, isRoutine: t.isRoutine,
      oldVidaAtual: t.vidaAtual, newVidaAtual: atualReading ? String(atualReading.value) : '', vidaAtualConfidence,
      oldVidaUtil: t.vidaUtil, newVidaUtil: limiteReading ? String(limiteReading.value) : '', vidaUtilConfidence,
    });
  }));
  rows.sort((a, b) => compareSlots(a.slot, b.slot));
  return rows;
}
