import React, { useState, useRef, useCallback } from 'react';
import {
  Plus, Minus, ChevronDown, ChevronRight, Camera, Image as ImageIcon, Pencil, Trash2, Check, X,
  AlertTriangle, RotateCcw, Loader2, Wrench, Layers, Cpu, Copy, Lock, Unlock, Crop as CropIcon, ArrowLeft,
} from 'lucide-react';
import { readPanelPhoto, readProgramPhoto } from './ocr.js';
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
  text: '#f0ece5',
  textDim: '#e5c9ae',
  textFaint: '#d9a374',
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

// Ordena por número do slot (T01, T02, T03...) em vez da ordem de
// cadastro, que é como as ferramentas ficam mais fáceis de achar.
function compareSlots(a, b) {
  const da = slotDigits(a);
  const db = slotDigits(b);
  if (da !== null && db !== null && da !== db) return da - db;
  return String(a || '').localeCompare(String(b || ''));
}

// Cadeado global: enquanto travado, tocar numa ferramenta não abre o
// formulário de edição — só o botão de zerar (sempre disponível) funciona.
const EditLockContext = React.createContext({ unlocked: false });

function desgasteForPreset(preset) {
  return preset === '4cc' ? 1 : 1.5;
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
    pallet: op.pallet ?? null,
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
      <span style={{ fontSize: 12, color: C.textDim }}>{label}</span>
      {children}
    </label>
  );
}

const TextInput = React.forwardRef(function TextInput(props, ref) {
  return (
    <input
      {...props}
      ref={ref}
      onFocus={(e) => {
        props.onFocus?.(e);
        // dá tempo do teclado abrir e o viewport encolher antes de rolar,
        // senão calcula a posição errada e o campo fica atrás dele
        setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
      }}
      className="w-full"
      style={{
        background: C.surfaceRaised, border: `1px solid ${C.border}`, borderRadius: 6,
        padding: '7px 9px', fontSize: 14, color: C.text, fontFamily: MONO,
        outline: 'none', ...(props.style || {}),
      }}
    />
  );
});

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

/* Seletor de slot T01–T49 — evita digitar (e digitar errado) o número
   da ferramenta no celular. */
function SlotSelect({ value, onChange }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      className="w-full"
      style={{
        background: C.surfaceRaised, border: `1px solid ${value ? C.borderLight : C.border}`, borderRadius: 6,
        padding: '7px 9px', fontSize: 14, color: value ? C.text : C.textFaint, fontFamily: MONO,
        outline: 'none', appearance: 'none',
      }}
    >
      <option value="">Escolher…</option>
      {Array.from({ length: 49 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`).map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );
}

function GaugeBar({ pct, color }) {
  return (
    <div style={{ height: 5, width: '100%', background: C.border, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 300ms ease' }} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Recorte da foto — arrasta os dois cantos pra excluir menu/reflexo antes */
/* de mandar pro OCR. Sem zoom/pinça: só os dois pontos definem o retângulo. */
/* ---------------------------------------------------------------------- */

function CropModal({ file, title, onConfirm, onCancel }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [rect, setRect] = useState({ x0: 4, y0: 12, x1: 96, y1: 88 });
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pointerToPercent(clientX, clientY) {
    const box = containerRef.current.getBoundingClientRect();
    const px = Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100));
    const py = Math.min(100, Math.max(0, ((clientY - box.top) / box.height) * 100));
    return { px, py };
  }

  function startDrag(corner) {
    return (e) => {
      e.preventDefault();
      e.target.setPointerCapture?.(e.pointerId);
      dragRef.current = corner;
    };
  }
  function onMove(e) {
    if (!dragRef.current) return;
    const { px, py } = pointerToPercent(e.clientX, e.clientY);
    setRect((prev) => (dragRef.current === 'tl'
      ? { ...prev, x0: Math.min(px, prev.x1 - 5), y0: Math.min(py, prev.y1 - 5) }
      : { ...prev, x1: Math.max(px, prev.x0 + 5), y1: Math.max(py, prev.y0 + 5) }));
  }
  function endDrag() { dragRef.current = null; }

  function confirm() {
    const img = new Image();
    img.onload = () => {
      const sx = (rect.x0 / 100) * img.naturalWidth;
      const sy = (rect.y0 / 100) * img.naturalHeight;
      const sw = ((rect.x1 - rect.x0) / 100) * img.naturalWidth;
      const sh = ((rect.y1 - rect.y0) / 100) * img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      onConfirm(canvas);
    };
    img.src = imgUrl;
  }

  const handleStyle = (x, y) => ({
    position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)',
    width: 26, height: 26, borderRadius: 999, background: C.accent, border: `2px solid #1a1207`,
    touchAction: 'none', cursor: 'grab', zIndex: 2,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 60, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '14px 16px 8px', color: C.text }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>Recorte a área dos números</div>
        <div style={{ fontSize: 11.5, color: C.textFaint }}>{title} · arraste os dois cantos pra fora do menu e do reflexo</div>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 12px', minHeight: 0 }}>
        <div
          ref={containerRef}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ position: 'relative', width: '100%', lineHeight: 0 }}
        >
          {imgUrl && (
            <img
              src={imgUrl}
              alt=""
              onLoad={(e) => setNatural({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }}
              draggable={false}
            />
          )}
          {/* sombra fora do retângulo escolhido */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 ${rect.y0}%,${rect.x0}% ${rect.y0}%,${rect.x0}% ${rect.y1}%,${rect.x1}% ${rect.y1}%,${rect.x1}% ${rect.y0}%,0 ${rect.y0}%)` }} />
          <div style={{
            position: 'absolute', left: `${rect.x0}%`, top: `${rect.y0}%`, width: `${rect.x1 - rect.x0}%`, height: `${rect.y1 - rect.y0}%`,
            border: `2px solid ${C.accent}`, boxSizing: 'border-box', pointerEvents: 'none',
          }} />
          <div style={handleStyle(rect.x0, rect.y0)} onPointerDown={startDrag('tl')} />
          <div style={handleStyle(rect.x1, rect.y1)} onPointerDown={startDrag('br')} />
        </div>
      </div>

      <div className="flex gap-2" style={{ padding: 16 }}>
        <button onClick={confirm} className="flex items-center gap-1.5 justify-center" style={{ flex: 1, background: C.accent, color: '#1a1207', border: 'none', borderRadius: 7, padding: '11px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          <CropIcon size={15} /> Confirmar recorte
        </button>
        <button onClick={onCancel} style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.borderLight}`, borderRadius: 7, padding: '11px 16px', fontSize: 14, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
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
function NodeHeader({ icon, expanded, onToggle, name, renaming, nameDraft, setNameDraft, onRenameCommit, onRenameStart, onRenameCancel, onDeleteStart, subtitle, extraRenaming }) {
  const { unlocked } = React.useContext(EditLockContext);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 12px', cursor: 'pointer' }} onClick={() => !renaming && onToggle()}>
      {expanded ? <ChevronDown size={16} color={C.textDim} /> : <ChevronRight size={16} color={C.textDim} />}
      {icon}
      {renaming ? (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onRenameCommit(); }}
            style={{ background: C.surfaceRaised, border: `1px solid ${C.borderLight}`, borderRadius: 6, padding: '5px 8px', color: C.text, fontSize: 14 }}
          />
          {extraRenaming}
        </div>
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{name}</div>
          {subtitle && <div style={{ fontSize: 12, color: C.textFaint }}>{subtitle}</div>}
        </div>
      )}
      {!renaming && unlocked && (
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

/* Linha com rótulo + botão de câmera + botão de galeria, usada nos dois
   gatilhos de foto (vida útil / vida atual) da máquina. */
function PhotoRow({ label, onFile, busy, busyLabel }) {
  const camRef = useRef(null);
  const galRef = useRef(null);
  function pick(ref) {
    return (e) => {
      const f = e.target.files?.[0];
      e.target.value = '';
      if (f) onFile(f);
    };
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0' }}>
      <span style={{ flex: 1, fontSize: 12.5, color: C.text, fontWeight: 600 }}>{label}</span>
      {busy ? (
        <span style={{ fontSize: 12, color: C.textFaint, display: 'flex', alignItems: 'center', gap: 5 }}>
          <Loader2 size={13} className="animate-spin" /> {busyLabel || 'Lendo...'}
        </span>
      ) : (
        <>
          <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={pick(camRef)} />
          <input ref={galRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pick(galRef)} />
          <IconBtn title="Tirar foto" onClick={() => camRef.current?.click()}><Camera size={16} color={C.accent} /></IconBtn>
          <IconBtn title="Escolher da galeria" onClick={() => galRef.current?.click()}><ImageIcon size={16} color={C.accent} /></IconBtn>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Tool row (with inline edit)                                            */
/* ---------------------------------------------------------------------- */

function ToolRow({ tool, onUpdate, onDelete }) {
  const { unlocked } = React.useContext(EditLockContext);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tool);
  const [confirmZero, setConfirmZero] = useState(false);

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
            <SlotSelect value={draft.slot} onChange={(v) => setDraft({ ...draft, slot: v })} />
          </Field>
          <Field label="Cód. ferramenta (BMAN)">
            <TextInput value={draft.bman} onChange={(e) => setDraft({ ...draft, bman: e.target.value })} placeholder="BMAN-0806" />
          </Field>
        </div>
        <label className="flex items-center gap-2 mb-2" style={{ fontSize: 12.5, color: C.textDim }}>
          <input type="checkbox" checked={!!draft.isRoutine} onChange={(e) => setDraft({ ...draft, isRoutine: e.target.checked })} />
          Ferramenta de rotina (sem vida útil, ex: limpeza)
        </label>
        <div className="flex gap-2 mb-2">
          {!draft.isRoutine && (
            <Field label="Vida útil">
              <TextInput inputMode="decimal" value={draft.vidaUtil} onChange={(e) => setDraft({ ...draft, vidaUtil: e.target.value })} placeholder="480" />
            </Field>
          )}
          <Field label="Desgaste / peça">
            <TextInput inputMode="decimal" value={draft.desgastePeca} onChange={(e) => setDraft({ ...draft, desgastePeca: e.target.value })} placeholder="1.5" />
          </Field>
        </div>
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

  if (confirmZero) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderBottom: `1px solid ${C.border}`, background: C.accentSoft }}>
        <span style={{ fontSize: 12.5, color: C.text, flex: 1 }}>
          Zerar {tool.isRoutine ? 'o contador' : 'a vida atual'} de <span style={{ fontFamily: MONO }}>{tool.slot}</span>?
        </span>
        <IconBtn onClick={() => setConfirmZero(false)}><X size={15} /></IconBtn>
        <IconBtn onClick={() => { onUpdate({ vidaAtual: 0 }); setConfirmZero(false); }}><Check size={16} color={C.ok} /></IconBtn>
      </div>
    );
  }

  return (
    <div
      onClick={() => { if (unlocked) { setDraft(tool); setEditing(true); } }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderBottom: `1px solid ${C.border}`, cursor: unlocked ? 'pointer' : 'default' }}
    >
      <StatusDot status={status} />
      <div style={{ minWidth: 46 }}>
        <div style={{ fontFamily: MONO, fontSize: 14, color: C.text }}>{tool.slot || '?'}</div>
        <div style={{ fontFamily: MONO, fontSize: 11.5, color: C.textFaint }}>{tool.bman || '—'}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <GaugeBar pct={pct} color={STATUS_COLOR[status]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          <span style={{ fontSize: 11.5, color: C.textFaint, fontFamily: MONO }}>
            {fmtNum(tool.vidaAtual)}{!tool.isRoutine && ` / ${fmtNum(tool.vidaUtil)}`}
          </span>
        </div>
      </div>
      <div style={{ textAlign: 'right', minWidth: 44 }}>
        {tool.isRoutine ? (
          <span style={{ fontSize: 11.5, color: C.textFaint }}>rotina</span>
        ) : (
          <>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 600, color: STATUS_COLOR[status] }}>
              {remaining === null ? '—' : remaining}
            </div>
            <div style={{ fontSize: 10.5, color: C.textFaint }}>peças</div>
          </>
        )}
      </div>
      <IconBtn title="Zerar" onClick={(e) => { e.stopPropagation(); setConfirmZero(true); }}>
        <RotateCcw size={15} color={C.textFaint} />
      </IconBtn>
    </div>
  );
}

function LimitePhotoButton({ readings, onReady }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStatus('loading');
    setError('');
    try {
      const list = await readPanelPhoto(file);
      const map = {};
      list.forEach((r) => { map[r.num] = r; });
      setCount(list.length);
      setStatus('ready');
      onReady(map);
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={status === 'loading'}
        className="flex items-center gap-1.5 justify-center w-full"
        style={{ background: C.accentSoft, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 7, padding: '8px 0', fontSize: 12.5, fontWeight: 600, cursor: status === 'loading' ? 'default' : 'pointer' }}
      >
        {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
        {status === 'loading' ? 'Lendo tela de vida útil...' : (readings ? 'Trocar foto da tela de vida útil' : 'Ler vida útil de uma foto')}
      </button>
      {status === 'ready' && (
        <div style={{ fontSize: 12, color: C.textFaint, marginTop: 5 }}>
          {count} valor{count !== 1 ? 'es' : ''} lido{count !== 1 ? 's' : ''} da tela #800-849 — ao digitar o slot (ex: T03), a vida útil preenche sozinha.
        </div>
      )}
      {status === 'error' && (
        <div style={{ fontSize: 11, color: C.crit, marginTop: 5 }}>Não consegui ler essa foto{error ? ` (${error})` : ''}. Tente outra.</div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Add-tool inline form                                                   */
/* ---------------------------------------------------------------------- */

function NewToolForm({ onAdd, compact, limiteReadings, blockPreset }) {
  const presetDesgaste = String(desgasteForPreset(blockPreset));
  const blank = { slot: '', bman: '', vidaUtil: '', vidaAtual: '0', desgastePeca: presetDesgaste, isRoutine: false };
  const [t, setT] = useState(blank);
  const [vuFromPhoto, setVuFromPhoto] = useState(false);

  // Se uma foto da tela de vida útil já foi lida (pelo botão acima, no
  // pai), assim que o slot bate com um #80N conhecido, preenche sozinho.
  // Só sobrescreve enquanto o valor ainda não foi editado à mão.
  React.useEffect(() => {
    if (!limiteReadings || t.isRoutine) return;
    const num = slotToLimiteNum(t.slot);
    if (num === null) return;
    const reading = limiteReadings[num];
    if (!reading) return;
    if (t.vidaUtil === '' || vuFromPhoto) {
      setT((prev) => (prev.vidaUtil === String(reading.value) ? prev : { ...prev, vidaUtil: String(reading.value) }));
      setVuFromPhoto(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.slot, t.isRoutine, limiteReadings]);

  function submit() {
    if (!t.slot.trim()) return;
    onAdd({
      id: genId('tool'),
      slot: t.slot.trim(),
      bman: t.bman.trim(),
      isRoutine: t.isRoutine,
      vidaUtil: t.isRoutine ? 0 : (parseFloat(t.vidaUtil) || 0),
      vidaAtual: parseFloat(t.vidaAtual) || 0,
      desgastePeca: parseFloat(t.desgastePeca) || desgasteForPreset(blockPreset),
      lastUpdated: null,
    });
    setT(blank);
    setVuFromPhoto(false);
  }

  return (
    <div style={{ padding: compact ? '10px' : '12px', background: C.surfaceRaised, borderRadius: 8, border: `1px dashed ${C.borderLight}` }}>
      <div className="flex gap-2 mb-2">
        <Field label="Slot">
          <SlotSelect value={t.slot} onChange={(v) => setT({ ...t, slot: v })} />
        </Field>
        <Field label="Cód. ferramenta (BMAN)">
          <TextInput value={t.bman} onChange={(e) => setT({ ...t, bman: e.target.value })} placeholder="BMAN-0806" />
        </Field>
      </div>
      <label className="flex items-center gap-2 mb-2" style={{ fontSize: 12.5, color: C.textDim }}>
        <input type="checkbox" checked={t.isRoutine} onChange={(e) => setT({ ...t, isRoutine: e.target.checked })} />
        Ferramenta de rotina (sem vida útil, ex: limpeza)
      </label>
      <div className="flex gap-2 mb-2">
        {!t.isRoutine && (
          <Field label="Vida útil">
            <TextInput
              inputMode="decimal"
              value={t.vidaUtil}
              onChange={(e) => { setT({ ...t, vidaUtil: e.target.value }); setVuFromPhoto(false); }}
              placeholder="480"
              style={{ borderColor: vuFromPhoto ? C.ok : undefined }}
            />
            {vuFromPhoto && <span style={{ fontSize: 10, color: C.ok }}>✓ lido da foto — confira</span>}
          </Field>
        )}
        <Field label="Desgaste / peça">
          <TextInput inputMode="decimal" value={t.desgastePeca} onChange={(e) => setT({ ...t, desgastePeca: e.target.value })} placeholder="1.5" />
        </Field>
      </div>
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

function OperationCard({ op, expanded, onToggle, onUpdateTool, onDeleteTool, onAddTool, onDeleteOp, onRenameOp, blockPreset }) {
  const { unlocked } = React.useContext(EditLockContext);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(op.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddTool, setShowAddTool] = useState(false);
  const [limiteReadings, setLimiteReadings] = useState(null);

  const active = op.tools.filter((t) => !t.isRoutine);
  const worst = active.map((t) => computeRemaining(t)).filter((r) => r !== null);
  const minRemaining = worst.length ? Math.min(...worst) : null;
  const headStatus = statusFor(minRemaining);

  const palletToggle = (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 5 }}>Esta operação roda em qual pallet?</div>
      <div className="flex gap-2">
        {[1, 2].map((p) => (
          <button
            key={p}
            onClick={() => onRenameOp(op.name, p)}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              background: op.pallet === p ? C.accentSoft : 'transparent',
              color: op.pallet === p ? C.accent : C.textDim,
              border: `1px solid ${op.pallet === p ? C.accent : C.border}`,
            }}
          >
            Pallet {p}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ background: C.surfaceDeep, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 8, overflow: 'hidden' }}>
      <NodeHeader
        icon={<Wrench size={14} color={C.textFaint} />}
        expanded={expanded}
        onToggle={onToggle}
        name={op.name}
        subtitle={
          <span>
            {op.pallet && <>Pallet {op.pallet} · </>}
            {`${op.tools.length} ferramenta${op.tools.length !== 1 ? 's' : ''}`}
            {minRemaining !== null && <> · <span style={{ color: STATUS_COLOR[headStatus] }}>{minRemaining} pç até a próxima troca</span></>}
          </span>
        }
        renaming={renaming}
        nameDraft={nameDraft}
        setNameDraft={setNameDraft}
        onRenameStart={() => setRenaming(true)}
        onRenameCommit={() => { onRenameOp(nameDraft, op.pallet); setRenaming(false); }}
        onRenameCancel={() => { setNameDraft(op.name); setRenaming(false); }}
        onDeleteStart={() => setConfirmDelete(true)}
      />

      {confirmDelete && (
        <DeleteConfirmBar label={`Excluir "${op.name}" e todas as ferramentas dela?`} onCancel={() => setConfirmDelete(false)} onConfirm={onDeleteOp} />
      )}

      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 12px' }}>
          {unlocked && palletToggle}
          {unlocked && (
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setShowAddTool((s) => !s)}
                className="flex items-center gap-1.5 justify-center w-full"
                style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px', fontSize: 12.5, cursor: 'pointer' }}
              >
                <Plus size={14} /> Ferramenta
              </button>
            </div>
          )}

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
              <LimitePhotoButton readings={limiteReadings} onReady={setLimiteReadings} />
              <NewToolForm compact onAdd={onAddTool} limiteReadings={limiteReadings} blockPreset={blockPreset} />
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

function ProgramPhotoButton({ onTools }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const camRef = useRef(null);
  const galRef = useRef(null);

  async function handleFile(file) {
    setStatus('loading');
    setError('');
    try {
      const found = await readProgramPhoto(file);
      if (found.length === 0) {
        setStatus('error');
        setError('nenhuma ferramenta reconhecida nessa foto');
        return;
      }
      onTools(found);
      setStatus('idle');
    } catch (err) {
      setStatus('error');
      setError(err.message);
    }
  }
  function pick(ref) {
    return (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f); };
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={pick(camRef)} />
      <input ref={galRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pick(galRef)} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => camRef.current?.click()}
          disabled={status === 'loading'}
          className="flex items-center gap-1.5 justify-center"
          style={{ flex: 1, background: C.accentSoft, color: C.accent, border: `1px solid ${C.accent}`, borderRadius: 7, padding: '8px 0', fontSize: 12.5, fontWeight: 600, cursor: status === 'loading' ? 'default' : 'pointer' }}
        >
          {status === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {status === 'loading' ? 'Lendo programa...' : 'Ler ferramentas do programa'}
        </button>
        <IconBtn title="Da galeria" onClick={() => galRef.current?.click()}><ImageIcon size={16} color={C.accent} /></IconBtn>
      </div>
      {status === 'error' && <div style={{ fontSize: 11, color: C.crit, marginTop: 5 }}>Não consegui reconhecer nada nessa foto{error ? ` (${error})` : ''}. Cadastre manualmente ou tente outra.</div>}
    </div>
  );
}

function AddOperationPanel({ onSave, onCancel, blockPreset }) {
  const [name, setName] = useState('');
  const [tools, setTools] = useState([]);
  const [limiteReadings, setLimiteReadings] = useState(null);

  function addTool(tool) { setTools((prev) => [...prev, tool]); }
  function removeTool(id) { setTools((prev) => prev.filter((t) => t.id !== id)); }
  function addToolsFromProgram(found) {
    setTools((prev) => {
      const existingSlots = new Set(prev.map((t) => t.slot));
      const additions = found
        .filter((f) => !existingSlots.has(f.slot))
        .map((f) => ({
          id: genId('tool'), slot: f.slot, bman: f.bman, isRoutine: false,
          vidaUtil: 0, vidaAtual: 0, desgastePeca: desgasteForPreset(blockPreset), lastUpdated: null,
        }));
      return [...prev, ...additions];
    });
  }
  function save() {
    if (!name.trim()) return;
    onSave({ id: genId('op'), name: name.trim(), pallet: null, tools });
  }

  return (
    <div style={{ background: C.surfaceRaised, borderRadius: 8, border: `1px solid ${C.accent}`, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text, marginBottom: 8 }}>Nova operação</div>
      <Field label="Nome da operação">
        <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="OP 800" style={{ fontFamily: SANS }} />
      </Field>

      <div style={{ marginTop: 10 }}>
        <ProgramPhotoButton onTools={addToolsFromProgram} />
        <LimitePhotoButton readings={limiteReadings} onReady={setLimiteReadings} />
        <NewToolForm onAdd={addTool} limiteReadings={limiteReadings} blockPreset={blockPreset} />
      </div>

      {tools.length > 0 && (
        <div style={{ marginTop: 10, marginBottom: 4 }}>
          {tools.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: MONO, fontSize: 13, color: C.text, minWidth: 40 }}>{t.slot}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: C.textFaint, flex: 1 }}>{t.bman || '—'}</span>
              <span style={{ fontSize: 12, color: C.textDim }}>{t.isRoutine ? 'rotina' : `vida ${fmtNum(t.vidaUtil)}`}</span>
              <IconBtn danger onClick={() => removeTool(t.id)}><Trash2 size={13} /></IconBtn>
            </div>
          ))}
        </div>
      )}

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

/* Contador de peças por pallet, na Máquina.
   O app guarda a ÚLTIMA contagem registrada e calcula a diferença
   sozinho — assim você só digita o número que está no computador
   naquele momento, sem precisar lembrar de quanto era antes. */
function PalletCounterRow({ pallet, lastCount, onApply, onReset }) {
  const [draft, setDraft] = useState('');

  const now = parseInt(draft, 10);
  const valid = !isNaN(now) && now >= 0;
  const diff = valid ? now - lastCount : null;
  const isReset = valid && now < lastCount; // contador zerou (troca de turno)
  const applyAmount = isReset ? now : diff;

  function commit() {
    if (!valid) return;
    onApply(applyAmount, now);
    setDraft('');
  }
  function bump(by) {
    const base = valid ? now : lastCount;
    setDraft(String(Math.max(0, base + by)));
  }

  return (
    <div style={{ padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, color: C.text, minWidth: 62, fontWeight: 600 }}>Pallet {pallet}</span>
        <IconBtn title="Menos um" onClick={() => bump(-1)}><Minus size={14} /></IconBtn>
        <TextInput
          inputMode="numeric"
          value={draft}
          placeholder={String(lastCount)}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1, textAlign: 'center', padding: '6px 2px' }}
        />
        <IconBtn title="Mais um" onClick={() => bump(1)}><Plus size={14} /></IconBtn>
        <button
          onClick={commit}
          disabled={!valid || applyAmount <= 0}
          style={{
            fontSize: 12, borderRadius: 6, padding: '6px 10px',
            background: valid && applyAmount > 0 ? C.accentSoft : 'transparent',
            color: valid && applyAmount > 0 ? C.accent : C.textFaint,
            border: `1px solid ${valid && applyAmount > 0 ? C.accent : C.border}`,
            cursor: valid && applyAmount > 0 ? 'pointer' : 'default',
          }}
        >
          Atualizar
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, paddingLeft: 2 }}>
        <span style={{ fontSize: 11.5, color: C.textFaint, flex: 1 }}>
          {valid
            ? (isReset
              ? `contador zerou — vai somar ${now} ${now === 1 ? 'peça' : 'peças'}`
              : (diff > 0
                ? `+${diff} ${diff === 1 ? 'peça' : 'peças'} desde a última atualização`
                : 'nenhuma peça nova'))
            : `última contagem registrada: ${lastCount}`}
        </span>
        <button
          onClick={onReset}
          style={{ fontSize: 11.5, background: 'transparent', color: C.textFaint, border: 'none', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}
        >
          zerar contagem
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
  onUpdateTool, onDeleteTool, onAddTool, onDeleteOp, onRenameOp,
  onPhotoFile, photoBusy, onManualEntry,
  onApplyPallet, onResetPallet, blockPreset,
}) {
  const { unlocked } = React.useContext(EditLockContext);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(machine.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddOp, setShowAddOp] = useState(false);
  const [showPanelRead, setShowPanelRead] = useState(false);
  const [showCounter, setShowCounter] = useState(false);

  const pallets = Array.from(new Set(machine.operations.map((o) => o.pallet).filter((p) => p === 1 || p === 2))).sort();
  const hasOps = machine.operations.length > 0;

  return (
    <div style={{ background: C.surface, borderRadius: 9, border: `1px solid ${C.border}`, marginBottom: 8, overflow: 'hidden' }}>
      <NodeHeader
        icon={<Cpu size={14} color={C.textDim} />}
        expanded={expanded}
        onToggle={onToggle}
        name={machine.name}
        subtitle={`${machine.operations.length} ${machine.operations.length === 1 ? 'operação' : 'operações'}`}
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
          {/* Uso diário em primeiro lugar: contador de peças usinadas */}
          {pallets.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <button
                onClick={() => setShowCounter((v) => !v)}
                className="flex items-center gap-1.5 justify-center w-full"
                style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 0', fontSize: 12.5, cursor: 'pointer' }}
              >
                {showCounter ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Contador de peças
              </button>
              {showCounter && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '2px 10px 6px', marginTop: 6 }}>
                  <div style={{ fontSize: 11.5, color: C.textFaint, textAlign: 'center', padding: '8px 0 6px' }}>
                    digite a contagem que está no computador agora
                  </div>
                  {pallets.map((p) => (
                    <PalletCounterRow
                      key={p}
                      pallet={p}
                      lastCount={(machine.palletLastCount || {})[p] || 0}
                      onApply={(amount, newCount) => onApplyPallet(machine.id, p, amount, newCount)}
                      onReset={() => onResetPallet(machine.id, p)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Leitura do painel: usada bem menos que o contador, então fica
              recolhida por padrão pra não poluir a tela do dia a dia. */}
          {hasOps && (
            <div style={{ marginBottom: 8 }}>
              <button
                onClick={() => setShowPanelRead((v) => !v)}
                className="flex items-center gap-1.5 justify-center w-full"
                style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 0', fontSize: 12.5, cursor: 'pointer' }}
              >
                {showPanelRead ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Ler do painel
              </button>
              {showPanelRead && (
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '4px 10px', marginTop: 6 }}>
                  <PhotoRow label="Vida atual (foto #900-949)" onFile={(f) => onPhotoFile(machine.id, 'atual', f)} busy={photoBusy === 'atual'} busyLabel="Lendo..." />
                  <PhotoRow label="Vida útil (foto #800-849)" onFile={(f) => onPhotoFile(machine.id, 'util', f)} busy={photoBusy === 'util'} busyLabel="Lendo..." />
                  <button
                    onClick={() => onManualEntry(machine.id)}
                    className="flex items-center gap-1.5 justify-center w-full"
                    style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 0', fontSize: 12.5, cursor: 'pointer', margin: '4px 0 8px' }}
                  >
                    <Pencil size={13} /> Digitar manualmente
                  </button>
                </div>
              )}
            </div>
          )}

          {unlocked && !showAddOp && (
            <button
              onClick={() => setShowAddOp(true)}
              className="flex items-center gap-1.5 justify-center w-full mb-2"
              style={{ background: 'transparent', border: `1px dashed ${C.borderLight}`, color: C.textDim, borderRadius: 7, padding: '8px 0', fontSize: 12.5, cursor: 'pointer' }}
            >
              <Plus size={14} /> Nova operação
            </button>
          )}
          {showAddOp && <AddOperationPanel blockPreset={blockPreset} onSave={(op) => { onAddOperation(op); setShowAddOp(false); }} onCancel={() => setShowAddOp(false)} />}

          {!hasOps && !showAddOp && (
            <div style={{ fontSize: 12.5, color: C.textFaint, padding: '6px 0 2px', textAlign: 'center' }}>
              {unlocked ? 'Nenhuma operação cadastrada nesta máquina ainda.' : 'Sem operações. Destrave o cadeado para cadastrar.'}
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
              onRenameOp={(name, pallet) => onRenameOp(op.id, name, pallet)}
              blockPreset={blockPreset}
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

/* Item da lista de células — cartão compacto que "entra" na célula ao
   tocar, em vez de expandir tudo aninhado na mesma tela. */
function CellListItem({ cell, onOpen }) {
  const rows = flattenToolRows([cell])
    .map((r) => computeRemaining(r.tool))
    .filter((r) => r !== null);
  const minRemaining = rows.length ? Math.min(...rows) : null;
  const status = statusFor(minRemaining);

  return (
    <div
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '14px 13px', cursor: 'pointer',
        background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 9,
      }}
    >
      <div style={{ width: 34, height: 34, borderRadius: 8, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Layers size={16} color={C.accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{cell.name}</div>
        <div style={{ fontSize: 12, color: C.textFaint }}>
          {cell.machines.length} {cell.machines.length === 1 ? 'máquina' : 'máquinas'} · bloco {cell.blockPreset || '6cc'}
        </div>
      </div>
      {minRemaining !== null && (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: STATUS_COLOR[status] }}>{minRemaining}</div>
          <div style={{ fontSize: 10, color: C.textFaint }}>pç</div>
        </div>
      )}
      <ChevronRight size={18} color={C.textFaint} />
    </div>
  );
}

/* Tela de uma célula: cabeçalho com voltar, resumo só desta célula e
   a lista de máquinas dela. */
function CellDetail({
  cell, onBack, onRename, onDelete, otherMachines,
  onAddMachine, expandedMachineId, onToggleMachine, onRenameMachine, onDeleteMachine,
  expandedOpId, onToggleOp, onAddOperation, onUpdateTool, onDeleteTool, onAddTool, onDeleteOp, onRenameOp,
  onPhotoFile, photoBusyMachineId, photoBusyKind, onManualEntry,
  onApplyPallet, onResetPallet, onSetBlockPreset,
}) {
  const { unlocked } = React.useContext(EditLockContext);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(cell.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const preset = cell.blockPreset || '6cc';

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <IconBtn title="Voltar" onClick={onBack}><ArrowLeft size={19} /></IconBtn>
        {renaming ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { onRename(nameDraft); setRenaming(false); } }}
            style={{ flex: 1, background: C.surfaceRaised, border: `1px solid ${C.borderLight}`, borderRadius: 6, padding: '6px 9px', color: C.text, fontSize: 16 }}
          />
        ) : (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{cell.name}</div>
            <div style={{ fontSize: 12, color: C.textFaint }}>
              {cell.machines.length} {cell.machines.length === 1 ? 'máquina' : 'máquinas'} · bloco {preset}
            </div>
          </div>
        )}
        {renaming ? (
          <div className="flex items-center">
            <IconBtn onClick={() => { onRename(nameDraft); setRenaming(false); }}><Check size={16} color={C.ok} /></IconBtn>
            <IconBtn onClick={() => { setNameDraft(cell.name); setRenaming(false); }}><X size={16} /></IconBtn>
          </div>
        ) : unlocked && (
          <div className="flex items-center">
            <IconBtn title="Renomear" onClick={() => setRenaming(true)}><Pencil size={15} /></IconBtn>
            <IconBtn title="Excluir" danger onClick={() => setConfirmDelete(true)}><Trash2 size={15} /></IconBtn>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div style={{ borderRadius: 8, overflow: 'hidden', marginBottom: 10, border: `1px solid ${C.border}` }}>
          <DeleteConfirmBar label={`Excluir "${cell.name}" e tudo dentro dela?`} onCancel={() => setConfirmDelete(false)} onConfirm={onDelete} />
        </div>
      )}

      <SummaryStrip cells={[cell]} hideCellName />

      {unlocked && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11.5, color: C.textFaint, marginBottom: 5 }}>
            Bloco padrão desta célula (define o desgaste/peça de todas as ferramentas)
          </div>
          <div className="flex gap-2">
            {['4cc', '6cc'].map((p) => (
              <button
                key={p}
                onClick={() => onSetBlockPreset(cell.id, p)}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  background: preset === p ? C.accentSoft : 'transparent',
                  color: preset === p ? C.accent : C.textDim,
                  border: `1px solid ${preset === p ? C.accent : C.border}`,
                }}
              >
                {p} {p === '4cc' ? '(desgaste 1)' : '(desgaste 1.5)'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>Máquinas</div>

      {unlocked && !showAddMachine && (
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
        <div style={{ fontSize: 12.5, color: C.textFaint, padding: '10px 0', textAlign: 'center' }}>
          {unlocked ? 'Nenhuma máquina cadastrada nesta célula ainda.' : 'Sem máquinas. Destrave o cadeado para cadastrar.'}
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
          onPhotoFile={onPhotoFile}
          photoBusy={photoBusyMachineId === m.id ? photoBusyKind : null}
          onManualEntry={onManualEntry}
          onApplyPallet={onApplyPallet}
          onResetPallet={onResetPallet}
          blockPreset={preset}
        />
      ))}
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
          onClick={() => { if (name.trim()) onSave({ id: genId('cell'), name: name.trim(), blockPreset: '6cc', machines: [] }); }}
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

function SummaryStrip({ cells, title = 'Mais próximas de quebrar', hideCellName = false }) {
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
      <div style={{ fontSize: 12, color: C.textDim, marginBottom: 8 }}>{title}</div>
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
                <div style={{ fontSize: 11.5, color: C.textFaint }}>{hideCellName ? '' : `${r.cellName} · `}{r.machineName} · {r.opName}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: STATUS_COLOR[status] }}>{r.remaining}</div>
                <div style={{ fontSize: 10, color: C.textFaint }}>peças</div>
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
  const { machineLabel, status, rows, error } = state;
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
        <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 14 }}>{machineLabel}</div>

        {status === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '30px 0' }}>
            <Loader2 size={26} color={C.accent} className="animate-spin" />
            <span style={{ fontSize: 13, color: C.textDim, textAlign: 'center' }}>Lendo painel...</span>
            <span style={{ fontSize: 12, color: C.textFaint, textAlign: 'center' }}>processamento local, pode levar alguns segundos</span>
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
            <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 10 }}>
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

            <div style={{ display: 'grid', gridTemplateColumns: '50px 1fr 1fr', columnGap: 8, rowGap: 3, marginBottom: 14, alignItems: 'center' }}>
              <div style={{ gridRow: 1, gridColumn: 1 }} />
              <div style={{ gridRow: 1, gridColumn: 2, fontSize: 11, color: C.textFaint, textAlign: 'center' }}>VIDA ÚTIL</div>
              <div style={{ gridRow: 1, gridColumn: 3, fontSize: 11, color: C.textFaint, textAlign: 'center' }}>VIDA ATUAL</div>

              {/* Colunas inteiras em blocos separados (não linha por linha) —
                  assim a setinha "próximo" do teclado numérico desce dentro
                  da mesma coluna que você está preenchendo, em vez de pular
                  pra coluna vizinha. */}
              {localRows.map((row, idx) => (
                <div key={`slot-${row.toolId}`} style={{ gridRow: idx + 2, gridColumn: 1, fontFamily: MONO, fontSize: 13, color: C.text, borderTop: `1px solid ${C.border}`, paddingTop: 8, alignSelf: 'start' }}>
                  {row.slot}
                  {row.opName && <div style={{ fontSize: 10, color: C.textFaint, fontFamily: SANS }}>{row.opName}</div>}
                </div>
              ))}

              {localRows.map((row, idx) => (
                <div key={`vu-${row.toolId}`} style={{ gridRow: idx + 2, gridColumn: 2, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  {row.isRoutine ? (
                    <div style={{ fontSize: 12, color: C.textFaint, textAlign: 'center' }}>—</div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <StatusDot status={dotStatusForConfidence(row.vidaUtilConfidence)} />
                        <TextInput
                          inputMode="decimal"
                          value={row.newVidaUtil}
                          placeholder="—"
                          onChange={(e) => patchRow(idx, 'newVidaUtil', e.target.value)}
                          style={{ flex: 1, textAlign: 'center', padding: '5px 4px', fontSize: 13, borderColor: row.vidaUtilConfidence === 'low' ? C.warn : C.border }}
                        />
                      </div>
                      <div style={{ fontSize: 10, color: C.textFaint, textAlign: 'center', marginTop: 2 }}>{fmtNum(row.oldVidaUtil)} antes</div>
                    </>
                  )}
                </div>
              ))}

              {localRows.map((row, idx) => (
                <div key={`va-${row.toolId}`} style={{ gridRow: idx + 2, gridColumn: 3, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <StatusDot status={dotStatusForConfidence(row.vidaAtualConfidence)} />
                    <TextInput
                      inputMode="decimal"
                      value={row.newVidaAtual}
                      placeholder="—"
                      onChange={(e) => patchRow(idx, 'newVidaAtual', e.target.value)}
                      style={{ flex: 1, textAlign: 'center', padding: '5px 4px', fontSize: 13, borderColor: row.vidaAtualConfidence === 'low' ? C.warn : C.border }}
                    />
                  </div>
                  <div style={{ fontSize: 10, color: C.textFaint, textAlign: 'center', marginTop: 2 }}>{fmtNum(row.oldVidaAtual)} antes</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 12 }}>Campos em branco mantêm o valor atual.</div>

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
  const [photoBusyMachineId, setPhotoBusyMachineId] = useState(null);
  const [photoBusyKind, setPhotoBusyKind] = useState(null);
  const [pendingCrop, setPendingCrop] = useState(null); // { machineId, kind, file }
  const [editUnlocked, setEditUnlocked] = useState(false);

  const selectedCell = cells.find((c) => c.id === expandedCellId) || null;

  const persist = useCallback((updater) => {
    setCells((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveData(next);
      return next;
    });
  }, []);

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
    setExpandedCellId(cell.id); // entra direto na célula recém-criada
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
  function renameOperation(opId, name, pallet) {
    if (!name.trim()) return;
    persist((prev) => {
      let next = updateOperationById(prev, opId, (o) => ({ ...o, name: name.trim(), pallet: pallet ?? o.pallet ?? null }));
      if (pallet === 1 || pallet === 2) {
        // Com exatamente 2 operações na máquina, definir o pallet de uma
        // já resolve a outra sozinha (só existem 2 pallets possíveis).
        next.forEach((c) => {
          c.machines.forEach((m) => {
            const inThisMachine = m.operations.some((o) => o.id === opId);
            if (inThisMachine && m.operations.length === 2) {
              const other = m.operations.find((o) => o.id !== opId);
              if (other) {
                const complementary = pallet === 1 ? 2 : 1;
                next = updateOperationById(next, other.id, (o) => ({ ...o, pallet: complementary }));
              }
            }
          });
        });
      }
      return next;
    });
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

  // Preset de bloco (4cc/6cc) da célula: sobrescreve o desgaste/peça de
  // TODAS as ferramentas dela de uma vez — um jeito rápido de trocar
  // quando o tipo de bloco rodado muda.
  function setBlockPreset(cellId, preset) {
    const desgaste = preset === '4cc' ? 1 : 1.5;
    persist((prev) => updateCellById(prev, cellId, (c) => ({
      ...c,
      blockPreset: preset,
      machines: c.machines.map((m) => ({
        ...m,
        operations: m.operations.map((o) => ({
          ...o,
          tools: o.tools.map((t) => ({ ...t, desgastePeca: desgaste })),
        })),
      })),
    })));
  }

  function resetPalletCount(machineId, pallet) {
    persist((prev) => updateMachineById(prev, machineId, (m) => ({
      ...m,
      palletLastCount: { ...(m.palletLastCount || {}), [pallet]: 0 },
    })));
  }

  // Soma "desgaste x peças novas" na vida atual de toda ferramenta cujo
  // operação pertence a esse pallet, e guarda a nova contagem como
  // referência — assim na próxima vez basta digitar o número do
  // computador de novo, sem precisar lembrar de quanto era antes.
  function applyPalletCount(machineId, pallet, amount, newCount) {
    if (!amount || amount <= 0) return;
    persist((prev) => prev.map((c) => ({
      ...c,
      machines: c.machines.map((m) => {
        if (m.id !== machineId) return m;
        // Ferramentas cadastradas antes do preset existir podem estar com
        // desgaste 0 — nesses casos usa o padrão da célula em vez de somar
        // nada (que era o motivo do contador parecer não funcionar).
        const fallback = desgasteForPreset(c.blockPreset);
        return {
          ...m,
          palletLastCount: { ...(m.palletLastCount || {}), [pallet]: newCount },
          operations: m.operations.map((o) => {
            if (o.pallet !== pallet) return o;
            return {
              ...o,
              tools: o.tools.map((t) => {
                const desg = parseFloat(t.desgastePeca) || fallback;
                return {
                  ...t,
                  desgastePeca: desg,
                  vidaAtual: (parseFloat(t.vidaAtual) || 0) + desg * amount,
                  lastUpdated: new Date().toISOString(),
                };
              }),
            };
          }),
        };
      }),
    })));
  }

  function findMachine(cellsList, machineId) {
    for (const c of cellsList) {
      const m = c.machines.find((mm) => mm.id === machineId);
      if (m) return { cell: c, machine: m };
    }
    return null;
  }

  // O OCR local pode "achar" que leu certo mesmo quando pulou um pedaço
  // do número (ex: ler "30" em vez de "2030"). Como o desgaste só sobe
  // aos pouquinhos entre uma foto e outra, um salto grande demais é
  // sinal de leitura quebrada — força conferência mesmo que o Tesseract
  // tenha reportado confiança alta.
  function isImplausibleJump(oldVal, newVal) {
    const o = parseFloat(oldVal);
    const n = parseFloat(newVal);
    if (isNaN(o) || isNaN(n)) return false;
    if (n === 0 || o === 0) return false; // reset de ferramenta trocada, ou ainda sem histórico
    return Math.abs(n - o) > Math.max(30, o * 0.5);
  }

  // Monta as linhas da tela de conferência pra TODAS as ferramentas de
  // uma máquina (todas as operações juntas). readingByNum vazio = modo
  // manual, sem nenhuma leitura de OCR (usado pelo "Adicionar manualmente").
  function buildRowsForMachine(machine, readingByNum) {
    const allTools = [];
    machine.operations.forEach((op) => {
      op.tools.forEach((t) => allTools.push({ tool: t, opName: op.name }));
    });

    const rows = allTools.map(({ tool: t, opName }) => {
      const atualNum = slotToAtualNum(t.slot);
      const atualReading = atualNum !== null ? readingByNum[atualNum] : undefined;
      const limiteNum = t.isRoutine ? null : slotToLimiteNum(t.slot);
      const limiteReading = limiteNum !== null ? readingByNum[limiteNum] : undefined;

      let vidaAtualConfidence = atualReading ? atualReading.confidence : 'missing';
      if (atualReading && isImplausibleJump(t.vidaAtual, atualReading.value)) {
        vidaAtualConfidence = 'low';
      }

      let vidaUtilConfidence = limiteReading ? limiteReading.confidence : 'missing';
      if (limiteReading && !t.isRoutine) {
        const oldVU = parseFloat(t.vidaUtil);
        if (!isNaN(oldVU) && oldVU > 0 && Math.abs(limiteReading.value - oldVU) > 0.01) {
          // vida útil quase nunca muda depois de cadastrada — qualquer
          // diferença aqui merece conferência, mesmo com confiança alta.
          vidaUtilConfidence = 'low';
        }
      }

      return {
        toolId: t.id,
        slot: t.slot,
        opName,
        isRoutine: t.isRoutine,
        oldVidaAtual: t.vidaAtual,
        newVidaAtual: atualReading ? String(atualReading.value) : '',
        vidaAtualConfidence,
        oldVidaUtil: t.vidaUtil,
        newVidaUtil: limiteReading ? String(limiteReading.value) : '',
        vidaUtilConfidence,
      };
    });
    rows.sort((a, b) => compareSlots(a.slot, b.slot));
    return rows;
  }

  // Chamado pelos botões de câmera/galeria de cada linha (vida útil ou
  // vida atual) — só guarda o arquivo e abre a tela de recorte. O OCR só
  // roda depois que o recorte for confirmado (processCroppedPhoto).
  function onPhotoFile(machineId, kind, file) {
    setPendingCrop({ machineId, kind, file });
  }

  function cancelCrop() {
    setPendingCrop(null);
  }

  async function processCroppedPhoto(canvas) {
    const { machineId, kind } = pendingCrop;
    setPendingCrop(null);
    const found = findMachine(cells, machineId);
    if (!found) return;
    const machineLabel = `${found.cell.name} · ${found.machine.name}`;
    const kindLabel = kind === 'util' ? 'vida útil' : 'vida atual';

    setPhotoBusyMachineId(machineId);
    setPhotoBusyKind(kind);
    setOcrModal({ machineId, machineLabel: `${machineLabel} · foto de ${kindLabel}`, status: 'loading', rows: [] });

    try {
      const readings = await readPanelPhoto(canvas);
      const readingByNum = {};
      readings.forEach((r) => { readingByNum[r.num] = r; });
      const rows = buildRowsForMachine(found.machine, readingByNum);
      setOcrModal({ machineId, machineLabel, status: 'review', rows });
    } catch (err) {
      setOcrModal({ machineId, machineLabel, status: 'error', rows: [], error: err.message });
    } finally {
      setPhotoBusyMachineId(null);
      setPhotoBusyKind(null);
    }
  }

  // "Adicionar manualmente": mesma tela de conferência, mas sem nenhuma
  // leitura de foto — todos os campos começam em branco pra digitar.
  function openManualEntry(machineId) {
    const found = findMachine(cells, machineId);
    if (!found) return;
    const machineLabel = `${found.cell.name} · ${found.machine.name}`;
    const rows = buildRowsForMachine(found.machine, {});
    setOcrModal({ machineId, machineLabel, status: 'review', rows });
  }

  function saveOcrRows(rows) {
    const byToolId = {};
    rows.forEach((r) => { byToolId[r.toolId] = r; });
    persist((prev) => prev.map((c) => ({
      ...c,
      machines: c.machines.map((m) => ({
        ...m,
        operations: m.operations.map((o) => ({
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
            if (Object.keys(patch).length === 0) return t;
            return { ...t, ...patch, lastUpdated: new Date().toISOString() };
          }),
        })),
      })),
    })));
    setOcrModal(null);
  }

  function retakePhoto() {
    // Fecha e deixa o usuário tocar de novo no botão de câmera/galeria
    // que quiser — como agora são 4 gatilhos possíveis (útil/atual x
    // câmera/galeria), não dá pra "adivinhar" qual repetir sozinho.
    setOcrModal(null);
  }

  return (
    <EditLockContext.Provider value={{ unlocked: editUnlocked }}>
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: SANS, color: C.text }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '18px 14px 90px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 18 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wrench size={17} color={C.accent} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>Vida de ferramentas</div>
            <div style={{ fontSize: 11.5, color: C.textFaint }}>Célula · Máquina · Operação</div>
          </div>
          <button
            onClick={() => setEditUnlocked((u) => !u)}
            title={editUnlocked ? 'Travar edição' : 'Destravar edição'}
            className="flex items-center gap-1.5"
            style={{
              background: editUnlocked ? C.warnSoft : 'transparent', color: editUnlocked ? C.warn : C.textFaint,
              border: `1px solid ${editUnlocked ? C.warn : C.border}`, borderRadius: 7, padding: '6px 10px', fontSize: 11.5, cursor: 'pointer',
            }}
          >
            {editUnlocked ? <Unlock size={13} /> : <Lock size={13} />}
            {editUnlocked ? 'Destravado' : 'Travado'}
          </button>
        </div>

        {selectedCell ? (
          <CellDetail
            cell={selectedCell}
            onBack={() => { setExpandedCellId(null); setExpandedMachineId(null); setExpandedOpId(null); }}
            onRename={(name) => renameCell(selectedCell.id, name)}
            onDelete={() => { deleteCell(selectedCell.id); setExpandedCellId(null); }}
            otherMachines={flattenMachines(cells)}
            onAddMachine={(machine) => addMachine(selectedCell.id, machine)}
            expandedMachineId={expandedMachineId}
            onToggleMachine={toggleMachine}
            onRenameMachine={renameMachine}
            onDeleteMachine={(machineId) => deleteMachine(selectedCell.id, machineId)}
            expandedOpId={expandedOpId}
            onToggleOp={toggleOp}
            onAddOperation={addOperation}
            onUpdateTool={updateTool}
            onDeleteTool={deleteTool}
            onAddTool={addTool}
            onDeleteOp={deleteOperation}
            onRenameOp={renameOperation}
            onPhotoFile={onPhotoFile}
            photoBusyMachineId={photoBusyMachineId}
            photoBusyKind={photoBusyKind}
            onManualEntry={openManualEntry}
            onApplyPallet={applyPalletCount}
            onResetPallet={resetPalletCount}
            onSetBlockPreset={setBlockPreset}
          />
        ) : (
          <>
            <SummaryStrip cells={cells} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: C.textDim }}>Células</span>
            </div>

            {!addingCell && editUnlocked && (
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
                {editUnlocked
                  ? 'Nenhuma célula cadastrada. Comece pela célula que você acompanha todo dia — dentro dela você cadastra as máquinas.'
                  : 'Nenhuma célula cadastrada. Destrave o cadeado acima para cadastrar.'}
              </div>
            )}

            {cells.map((cell) => (
              <CellListItem key={cell.id} cell={cell} onOpen={() => setExpandedCellId(cell.id)} />
            ))}
          </>
        )}
      </div>

      {pendingCrop && (
        <CropModal
          file={pendingCrop.file}
          title={pendingCrop.kind === 'util' ? 'Vida útil (#800-849)' : 'Vida atual (#900-949)'}
          onConfirm={processCroppedPhoto}
          onCancel={cancelCrop}
        />
      )}

      {ocrModal && <OcrModal state={ocrModal} onClose={() => setOcrModal(null)} onRetake={retakePhoto} onSave={saveOcrRows} />}
    </div>
    </EditLockContext.Provider>
  );
}
