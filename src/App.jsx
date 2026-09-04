import React, { useState, useRef, useCallback } from 'react';
import {
  Plus, ChevronDown, ChevronRight, Camera, Pencil, Trash2, Check, X,
  AlertTriangle, RotateCcw, Loader2, Wrench, Layers, Cpu, Copy,
} from 'lucide-react';
import { readPanelPhoto } from './ocr.js';
import { loadData, saveData } from './storage.js';

/* ---------------------------------------------------------------------- */
/* Design tokens                                                          */
/* ---------------------------------------------------------------------- */

const C = {
  bg: '#15181b',
  surface: '#1d2125',
  surfaceRaised: '#242a2f',
  surfaceDeep: '#191d20',
  border: '#2c3237',
  borderLight: '#3a4148',
  text: '#e8e5de',
  textDim: '#98a0a6',
  textFaint: '#5c646b',
  accent: '#ff8a3d',
  accentSoft: 'rgba(255, 138, 61, 0.14)',
  ok: '#5fbf77',
  okSoft: 'rgba(95, 191, 119, 0.14)',
  warn: '#e8b93f',
  warnSoft: 'rgba(232, 185, 63, 0.14)',
  crit: '#e5534b',
  critSoft: 'rgba(229, 83, 75, 0.14)',
};

const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO = 'ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace';

const CRITICAL_MAX = 10;
const WARNING_MAX = 30;

/* ---------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ---------------------------------------------------------------------- */

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function slotDigits(slot) {
  const m = (slot || '').match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function slotToAtualNum(slot) {
  const d = slotDigits(slot);
  return d === null ? null : 900 + d;
}

function slotToLimiteNum(slot) {
  const d = slotDigits(slot);
  return d === null ? null : 800 + d;
}

function computeRemaining(tool) {
  if (tool.isRoutine) return null;
  const desg = parseFloat(tool.desgastePeca);
  const vu = parseFloat(tool.vidaUtil);
  const va = parseFloat(tool.vidaAtual);
  if (!desg || desg <= 0 || isNaN(vu) || isNaN(va)) return null;
  return Math.floor((vu - va) / desg);
}

function statusFor(remaining) {
  if (remaining === null) return 'routine';
  if (remaining <= 0) return 'expired';
  if (remaining <= CRITICAL_MAX) return 'critical';
  if (remaining <= WARNING_MAX) return 'warning';
  return 'ok';
}

const STATUS_COLOR = { routine: C.textFaint, expired: C.crit, critical: C.crit, warning: C.warn, ok: C.ok };
const STATUS_SOFT = { routine: 'transparent', expired: C.critSoft, critical: C.critSoft, warning: C.warnSoft, ok: C.okSoft };

function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/* ---------------------------------------------------------------------- */
/* Tree helpers — cada nó (célula/máquina/operação/ferramenta) tem um id  */
/* próprio e único, então as funções abaixo acham e atualizam qualquer    */
/* nível sem precisar receber o caminho inteiro (cellId+machineId+...).    */
/* ---------------------------------------------------------------------- */

function updateCellById(cells, cellId, fn) {
  return cells.map((c) => (c.id === cellId ? fn(c) : c));
}
function updateMachineById(cells, machineId, fn) {
  return cells.map((c) => ({ ...c, machines: c.machines.map((m) => (m.id === machineId ? fn(m) : m)) }));
}
function updateOperationById(cells, opId, fn) {
  return cells.map((c) => ({
    ...c,
    machines: c.machines.map((m) => ({ ...m, operations: m.operations.map((o) => (o.id === opId ? fn(o) : o)) })),
  }));
}
function updateToolById(cells, opId, toolId, fn) {
  return updateOperationById(cells, opId, (o) => ({ ...o, tools: o.tools.map((t) => (t.id === toolId ? fn(t) : t)) }));
}

function flattenMachines(cells) {
  const out = [];
  cells.forEach((c) => c.machines.forEach((m) => out.push({ cellName: c.name, cellId: c.id, machine: m })));
  return out;
}
function flattenToolRows(cells) {
  const out = [];
  cells.forEach((c) => c.machines.forEach((m) => m.operations.forEach((o) => o.tools.forEach((t) => {
    out.push({ cellName: c.name, machineName: m.name, opName: o.name, opId: o.id, tool: t });
  }))));
  return out;
}
function cloneOperationsForNewMachine(operations) {
  return operations.map((op) => ({
    id: genId('op'),
    name: op.name,
    tools: op.tools.map((t) => ({ ...t, id: genId('tool'), vidaAtual: 0, lastUpdated: null })),
  }));
}

/* ---------------------------------------------------------------------- */
/* Small UI primitives                                                    */
/* ---------------------------------------------------------------------- */

function IconBtn({ onClick, children, title, danger }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center rounded-md"
      style={{ width: 32, height: 32, color: danger ? C.crit : C.textDim, background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1" style={{ flex: 1, minWidth: 0 }}>
      <span style={{ fontSize: 11, color: C.textDim }}>{label}</span>
      {children}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className="w-full"
      style={{
        background: C.surfaceRaised, border: `1px solid ${C.border}`, borderRadius: 6,
        padding: '7px 9px', fontSize: 14, color: C.text, fontFamily: MONO,
        outline: 'none', ...(props.style || {}),
      }}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      className="w-full"
      style={{
        background: C.surfaceRaised, border: `1px solid ${C.border}`, borderRadius: 6,
        padding: '7px 9px', fontSize: 13, color: C.text, fontFamily: SANS,
        outline: 'none', ...(props.style || {}),
      }}
    />
  );
}

function GaugeBar({ pct, color }) {
  return (
    <div style={{ height: 5, width: '100%', background: C.border, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 300ms ease' }} />
    </div>
  );
}

function dotStatusForConfidence(c) {
  if (c === 'high') return 'ok';
  if (c === 'low') return 'warning';
  return 'routine'; // "missing" = não apareceu nessa foto, não é um erro
}

function StatusDot({ status }) {
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: STATUS_COLOR[status], flexShrink: 0 }} />;
}

function DeleteConfirmBar({ label, onCancel, onConfirm }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.critSoft, borderTop: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 12.5, color: C.text, flex: 1 }}>{label}</span>
      <button onClick={onCancel} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.textDim, borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
      <button onClick={onConfirm} style={{ background: C.crit, border: 'none', color: '#fff', borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>Excluir</button>
    </div>
  );
}

/* Cabeçalho reutilizado por Célula / Máquina / Operação: chevron, nome
   (com edição inline), contador de filhos e botões de ação. */
function NodeHeader({ icon, expanded, onToggle, name, renaming, nameDraft, setNameDraft, onRenameCommit, onRenameStart, onRenameCancel, onDeleteStart, subtitle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px', cursor: 'pointer' }} onClick={() => !renaming && onToggle()}>
      {expanded ? <ChevronDown size={16} color={C.textDim} /> : <ChevronRight size={16} color={C.textDim} />}
      {icon}
      {renaming ? (
        <input
          autoFocus
          value={nameDraft}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onRenameCommit(); }}
          style={{ flex: 1, background: C.surfaceRaised, border: `1px solid ${C.borderLight}`, borderRadius: 6, padding: '5px 8px', color: C.text, fontSize: 14 }}
        />
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{name}</div>
          {subtitle && <div style={{ fontSize: 11, color: C.textFaint }}>{subtitle}</div>}
        </div>
      )}
      {!renaming && (
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <IconBtn title="Renomear" onClick={onRenameStart}><Pencil size={14} /></IconBtn>
          <IconBtn title="Excluir" danger onClick={onDeleteStart}><Trash2 size={14} /></IconBtn>
        </div>
      )}
      {renaming && (
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <IconBtn onClick={onRenameCommit}><Check size={15} color={C.ok} /></IconBtn>
          <IconBtn onClick={onRenameCancel}><X size={15} /></IconBtn>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Tool row (with inline edit)                                            */
/* ---------------------------------------------------------------------- */

function ToolRow({ tool, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tool);

  const remaining = computeRemaining(tool);
  const status = statusFor(remaining);
  const pct = tool.isRoutine ? 100
    : (parseFloat(tool.vidaUtil) > 0
      ? Math.max(0, Math.min(100, 100 - (parseFloat(tool.vidaAtual) / parseFloat(tool.vidaUtil)) * 100))
      : 0);

  function save() {
    onUpdate({
      ...draft,
      vidaUtil: parseFloat(draft.vidaUtil) || 0,
      vidaAtual: parseFloat(draft.vidaAtual) || 0,
      desgastePeca: parseFloat(draft.desgastePeca) || 0,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <div style={{ padding: '10px 12px', background: C.surfaceRaised, borderRadius: 8, marginBottom: 6, border: `1px solid ${C.borderLight}` }}>
        <div className="flex gap-2 mb-2">
          <Field label="Slot">
            <TextInput value={draft.slot} onChange={(e) => setDraft({ ...draft, slot: e.target.value })} placeholder="T03" />
          </Field>
          <Field label="Cód. ferramenta (BMAN)">
            <TextInput value={draft.bman} onChange={(e) => setDraft({ ...draft, bman: e.target.value })} placeholder="BMAN-0806" />
          </Field>
        </div>
        <label className="flex items-center gap-2 mb-2" style={{ fontSize: 12.5, color: C.textDim }}>
          <input type="checkbox" checked={!!draft.isRoutine} onChange={(e) => setDraft({ ...draft, isRoutine: e.target.checked })} />
          Ferramenta de rotina (sem vida útil, ex: limpeza)
        </label>
        {!draft.isRoutine && (
          <div className="flex gap-2 mb-2">
            <Field label="Vida útil">
              <TextInput inputMode="decimal" value={draft.vidaUtil} onChange={(e) => setDraft({ ...draft, vidaUtil: e.target.value })} placeholder="480" />
            </Field>
            <Field label="Desgaste / peça">
              <TextInput inputMode="decimal" value={draft.desgastePeca} onChange={(e) => setDraft({ ...draft, desgastePeca: e.target.value })} placeholder="1.5" />
            </Field>
          </div>
        )}
        <Field label={draft.isRoutine ? 'Contador atual' : 'Vida atual'}>
          <TextInput inputMode="decimal" value={draft.vidaAtual} onChange={(e) => setDraft({ ...draft, vidaAtual: e.target.value })} placeholder="0" />
        </Field>
        <div className="flex gap-2 mt-3">
          <button onClick={save} className="flex items-center gap-1 justify-center" style={{ flex: 1, background: C.accent, color: '#1a1207', border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Check size={14} /> Salvar
          </button>
          <button onClick={() => { setDraft(tool); setEditing(false); }} className="flex items-center gap-1 justify-center" style={{ flex: 1, background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 0', fontSize: 13, cursor: 'pointer' }}>
            Cancelar
          </button>
          <IconBtn danger onClick={onDelete} title="Excluir ferramenta"><Trash2 size={15} /></IconBtn>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => { setDraft(tool); setEditing(true); }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}
    >
      <StatusDot status={status} />
      <div style={{ minWidth: 46 }}>
        <div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>{tool.slot || '?'}</div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.textFaint }}>{tool.bman || '—'}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <GaugeBar pct={pct} color={STATUS_COLOR[status]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: 10.5, color: C.textFaint, fontFamily: MONO }}>
            {fmtNum(tool.vidaAtual)}{!tool.isRoutine && ` / ${fmtNum(tool.vidaUtil)}`}
          </span>
        </div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 56 }}>
        {tool.isRoutine ? (
          <span style={{ fontSize: 10.5, color: C.textFaint }}>rotina</span>
        ) : (
          <>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, color: STATUS_COLOR[status] }}>
              {remaining === null ? '—' : remaining}
            </div>
            <div style={{ fontSize: 9.5, color: C.textFaint }}>peças</div>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Add-tool inline form                                                   */
/* ---------------------------------------------------------------------- */

function NewToolForm({ onAdd, compact }) {
  const blank = { slot: '', bman: '', vidaUtil: '', vidaAtual: '0', desgastePeca: '', isRoutine: false };
  const [t, setT] = useState(blank);

  function submit() {
    if (!t.slot.trim()) return;
    onAdd({
      id: genId('tool'),
      slot: t.slot.trim(),
      bman: t.bman.trim(),
      isRoutine: t.isRoutine,
      vidaUtil: t.isRoutine ? 0 : (parseFloat(t.vidaUtil) || 0),
      vidaAtual: parseFloat(t.vidaAtual) || 0,
      desgastePeca: t.isRoutine ? 0 : (parseFloat(t.desgastePeca) || 0),
      lastUpdated: null,
    });
    setT(blank);
  }

  return (
    <div style={{ padding: compact ? '10px' : '12px', background: C.surfaceRaised, borderRadius: 8, border: `1px dashed ${C.borderLight}` }}>
      <div className="flex gap-2 mb-2">
        <Field label="Slot">
          <TextInput value={t.slot} onChange={(e) => setT({ ...t, slot: e.target.value })} placeholder="T03" />
        </Field>
        <Field label="Cód. ferramenta (BMAN)">
          <TextInput value={t.bman} onChange={(e) => setT({ ...t, bman: e.target.value })} placeholder="BMAN-0806" />
        </Field>
      </div>
      <label className="flex items-center gap-2 mb-2" style={{ fontSize: 12.5, color: C.textDim }}>
        <input type="checkbox" checked={t.isRoutine} onChange={(e) => setT({ ...t, isRoutine: e.target.checked })} />
        Ferramenta de rotina (sem vida útil, ex: limpeza)
      </label>
      {!t.isRoutine && (
        <div className="flex gap-2 mb-2">
          <Field label="Vida útil">
            <TextInput inputMode="decimal" value={t.vidaUtil} onChange={(e) => setT({ ...t, vidaUtil: e.target.value })} placeholder="480" />
          </Field>
          <Field label="Desgaste / peça">
            <TextInput inputMode="decimal" value={t.desgastePeca} onChange={(e) => setT({ ...t, desgastePeca: e.target.value })} placeholder="1.5" />
          </Field>
        </div>
      )}
      <Field label={t.isRoutine ? 'Contador atual' : 'Vida atual'}>
        <TextInput inputMode="decimal" value={t.vidaAtual} onChange={(e) => setT({ ...t, vidaAtual: e.target.value })} placeholder="0" />
      </Field>
      <button
        onClick={submit}
        disabled={!t.slot.trim()}
        className="flex items-center gap-1 justify-center mt-3 w-full"
        style={{
          background: t.slot.trim() ? C.accent : C.border, color: t.slot.trim() ? '#1a1207' : C.textFaint,
          border: 'none', borderRadius: 6, padding: '8px 0', fontSize: 13, fontWeight: 600,
          cursor: t.slot.trim() ? 'pointer' : 'default',
        }}
      >
        <Plus size={14} /> Adicionar ferramenta
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Operation card (nível 3 — dentro de uma máquina)                       */
/* ---------------------------------------------------------------------- */

function OperationCard({ op, expanded, onToggle, onUpdateTool, onDeleteTool, onAddTool, onDeleteOp, onRenameOp, onPhoto, photoBusy }) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(op.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddTool, setShowAddTool] = useState(false);

  const active = op.tools.filter((t) => !t.isRoutine);
  const worst = active.map((t) => computeRemaining(t)).filter((r) => r !== null);
  const minRemaining = worst.length ? Math.min(...worst) : null;
  const headStatus = statusFor(minRemaining);
  const subtitle = `${op.tools.length} ferramenta${op.tools.length !== 1 ? 's' : ''}` +
    (minRemaining !== null ? ` · ${minRemaining} pç até a próxima troca` : '');

  return (
    <div style={{ background: C.surfaceDeep, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 8, overflow: 'hidden' }}>
      <NodeHeader
        icon={<Wrench size={14} color={C.textFaint} />}
        expanded={expanded}
        onToggle={onToggle}
        name={op.name}
        subtitle={<span>{`${op.tools.length} ferramenta${op.tools.length !== 1 ? 's' : ''}`}{minRemaining !== null && <> · <span style={{ color: STATUS_COLOR[headStatus] }}>{minRemaining} pç até a próxima troca</span></>}</span>}
        renaming={renaming}
        nameDraft={nameDraft}
        setNameDraft={setNameDraft}
        onRenameStart={() => setRenaming(true)}
        onRenameCommit={() => { onRenameOp(nameDraft); setRenaming(false); }}
        onRenameCancel={() => { setNameDraft(op.name); setRenaming(false); }}
        onDeleteStart={() => setConfirmDelete(true)}
      />

      {confirmDelete && (
        <DeleteConfirmBar label={`Excluir "${op.name}" e todas as ferramentas dela?`} onCancel={() => setConfirmDelete(false)} onConfirm={onDeleteOp} />
      )}

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px' }}>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => onPhoto(op.id)}
              disabled={photoBusy}
              className="flex items-center gap-1.5 justify-center"
              style={{ flex: 1, background: C.accentSoft, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 7, padding: '8px 0', fontSize: 12.5, fontWeight: 600, cursor: photoBusy ? 'default' : 'pointer' }}
            >
              {photoBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {photoBusy ? 'Lendo painel...' : 'Atualizar com foto'}
            </button>
            <button
              onClick={() => setShowAddTool((s) => !s)}
              className="flex items-center gap-1.5 justify-center"
              style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 12.5, cursor: 'pointer' }}
            >
              <Plus size={14} /> Ferramenta
            </button>
          </div>

          {op.tools.length === 0 && !showAddTool && (
            <div style={{ fontSize: 12.5, color: C.textFaint, padding: '10px 0', textAlign: 'center' }}>
              Nenhuma ferramenta cadastrada ainda.
            </div>
          )}

          <div style={{ marginBottom: showAddTool ? 10 : 0 }}>
            {op.tools.map((t) => (
              <ToolRow key={t.id} tool={t} onUpdate={(patch) => onUpdateTool(t.id, patch)} onDelete={() => onDeleteTool(t.id)} />
            ))}
          </div>

          {showAddTool && (
            <>
              <NewToolForm compact onAdd={onAddTool} />
              <button
                onClick={() => setShowAddTool(false)}
                className="flex items-center gap-1.5 justify-center mt-2 w-full"
                style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 0', fontSize: 12.5, cursor: 'pointer' }}
              >
                <Check size={13} /> Concluído, fechar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Add operation panel (nome + ferramentas de uma vez)                    */
/* ---------------------------------------------------------------------- */

function AddOperationPanel({ onSave, onCancel }) {
  const [name, setName] = useState('');
  const [tools, setTools] = useState([]);

  function addTool(tool) { setTools((prev) => [...prev, tool]); }
  function removeTool(id) { setTools((prev) => prev.filter((t) => t.id !== id)); }
  function save() {
    if (!name.trim()) return;
    onSave({ id: genId('op'), name: name.trim(), tools });
  }

  return (
    <div style={{ background: C.surfaceRaised, borderRadius: 8, border: `1px solid ${C.accent}`, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginBottom: 8 }}>Nova operação</div>
      <Field label="Nome da operação">
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="OP 800" style={{ fontFamily: SANS }} />
      </Field>

      {tools.length > 0 && (
        <div style={{ marginTop: 10, marginBottom: 4 }}>
          {tools.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: C.text, minWidth: 40 }}>{t.slot}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: C.textFaint, flex: 1 }}>{t.bman || '—'}</span>
              <span style={{ fontSize: 11, color: C.textDim }}>{t.isRoutine ? 'rotina' : `vida ${fmtNum(t.vidaUtil)}`}</span>
              <IconBtn danger onClick={() => removeTool(t.id)}><Trash2 size={13} /></IconBtn>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <NewToolForm onAdd={addTool} />
      </div>

      <div className="flex gap-2 mt-3">
        <button
          onClick={save}
          disabled={!name.trim()}
          className="flex items-center gap-1.5 justify-center"
          style={{ flex: 1, background: name.trim() ? C.accent : C.border, color: name.trim() ? '#1a1207' : C.textFaint, border: 'none', borderRadius: 7, padding: '9px 0', fontSize: 13, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'default' }}
        >
          <Check size={14} /> Salvar operação
        </button>
        <button onClick={onCancel} style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 7, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Machine card (nível 2 — dentro de uma célula)                          */
/* ---------------------------------------------------------------------- */

function MachineCard({
  machine, expanded, onToggle, onRename, onDelete,
  onAddOperation, onToggleOp, expandedOpId,
  onUpdateTool, onDeleteTool, onAddTool, onDeleteOp, onRenameOp, onPhoto, photoBusyOpId,
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(machine.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddOp, setShowAddOp] = useState(false);

  return (
    <div style={{ background: C.surface, borderRadius: 9, border: `1px solid ${C.border}`, marginBottom: 8, overflow: 'hidden' }}>
      <NodeHeader
        icon={<Cpu size={14} color={C.textDim} />}
        expanded={expanded}
        onToggle={onToggle}
        name={machine.name}
        subtitle={`${machine.operations.length} operação${machine.operations.length !== 1 ? 'ões' : ''}`}
        renaming={renaming}
        nameDraft={nameDraft}
        setNameDraft={setNameDraft}
        onRenameStart={() => setRenaming(true)}
        onRenameCommit={() => { onRename(nameDraft); setRenaming(false); }}
        onRenameCancel={() => { setNameDraft(machine.name); setRenaming(false); }}
        onDeleteStart={() => setConfirmDelete(true)}
      />

      {confirmDelete && (
        <DeleteConfirmBar label={`Excluir a máquina "${machine.name}" e tudo dentro dela?`} onCancel={() => setConfirmDelete(false)} onConfirm={onDelete} />
      )}

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px', background: C.bg }}>
          {!showAddOp && (
            <button
              onClick={() => setShowAddOp(true)}
              className="flex items-center gap-1.5 justify-center w-full mb-2"
              style={{ background: 'transparent', border: `1px dashed ${C.borderLight}`, color: C.textDim, borderRadius: 7, padding: '8px 0', fontSize: 12.5, cursor: 'pointer' }}
            >
              <Plus size={14} /> Nova operação
            </button>
          )}
          {showAddOp && <AddOperationPanel onSave={(op) => { onAddOperation(op); setShowAddOp(false); }} onCancel={() => setShowAddOp(false)} />}

          {machine.operations.length === 0 && !showAddOp && (
            <div style={{ fontSize: 12, color: C.textFaint, padding: '6px 0 2px', textAlign: 'center' }}>
              Nenhuma operação cadastrada nesta máquina ainda.
            </div>
          )}

          {machine.operations.map((op) => (
            <OperationCard
              key={op.id}
              op={op}
              expanded={expandedOpId === op.id}
              onToggle={() => onToggleOp(op.id)}
              onUpdateTool={(toolId, patch) => onUpdateTool(op.id, toolId, patch)}
              onDeleteTool={(toolId) => onDeleteTool(op.id, toolId)}
              onAddTool={(tool) => onAddTool(op.id, tool)}
              onDeleteOp={() => onDeleteOp(op.id)}
              onRenameOp={(name) => onRenameOp(op.id, name)}
              onPhoto={onPhoto}
              photoBusy={photoBusyOpId === op.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Add machine panel — com opção de duplicar de outra máquina              */
/* ---------------------------------------------------------------------- */

function AddMachinePanel({ onSave, onCancel, otherMachines }) {
  const [name, setName] = useState('');
  const [sourceId, setSourceId] = useState('');

  function save() {
    if (!name.trim()) return;
    const source = otherMachines.find((m) => m.machine.id === sourceId);
    const operations = source ? cloneOperationsForNewMachine(source.machine.operations) : [];
    onSave({ id: genId('machine'), name: name.trim(), operations });
  }

  return (
    <div style={{ background: C.surfaceRaised, borderRadius: 8, border: `1px solid ${C.accent}`, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginBottom: 8 }}>Nova máquina</div>
      <Field label="Identificação da máquina">
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="6262" style={{ fontFamily: SANS }} />
      </Field>

      {otherMachines.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <Field label="Copiar operações e ferramentas de">
            <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
              <option value="">Nenhuma — começar em branco</option>
              {otherMachines.map(({ machine, cellName }) => (
                <option key={machine.id} value={machine.id}>{cellName} · {machine.name}</option>
              ))}
            </Select>
          </Field>
          {sourceId && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11.5, color: C.textFaint, marginTop: 6 }}>
              <Copy size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Copia os slots, códigos BMAN, vida útil e desgaste por peça. A vida atual de cada ferramenta começa zerada, já que é um jogo de ferramentas físico separado.</span>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={save}
          disabled={!name.trim()}
          className="flex items-center gap-1.5 justify-center"
          style={{ flex: 1, background: name.trim() ? C.accent : C.border, color: name.trim() ? '#1a1207' : C.textFaint, border: 'none', borderRadius: 7, padding: '9px 0', fontSize: 13, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'default' }}
        >
          <Check size={14} /> Salvar máquina
        </button>
        <button onClick={onCancel} style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 7, padding: '9px 14px', fontSize: 13, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Cell card (nível 1 — topo)                                             */
/* ---------------------------------------------------------------------- */

function CellCard({
  cell, expanded, onToggle, onRename, onDelete, otherMachines,
  onAddMachine, expandedMachineId, onToggleMachine, onRenameMachine, onDeleteMachine,
  expandedOpId, onToggleOp, onAddOperation, onUpdateTool, onDeleteTool, onAddTool, onDeleteOp, onRenameOp, onPhoto, photoBusyOpId,
}) {
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(cell.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddMachine, setShowAddMachine] = useState(false);

  return (
    <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 10, overflow: 'hidden' }}>
      <NodeHeader
        icon={<Layers size={15} color={C.accent} />}
        expanded={expanded}
        onToggle={onToggle}
        name={cell.name}
        subtitle={`${cell.machines.length} máquina${cell.machines.length !== 1 ? 's' : ''}`}
        renaming={renaming}
        nameDraft={nameDraft}
        setNameDraft={setNameDraft}
        onRenameStart={() => setRenaming(true)}
        onRenameCommit={() => { onRename(nameDraft); setRenaming(false); }}
        onRenameCancel={() => { setNameDraft(cell.name); setRenaming(false); }}
        onDeleteStart={() => setConfirmDelete(true)}
      />

      {confirmDelete && (
        <DeleteConfirmBar label={`Excluir "${cell.name}" e tudo dentro dela?`} onCancel={() => setConfirmDelete(false)} onConfirm={onDelete} />
      )}

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px' }}>
          {!showAddMachine && (
            <button
              onClick={() => setShowAddMachine(true)}
              className="flex items-center gap-1.5 justify-center w-full mb-2"
              style={{ background: 'transparent', border: `1px dashed ${C.borderLight}`, color: C.textDim, borderRadius: 7, padding: '9px 0', fontSize: 12.5, cursor: 'pointer' }}
            >
              <Plus size={14} /> Nova máquina
            </button>
          )}
          {showAddMachine && (
            <AddMachinePanel
              otherMachines={otherMachines}
              onSave={(machine) => { onAddMachine(machine); setShowAddMachine(false); }}
              onCancel={() => setShowAddMachine(false)}
            />
          )}

          {cell.machines.length === 0 && !showAddMachine && (
            <div style={{ fontSize: 12, color: C.textFaint, padding: '6px 0 2px', textAlign: 'center' }}>
              Nenhuma máquina cadastrada nesta célula ainda.
            </div>
          )}

          {cell.machines.map((m) => (
            <MachineCard
              key={m.id}
              machine={m}
              expanded={expandedMachineId === m.id}
              onToggle={() => onToggleMachine(m.id)}
              onRename={(name) => onRenameMachine(m.id, name)}
              onDelete={() => onDeleteMachine(m.id)}
              onAddOperation={(op) => onAddOperation(m.id, op)}
              onToggleOp={onToggleOp}
              expandedOpId={expandedOpId}
              onUpdateTool={onUpdateTool}
              onDeleteTool={onDeleteTool}
              onAddTool={onAddTool}
              onDeleteOp={onDeleteOp}
              onRenameOp={onRenameOp}
              onPhoto={onPhoto}
              photoBusyOpId={photoBusyOpId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Add cell panel                                                         */
/* ---------------------------------------------------------------------- */

function AddCellPanel({ onSave, onCancel }) {
  const [name, setName] = useState('');
  return (
    <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.accent}`, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 10 }}>Nova célula</div>
      <Field label="Nome ou número da célula">
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Célula 9" style={{ fontFamily: SANS }} />
      </Field>
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => { if (name.trim()) onSave({ id: genId('cell'), name: name.trim(), machines: [] }); }}
          disabled={!name.trim()}
          className="flex items-center gap-1.5 justify-center"
          style={{ flex: 1, background: name.trim() ? C.accent : C.border, color: name.trim() ? '#1a1207' : C.textFaint, border: 'none', borderRadius: 7, padding: '10px 0', fontSize: 13.5, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'default' }}
        >
          <Check size={15} /> Salvar célula
        </button>
        <button onClick={onCancel} style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 7, padding: '10px 16px', fontSize: 13.5, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Summary strip                                                          */
/* ---------------------------------------------------------------------- */

function SummaryStrip({ cells }) {
  const rows = flattenToolRows(cells)
    .map((r) => ({ ...r, remaining: computeRemaining(r.tool) }))
    .filter((r) => r.remaining !== null)
    .sort((a, b) => a.remaining - b.remaining)
    .slice(0, 5);

  if (rows.length === 0) {
    return <div style={{ padding: '14px 4px', color: C.textFaint, fontSize: 12.5 }}>Cadastre ferramentas para ver aqui quais quebram primeiro.</div>;
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Mais próximas de quebrar</div>
      <div style={{ background: C.surface, borderRadius: 10, border: `1px solid ${C.border}` }}>
        {rows.map((r, i) => {
          const status = statusFor(r.remaining);
          return (
            <div
              key={r.tool.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderBottom: i < rows.length - 1 ? `1px solid ${C.border}` : 'none',
                background: status === 'critical' || status === 'expired' ? STATUS_SOFT[status] : 'transparent',
              }}
            >
              <StatusDot status={status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, color: C.text, fontFamily: MONO }}>{r.tool.slot}</div>
                <div style={{ fontSize: 10.5, color: C.textFaint }}>{r.cellName} · {r.machineName} · {r.opName}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: STATUS_COLOR[status] }}>{r.remaining}</div>
                <div style={{ fontSize: 9, color: C.textFaint }}>peças</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* OCR review modal                                                       */
/* ---------------------------------------------------------------------- */

function OcrModal({ state, onClose, onRetake, onSave }) {
  const { opLabel, status, rows, error } = state;
  const [localRows, setLocalRows] = useState(rows || []);

  React.useEffect(() => { setLocalRows(rows || []); }, [rows]);

  const lowConfidenceCount = localRows.reduce((n, r) => {
    let c = 0;
    if (r.vidaAtualConfidence === 'low') c++;
    if (!r.isRoutine && r.vidaUtilConfidence === 'low') c++;
    return n + c;
  }, 0);

  function patchRow(idx, field, value) {
    setLocalRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: C.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, width: '100%', maxWidth: 480, maxHeight: '86vh', overflowY: 'auto', border: `1px solid ${C.borderLight}`, borderBottom: 'none', padding: 16 }}
      >
        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: '0 auto 14px' }} />
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Conferir leitura</div>
        <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 14 }}>{opLabel}</div>

        {status === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '30px 0' }}>
            <Loader2 size={26} color={C.accent} className="animate-spin" />
            <span style={{ fontSize: 13, color: C.textDim, textAlign: 'center' }}>Lendo painel...</span>
            <span style={{ fontSize: 11, color: C.textFaint, textAlign: 'center' }}>processamento local, pode levar alguns segundos</span>
          </div>
        )}

        {status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0' }}>
            <AlertTriangle size={26} color={C.crit} />
            <span style={{ fontSize: 13, color: C.text, textAlign: 'center' }}>
              Não foi possível ler a foto{error ? ` (${error})` : ''}. Tente novamente com mais luz e sem tremer.
            </span>
            <button onClick={onRetake} className="flex items-center gap-1.5" style={{ background: C.accent, color: '#1a1207', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <Camera size={14} /> Tentar outra foto
            </button>
          </div>
        )}

        {status === 'review' && (
          <>
            <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 10 }}>
              VU = vida útil (tela #800-849) · VA = vida atual (tela #900-949). Cada foto só preenche o que aparecer nela.
            </div>

            {lowConfidenceCount > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: C.warnSoft, border: `1px solid ${C.warn}`, borderRadius: 8, padding: '9px 10px', marginBottom: 12 }}>
                <AlertTriangle size={15} color={C.warn} style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: C.text }}>
                  {lowConfidenceCount} valor{lowConfidenceCount > 1 ? 'es' : ''} ficou{lowConfidenceCount > 1 ? 'ram' : ''} pouco nítido{lowConfidenceCount > 1 ? 's' : ''} na foto. Confira, digite manualmente ou repita a foto.
                </span>
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              {localRows.map((row, idx) => (
                <div key={row.toolId} style={{ padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontFamily: MONO, fontSize: 13, color: C.text }}>{row.slot}</span>
                    {row.isRoutine && <span style={{ fontSize: 10, color: C.textFaint }}>rotina</span>}
                  </div>

                  {!row.isRoutine && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                      <StatusDot status={dotStatusForConfidence(row.vidaUtilConfidence)} />
                      <span style={{ fontSize: 10, color: C.textFaint, width: 18 }}>VU</span>
                      <TextInput
                        inputMode="decimal"
                        value={row.newVidaUtil}
                        placeholder="—"
                        onChange={(e) => patchRow(idx, 'newVidaUtil', e.target.value)}
                        style={{ flex: 1, textAlign: 'right', padding: '5px 8px', fontSize: 13, borderColor: row.vidaUtilConfidence === 'low' ? C.warn : C.border }}
                      />
                      <span style={{ fontSize: 10, color: C.textFaint, minWidth: 44, textAlign: 'right' }}>{fmtNum(row.oldVidaUtil)} antes</span>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusDot status={dotStatusForConfidence(row.vidaAtualConfidence)} />
                    <span style={{ fontSize: 10, color: C.textFaint, width: 18 }}>VA</span>
                    <TextInput
                      inputMode="decimal"
                      value={row.newVidaAtual}
                      placeholder="—"
                      onChange={(e) => patchRow(idx, 'newVidaAtual', e.target.value)}
                      style={{ flex: 1, textAlign: 'right', padding: '5px 8px', fontSize: 13, borderColor: row.vidaAtualConfidence === 'low' ? C.warn : C.border }}
                    />
                    <span style={{ fontSize: 10, color: C.textFaint, minWidth: 44, textAlign: 'right' }}>{fmtNum(row.oldVidaAtual)} antes</span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 12 }}>Campos em branco mantêm o valor atual.</div>

            <div className="flex gap-2">
              <button onClick={() => onSave(localRows)} className="flex items-center gap-1.5 justify-center" style={{ flex: 1, background: C.accent, color: '#1a1207', border: 'none', borderRadius: 7, padding: '10px 0', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                <Check size={15} /> Salvar leitura
              </button>
              <button onClick={onRetake} className="flex items-center gap-1.5 justify-center" style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 7, padding: '10px 14px', fontSize: 13.5, cursor: 'pointer' }}>
                <RotateCcw size={14} /> Repetir foto
              </button>
            </div>
          </>
        )}

        <button onClick={onClose} style={{ display: 'block', margin: '14px auto 0', background: 'transparent', border: 'none', color: C.textFaint, fontSize: 12, cursor: 'pointer' }}>
          Fechar
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Root                                                                    */
/* ---------------------------------------------------------------------- */

export default function App() {
  const [cells, setCells] = useState(() => loadData().cells);
  const [expandedCellId, setExpandedCellId] = useState(null);
  const [expandedMachineId, setExpandedMachineId] = useState(null);
  const [expandedOpId, setExpandedOpId] = useState(null);
  const [addingCell, setAddingCell] = useState(false);
  const [ocrModal, setOcrModal] = useState(null);
  const [photoBusyOpId, setPhotoBusyOpId] = useState(null);
  const fileInputRef = useRef(null);
  const pendingOpId = useRef(null);

  const persist = useCallback((updater) => {
    setCells((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveData(next);
      return next;
    });
  }, []);

  function toggleCell(cellId) {
    setExpandedCellId((cur) => {
      if (cur === cellId) return null;
      setExpandedMachineId(null);
      setExpandedOpId(null);
      return cellId;
    });
  }
  function toggleMachine(machineId) {
    setExpandedMachineId((cur) => {
      if (cur === machineId) return null;
      setExpandedOpId(null);
      return machineId;
    });
  }
  function toggleOp(opId) {
    setExpandedOpId((cur) => (cur === opId ? null : opId));
  }

  function addCell(cell) {
    persist((prev) => [...prev, cell]);
    setAddingCell(false);
    setExpandedCellId(cell.id);
  }
  function deleteCell(cellId) {
    persist((prev) => prev.filter((c) => c.id !== cellId));
  }
  function renameCell(cellId, name) {
    if (!name.trim()) return;
    persist((prev) => updateCellById(prev, cellId, (c) => ({ ...c, name: name.trim() })));
  }

  function addMachine(cellId, machine) {
    persist((prev) => updateCellById(prev, cellId, (c) => ({ ...c, machines: [...c.machines, machine] })));
    setExpandedMachineId(machine.id);
  }
  function deleteMachine(cellId, machineId) {
    persist((prev) => updateCellById(prev, cellId, (c) => ({ ...c, machines: c.machines.filter((m) => m.id !== machineId) })));
  }
  function renameMachine(machineId, name) {
    if (!name.trim()) return;
    persist((prev) => updateMachineById(prev, machineId, (m) => ({ ...m, name: name.trim() })));
  }

  function addOperation(machineId, op) {
    persist((prev) => updateMachineById(prev, machineId, (m) => ({ ...m, operations: [...m.operations, op] })));
  }
  function deleteOperation(opId) {
    persist((prev) => prev.map((c) => ({
      ...c,
      machines: c.machines.map((m) => ({ ...m, operations: m.operations.filter((o) => o.id !== opId) })),
    })));
  }
  function renameOperation(opId, name) {
    if (!name.trim()) return;
    persist((prev) => updateOperationById(prev, opId, (o) => ({ ...o, name: name.trim() })));
  }

  function addTool(opId, tool) {
    persist((prev) => updateOperationById(prev, opId, (o) => ({ ...o, tools: [...o.tools, tool] })));
  }
  function updateTool(opId, toolId, patch) {
    persist((prev) => updateToolById(prev, opId, toolId, (t) => ({ ...t, ...patch, lastUpdated: new Date().toISOString() })));
  }
  function deleteTool(opId, toolId) {
    persist((prev) => updateOperationById(prev, opId, (o) => ({ ...o, tools: o.tools.filter((t) => t.id !== toolId) })));
  }

  function triggerPhoto(opId) {
    pendingOpId.current = opId;
    fileInputRef.current?.click();
  }

  function findOperation(cellsList, opId) {
    for (const c of cellsList) {
      for (const m of c.machines) {
        const op = m.operations.find((o) => o.id === opId);
        if (op) return { cell: c, machine: m, operation: op };
      }
    }
    return null;
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const opId = pendingOpId.current;
    if (!file || !opId) return;
    const found = findOperation(cells, opId);
    if (!found) return;
    const opLabel = `${found.cell.name} · ${found.machine.name} · ${found.operation.name}`;

    setPhotoBusyOpId(opId);
    setOcrModal({ opId, opLabel, status: 'loading', rows: [] });

    try {
      const readings = await readPanelPhoto(file);
      const readingByNum = {};
      readings.forEach((r) => { readingByNum[r.num] = r; });

      const rows = found.operation.tools.map((t) => {
        const atualNum = slotToAtualNum(t.slot);
        const atualReading = atualNum !== null ? readingByNum[atualNum] : undefined;
        const limiteNum = t.isRoutine ? null : slotToLimiteNum(t.slot);
        const limiteReading = limiteNum !== null ? readingByNum[limiteNum] : undefined;
        return {
          toolId: t.id,
          slot: t.slot,
          isRoutine: t.isRoutine,
          oldVidaAtual: t.vidaAtual,
          newVidaAtual: atualReading ? String(atualReading.value) : '',
          vidaAtualConfidence: atualReading ? atualReading.confidence : 'missing',
          oldVidaUtil: t.vidaUtil,
          newVidaUtil: limiteReading ? String(limiteReading.value) : '',
          vidaUtilConfidence: limiteReading ? limiteReading.confidence : 'missing',
        };
      });

      setOcrModal({ opId, opLabel, status: 'review', rows });
    } catch (err) {
      setOcrModal({ opId, opLabel, status: 'error', rows: [], error: err.message });
    } finally {
      setPhotoBusyOpId(null);
    }
  }

  function saveOcrRows(rows) {
    const opId = ocrModal.opId;
    persist((prev) => updateOperationById(prev, opId, (o) => ({
      ...o,
      tools: o.tools.map((t) => {
        const row = rows.find((r) => r.toolId === t.id);
        if (!row) return t;
        const patch = {};
        const va = parseFloat(row.newVidaAtual);
        if (row.newVidaAtual !== '' && !isNaN(va)) patch.vidaAtual = va;
        if (!t.isRoutine) {
          const vu = parseFloat(row.newVidaUtil);
          if (row.newVidaUtil !== '' && !isNaN(vu)) patch.vidaUtil = vu;
        }
        if (Object.keys(patch).length === 0) return t;
        return { ...t, ...patch, lastUpdated: new Date().toISOString() };
      }),
    })));
    setOcrModal(null);
  }

  function retakePhoto() {
    const opId = ocrModal?.opId;
    setOcrModal(null);
    if (opId) triggerPhoto(opId);
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS, color: C.text }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '18px 14px 90px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wrench size={17} color={C.accent} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>Vida de ferramentas</div>
            <div style={{ fontSize: 11.5, color: C.textFaint }}>Célula · Máquina · Operação</div>
          </div>
        </div>

        <SummaryStrip cells={cells} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: C.textDim }}>Células</span>
        </div>

        {!addingCell && (
          <button
            onClick={() => setAddingCell(true)}
            className="flex items-center gap-2"
            style={{ width: '100%', background: 'transparent', border: `1px dashed ${C.borderLight}`, color: C.textDim, borderRadius: 10, padding: '11px 14px', fontSize: 13.5, marginBottom: 14, cursor: 'pointer' }}
          >
            <Plus size={16} /> Cadastrar nova célula
          </button>
        )}

        {addingCell && <AddCellPanel onSave={addCell} onCancel={() => setAddingCell(false)} />}

        {cells.length === 0 && !addingCell && (
          <div style={{ textAlign: 'center', color: C.textFaint, fontSize: 12.5, padding: '20px 10px' }}>
            Nenhuma célula cadastrada. Comece pela célula que você acompanha todo dia — dentro dela você cadastra as máquinas.
          </div>
        )}

        {cells.map((cell) => (
          <CellCard
            key={cell.id}
            cell={cell}
            expanded={expandedCellId === cell.id}
            onToggle={() => toggleCell(cell.id)}
            onRename={(name) => renameCell(cell.id, name)}
            onDelete={() => deleteCell(cell.id)}
            otherMachines={flattenMachines(cells)}
            onAddMachine={(machine) => addMachine(cell.id, machine)}
            expandedMachineId={expandedMachineId}
            onToggleMachine={toggleMachine}
            onRenameMachine={renameMachine}
            onDeleteMachine={(machineId) => deleteMachine(cell.id, machineId)}
            expandedOpId={expandedOpId}
            onToggleOp={toggleOp}
            onAddOperation={addOperation}
            onUpdateTool={updateTool}
            onDeleteTool={deleteTool}
            onAddTool={addTool}
            onDeleteOp={deleteOperation}
            onRenameOp={renameOperation}
            onPhoto={triggerPhoto}
            photoBusyOpId={photoBusyOpId}
          />
        ))}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />

      {ocrModal && <OcrModal state={ocrModal} onClose={() => setOcrModal(null)} onRetake={retakePhoto} onSave={saveOcrRows} />}
    </div>
  );
}
