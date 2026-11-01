import React, { useState, useRef } from 'react';
import {
  Wrench, StickyNote, Pencil, Check, Plus, Camera, Factory, ChevronRight, GripVertical, Trash2, Home, LayoutGrid,
  Settings, Download, Upload, SlidersHorizontal, Bell, AlertTriangle, CheckCircle2, Keyboard, Layers,
} from 'lucide-react';
import { C, MONO, SANS, STATUS, SAFE_TOP, SAFE_BOTTOM } from './theme.js';
import { TopBar, IconButton, Button, Chip, ChipRow, Card, SectionTitle, Badge, LifeBar, EmptyState, Notice, TextInput } from './ui.jsx';
import { useApp } from './actions.js';
import {
  flattenToolRows, computeRemaining, statusFor, lifePct, compareSlots, notesForSlot, WARNING_MAX, timeAgo,
} from './logic.js';

/* Linha de ferramenta — usada no Início e dentro da célula. */
function ToolLine({ tool, preset, subtitle, noteCount, onClick, last }) {
  const remaining = computeRemaining(tool, preset);
  const status = statusFor(remaining);
  const S = STATUS[status];
  return (
    <button type="button" onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: last ? 'none' : `1px solid ${C.divider}`,
        padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: SANS, color: C.text, minHeight: 64,
      }}>
      <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, width: 46, flexShrink: 0 }}>{tool.slot || '?'}</span>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 14.5, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</span>
          {noteCount > 0 && <StickyNote size={16} color={C.navy} aria-label="Tem anotação" style={{ flexShrink: 0 }} />}
        </span>
        {tool.isRoutine ? <span style={{ fontSize: 13, color: C.muted }}>rotina · sem vida útil</span> : <LifeBar pct={lifePct(tool)} status={status} />}
      </span>
      <span style={{ textAlign: 'right', width: 56, flexShrink: 0 }}>
        <span style={{ display: 'block', fontSize: 21, fontWeight: 700, color: S.text, lineHeight: 1.1 }}>{tool.isRoutine || remaining === null ? '—' : remaining}</span>
        {!tool.isRoutine && <span style={{ display: 'block', fontSize: 12.5, color: C.muted }}>peças</span>}
      </span>
    </button>
  );
}

function cellSummary(cell) {
  const preset = cell.blockPreset || '6cc';
  const rem = flattenToolRows([cell]).map((r) => computeRemaining(r.tool, preset)).filter((r) => r !== null);
  const min = rem.length ? Math.min(...rem) : null;
  const near = rem.filter((r) => r <= WARNING_MAX).length;
  return { min, near, status: statusFor(min), hasTools: rem.length > 0 };
}

function CellCard({ cell, onClick }) {
  const { near, status, hasTools } = cellSummary(cell);
  const S = STATUS[status];
  return (
    <button type="button" onClick={onClick}
      style={{ textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer', fontFamily: SANS, color: C.text, minHeight: 104 }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell.name}</span>
        {hasTools && <span style={{ width: 11, height: 11, borderRadius: 6, background: S.bar, flexShrink: 0 }} />}
      </span>
      <span style={{ fontSize: 14, color: C.muted }}>{cell.machines.length} {cell.machines.length === 1 ? 'máquina' : 'máquinas'} · {cell.blockPreset || '6cc'}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: !hasTools ? C.muted : near ? S.text : C.okText }}>
        {!hasTools ? 'sem ferramentas' : near ? `${near} perto de trocar` : 'tudo em dia'}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------- */
/* Início                                                                 */
/* ---------------------------------------------------------------------- */

export function HomeScreen() {
  const { cells, nav } = useApp();
  const [showAll, setShowAll] = useState(false);
  const rows = flattenToolRows(cells)
    .map((r) => ({ ...r, remaining: computeRemaining(r.tool, r.preset) }))
    .filter((r) => r.remaining !== null)
    .sort((a, b) => a.remaining - b.remaining);
  const urgent = rows.filter((r) => r.remaining <= WARNING_MAX).length;
  const visible = showAll ? rows : rows.slice(0, Math.max(5, Math.min(urgent, 10)));
  const cellById = Object.fromEntries(cells.map((c) => [c.id, c]));

  return (
    <>
      <div style={{ background: C.navy, color: '#fff', padding: `calc(16px + ${SAFE_TOP}) 20px 24px`, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wrench size={22} color={C.navy} strokeWidth={2.4} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.01em' }}>Toolpy</div>
        </div>
        {rows.length > 0 && (
          urgent > 0 ? (
            <div>
              <div style={{ fontSize: 15.5, color: C.onNavyMuted }}>Trocam em até {WARNING_MAX} peças</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 2 }}>
                <span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1 }}>{urgent}</span>
                <span style={{ fontSize: 19, fontWeight: 500 }}>{urgent === 1 ? 'ferramenta' : 'ferramentas'}</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle2 size={28} />
              <div style={{ fontSize: 18, fontWeight: 500 }}>Nenhuma troca nas próximas {WARNING_MAX} peças</div>
            </div>
          )
        )}
      </div>

      <div style={{ padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cells.length === 0 ? (
          <EmptyState icon={<Layers size={30} />} title="Vamos começar" text="Cadastre a célula que você acompanha. Dentro dela entram as máquinas, operações e ferramentas."
            action={<Button icon={<Plus size={20} />} onClick={() => nav.push({ type: 'addCell' })}>Cadastrar célula</Button>} />
        ) : (
          <>
            {rows.length > 0 ? (
              <>
                <SectionTitle>Trocar primeiro</SectionTitle>
                <Card>
                  {visible.map((r, i) => (
                    <ToolLine key={r.tool.id} tool={r.tool} preset={r.preset}
                      subtitle={`${r.cellName} · ${r.machineName} · ${r.opName}`}
                      noteCount={notesForSlot(cellById[r.cellId], r.tool.slot).length}
                      last={i === visible.length - 1}
                      onClick={() => nav.push({ type: 'tool', opId: r.opId, toolId: r.tool.id })} />
                  ))}
                </Card>
                {rows.length > visible.length && (
                  <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>Ver todas ({rows.length})</Button>
                )}
              </>
            ) : (
              <Notice tone="navy" icon={<Wrench size={20} />}>Cadastre ferramentas com vida útil pra ver aqui quais trocam primeiro.</Notice>
            )}

            <SectionTitle>Células</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              {cells.map((c) => <CellCard key={c.id} cell={c} onClick={() => nav.push({ type: 'cell', cellId: c.id })} />)}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Células (lista, reordenar)                                             */
/* ---------------------------------------------------------------------- */

function ReorderableCells({ cells, editing, onOpen, onReorder }) {
  const itemRefs = useRef({});
  const [drag, setDrag] = useState(null);

  function startDrag(cellId) {
    return (e) => {
      e.preventDefault();
      const order = cells.map((c) => c.id);
      const rects = {};
      order.forEach((cid) => { const n = itemRefs.current[cid]; if (n) rects[cid] = n.getBoundingClientRect(); });
      setDrag({ id: cellId, startY: e.clientY, y: e.clientY, order, rects, targetIndex: order.indexOf(cellId) });
      e.target.setPointerCapture?.(e.pointerId);
    };
  }
  function onMove(e) {
    if (!drag) return;
    const y = e.clientY;
    let targetIndex = drag.order.length;
    for (let i = 0; i < drag.order.length; i++) {
      const r = drag.rects[drag.order[i]];
      if (r && y < r.top + r.height / 2) { targetIndex = i; break; }
    }
    setDrag((d) => (d ? { ...d, y, targetIndex } : d));
  }
  function endDrag() {
    if (!drag) return;
    const { id, order, targetIndex } = drag;
    const without = order.filter((cid) => cid !== id);
    const next = [...without];
    next.splice(Math.min(targetIndex, without.length), 0, id);
    if (next.join() !== order.join()) onReorder(next.map((cid) => cells.find((c) => c.id === cid)).filter(Boolean));
    setDrag(null);
  }
  const offset = drag ? drag.y - drag.startY : 0;
  const line = <div style={{ height: 4, background: C.navy, borderRadius: 2, margin: '0 0 8px' }} />;

  return (
    <div onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
      {cells.map((cell, i) => {
        const { near, status, hasTools } = cellSummary(cell);
        const dragging = drag?.id === cell.id;
        return (
          <React.Fragment key={cell.id}>
            {drag && drag.targetIndex === i && line}
            <div ref={(n) => { itemRefs.current[cell.id] = n; }}
              style={{
                transform: dragging ? `translateY(${offset}px) scale(1.02)` : 'none', position: dragging ? 'relative' : 'static', zIndex: dragging ? 5 : 'auto',
                boxShadow: dragging ? '0 12px 28px rgba(16,33,63,0.25)' : 'none', borderRadius: 16, marginBottom: 10,
              }}>
              <div onClick={() => { if (!drag && !editing) onOpen(cell.id); }}
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px', cursor: editing ? 'default' : 'pointer', minHeight: 72 }}>
                {editing && (
                  <div onPointerDown={startDrag(cell.id)} title="Arrastar para reordenar" aria-label={`Arrastar ${cell.name}`}
                    style={{ width: 44, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', cursor: 'grab', margin: '0 -6px 0 -8px', color: C.muted }}>
                    <GripVertical size={24} />
                  </div>
                )}
                <div style={{ width: 44, height: 44, borderRadius: 12, background: C.navyTint, color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Layers size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 600 }}>{cell.name}</div>
                  <div style={{ fontSize: 14, color: C.muted }}>
                    {cell.machines.length} {cell.machines.length === 1 ? 'máquina' : 'máquinas'} · bloco {cell.blockPreset || '6cc'}
                    {hasTools && near > 0 && <span style={{ color: STATUS[status].text, fontWeight: 600 }}> · {near} perto de trocar</span>}
                  </div>
                </div>
                {!editing && <ChevronRight size={22} color={C.muted} />}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {drag && drag.targetIndex === cells.length && line}
    </div>
  );
}

export function CellsScreen() {
  const { cells, act, nav } = useApp();
  const [editing, setEditing] = useState(false);
  return (
    <>
      <TopBar title="Células" big
        actions={cells.length > 1 && (
          <IconButton label={editing ? 'Concluir' : 'Reordenar'} onNavy active={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? <Check size={22} /> : <Pencil size={20} />}
          </IconButton>
        )} />
      <div style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {editing && <div style={{ fontSize: 15, color: C.muted, margin: '0 2px 10px' }}>Segure o ícone ⋮⋮ e arraste pra mudar a ordem.</div>}
        {cells.length === 0 && <EmptyState icon={<Layers size={30} />} title="Nenhuma célula" text="Comece pela célula que você acompanha todo dia." />}
        <ReorderableCells cells={cells} editing={editing} onOpen={(id) => nav.push({ type: 'cell', cellId: id })} onReorder={act.reorderCells} />
        {!editing && <Button variant="soft" icon={<Plus size={20} />} onClick={() => nav.push({ type: 'addCell' })}>Nova célula</Button>}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Dentro da célula                                                       */
/* ---------------------------------------------------------------------- */

function CalibrationBanner({ machine }) {
  const { act, nav } = useApp();
  const cal = machine.calibration;
  if (!cal) return null;
  const since = new Date(cal.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const cancel = <Button variant="secondary" size="sm" onClick={() => act.cancelCalibration(machine.id)}>Cancelar calibração</Button>;
  if (cal.phase === 'awaiting_start' || cal.phase === 'awaiting_finish') {
    const start = cal.phase === 'awaiting_start';
    return (
      <Notice tone="warn" icon={<SlidersHorizontal size={20} />}
        action={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="warn" icon={<Camera size={20} />} onClick={() => nav.push({ type: 'photo', machineId: machine.id, kind: 'atual' })}>Ler vida atual</Button>
          <Button variant="secondary" size="sm" icon={<Keyboard size={18} />} onClick={() => act.openManualEntry(machine.id, true)}>Digitar na mão</Button>
          {cancel}
        </div>}>
        <b>Calibração do bloco {cal.preset}:</b> leia a vida atual agora — essa leitura vira o <b>{start ? 'início' : 'fim'}</b> da calibração.
      </Notice>
    );
  }
  if (cal.phase === 'running') {
    return (
      <Notice tone="warn" icon={<SlidersHorizontal size={20} />}
        action={<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="warn" onClick={() => act.setCalibrationPhase(machine.id, 'awaiting_finish')}>Finalizar calibração</Button>
          {cancel}
        </div>}>
        <b>Calibrando bloco {cal.preset}</b> desde {since}. Deixe rodar as peças que quiser antes de finalizar.
      </Notice>
    );
  }
  if (cal.phase === 'ready') {
    return (
      <Notice tone="warn" icon={<SlidersHorizontal size={20} />}
        action={<Button variant="warn" onClick={() => nav.push({ type: 'calibration', machineId: machine.id })}>Ver resultado</Button>}>
        <b>Calibração pronta.</b> Falta informar quantas peças rodaram.
      </Notice>
    );
  }
  return null;
}

function InlineRename({ value, onSave, label }) {
  const [v, setV] = useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
      <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>{label}</span>
        <TextInput value={v} onChange={(e) => setV(e.target.value)} />
      </label>
      <Button full={false} variant="soft" disabled={!v.trim() || v.trim() === value} onClick={() => onSave(v)}>Salvar</Button>
    </div>
  );
}

function DangerConfirm({ label, confirmLabel, onConfirm }) {
  const [open, setOpen] = useState(false);
  if (!open) return <Button variant="dangerSoft" size="sm" icon={<Trash2 size={18} />} onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancelar</Button>
      <Button variant="danger" size="sm" onClick={onConfirm}>{confirmLabel}</Button>
    </div>
  );
}

export function CellScreen({ cellId }) {
  const { cells, act, nav } = useApp();
  const cell = cells.find((c) => c.id === cellId);
  const [machineId, setMachineId] = useState(cell?.machines[0]?.id || null);
  const [editing, setEditing] = useState(false);
  const prevCount = useRef(cell?.machines.length || 0);

  // Máquina nova cadastrada → já seleciona ela.
  React.useEffect(() => {
    const n = cell?.machines.length || 0;
    if (n > prevCount.current) setMachineId(cell.machines[n - 1].id);
    prevCount.current = n;
  }, [cell?.machines.length]);

  if (!cell) return null;
  const preset = cell.blockPreset || '6cc';
  const machine = cell.machines.find((m) => m.id === machineId) || cell.machines[0] || null;
  const noteCount = (cell.notes || []).length;
  const pallets = machine ? new Set(machine.operations.map((o) => o.pallet).filter((p) => p === 1 || p === 2)) : new Set();

  return (
    <>
      <TopBar title={cell.name} subtitle={`Bloco ${preset} · ${cell.machines.length} ${cell.machines.length === 1 ? 'máquina' : 'máquinas'}`} onBack={nav.close}
        actions={<>
          <IconButton label={`Anotações da célula (${noteCount})`} onNavy badge={noteCount || null} onClick={() => nav.push({ type: 'cellNotes', cellId })}><StickyNote size={20} /></IconButton>
          <IconButton label={editing ? 'Concluir edição' : 'Editar célula'} onNavy active={editing} onClick={() => setEditing((v) => !v)}>
            {editing ? <Check size={22} /> : <Pencil size={20} />}
          </IconButton>
        </>}>
        {(cell.machines.length > 0 || editing) && (
          <div style={{ paddingLeft: 12 }}>
            <ChipRow>
              {cell.machines.map((m) => <Chip key={m.id} onNavy selected={machine?.id === m.id} onClick={() => setMachineId(m.id)}>{m.name}</Chip>)}
              {editing && <Chip onNavy onClick={() => nav.push({ type: 'addMachine', cellId })}>+ Máquina</Chip>}
            </ChipRow>
          </div>
        )}
      </TopBar>

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {editing && (
          <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, border: `1.5px solid ${C.navy}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, letterSpacing: '0.04em' }}>EDITANDO A CÉLULA</div>
            <InlineRename label="Nome da célula" value={cell.name} onSave={(v) => act.renameCell(cellId, v)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Bloco que roda (define o desgaste/peça)</span>
              <ChipRow>{['4cc', '6cc'].map((p) => <Chip key={p} selected={preset === p} onClick={() => act.setBlockPreset(cellId, p)}>{p === '4cc' ? '4cc • 6509' : '6cc • 6508'}</Chip>)}</ChipRow>
            </div>
            <DangerConfirm label="Excluir célula" confirmLabel={`Excluir ${cell.name} e tudo dentro`} onConfirm={() => { act.deleteCell(cellId); nav.close(); }} />
          </Card>
        )}

        {cell.machines.length === 0 && (
          <EmptyState icon={<Layers size={30} />} title="Nenhuma máquina" text="Cadastre as máquinas desta célula (ex: 6262, 6265)."
            action={<Button icon={<Plus size={20} />} onClick={() => nav.push({ type: 'addMachine', cellId })}>Cadastrar máquina</Button>} />
        )}

        {machine && (
          <>
            {editing && (
              <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, letterSpacing: '0.04em' }}>MÁQUINA {machine.name}</div>
                <InlineRename label="Nome da máquina" value={machine.name} onSave={(v) => act.renameMachine(machine.id, v)} />
                {machine.operations.length > 0 && !machine.calibration && (
                  <Button variant="secondary" size="sm" icon={<SlidersHorizontal size={18} />} onClick={() => act.startCalibration(machine.id)}>Calibrar desgaste (bloco {preset})</Button>
                )}
                <DangerConfirm label="Excluir máquina" confirmLabel={`Excluir ${machine.name}`} onConfirm={() => act.deleteMachine(cellId, machine.id)} />
              </Card>
            )}

            <CalibrationBanner machine={machine} />

            {machine.operations.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: pallets.size ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 10 }}>
                <Button size="lg" icon={<Camera size={22} />} onClick={() => nav.push({ type: 'photo', machineId: machine.id })}>Ler foto</Button>
                {pallets.size > 0 && <Button size="lg" variant="soft" icon={<Factory size={22} />} onClick={() => nav.push({ type: 'production', machineId: machine.id })}>Produção</Button>}
              </div>
            )}

            {machine.operations.map((op) => {
              const tools = [...op.tools].sort((a, b) => compareSlots(a.slot, b.slot));
              return (
                <div key={op.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  <SectionTitle right={`${op.pallet ? `Pallet ${op.pallet} · ` : 'sem pallet · '}${op.tools.length} ${op.tools.length === 1 ? 'ferramenta' : 'ferramentas'}`}>{op.name}</SectionTitle>
                  {editing && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
                      <Button variant="secondary" size="sm" icon={<Pencil size={17} />} onClick={() => nav.push({ type: 'editOp', opId: op.id })}>Editar operação</Button>
                      <Button variant="soft" size="sm" icon={<Plus size={18} />} onClick={() => nav.push({ type: 'addTool', opId: op.id })}>Ferramenta</Button>
                    </div>
                  )}
                  {tools.length > 0 ? (
                    <Card>
                      {tools.map((t, i) => (
                        <ToolLine key={t.id} tool={t} preset={preset} subtitle={t.bman || 'sem código'} last={i === tools.length - 1}
                          noteCount={notesForSlot(cell, t.slot).length} onClick={() => nav.push({ type: 'tool', opId: op.id, toolId: t.id })} />
                      ))}
                    </Card>
                  ) : !editing && (
                    <Card style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div style={{ fontSize: 15, color: C.muted }}>Nenhuma ferramenta nesta operação.</div>
                      <Button variant="soft" size="sm" icon={<Plus size={18} />} onClick={() => nav.push({ type: 'addTool', opId: op.id })}>Cadastrar ferramenta</Button>
                    </Card>
                  )}
                </div>
              );
            })}

            {machine.operations.length === 0 && !editing && (
              <EmptyState icon={<Wrench size={30} />} title="Sem operações" text={`Cadastre as operações da ${machine.name} (ex: OP 800). Dá pra ler as ferramentas direto da tela do programa.`}
                action={<Button icon={<Plus size={20} />} onClick={() => nav.push({ type: 'addOp', machineId: machine.id })}>Cadastrar operação</Button>} />
            )}
            {editing && <Button variant="soft" icon={<Plus size={20} />} onClick={() => nav.push({ type: 'addOp', machineId: machine.id })}>Nova operação</Button>}
          </>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Anotações                                                              */
/* ---------------------------------------------------------------------- */

export function NotesScreen({ lockedCellId }) {
  const { cells, nav } = useApp();
  const [filter, setFilter] = useState(null);
  const cellFilter = lockedCellId || filter;
  const lockedCell = lockedCellId ? cells.find((c) => c.id === lockedCellId) : null;
  const notes = [];
  cells.forEach((c) => (c.notes || []).forEach((n) => { if (!cellFilter || c.id === cellFilter) notes.push({ ...n, cellId: c.id, cellName: c.name }); }));
  notes.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

  return (
    <>
      <TopBar title={lockedCell ? `Anotações · ${lockedCell.name}` : 'Anotações'} big={!lockedCell} onBack={lockedCell ? nav.close : undefined}>
        {!lockedCell && cells.length > 1 && (
          <ChipRow>
            <Chip onNavy selected={!filter} onClick={() => setFilter(null)}>Todas</Chip>
            {cells.map((c) => <Chip key={c.id} onNavy selected={filter === c.id} onClick={() => setFilter(c.id)}>{c.name}</Chip>)}
          </ChipRow>
        )}
      </TopBar>
      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {notes.length === 0 && (
          <EmptyState icon={<StickyNote size={30} />} title="Nenhuma anotação"
            text="Guarde aqui o que é bom lembrar — por exemplo: “se trocar a T2 ou T3, levar a peça pro 3D”." />
        )}
        {notes.map((n) => (
          <button key={n.id} type="button" onClick={() => nav.push({ type: 'note', cellId: n.cellId, noteId: n.id })}
            style={{ textAlign: 'left', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer', fontFamily: SANS, color: C.text }}>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {!cellFilter && <Badge tone="solid">{n.cellName}</Badge>}
              {(n.slots || []).map((s) => <Badge key={s} mono>{s}</Badge>)}
              {!(n.slots || []).length && <Badge tone="muted">geral</Badge>}
              {n.remind && <Badge tone="warn">avisa ao trocar</Badge>}
            </span>
            <span style={{ fontSize: 17, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{n.text}</span>
            {n.updatedAt && <span style={{ fontSize: 13, color: C.muted }}>{timeAgo(n.updatedAt)}</span>}
          </button>
        ))}
        {cells.length > 0 && (
          <Button size="lg" icon={<Plus size={22} />} onClick={() => nav.push({ type: 'note', cellId: cellFilter || undefined })}>Nova anotação</Button>
        )}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Ajustes                                                                */
/* ---------------------------------------------------------------------- */

export function SettingsScreen() {
  const { cells, act } = useApp();
  const inputRef = useRef(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const toolCount = flattenToolRows(cells).length;

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setError(''); setDone('');
    try { setPending(await act.readBackup(f)); } catch { setError('Esse arquivo não parece um backup do Toolpy.'); }
  }

  return (
    <>
      <TopBar title="Ajustes" big />
      <div style={{ padding: '18px 16px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Backup</div>
          <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>
            Seus dados ficam só neste aparelho ({cells.length} {cells.length === 1 ? 'célula' : 'células'}, {toolCount} ferramentas). Exporte um backup de vez em quando — e é assim que você passa os dados do site pro app instalado.
          </div>
          <Button icon={<Download size={20} />} onClick={() => { act.exportBackup(); setDone('Backup exportado.'); }}>Exportar backup</Button>
          <input ref={inputRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={onFile} />
          <Button variant="secondary" icon={<Upload size={20} />} onClick={() => inputRef.current?.click()}>Importar backup</Button>
          {done && <div style={{ fontSize: 14.5, color: C.okText }}>✓ {done}</div>}
          {error && <Notice tone="crit" icon={<AlertTriangle size={20} />}>{error}</Notice>}
          {pending && (
            <Notice tone="warn" icon={<AlertTriangle size={20} />}
              action={<div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
                <Button variant="secondary" size="sm" onClick={() => setPending(null)}>Cancelar</Button>
                <Button variant="warn" size="sm" onClick={() => { act.applyBackup(pending); setPending(null); setDone('Backup importado.'); }}>Substituir tudo</Button>
              </div>}>
              Importar vai <b>substituir tudo</b> que está aqui agora pelo arquivo ({pending.length} {pending.length === 1 ? 'célula' : 'células'}). Não tem volta.
            </Notice>
          )}
        </Card>
        <Card style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>Sobre</div>
          <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>Toolpy · vida de ferramentas. A leitura de foto roda no próprio aparelho, sem internet depois da primeira vez.</div>
        </Card>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Barra de baixo                                                         */
/* ---------------------------------------------------------------------- */

export function BottomNav({ tab, onTab, onPhoto, noteCount }) {
  const item = (id, label, icon) => {
    const on = tab === id;
    return (
      <button type="button" key={id} onClick={() => onTab(id)} aria-current={on ? 'page' : undefined}
        style={{ flex: 1, height: 64, border: 'none', background: 'transparent', color: on ? C.navy : C.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, cursor: 'pointer', fontFamily: SANS, fontSize: 12.5, fontWeight: on ? 700 : 500 }}>
        {icon}
        {label}
      </button>
    );
  };
  return (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 30, background: C.surface, borderTop: `1px solid ${C.border}`,
      paddingBottom: SAFE_BOTTOM, display: 'flex', justifyContent: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', maxWidth: 520 }}>
        {item('inicio', 'Início', <Home size={25} />)}
        {item('celulas', 'Células', <LayoutGrid size={25} />)}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <button type="button" aria-label="Ler foto do painel" onClick={onPhoto}
            style={{ width: 62, height: 62, borderRadius: 31, border: `4px solid ${C.surface}`, background: C.navy, color: '#fff', marginTop: -30, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(15,45,92,0.35)', cursor: 'pointer' }}>
            <Camera size={28} />
          </button>
        </div>
        {item('notas', 'Notas', <StickyNote size={25} />)}
        {item('ajustes', 'Ajustes', <Settings size={25} />)}
      </div>
    </nav>
  );
}
