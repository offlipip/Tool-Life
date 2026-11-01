import React, { useState, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { C, SANS } from './theme.js';
import { AppCtx } from './actions.js';
import { loadData, saveData, exportBackup, importBackup, backupText, parseBackupText } from './storage.js';
import { readPanelPhoto } from './ocr.js';
import {
  updateCellById, updateMachineById, updateOperationById, updateToolById, getToolDesgaste, findMachine, buildRowsForMachine, planCopy,
} from './logic.js';
import { HomeScreen, CellsScreen, CellScreen, NotesScreen, SettingsScreen, BottomNav } from './screens.jsx';
import {
  ToolSheet, PhotoSheet, ProductionSheet, CalibrationSheet, NoteSheet, AddCellSheet, AddMachineSheet,
  AddOperationSheet, AddToolSheet, EditOperationSheet, CopyFromSheet, CellSettingsSheet,
} from './sheets.jsx';
import { CropModal, OcrReviewSheet } from './tooling.jsx';

const PAGE_TYPES = ['cell', 'cellNotes'];

export default function App() {
  const [cells, setCells] = useState(() => loadData().cells);
  const [tab, setTab] = useState('inicio');
  const [stack, setStack] = useState([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const persist = useCallback((updater) => {
    setCells((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveData(next);
      return next;
    });
  }, []);

  /* ------------------------------------------------------------------ */
  /* Navegação: cada tela/folha aberta vira uma entrada no histórico, aí */
  /* o botão voltar do Android fecha a de cima em vez de sair do app.    */
  /* ------------------------------------------------------------------ */
  // Abas: sair do Início pra outra aba cria UMA entrada no histórico; o
  // voltar então leva de volta pro Início antes de sair do app.
  const tabEntryRef = useRef(false);
  React.useEffect(() => {
    function onPop() {
      if (stackRef.current.length) { setStack((s) => s.slice(0, -1)); return; }
      if (tabEntryRef.current) { tabEntryRef.current = false; setTab('inicio'); window.scrollTo(0, 0); }
    }
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // No apk: o botão voltar do Android vem pra cá em vez de fechar o app.
  // Se ainda tem algo pra voltar (folha, tela, aba), volta; no Início,
  // só manda o app pro segundo plano (não fecha nem perde nada).
  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let handle;
    CapApp.addListener('backButton', () => {
      if (stackRef.current.length || tabEntryRef.current) window.history.back();
      else CapApp.minimizeApp();
    }).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, []);

  function changeTab(t) {
    window.scrollTo(0, 0);
    if (t === tab) return;
    if (t === 'inicio') {
      if (tabEntryRef.current) window.history.back(); else setTab('inicio');
      return;
    }
    if (!tabEntryRef.current) { window.history.pushState({ toolpy: 'tab' }, ''); tabEntryRef.current = true; }
    setTab(t);
  }
  const nav = {
    push(item) { window.history.pushState({ toolpy: true }, ''); setStack((s) => [...s, item]); },
    close() { if (stackRef.current.length) window.history.back(); },
    replaceTop(item) { setStack((s) => (s.length ? [...s.slice(0, -1), item] : [item])); if (!stackRef.current.length) window.history.pushState({ toolpy: true }, ''); },
    patchTop(type, patch) { setStack((s) => s.map((it, i) => (i === s.length - 1 && it.type === type ? { ...it, ...patch } : it))); },
    reset() { setStack([]); },
  };

  /* ------------------------------------------------------------------ */
  /* Ações sobre os dados                                               */
  /* ------------------------------------------------------------------ */
  const act = {
    addCell(cell) { persist((p) => [...p, cell]); },
    deleteCell(cellId) { persist((p) => p.filter((c) => c.id !== cellId)); },
    renameCell(cellId, name) { if (name.trim()) persist((p) => updateCellById(p, cellId, (c) => ({ ...c, name: name.trim() }))); },
    reorderCells(next) { persist(() => next); },
    setBlockPreset(cellId, preset) { persist((p) => updateCellById(p, cellId, (c) => ({ ...c, blockPreset: preset }))); },

    addMachine(cellId, machine) { persist((p) => updateCellById(p, cellId, (c) => ({ ...c, machines: [...c.machines, machine] }))); },
    deleteMachine(cellId, machineId) { persist((p) => updateCellById(p, cellId, (c) => ({ ...c, machines: c.machines.filter((m) => m.id !== machineId) }))); },
    renameMachine(machineId, name) { if (name.trim()) persist((p) => updateMachineById(p, machineId, (m) => ({ ...m, name: name.trim() }))); },

    addOperation(machineId, op) { persist((p) => updateMachineById(p, machineId, (m) => ({ ...m, operations: [...m.operations, op] }))); },
    deleteOperation(opId) {
      persist((p) => p.map((c) => ({ ...c, machines: c.machines.map((m) => ({ ...m, operations: m.operations.filter((o) => o.id !== opId) })) })));
    },
    // Com exatamente 2 operações na máquina, definir o pallet de uma já
    // resolve a outra (só existem 2 pallets).
    updateOperation(opId, name, pallet) {
      if (!name.trim()) return;
      persist((p) => {
        let next = updateOperationById(p, opId, (o) => ({ ...o, name: name.trim(), pallet: pallet ?? null }));
        if (pallet === 1 || pallet === 2) {
          next.forEach((c) => c.machines.forEach((m) => {
            if (m.operations.some((o) => o.id === opId) && m.operations.length === 2) {
              const other = m.operations.find((o) => o.id !== opId);
              if (other) next = updateOperationById(next, other.id, (o) => ({ ...o, pallet: pallet === 1 ? 2 : 1 }));
            }
          }));
        }
        return next;
      });
    },

    addTool(opId, tool) { persist((p) => updateOperationById(p, opId, (o) => ({ ...o, tools: [...o.tools, tool] }))); },
    addTools(opId, tools) { persist((p) => updateOperationById(p, opId, (o) => ({ ...o, tools: [...o.tools, ...tools] }))); },
    updateTool(opId, toolId, patch) { persist((p) => updateToolById(p, opId, toolId, (t) => ({ ...t, ...patch, lastUpdated: new Date().toISOString() }))); },
    resetTool(opId, toolId) { act.updateTool(opId, toolId, { vidaAtual: 0, lastReset: new Date().toISOString() }); },
    deleteTool(opId, toolId) { persist((p) => updateOperationById(p, opId, (o) => ({ ...o, tools: o.tools.filter((t) => t.id !== toolId) }))); },

    // Produção de um turno: soma "desgaste x peças" em toda ferramenta do pallet.
    addProduction(machineId, pallet, pieces) {
      if (!pieces || pieces <= 0) return;
      persist((p) => p.map((c) => ({
        ...c,
        machines: c.machines.map((m) => {
          if (m.id !== machineId) return m;
          const preset = c.blockPreset || '6cc';
          return {
            ...m,
            lastAdd: { ...(m.lastAdd || {}), [pallet]: { amount: pieces, appliedAt: Date.now() } },
            operations: m.operations.map((o) => (o.pallet !== pallet ? o : {
              ...o,
              tools: o.tools.map((t) => ({ ...t, vidaAtual: (parseFloat(t.vidaAtual) || 0) + getToolDesgaste(t, preset) * pieces, lastUpdated: new Date().toISOString() })),
            })),
          };
        }),
      })));
    },
    undoProduction(machineId, pallet) {
      persist((p) => p.map((c) => ({
        ...c,
        machines: c.machines.map((m) => {
          if (m.id !== machineId) return m;
          const last = (m.lastAdd || {})[pallet];
          if (!last) return m;
          const preset = c.blockPreset || '6cc';
          return {
            ...m,
            lastAdd: { ...(m.lastAdd || {}), [pallet]: null },
            operations: m.operations.map((o) => (o.pallet !== pallet ? o : {
              ...o,
              tools: o.tools.map((t) => ({ ...t, vidaAtual: Math.max(0, (parseFloat(t.vidaAtual) || 0) - getToolDesgaste(t, preset) * last.amount) })),
            })),
          };
        }),
      })));
    },

    copyFromMachine(targetId, sourceId, opts) {
      persist((p) => {
        const src = findMachine(p, sourceId);
        const tgt = findMachine(p, targetId);
        if (!src || !tgt) return p;
        const plan = planCopy(src.machine, tgt.machine);
        return updateMachineById(p, targetId, (m) => plan.apply(m, opts));
      });
    },

    // Calibração: leitura FRESCA no início e no fim (nunca o valor
    // acumulado pelo contador), senão a conta só confirma o próprio chute.
    startCalibration(machineId) {
      persist((p) => updateMachineById(p, machineId, (m) => ({
        ...m,
        calibration: { preset: p.find((c) => c.machines.some((mm) => mm.id === machineId))?.blockPreset || '6cc', phase: 'awaiting_start', startedAt: new Date().toISOString() },
      })));
    },
    setCalibrationPhase(machineId, phase) { persist((p) => updateMachineById(p, machineId, (m) => (m.calibration ? { ...m, calibration: { ...m.calibration, phase } } : m))); },
    cancelCalibration(machineId) { persist((p) => updateMachineById(p, machineId, (m) => ({ ...m, calibration: null }))); },
    finishCalibration(machineId, readyRows) {
      const byId = {};
      readyRows.forEach((r) => { byId[r.toolId] = r.computed; });
      persist((p) => p.map((c) => ({
        ...c,
        machines: c.machines.map((m) => {
          if (m.id !== machineId) return m;
          const preset = m.calibration?.preset || c.blockPreset || '6cc';
          return {
            ...m,
            calibration: null,
            operations: m.operations.map((o) => ({
              ...o,
              tools: o.tools.map((t) => {
                const val = byId[t.id];
                if (val === undefined) return t;
                const prevMap = (t.desgastePeca && typeof t.desgastePeca === 'object') ? t.desgastePeca : {};
                return { ...t, desgastePeca: { ...prevMap, [preset]: Math.round(val * 100) / 100 } };
              }),
            })),
          };
        }),
      })));
    },

    // Foto de vida atual/útil: folha de foto → recorte → OCR → conferência.
    startPhotoRead(machineId, kind, file) { nav.replaceTop({ type: 'crop', machineId, kind, file }); },
    async processCrop(canvas) {
      const top = stackRef.current[stackRef.current.length - 1];
      if (!top || top.type !== 'crop') return;
      const fm = findMachine(cells, top.machineId);
      if (!fm) { nav.close(); return; }
      const label = `${fm.cell.name} · ${fm.machine.name} · ${top.kind === 'util' ? 'vida útil' : 'vida atual'}`;
      nav.replaceTop({ type: 'ocr', machineId: top.machineId, kind: top.kind, label, status: 'loading', rows: [] });
      try {
        const readings = await readPanelPhoto(canvas);
        const byNum = {};
        readings.forEach((r) => { byNum[r.num] = r; });
        nav.patchTop('ocr', { status: 'review', rows: buildRowsForMachine(fm.machine, byNum) });
      } catch (err) {
        nav.patchTop('ocr', { status: 'error', error: err.message });
      }
    },
    openManualEntry(machineId) {
      const fm = findMachine(cells, machineId);
      if (!fm) return;
      const item = { type: 'ocr', manual: true, machineId, label: `${fm.cell.name} · ${fm.machine.name}`, status: 'review', rows: buildRowsForMachine(fm.machine, {}) };
      const top = stackRef.current[stackRef.current.length - 1];
      if (top && top.type === 'photo') nav.replaceTop(item); else nav.push(item);
    },
    saveOcrRows(machineId, rows) {
      const byToolId = {};
      rows.forEach((r) => { byToolId[r.toolId] = r; });
      const fm = findMachine(cells, machineId);
      const willBeReady = fm?.machine.calibration?.phase === 'awaiting_finish';
      persist((p) => p.map((c) => ({
        ...c,
        machines: c.machines.map((m) => {
          const ops = m.operations.map((o) => ({
            ...o,
            tools: o.tools.map((t) => {
              const row = byToolId[t.id];
              if (!row) return t;
              const patch = {};
              const va = parseFloat(row.newVidaAtual);
              if (row.newVidaAtual !== '' && !isNaN(va)) patch.vidaAtual = va;
              if (!t.isRoutine) {
                const vu = parseFloat(row.newVidaUtil);
                if (row.newVidaUtil !== '' && !isNaN(vu)) patch.vidaUtil = vu;
              }
              return Object.keys(patch).length ? { ...t, ...patch, lastUpdated: new Date().toISOString() } : t;
            }),
          }));
          if (m.id !== machineId) return { ...m, operations: ops };
          let cal = m.calibration;
          if (cal?.phase === 'awaiting_start' || cal?.phase === 'awaiting_finish') {
            const captured = {};
            ops.forEach((o) => o.tools.forEach((t) => { if (!t.isRoutine) captured[t.id] = parseFloat(t.vidaAtual) || 0; }));
            cal = cal.phase === 'awaiting_start' ? { ...cal, phase: 'running', snapshot: captured } : { ...cal, phase: 'ready', finish: captured };
          }
          return { ...m, operations: ops, calibration: cal };
        }),
      })));
      if (willBeReady) nav.replaceTop({ type: 'calibration', machineId }); else nav.close();
    },

    // Anotações ficam dentro da célula (entram no backup automaticamente).
    saveNote(oldCellId, newCellId, note) {
      persist((p) => p.map((c) => {
        let notes = c.notes || [];
        if (c.id === oldCellId && oldCellId !== newCellId) notes = notes.filter((n) => n.id !== note.id);
        if (c.id === newCellId) notes = notes.some((n) => n.id === note.id) ? notes.map((n) => (n.id === note.id ? note : n)) : [...notes, note];
        return { ...c, notes };
      }));
    },
    deleteNote(cellId, noteId) { persist((p) => updateCellById(p, cellId, (c) => ({ ...c, notes: (c.notes || []).filter((n) => n.id !== noteId) }))); },

    exportBackup() { return exportBackup(cells); },
    backupText() { return backupText(cells); },
    readBackup(file) { return importBackup(file); },
    readBackupText(text) { return parseBackupText(text); },
    applyBackup(imported) { persist(() => imported); nav.reset(); },
  };

  const ctx = { cells, act, nav };

  /* ------------------------------------------------------------------ */
  /* O que mostrar                                                      */
  /* ------------------------------------------------------------------ */
  const top = stack[stack.length - 1] || null;
  let page = null;
  for (let i = stack.length - 1; i >= 0; i--) if (PAGE_TYPES.includes(stack[i].type)) { page = stack[i]; break; }
  const overlay = top && !PAGE_TYPES.includes(top.type) ? top : null;

  let base;
  if (page?.type === 'cell') base = <CellScreen key={page.cellId} cellId={page.cellId} />;
  else if (page?.type === 'cellNotes') base = <NotesScreen key={`n${page.cellId}`} lockedCellId={page.cellId} />;
  else if (tab === 'celulas') base = <CellsScreen />;
  else if (tab === 'notas') base = <NotesScreen />;
  else if (tab === 'ajustes') base = <SettingsScreen />;
  else base = <HomeScreen />;

  let sheet = null;
  if (overlay) {
    const o = overlay;
    const k = JSON.stringify({ t: o.type, a: o.opId, b: o.toolId, c: o.cellId, d: o.noteId, e: o.machineId });
    switch (o.type) {
      case 'tool': sheet = <ToolSheet key={k} opId={o.opId} toolId={o.toolId} />; break;
      case 'photo': sheet = <PhotoSheet key={k} machineId={o.machineId} kind={o.kind} />; break;
      case 'production': sheet = <ProductionSheet key={k} machineId={o.machineId} />; break;
      case 'calibration': sheet = <CalibrationSheet key={k} machineId={o.machineId} />; break;
      case 'note': sheet = <NoteSheet key={k} cellId={o.cellId} noteId={o.noteId} presetSlots={o.presetSlots} />; break;
      case 'addCell': sheet = <AddCellSheet key={k} />; break;
      case 'addMachine': sheet = <AddMachineSheet key={k} cellId={o.cellId} />; break;
      case 'addOp': sheet = <AddOperationSheet key={k} machineId={o.machineId} />; break;
      case 'addTool': sheet = <AddToolSheet key={k} opId={o.opId} />; break;
      case 'editOp': sheet = <EditOperationSheet key={k} opId={o.opId} />; break;
      case 'cellSettings': sheet = <CellSettingsSheet key={k} cellId={o.cellId} />; break;
      case 'copyFrom': sheet = <CopyFromSheet key={k} machineId={o.machineId} />; break;
      case 'crop':
        sheet = <CropModal file={o.file} title={o.kind === 'util' ? 'Vida útil (#800–849)' : 'Vida atual (#900–949)'} onConfirm={act.processCrop} onCancel={nav.close} />;
        break;
      case 'ocr':
        sheet = (
          <OcrReviewSheet state={o} onClose={nav.close} onSave={(rows) => act.saveOcrRows(o.machineId, rows)}
            onRetake={() => nav.replaceTop({ type: 'photo', machineId: o.machineId, kind: o.kind || 'atual' })} />
        );
        break;
      default: sheet = null;
    }
  }

  const showNav = !page;
  const noteCount = cells.reduce((n, c) => n + (c.notes || []).length, 0);

  return (
    <AppCtx.Provider value={ctx}>
      <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS, color: C.text }}>
        <div style={{ maxWidth: 520, margin: '0 auto', paddingBottom: showNav ? 'calc(110px + env(safe-area-inset-bottom))' : 'calc(40px + env(safe-area-inset-bottom))' }}>
          {base}
        </div>
        {showNav && (
          <BottomNav tab={tab} noteCount={noteCount}
            onTab={changeTab}
            onPhoto={() => nav.push({ type: 'photo' })} />
        )}
        {sheet}
        {/* Faixa fixa atrás da barra de status do celular: sem ela, o
            conteúdo rolado aparecia por baixo do relógio/bateria. */}
        <div aria-hidden="true" style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 'env(safe-area-inset-top)', background: C.navy, zIndex: 45, pointerEvents: 'none' }} />
      </div>
    </AppCtx.Provider>
  );
}
