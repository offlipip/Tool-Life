import React, { useState } from 'react';
import {
  RotateCcw, SlidersHorizontal, Pencil, Trash2, Bell, StickyNote, Gauge, Timer, ListOrdered, Keyboard,
  Check, Plus, AlertTriangle, Factory, Undo2, Copy,
} from 'lucide-react';
import { C, MONO, SANS, STATUS } from './theme.js';
import {
  Sheet, Button, Field, TextInput, TextArea, SlotSelect, Select, Checkbox, Chip, ChipRow, Notice, Badge, LifeBar, StatRow, EmptyState,
} from './ui.jsx';
import { PhotoButtons, LimitePhotoButton, NewToolForm, ProgramFoundList, useProgramReader } from './tooling.jsx';
import { useApp } from './actions.js';
import {
  findTool, findMachine, computeRemaining, statusFor, lifePct, getToolDesgaste, isCalibrated, desgasteForPreset,
  fmtNum, timeAgo, notesForSlot, slotsInCell, genId, compareSlots, cloneOperationsForNewMachine, flattenMachines, planCopy, fmtDesg,
} from './logic.js';

/* ---------------------------------------------------------------------- */
/* Ficha da ferramenta                                                    */
/* ---------------------------------------------------------------------- */

export function ToolSheet({ opId, toolId }) {
  const { cells, act, nav } = useApp();
  const [mode, setMode] = useState('view'); // view | reset | adjust | edit | delete
  const [draft, setDraft] = useState(null);
  const [adjust, setAdjust] = useState('');
  const found = findTool(cells, opId, toolId);
  if (!found) return null;
  const { cell, machine, op, tool } = found;
  const preset = cell.blockPreset || '6cc';
  const remaining = computeRemaining(tool, preset);
  const status = statusFor(remaining);
  const S = STATUS[status];
  const calibrated = isCalibrated(tool, preset);
  const notes = notesForSlot(cell, tool.slot);
  const reminders = notes.filter((n) => n.remind);
  const updated = timeAgo(tool.lastUpdated);

  function startEdit() {
    setDraft({ ...tool, vidaUtil: String(tool.vidaUtil ?? ''), vidaAtual: String(tool.vidaAtual ?? ''), desgastePeca: String(getToolDesgaste(tool, preset)) });
    setMode('edit');
  }
  function saveEdit() {
    const prevMap = (tool.desgastePeca && typeof tool.desgastePeca === 'object') ? tool.desgastePeca : {};
    act.updateTool(op.id, tool.id, {
      slot: draft.slot, bman: draft.bman.trim(), isRoutine: !!draft.isRoutine,
      vidaUtil: parseFloat(draft.vidaUtil) || 0,
      vidaAtual: parseFloat(draft.vidaAtual) || 0,
      desgastePeca: { ...prevMap, [preset]: parseFloat(draft.desgastePeca) || desgasteForPreset(preset) },
    });
    setMode('view');
  }

  const title = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>{tool.slot || '?'}</span>
      <span style={{ fontFamily: MONO, fontSize: 16, color: C.muted }}>{tool.bman || 'sem código'}</span>
    </div>
  );
  const subtitle = `${cell.name} · ${machine.name} · ${op.name}${op.pallet ? ` · Pallet ${op.pallet}` : ''}`;

  let footer;
  if (mode === 'view') {
    footer = (
      <>
        <Button size="lg" icon={<RotateCcw size={22} />} onClick={() => setMode('reset')}>Troquei a ferramenta</Button>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <Button variant="secondary" icon={<SlidersHorizontal size={18} />} onClick={() => { setAdjust(String(tool.vidaAtual ?? '')); setMode('adjust'); }}>Ajustar vida</Button>
          <Button variant="secondary" icon={<Pencil size={18} />} onClick={startEdit}>Editar dados</Button>
        </div>
      </>
    );
  } else if (mode === 'reset') {
    footer = (
      <>
        <Button size="lg" icon={<Check size={22} />} onClick={() => { act.resetTool(op.id, tool.id); setMode('view'); }}>Sim, zerar vida atual</Button>
        <Button variant="secondary" onClick={() => setMode('view')}>Cancelar</Button>
      </>
    );
  } else if (mode === 'adjust') {
    footer = (
      <>
        <Button size="lg" icon={<Check size={22} />} onClick={() => { const v = parseFloat(adjust); if (!isNaN(v)) act.updateTool(op.id, tool.id, { vidaAtual: v }); setMode('view'); }}>Salvar</Button>
        <Button variant="secondary" onClick={() => setMode('view')}>Cancelar</Button>
      </>
    );
  } else if (mode === 'edit') {
    footer = (
      <>
        <Button size="lg" icon={<Check size={22} />} disabled={!draft.slot} onClick={saveEdit}>Salvar alterações</Button>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <Button variant="secondary" onClick={() => setMode('view')}>Cancelar</Button>
          <Button variant="dangerSoft" icon={<Trash2 size={18} />} onClick={() => setMode('delete')}>Excluir</Button>
        </div>
      </>
    );
  } else if (mode === 'delete') {
    footer = (
      <>
        <Button variant="danger" size="lg" icon={<Trash2 size={20} />} onClick={() => { act.deleteTool(op.id, tool.id); nav.close(); }}>Excluir {tool.slot}</Button>
        <Button variant="secondary" onClick={() => setMode('edit')}>Cancelar</Button>
      </>
    );
  }

  return (
    <Sheet title={title} subtitle={subtitle} onClose={nav.close} footer={footer}>
      {(mode === 'view' || mode === 'reset' || mode === 'adjust') && (
        <div style={{ background: C.bg, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tool.isRoutine ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 600 }}>Ferramenta de rotina</span>
              <span style={{ fontSize: 15, color: C.muted }}>contador {fmtNum(tool.vidaAtual)}</span>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 44, fontWeight: 700, color: S.text, lineHeight: 1 }}>{remaining === null ? '—' : remaining}</span>
                <span style={{ fontSize: 17, fontWeight: 500 }}>{remaining !== null && remaining <= 0 ? 'peças — passou do limite' : 'peças até trocar'}</span>
              </div>
              <LifeBar pct={lifePct(tool)} status={status} height={13} />
            </>
          )}
          <StatRow items={[
            { label: 'Vida atual', value: fmtNum(tool.vidaAtual) },
            ...(tool.isRoutine ? [] : [{ label: 'Vida útil', value: fmtNum(tool.vidaUtil) }]),
            {
              label: `Desgaste/pç`, value: fmtDesg(getToolDesgaste(tool, preset)),
              hint: tool.isRoutine ? null : (calibrated ? `calibrado ${preset}` : 'padrão, não calibrado'),
              hintColor: calibrated ? C.muted : C.warnText,
            },
          ]} />
          {updated && <div style={{ fontSize: 13.5, color: C.muted }}>Atualizado {updated}</div>}
        </div>
      )}

      {mode === 'reset' && (
        <>
          <Notice tone="warn" icon={<RotateCcw size={20} />}>
            Zerar a vida atual da <b>{tool.slot}</b> (de {fmtNum(tool.vidaAtual)} pra 0)? Use quando a ferramenta foi trocada.
          </Notice>
          {reminders.map((n) => (
            <Notice key={n.id} tone="navy" icon={<Bell size={20} />}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 2 }}>LEMBRETE</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{n.text}</div>
            </Notice>
          ))}
        </>
      )}

      {mode === 'adjust' && (
        <Field label={tool.isRoutine ? 'Contador atual' : 'Vida atual'} hint="Use quando o número do painel não bater com o do app.">
          <TextInput mono inputMode="decimal" autoFocus value={adjust} onChange={(e) => setAdjust(e.target.value)} />
        </Field>
      )}

      {mode === 'view' && (
        <>
          {notes.map((n) => (
            <button key={n.id} type="button" onClick={() => nav.push({ type: 'note', cellId: cell.id, noteId: n.id })}
              style={{ textAlign: 'left', background: C.navyTint, border: `1.5px solid ${C.navy}`, borderRadius: 14, padding: '13px 14px', display: 'flex', gap: 11, cursor: 'pointer', fontFamily: SANS, color: C.text }}>
              <StickyNote size={20} color={C.navy} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>Anotação · {(n.slots || []).join(', ')}{n.remind ? ' · avisa ao trocar' : ''}</span>
                <span style={{ fontSize: 16, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>{n.text}</span>
              </span>
            </button>
          ))}
          <Button variant="ghost" size="sm" icon={<Plus size={18} />} onClick={() => nav.push({ type: 'note', cellId: cell.id, presetSlots: [tool.slot] })}>
            Anotação pra {tool.slot}
          </Button>
        </>
      )}

      {(mode === 'edit' || mode === 'delete') && draft && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {mode === 'delete' && <Notice tone="crit" icon={<AlertTriangle size={20} />}>Excluir {tool.slot} desta operação? Isso não tem volta.</Notice>}
          <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Slot" style={{ flex: '0 0 120px' }}><SlotSelect value={draft.slot} onChange={(v) => setDraft({ ...draft, slot: v })} /></Field>
            <Field label="Código (BMAN)"><TextInput mono value={draft.bman || ''} onChange={(e) => setDraft({ ...draft, bman: e.target.value })} placeholder="BMAN-0806" /></Field>
          </div>
          <Checkbox checked={draft.isRoutine} onChange={(v) => setDraft({ ...draft, isRoutine: v })}>Ferramenta de rotina (sem vida útil)</Checkbox>
          <div style={{ display: 'flex', gap: 10 }}>
            {!draft.isRoutine && <Field label="Vida útil"><TextInput mono inputMode="decimal" value={draft.vidaUtil} onChange={(e) => setDraft({ ...draft, vidaUtil: e.target.value })} /></Field>}
            <Field label={`Desgaste/pç (${preset})`} hint={calibrated ? `calibrado pro ${preset}` : 'padrão — não calibrado'}>
              <TextInput mono inputMode="decimal" value={draft.desgastePeca} onChange={(e) => setDraft({ ...draft, desgastePeca: e.target.value })} />
            </Field>
          </div>
          <Field label={draft.isRoutine ? 'Contador atual' : 'Vida atual'}>
            <TextInput mono inputMode="decimal" value={draft.vidaAtual} onChange={(e) => setDraft({ ...draft, vidaAtual: e.target.value })} />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- */
/* Ler foto — um ponto de entrada só pra todas as leituras                */
/* ---------------------------------------------------------------------- */

const KINDS = [
  { id: 'atual', icon: <Gauge size={26} />, title: 'Vida atual (#900–949)', text: 'O do dia a dia: atualiza quanto cada ferramenta já gastou' },
  { id: 'util', icon: <Timer size={26} />, title: 'Vida útil (#800–849)', text: 'O limite de cada ferramenta — quase nunca muda' },
  { id: 'programa', icon: <ListOrdered size={26} />, title: 'Tela do programa', text: 'Cadastra ferramentas novas (T + código BMAN)' },
  { id: 'manual', icon: <Keyboard size={26} />, title: 'Digitar na mão', text: 'Sem foto: você preenche os valores da vida atual' },
];

export function PhotoSheet({ machineId: initialMachine, kind: initialKind, opId: initialOp, programFile }) {
  const { cells, act, nav } = useApp();
  const machines = flattenMachines(cells);
  const [machineId, setMachineId] = useState(initialMachine || (machines.length === 1 ? machines[0].machine.id : null));
  const [kind, setKind] = useState(initialKind || 'atual');
  const [opId, setOpId] = useState(initialOp || null);
  const [found, setFound] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [added, setAdded] = useState(null);
  const program = useProgramReader();
  // foto do programa recuperada depois do Android encerrar o app
  React.useEffect(() => { if (programFile) onProgramFile(programFile); }, [programFile]);

  const fm = machineId ? findMachine(cells, machineId) : null;
  const ops = fm ? fm.machine.operations : [];
  const effectiveOpId = opId || (ops.length === 1 ? ops[0].id : null);
  const op = ops.find((o) => o.id === effectiveOpId);

  if (machines.length === 0) {
    return (
      <Sheet title="Ler foto" onClose={nav.close}>
        <EmptyState icon={<Gauge size={30} />} title="Nenhuma máquina ainda" text="Cadastre uma célula e uma máquina primeiro — a leitura sempre é de uma máquina."
          action={<Button onClick={() => nav.replaceTop({ type: 'addCell' })}>Cadastrar célula</Button>} />
      </Sheet>
    );
  }

  async function onProgramFile(file) {
    const list = await program.read(file);
    if (!list.length) return;
    const existing = new Set((op?.tools || []).map((t) => t.slot));
    setFound(list);
    setSelected(new Set(list.filter((f) => !existing.has(f.slot)).map((f) => f.slot)));
  }
  function confirmProgram() {
    const preset = fm.cell.blockPreset || '6cc';
    const tools = found.filter((f) => selected.has(f.slot)).map((f) => ({
      id: genId('tool'), slot: f.slot, bman: f.bman, isRoutine: false, vidaUtil: 0, vidaAtual: 0,
      desgastePeca: {}, lastUpdated: null,
    }));
    act.addTools(op.id, tools);
    setAdded(tools.length);
    setFound(null);
  }

  // Depois de cadastrar pelo programa
  if (added !== null) {
    return (
      <Sheet title="Ferramentas cadastradas" subtitle={`${fm.cell.name} · ${fm.machine.name} · ${op?.name}`} onClose={nav.close}
        footer={<>
          <Button size="lg" icon={<Timer size={22} />} onClick={() => { setAdded(null); setKind('util'); }}>Ler vida útil agora (#800)</Button>
          <Button variant="secondary" onClick={nav.close}>Depois</Button>
        </>}>
        <Notice tone="navy" icon={<Check size={20} />}>
          {added} ferramenta{added === 1 ? '' : 's'} cadastrada{added === 1 ? '' : 's'}. A vida útil delas ainda está em branco — leia a tela #800–849 pra preencher.
        </Notice>
      </Sheet>
    );
  }

  // Conferência do que foi lido no programa
  if (found) {
    const existing = new Set((op?.tools || []).map((t) => t.slot));
    return (
      <Sheet title="Conferir programa" subtitle={`${fm.cell.name} · ${fm.machine.name} · ${op?.name}`} onClose={nav.close}
        footer={<>
          <Button size="lg" disabled={selected.size === 0} icon={<Plus size={22} />} onClick={confirmProgram}>
            Cadastrar {selected.size} ferramenta{selected.size === 1 ? '' : 's'}
          </Button>
          <Button variant="secondary" onClick={() => setFound(null)}>Tirar outra foto</Button>
        </>}>
        <div style={{ fontSize: 15, color: C.muted }}>Confira os códigos lidos — dá pra corrigir tocando no código. Borda laranja = sem código ou formato diferente do normal (ex: faltou dígito). Ferramenta sem BMAN pode ficar em branco.</div>
        <ProgramFoundList found={found} existingSlots={existing}
          onEdit={(slot, bman) => setFound((p) => p.map((f) => (f.slot === slot ? { ...f, bman } : f)))}
          selected={selected} onToggle={(s) => setSelected((p) => { const n = new Set(p); if (n.has(s)) n.delete(s); else n.add(s); return n; })} />
      </Sheet>
    );
  }

  const needsOp = kind === 'programa';
  const canGo = !!fm && (!needsOp || !!op);

  let footer = null;
  if (canGo) {
    if (kind === 'manual') {
      footer = <Button size="lg" icon={<Keyboard size={22} />} onClick={() => act.openManualEntry(machineId)}>Abrir digitação</Button>;
    } else if (kind === 'programa') {
      footer = (
        <>
          <PhotoButtons onFile={onProgramFile} busy={program.status === 'loading'} busyLabel="Lendo programa..."
            context={{ type: 'program', cellId: fm.cell.id, machineId, opId: effectiveOpId }} />
          {program.status === 'error' && <div style={{ fontSize: 14, color: C.critText, textAlign: 'center' }}>Não reconheci nada{program.error ? ` (${program.error})` : ''}. Tente outra foto.</div>}
        </>
      );
    } else {
      footer = <PhotoButtons onFile={(f) => act.startPhotoRead(machineId, kind, f)} context={{ type: 'kind', cellId: fm.cell.id, machineId, kind }} />;
    }
  }

  return (
    <Sheet title="Ler foto" subtitle={fm ? `${fm.cell.name} · ${fm.machine.name}` : 'Escolha a máquina'} onClose={nav.close} footer={footer}>
      {!initialMachine && machines.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Máquina</div>
          <ChipRow wrap>
            {machines.map(({ machine, cellName }) => (
              <Chip key={machine.id} small selected={machine.id === machineId} onClick={() => { setMachineId(machine.id); setOpId(null); }}>
                {cellName} · {machine.name}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}

      {fm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>O que você vai ler?</div>
          {KINDS.map((k) => {
            const sel = kind === k.id;
            return (
              <button key={k.id} type="button" onClick={() => setKind(k.id)} aria-pressed={sel}
                style={{
                  textAlign: 'left', border: sel ? `2px solid ${C.navy}` : `1.5px solid ${C.borderStrong}`, background: sel ? C.navyTint : C.surface,
                  borderRadius: 16, padding: 14, display: 'flex', gap: 14, alignItems: 'center', cursor: 'pointer', fontFamily: SANS, color: C.text,
                }}>
                <span style={{ width: 50, height: 50, borderRadius: 12, background: sel ? C.navy : C.navyTint, color: sel ? '#fff' : C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{k.icon}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 16.5, fontWeight: 600 }}>{k.title}</span>
                  <span style={{ fontSize: 14, color: C.muted, lineHeight: 1.35 }}>{k.text}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {fm && needsOp && (
        ops.length === 0 ? (
          <Notice tone="warn" icon={<AlertTriangle size={20} />}
            action={<Button variant="secondary" size="sm" onClick={() => nav.replaceTop({ type: 'addOp', machineId })}>Cadastrar operação</Button>}>
            Essa máquina ainda não tem operação. Pelo programa, as ferramentas entram numa operação.
          </Notice>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Em qual operação cadastrar?</div>
            <ChipRow wrap>{ops.map((o) => <Chip key={o.id} selected={o.id === effectiveOpId} onClick={() => setOpId(o.id)}>{o.name}</Chip>)}</ChipRow>
          </div>
        )
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- */
/* Lançar produção do turno                                               */
/* ---------------------------------------------------------------------- */

export function ProductionSheet({ machineId }) {
  const { cells, act, nav } = useApp();
  const [drafts, setDrafts] = useState({});
  const fm = findMachine(cells, machineId);
  if (!fm) return null;
  const { machine } = fm;
  const pallets = Array.from(new Set(machine.operations.map((o) => o.pallet).filter((p) => p === 1 || p === 2))).sort();

  return (
    <Sheet title="Lançar produção" subtitle={`${fm.cell.name} · ${machine.name}`} onClose={nav.close}>
      <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.45 }}>
        Digite as peças que um turno fez. O app soma o desgaste em todas as ferramentas daquele pallet.
      </div>
      {pallets.length === 0 && (
        <Notice tone="warn" icon={<AlertTriangle size={20} />}>Nenhuma operação tem pallet definido. Edite as operações e escolha o pallet de cada uma.</Notice>
      )}
      {pallets.map((p) => {
        const draft = drafts[p] || '';
        const n = parseInt(draft, 10);
        const valid = !isNaN(n) && n > 0;
        const last = (machine.lastAdd || {})[p];
        const opNames = machine.operations.filter((o) => o.pallet === p).map((o) => o.name).join(', ');
        return (
          <div key={p} style={{ background: C.bg, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 18, fontWeight: 600 }}>Pallet {p}</span>
              <span style={{ fontSize: 14, color: C.muted }}>{opNames}</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <TextInput mono inputMode="numeric" placeholder="peças" value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [p]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter' && valid) { act.addProduction(machineId, p, n); setDrafts((d) => ({ ...d, [p]: '' })); } }}
                style={{ flex: 1, textAlign: 'center', fontSize: 20 }} />
              <Button full={false} disabled={!valid} icon={<Factory size={20} />} onClick={() => { act.addProduction(machineId, p, n); setDrafts((d) => ({ ...d, [p]: '' })); }}>Lançar</Button>
            </div>
            {last && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 14.5, color: C.okText }}>✓ +{last.amount} {last.amount === 1 ? 'peça lançada' : 'peças lançadas'} por último</span>
                <Button variant="ghost" size="sm" full={false} icon={<Undo2 size={18} />} onClick={() => act.undoProduction(machineId, p)}>Desfazer</Button>
              </div>
            )}
          </div>
        );
      })}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- */
/* Resultado da calibração                                                */
/* ---------------------------------------------------------------------- */

export function CalibrationSheet({ machineId }) {
  const { cells, act, nav } = useApp();
  const fm = findMachine(cells, machineId);
  const machine = fm?.machine;
  const cal = machine?.calibration;
  // Grupo de peças: Pallet 1, Pallet 2, ou 0 = operações sem pallet
  // definido (antes elas ficavam sem campo e não dava pra salvar).
  const groupOf = (op) => (op.pallet === 1 || op.pallet === 2 ? op.pallet : 0);
  const groups = machine ? Array.from(new Set(machine.operations.filter((o) => o.tools.length).map(groupOf))).sort() : [];
  const [pieces, setPieces] = useState({});
  if (!cal || cal.phase !== 'ready') return null;
  const groupLabel = (g) => (g === 0 ? (groups.length === 1 ? 'Peças produzidas' : 'Operações sem pallet') : `Pallet ${g}`);
  const groupOps = (g) => machine.operations.filter((o) => groupOf(o) === g && o.tools.length).map((o) => o.name).join(', ');

  const rows = [];
  machine.operations.forEach((op) => {
    op.tools.forEach((t) => {
      if (t.isRoutine || !(t.id in (cal.snapshot || {})) || !(t.id in (cal.finish || {}))) return;
      const n = parseInt(pieces[groupOf(op)], 10);
      const valid = !isNaN(n) && n > 0;
      const s = cal.snapshot[t.id];
      const f = cal.finish[t.id];
      rows.push({ toolId: t.id, slot: t.slot, startVA: s, finishVA: f, computed: valid ? (f - s) / n : null });
    });
  });
  rows.sort((a, b) => compareSlots(a.slot, b.slot));
  const ready = rows.filter((r) => r.computed !== null && r.computed > 0);

  return (
    <Sheet title="Resultado da calibração" subtitle={`${fm.cell.name} · ${machine.name} · bloco ${cal.preset}`} onClose={nav.close} tall
      footer={<>
        <Button size="lg" disabled={ready.length === 0} icon={<Check size={22} />} onClick={() => { act.finishCalibration(machineId, ready); nav.close(); }}>
          Salvar calibração ({ready.length})
        </Button>
        <Button variant="dangerSoft" onClick={() => { act.cancelCalibration(machineId); nav.close(); }}>Descartar calibração</Button>
      </>}>
      <div style={{ fontSize: 15, color: C.muted }}>Quantas peças rodaram entre a leitura de início e a de fim?</div>
      {groups.map((g) => (
        <Field key={g} label={groupLabel(g)} hint={groupOps(g)}>
          <TextInput mono inputMode="numeric" value={pieces[g] || ''} placeholder="0" onChange={(e) => setPieces((prev) => ({ ...prev, [g]: e.target.value }))}
            style={{ fontSize: 20, textAlign: 'center' }} />
        </Field>
      ))}
      <div>
        {rows.length === 0 && <div style={{ fontSize: 15, color: C.muted }}>Nenhuma ferramenta pra calibrar — confira se as duas leituras (início e fim) trouxeram a vida atual das ferramentas.</div>}
        {rows.map((r) => (
          <div key={r.toolId} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, borderBottom: `1px solid ${C.divider}` }}>
            <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, width: 52 }}>{r.slot}</span>
            <span style={{ fontFamily: MONO, fontSize: 14, color: C.muted, flex: 1 }}>{fmtNum(r.startVA)} → {fmtNum(r.finishVA)}</span>
            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: r.computed === null ? C.muted : (r.computed > 0 ? C.okText : C.critText) }}>
              {r.computed === null ? '—' : r.computed.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 13.5, color: C.muted }}>Valor zero ou negativo geralmente é ferramenta trocada no meio — ela fica de fora.</div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- */
/* Anotação                                                               */
/* ---------------------------------------------------------------------- */

export function NoteSheet({ cellId, noteId, presetSlots }) {
  const { cells, act, nav } = useApp();
  const existing = noteId ? (cells.find((c) => c.id === cellId)?.notes || []).find((n) => n.id === noteId) : null;
  const [cellSel, setCellSel] = useState(cellId || (cells.length === 1 ? cells[0].id : null));
  const [text, setText] = useState(existing?.text || '');
  const [slots, setSlots] = useState(new Set(existing?.slots || presetSlots || []));
  const [remind, setRemind] = useState(existing?.remind ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cell = cells.find((c) => c.id === cellSel);
  const available = cell ? Array.from(new Set([...slotsInCell(cell), ...slots])).sort(compareSlots) : [];

  function toggleSlot(s) { setSlots((p) => { const n = new Set(p); if (n.has(s)) n.delete(s); else n.add(s); return n; }); }
  function save() {
    const slotList = Array.from(slots).sort(compareSlots);
    act.saveNote(cellId, cellSel, {
      id: existing?.id || genId('note'), text: text.trim(), slots: slotList, remind: remind && slotList.length > 0,
      createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    nav.close();
  }

  if (cells.length === 0) {
    return (
      <Sheet title="Nova anotação" onClose={nav.close}>
        <EmptyState icon={<StickyNote size={30} />} title="Nenhuma célula ainda" text="As anotações ficam separadas por célula. Cadastre uma célula primeiro." />
      </Sheet>
    );
  }

  return (
    <Sheet title={existing ? 'Editar anotação' : 'Nova anotação'} onClose={nav.close}
      footer={confirmDelete ? (
        <>
          <Button variant="danger" size="lg" icon={<Trash2 size={20} />} onClick={() => { act.deleteNote(cellId, existing.id); nav.close(); }}>Excluir anotação</Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
        </>
      ) : (
        <>
          <Button size="lg" disabled={!text.trim() || !cellSel} icon={<Check size={22} />} onClick={save}>Salvar anotação</Button>
          {existing && <Button variant="dangerSoft" icon={<Trash2 size={18} />} onClick={() => setConfirmDelete(true)}>Excluir</Button>}
        </>
      )}>
      {cells.length > 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Célula</div>
          <ChipRow wrap>{cells.map((c) => <Chip key={c.id} selected={c.id === cellSel} onClick={() => { setCellSel(c.id); if (c.id !== cellSel) setSlots(new Set()); }}>{c.name}</Chip>)}</ChipRow>
        </div>
      )}
      <Field label="Anotação">
        <TextArea autoFocus={!existing} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex: se trocar a T2 ou T3, levar a peça pro 3D." />
      </Field>
      {cell && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Ligar a ferramentas (opcional)</div>
          {available.length === 0
            ? <div style={{ fontSize: 14.5, color: C.muted }}>Nenhuma ferramenta cadastrada nessa célula ainda.</div>
            : <ChipRow wrap>{available.map((s) => <Chip key={s} small mono selected={slots.has(s)} onClick={() => toggleSlot(s)}>{s}</Chip>)}</ChipRow>}
          <div style={{ fontSize: 13.5, color: C.muted }}>Ligada a um T, a nota aparece na ficha dele.</div>
        </div>
      )}
      <div style={{ opacity: slots.size ? 1 : 0.5 }}>
        <Checkbox checked={remind && slots.size > 0} onChange={(v) => slots.size && setRemind(v)}>
          Avisar quando eu registrar a troca {slots.size ? `de ${Array.from(slots).sort(compareSlots).join(', ')}` : 'dessas ferramentas'}
        </Checkbox>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- */
/* Cadastros                                                              */
/* ---------------------------------------------------------------------- */

function PresetChips({ value, onChange }) {
  return (
    <ChipRow>
      {['4cc', '6cc'].map((p) => <Chip key={p} selected={value === p} onClick={() => onChange(p)}>{p === '4cc' ? '4cc • 6509' : '6cc • 6508'}</Chip>)}
    </ChipRow>
  );
}

export function AddCellSheet() {
  const { act, nav } = useApp();
  const [name, setName] = useState('');
  const [preset, setPreset] = useState('6cc');
  function save() {
    const cell = { id: genId('cell'), name: name.trim(), blockPreset: preset, machines: [], notes: [] };
    act.addCell(cell);
    nav.replaceTop({ type: 'cell', cellId: cell.id });
  }
  return (
    <Sheet title="Nova célula" onClose={nav.close} footer={<Button size="lg" disabled={!name.trim()} icon={<Check size={22} />} onClick={save}>Salvar célula</Button>}>
      <Field label="Nome ou número"><TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Célula 9" onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) save(); }} /></Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Bloco que roda nela</div>
        <PresetChips value={preset} onChange={setPreset} />
      </div>
    </Sheet>
  );
}

export function AddMachineSheet({ cellId }) {
  const { cells, act, nav } = useApp();
  const [name, setName] = useState('');
  const [sourceId, setSourceId] = useState('');
  const others = flattenMachines(cells);
  function save() {
    const source = others.find((m) => m.machine.id === sourceId);
    act.addMachine(cellId, { id: genId('machine'), name: name.trim(), operations: source ? cloneOperationsForNewMachine(source.machine.operations) : [] });
    nav.close();
  }
  return (
    <Sheet title="Nova máquina" onClose={nav.close} footer={<Button size="lg" disabled={!name.trim()} icon={<Check size={22} />} onClick={save}>Salvar máquina</Button>}>
      <Field label="Identificação"><TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="6262" /></Field>
      {others.length > 0 && (
        <Field label="Copiar operações e ferramentas de" hint={sourceId ? 'Copia slots, códigos, vida útil e desgaste. A vida atual começa zerada (é outro jogo de ferramentas).' : null}>
          <Select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">Nenhuma — começar em branco</option>
            {others.map(({ machine, cellName }) => <option key={machine.id} value={machine.id}>{cellName} · {machine.name}</option>)}
          </Select>
        </Field>
      )}
    </Sheet>
  );
}

function PalletChips({ value, onChange }) {
  return (
    <ChipRow>
      {[1, 2].map((p) => <Chip key={p} selected={value === p} onClick={() => onChange(value === p ? null : p)}>Pallet {p}</Chip>)}
    </ChipRow>
  );
}

export function AddOperationSheet({ machineId }) {
  const { cells, act, nav } = useApp();
  const fm = findMachine(cells, machineId);
  const preset = fm?.cell.blockPreset || '6cc';
  const [name, setName] = useState('');
  const [pallet, setPallet] = useState(null);
  const [tools, setTools] = useState([]);
  const [limite, setLimite] = useState(null);
  const program = useProgramReader();
  if (!fm) return null;

  async function onProgram(file) {
    const found = await program.read(file);
    setTools((prev) => {
      const have = new Set(prev.map((t) => t.slot));
      return [...prev, ...found.filter((f) => !have.has(f.slot)).map((f) => ({
        id: genId('tool'), slot: f.slot, bman: f.bman, isRoutine: false, vidaUtil: 0, vidaAtual: 0,
        desgastePeca: {}, lastUpdated: null,
      }))];
    });
  }
  function save() {
    act.addOperation(machineId, { id: genId('op'), name: name.trim(), pallet, tools: [...tools].sort((a, b) => compareSlots(a.slot, b.slot)) });
    nav.close();
  }

  return (
    <Sheet title="Nova operação" subtitle={`${fm.cell.name} · ${fm.machine.name}`} onClose={nav.close} tall
      footer={<Button size="lg" disabled={!name.trim()} icon={<Check size={22} />} onClick={save}>Salvar operação{tools.length ? ` (${tools.length} ferramentas)` : ''}</Button>}>
      <Field label="Nome"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="OP 800" /></Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Roda em qual pallet?</div>
        <PalletChips value={pallet} onChange={setPallet} />
      </div>
      <div style={{ height: 1, background: C.divider }} />
      <div style={{ fontSize: 17, fontWeight: 600 }}>Ferramentas</div>
      <PhotoButtons variant="soft" size="md" onFile={onProgram} busy={program.status === 'loading'} busyLabel="Lendo programa..." label="Ler todas do programa" />
      {program.status === 'error' && <div style={{ fontSize: 14, color: C.critText }}>Não reconheci nada nessa foto{program.error ? ` (${program.error})` : ''}.</div>}
      {tools.length > 0 && (
        <div>
          {tools.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 50, borderBottom: `1px solid ${C.divider}` }}>
              <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, width: 52 }}>{t.slot}</span>
              <span style={{ fontFamily: MONO, fontSize: 14.5, color: C.muted, flex: 1 }}>{t.bman || '—'}</span>
              <span style={{ fontSize: 14, color: C.muted }}>{t.isRoutine ? 'rotina' : `vida ${fmtNum(t.vidaUtil)}`}</span>
              <button type="button" aria-label={`Remover ${t.slot}`} onClick={() => setTools((p) => p.filter((x) => x.id !== t.id))}
                style={{ width: 44, height: 44, border: 'none', background: 'transparent', color: C.critText, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2 size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
      <LimitePhotoButton readings={limite} onReady={setLimite} />
      <NewToolForm hideProgramPhoto onAdd={(t) => setTools((p) => [...p, t])} limiteReadings={limite} blockPreset={preset} />
    </Sheet>
  );
}

export function AddToolSheet({ opId, programFile, limiteFile }) {
  const { cells, act, nav } = useApp();
  const [limite, setLimite] = useState(null);
  const [added, setAdded] = useState([]);
  let ctx = null;
  for (const c of cells) for (const m of c.machines) { const o = m.operations.find((oo) => oo.id === opId); if (o) ctx = { cell: c, machine: m, op: o }; }
  if (!ctx) return null;
  const preset = ctx.cell.blockPreset || '6cc';
  return (
    <Sheet title="Nova ferramenta" subtitle={`${ctx.cell.name} · ${ctx.machine.name} · ${ctx.op.name}`} onClose={nav.close} tall
      footer={<Button size="lg" variant={added.length ? 'primary' : 'secondary'} icon={<Check size={22} />} onClick={nav.close}>{added.length ? 'Concluir' : 'Fechar'}</Button>}>
      {added.length > 0 && <Notice tone="navy" icon={<Check size={20} />}>Adicionadas agora: {added.join(', ')}</Notice>}
      <LimitePhotoButton readings={limite} onReady={setLimite} initialFile={limiteFile} context={{ type: 'addToolLimite', cellId: ctx.cell.id, opId }} />
      <NewToolForm limiteReadings={limite} blockPreset={preset} existingSlots={new Set(ctx.op.tools.map((t) => t.slot))}
        programContext={{ type: 'addTool', cellId: ctx.cell.id, opId }} initialProgramFile={programFile}
        onAdd={(t) => { act.addTool(opId, t); setAdded((p) => [...p, t.slot]); }}
        onAddMany={(list) => { act.addTools(opId, list); setAdded((p) => [...p, ...list.map((t) => t.slot)]); }} />
    </Sheet>
  );
}

export function EditOperationSheet({ opId }) {
  const { cells, act, nav } = useApp();
  let ctx = null;
  for (const c of cells) for (const m of c.machines) { const o = m.operations.find((oo) => oo.id === opId); if (o) ctx = { cell: c, machine: m, op: o }; }
  const [name, setName] = useState(ctx?.op.name || '');
  const [pallet, setPallet] = useState(ctx?.op.pallet ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!ctx) return null;
  return (
    <Sheet title="Editar operação" subtitle={`${ctx.cell.name} · ${ctx.machine.name}`} onClose={nav.close}
      footer={confirmDelete ? (
        <>
          <Button variant="danger" size="lg" icon={<Trash2 size={20} />} onClick={() => { act.deleteOperation(opId); nav.close(); }}>Excluir {ctx.op.name} e {ctx.op.tools.length} ferramentas</Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
        </>
      ) : (
        <>
          <Button size="lg" disabled={!name.trim()} icon={<Check size={22} />} onClick={() => { act.updateOperation(opId, name, pallet); nav.close(); }}>Salvar</Button>
          <Button variant="dangerSoft" icon={<Trash2 size={18} />} onClick={() => setConfirmDelete(true)}>Excluir operação</Button>
        </>
      )}>
      <Field label="Nome"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Roda em qual pallet?</div>
        <PalletChips value={pallet} onChange={setPallet} />
        <div style={{ fontSize: 13.5, color: C.muted }}>Com 2 operações na máquina, a outra fica com o outro pallet sozinha.</div>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- */
/* Copiar ferramentas / desgaste calibrado de outra máquina               */
/* ---------------------------------------------------------------------- */

export function CopyFromSheet({ machineId }) {
  const { cells, act, nav } = useApp();
  const target = findMachine(cells, machineId);
  const sources = flattenMachines(cells).filter(({ machine }) => machine.id !== machineId && machine.operations.length > 0);
  const [sourceId, setSourceId] = useState(sources.length === 1 ? sources[0].machine.id : null);
  const [copyTools, setCopyTools] = useState(true);
  const [copyDesgaste, setCopyDesgaste] = useState(true);
  const [done, setDone] = useState(null);
  if (!target) return null;
  const src = sources.find((s) => s.machine.id === sourceId);
  const plan = src ? planCopy(src.machine, target.machine) : null;
  const nothing = plan && plan.newTools.length === 0 && plan.desgaste.length === 0;
  const willDo = plan && ((copyTools && plan.newTools.length) || (copyDesgaste && plan.desgaste.length));

  if (done) {
    return (
      <Sheet title="Cópia feita" subtitle={`${target.cell.name} · ${target.machine.name}`} onClose={nav.close}
        footer={<Button size="lg" icon={<Check size={22} />} onClick={nav.close}>Fechar</Button>}>
        <Notice tone="navy" icon={<Check size={20} />}>
          {done.tools ? `${done.tools} ferramenta${done.tools === 1 ? '' : 's'} copiada${done.tools === 1 ? '' : 's'} (com a vida atual zerada). ` : ''}
          {done.desg ? `Desgaste calibrado copiado em ${done.desg} ferramenta${done.desg === 1 ? '' : 's'}.` : ''}
        </Notice>
      </Sheet>
    );
  }

  const byTool = plan ? Array.from(new Set(plan.desgaste.map((d) => d.toolId))).length : 0;
  return (
    <Sheet title="Copiar de outra máquina" subtitle={`Para: ${target.cell.name} · ${target.machine.name}`} onClose={nav.close} tall
      footer={<Button size="lg" disabled={!willDo} icon={<Copy size={22} />}
        onClick={() => { act.copyFromMachine(machineId, sourceId, { copyTools, copyDesgaste }); setDone({ tools: copyTools ? plan.newTools.length : 0, desg: copyDesgaste ? byTool : 0 }); }}>
        Copiar
      </Button>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Copiar da máquina</div>
        <ChipRow wrap>
          {sources.map(({ machine, cellName }) => <Chip key={machine.id} small selected={machine.id === sourceId} onClick={() => setSourceId(machine.id)}>{cellName} · {machine.name}</Chip>)}
        </ChipRow>
      </div>

      {plan && nothing && <Notice tone="navy" icon={<Check size={20} />}>Nada pra copiar — as duas máquinas já têm as mesmas ferramentas e o mesmo desgaste.</Notice>}

      {plan && !nothing && (
        <>
          <div style={{ background: C.bg, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Checkbox checked={copyTools && plan.newTools.length > 0} onChange={(v) => plan.newTools.length && setCopyTools(v)}>
              <b>Ferramentas que faltam</b> ({plan.newTools.length})
            </Checkbox>
            {plan.newTools.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 34 }}>
                {plan.newTools.map((n, i) => <Badge key={i} mono tone={n.newOp ? 'warn' : 'navy'}>{n.opName} · {n.slot}</Badge>)}
              </div>
            ) : <div style={{ fontSize: 14, color: C.muted, paddingLeft: 34 }}>Todas já existem aqui.</div>}
            {plan.newTools.some((n) => n.newOp) && <div style={{ fontSize: 13.5, color: C.muted, paddingLeft: 34 }}>Em laranja: operação que ainda não existe aqui — ela é criada junto.</div>}
            <div style={{ fontSize: 13.5, color: C.muted, paddingLeft: 34 }}>Copia slot, código, vida útil e desgaste. A vida atual começa zerada.</div>
          </div>

          <div style={{ background: C.bg, borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Checkbox checked={copyDesgaste && plan.desgaste.length > 0} onChange={(v) => plan.desgaste.length && setCopyDesgaste(v)}>
              <b>Desgaste calibrado</b> ({byTool} ferramenta{byTool === 1 ? '' : 's'})
            </Checkbox>
            {plan.desgaste.length > 0 ? (
              <div style={{ paddingLeft: 34 }}>
                {plan.desgaste.map((d, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', minHeight: 36, fontFamily: MONO, fontSize: 15, borderBottom: `1px solid ${C.divider}` }}>
                    <span style={{ width: 46, fontWeight: 600 }}>{d.slot}</span>
                    <span style={{ flex: 1, color: C.muted }}>{d.opName} · {d.preset}</span>
                    <span>{d.from === null ? 'padrão' : fmtDesg(d.from)} → <b>{fmtDesg(d.to)}</b></span>
                  </div>
                ))}
              </div>
            ) : <div style={{ fontSize: 14, color: C.muted, paddingLeft: 34 }}>A outra máquina não tem desgaste calibrado diferente deste.</div>}
          </div>
        </>
      )}
    </Sheet>
  );
}

/* ---------------------------------------------------------------------- */
/* Ajustes da célula (separado do lápis, que é só da máquina)             */
/* ---------------------------------------------------------------------- */

export function CellSettingsSheet({ cellId }) {
  const { cells, act, nav } = useApp();
  const cell = cells.find((c) => c.id === cellId);
  const [name, setName] = useState(cell?.name || '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!cell) return null;
  const preset = cell.blockPreset || '6cc';
  const changed = name.trim() && name.trim() !== cell.name;
  const toolCount = cell.machines.reduce((n, m) => n + m.operations.reduce((k, o) => k + o.tools.length, 0), 0);

  return (
    <Sheet title="Ajustes da célula" subtitle={cell.name} onClose={nav.close}
      footer={confirmDelete ? (
        <>
          <Button variant="danger" size="lg" icon={<Trash2 size={20} />} onClick={() => { act.deleteCell(cellId); nav.close(); }}>
            Excluir {cell.name} ({cell.machines.length} máq., {toolCount} ferramentas)
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
        </>
      ) : (
        <Button size="lg" disabled={!changed} icon={<Check size={22} />} onClick={() => { act.renameCell(cellId, name); nav.close(); }}>Salvar nome</Button>
      )}>
      <Field label="Nome da célula"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>Bloco que roda (define o desgaste/peça)</div>
        <PresetChips value={preset} onChange={(p) => act.setBlockPreset(cellId, p)} />
        <div style={{ fontSize: 13.5, color: C.muted }}>Muda na hora. Cada ferramenta guarda o desgaste calibrado de cada bloco.</div>
      </div>
      <Button variant="soft" icon={<Plus size={20} />} onClick={() => nav.replaceTop({ type: 'addMachine', cellId })}>Adicionar máquina</Button>
      {!confirmDelete && <Button variant="dangerSoft" icon={<Trash2 size={18} />} onClick={() => setConfirmDelete(true)}>Excluir célula</Button>}
    </Sheet>
  );
}
