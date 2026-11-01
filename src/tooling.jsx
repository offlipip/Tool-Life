import React, { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, Crop as CropIcon, AlertTriangle, RotateCcw, Check, Plus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { C, MONO, SANS, SAFE_TOP, SAFE_BOTTOM } from './theme.js';
import { Button, Field, TextInput, SlotSelect, Checkbox, Sheet, Notice, Badge, Chip, ChipRow } from './ui.jsx';
import { readPanelPhoto, readProgramPhoto } from './ocr.js';
import { genId, desgasteForPreset, slotToLimiteNum, fmtNum } from './logic.js';

/* Dois botões (câmera + galeria) com os <input type=file> escondidos. */
export function PhotoButtons({ onFile, label = 'Abrir câmera', busy, busyLabel, variant = 'primary', size = 'lg' }) {
  const camRef = useRef(null);
  const galRef = useRef(null);
  function pick(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onFile(f);
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={pick} />
      <input ref={galRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={pick} />
      <Button variant={variant} size={size} busy={busy} icon={<Camera size={22} />} onClick={() => camRef.current?.click()}>
        {busy ? (busyLabel || 'Lendo...') : label}
      </Button>
      <Button variant="ghost" size="sm" disabled={busy} icon={<ImageIcon size={18} />} onClick={() => galRef.current?.click()}>
        Escolher da galeria
      </Button>
    </div>
  );
}

/* Recorte: arrasta os dois cantos pra excluir menu/reflexo antes do OCR. */
export function CropModal({ file, title, onConfirm, onCancel }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [rect, setRect] = useState({ x0: 4, y0: 12, x1: 96, y1: 88 });
  const containerRef = useRef(null);
  const dragRef = useRef(null);

  React.useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function toPct(clientX, clientY) {
    const box = containerRef.current.getBoundingClientRect();
    return {
      px: Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)),
      py: Math.min(100, Math.max(0, ((clientY - box.top) / box.height) * 100)),
    };
  }
  function startDrag(corner) {
    return (e) => { e.preventDefault(); e.target.setPointerCapture?.(e.pointerId); dragRef.current = corner; };
  }
  function onMove(e) {
    if (!dragRef.current) return;
    const { px, py } = toPct(e.clientX, e.clientY);
    setRect((p) => (dragRef.current === 'tl'
      ? { ...p, x0: Math.min(px, p.x1 - 5), y0: Math.min(py, p.y1 - 5) }
      : { ...p, x1: Math.max(px, p.x0 + 5), y1: Math.max(py, p.y0 + 5) }));
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

  const handle = (x, y) => ({
    position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%,-50%)',
    width: 34, height: 34, borderRadius: 17, background: '#fff', border: `4px solid ${C.navy}`,
    boxShadow: '0 2px 8px rgba(0,0,0,0.5)', touchAction: 'none', cursor: 'grab', zIndex: 2,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0B1426', zIndex: 60, display: 'flex', flexDirection: 'column', fontFamily: SANS }}>
      <div style={{ padding: `calc(16px + ${SAFE_TOP}) 20px 10px`, color: '#fff' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Recorte a área dos números</div>
        <div style={{ fontSize: 14.5, color: C.onNavyMuted, marginTop: 3 }}>{title} · arraste os dois cantos pra fora do menu e do reflexo</div>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 14px', minHeight: 0 }}>
        <div ref={containerRef} onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ position: 'relative', width: '100%', lineHeight: 0 }}>
          {imgUrl && <img src={imgUrl} alt="Foto do painel" draggable={false} style={{ width: '100%', height: 'auto', display: 'block', userSelect: 'none' }} />}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', clipPath: `polygon(0 0,100% 0,100% 100%,0 100%,0 ${rect.y0}%,${rect.x0}% ${rect.y0}%,${rect.x0}% ${rect.y1}%,${rect.x1}% ${rect.y1}%,${rect.x1}% ${rect.y0}%,0 ${rect.y0}%)` }} />
          <div style={{ position: 'absolute', left: `${rect.x0}%`, top: `${rect.y0}%`, width: `${rect.x1 - rect.x0}%`, height: `${rect.y1 - rect.y0}%`, border: '3px solid #fff', boxSizing: 'border-box', pointerEvents: 'none' }} />
          <div style={handle(rect.x0, rect.y0)} onPointerDown={startDrag('tl')} />
          <div style={handle(rect.x1, rect.y1)} onPointerDown={startDrag('br')} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: `16px 20px calc(18px + ${SAFE_BOTTOM})` }}>
        <Button variant="secondary" full={false} onClick={onCancel}>Cancelar</Button>
        <Button onClick={confirm} icon={<CropIcon size={20} />} style={{ background: '#fff', color: C.navy }}>Ler esta área</Button>
      </div>
    </div>
  );
}

function confDot(c) {
  const color = c === 'high' ? C.ok : c === 'low' ? C.warn : C.borderStrong;
  return <span style={{ width: 10, height: 10, borderRadius: 5, background: color, flexShrink: 0, display: 'inline-block' }} />;
}

/* Conferência da leitura (foto ou digitação manual) antes de salvar. */
export function OcrReviewSheet({ state, onClose, onRetake, onSave }) {
  const { label, status, rows, error, manual } = state;
  const [localRows, setLocalRows] = useState(rows || []);
  const [showVU, setShowVU] = useState(false);

  React.useEffect(() => {
    setLocalRows(rows || []);
    setShowVU((rows || []).some((r) => !r.isRoutine && (r.newVidaUtil !== '' || r.vidaUtilConfidence === 'low')));
  }, [rows]);

  const low = localRows.reduce((n, r) => n + (r.vidaAtualConfidence === 'low' ? 1 : 0) + (!r.isRoutine && r.vidaUtilConfidence === 'low' ? 1 : 0), 0);
  const read = localRows.filter((r) => r.newVidaAtual !== '' || r.newVidaUtil !== '').length;
  function patch(idx, field, value) { setLocalRows((p) => p.map((r, i) => (i === idx ? { ...r, [field]: value } : r))); }

  const footer = status === 'review' ? (
    <>
      <Button size="lg" icon={<Check size={22} />} onClick={() => onSave(localRows)}>Salvar leitura</Button>
      {!manual && <Button variant="secondary" icon={<RotateCcw size={18} />} onClick={onRetake}>Repetir foto</Button>}
    </>
  ) : status === 'error' ? (
    <Button size="lg" icon={<Camera size={22} />} onClick={onRetake}>Tentar outra foto</Button>
  ) : null;

  return (
    <Sheet title={manual ? 'Digitar valores' : 'Conferir leitura'} subtitle={label} onClose={onClose} footer={footer} tall>
      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0' }}>
          <Loader2 size={34} color={C.navy} className="animate-spin" />
          <div style={{ fontSize: 17, fontWeight: 600 }}>Lendo o painel…</div>
          <div style={{ fontSize: 14.5, color: C.muted }}>roda no próprio aparelho, leva alguns segundos</div>
        </div>
      )}
      {status === 'error' && (
        <Notice tone="crit" icon={<AlertTriangle size={20} />}>
          Não consegui ler a foto{error ? ` (${error})` : ''}. Tente de novo com mais luz e sem tremer.
        </Notice>
      )}
      {status === 'review' && (
        <>
          {!manual && (
            <div style={{ fontSize: 15, color: C.muted }}>
              {read} de {localRows.length} ferramentas lidas. Campo em branco mantém o valor de antes.
            </div>
          )}
          {low > 0 && (
            <Notice tone="warn" icon={<AlertTriangle size={20} />}>
              {low} valor{low > 1 ? 'es' : ''} com leitura duvidosa (bolinha laranja). Confira antes de salvar.
            </Notice>
          )}
          <div>
            <div style={{ display: 'flex', fontSize: 13, fontWeight: 600, color: C.muted, padding: '0 2px 6px' }}>
              <span style={{ width: 72 }}>Slot</span><span style={{ flex: 1, textAlign: 'center' }}>Vida atual</span><span style={{ width: 70, textAlign: 'right' }}>antes</span>
            </div>
            {localRows.map((row, idx) => (
              <div key={row.toolId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${C.divider}` }}>
                <div style={{ width: 62 }}>
                  <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600 }}>{row.slot}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{row.opName}</div>
                </div>
                {!manual && confDot(row.vidaAtualConfidence)}
                <TextInput mono inputMode="decimal" value={row.newVidaAtual} placeholder="—" onChange={(e) => patch(idx, 'newVidaAtual', e.target.value)}
                  style={{ flex: 1, textAlign: 'center', height: 46, borderColor: row.vidaAtualConfidence === 'low' ? C.warn : C.borderStrong }} />
                <span style={{ width: 60, textAlign: 'right', fontFamily: MONO, fontSize: 14, color: C.muted }}>{fmtNum(row.oldVidaAtual)}</span>
              </div>
            ))}
          </div>
          <div>
            <button type="button" onClick={() => setShowVU((v) => !v)} style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 8, background: C.bg, border: 'none', borderRadius: 12, padding: '0 14px', fontSize: 15.5, fontWeight: 600, color: C.navy, cursor: 'pointer', fontFamily: SANS }}>
              {showVU ? <ChevronDown size={20} /> : <ChevronRight size={20} />} Vida útil (quase nunca muda)
            </button>
            {showVU && localRows.map((row, idx) => (row.isRoutine ? null : (
              <div key={row.toolId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: `1px solid ${C.divider}` }}>
                <span style={{ width: 62, fontFamily: MONO, fontSize: 16, fontWeight: 600 }}>{row.slot}</span>
                {!manual && confDot(row.vidaUtilConfidence)}
                <TextInput mono inputMode="decimal" value={row.newVidaUtil} placeholder="—" onChange={(e) => patch(idx, 'newVidaUtil', e.target.value)}
                  style={{ flex: 1, textAlign: 'center', height: 46, borderColor: row.vidaUtilConfidence === 'low' ? C.warn : C.borderStrong }} />
                <span style={{ width: 60, textAlign: 'right', fontFamily: MONO, fontSize: 14, color: C.muted }}>{fmtNum(row.oldVidaUtil)}</span>
              </div>
            )))}
          </div>
        </>
      )}
    </Sheet>
  );
}

/* Foto da tela #800-849 lida ANTES de cadastrar: ao escolher o slot, a
   vida útil preenche sozinha. */
export function LimitePhotoButton({ readings, onReady }) {
  const [status, setStatus] = useState('idle');
  const [count, setCount] = useState(0);
  const [error, setError] = useState('');
  async function handle(file) {
    setStatus('loading'); setError('');
    try {
      const list = await readPanelPhoto(file);
      const map = {};
      list.forEach((r) => { map[r.num] = r; });
      setCount(list.length); setStatus('ready'); onReady(map);
    } catch (err) { setStatus('error'); setError(err.message); }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <PhotoButtons variant="soft" size="md" onFile={handle} busy={status === 'loading'} busyLabel="Lendo vida útil..."
        label={readings ? 'Trocar foto da vida útil (#800)' : 'Ler vida útil de uma foto (#800)'} />
      {status === 'ready' && <div style={{ fontSize: 14, color: C.okText }}>{count} valores lidos — ao escolher o slot, a vida útil preenche sozinha.</div>}
      {status === 'error' && <div style={{ fontSize: 14, color: C.critText }}>Não consegui ler essa foto{error ? ` (${error})` : ''}.</div>}
    </div>
  );
}

/* Lê a tela do PROGRAMA e devolve os pares T/BMAN encontrados. */
export function useProgramReader() {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  async function read(file) {
    setStatus('loading'); setError('');
    try {
      const found = await readProgramPhoto(file);
      if (found.length === 0) { setStatus('error'); setError('nenhuma ferramenta reconhecida nessa foto'); return []; }
      setStatus('idle');
      return found;
    } catch (err) { setStatus('error'); setError(err.message); return []; }
  }
  return { status, error, read };
}

/* Formulário de UMA ferramenta nova. */
export function NewToolForm({ onAdd, onAddMany, existingSlots, limiteReadings, blockPreset, hideProgramPhoto }) {
  const presetDesgaste = String(desgasteForPreset(blockPreset));
  const blank = { slot: '', bman: '', vidaUtil: '', vidaAtual: '0', desgastePeca: presetDesgaste, isRoutine: false };
  const [t, setT] = useState(blank);
  const [vuFromPhoto, setVuFromPhoto] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const program = useProgramReader();

  React.useEffect(() => {
    if (!limiteReadings || t.isRoutine) return;
    const num = slotToLimiteNum(t.slot);
    if (num === null) return;
    const reading = limiteReadings[num];
    if (!reading) return;
    if (t.vidaUtil === '' || vuFromPhoto) {
      setT((p) => (p.vidaUtil === String(reading.value) ? p : { ...p, vidaUtil: String(reading.value) }));
      setVuFromPhoto(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.slot, t.isRoutine, limiteReadings]);

  async function handleProgram(file) {
    const found = await program.read(file);
    const have = existingSlots || new Set();
    if (found.length) setCandidates(found.filter((f) => !have.has(f.slot)));
  }
  // Cadastra de uma vez todas as lidas (vida útil vem da foto #800 se ela
  // já tiver sido lida; senão fica em branco pra ler depois).
  function addAll() {
    const tools = candidates.map((c) => {
      const num = slotToLimiteNum(c.slot);
      const vu = limiteReadings && num !== null && limiteReadings[num] ? limiteReadings[num].value : 0;
      return { id: genId('tool'), slot: c.slot, bman: c.bman || '', isRoutine: false, vidaUtil: vu, vidaAtual: 0, desgastePeca: {}, lastUpdated: null };
    });
    onAddMany(tools);
    setCandidates([]);
  }
  function useCandidate(c) {
    setT((p) => ({ ...p, slot: c.slot, bman: c.bman }));
    setCandidates((p) => p.filter((x) => x !== c));
  }
  function submit() {
    if (!t.slot.trim()) return;
    onAdd({
      id: genId('tool'), slot: t.slot.trim(), bman: t.bman.trim(), isRoutine: t.isRoutine,
      vidaUtil: t.isRoutine ? 0 : (parseFloat(t.vidaUtil) || 0),
      vidaAtual: parseFloat(t.vidaAtual) || 0,
      // só grava como "calibrado" se mudou do padrão — senão fica o chute padrão
      desgastePeca: (parseFloat(t.desgastePeca) && parseFloat(t.desgastePeca) !== desgasteForPreset(blockPreset)) ? { [blockPreset]: parseFloat(t.desgastePeca) } : {},
      lastUpdated: null,
    });
    setT(blank); setVuFromPhoto(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: C.bg, borderRadius: 16, padding: 14 }}>
      {!hideProgramPhoto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PhotoButtons variant="soft" size="md" onFile={handleProgram} busy={program.status === 'loading'} busyLabel="Lendo programa..." label="Ler slot e código do programa" />
          {program.status === 'error' && <div style={{ fontSize: 14, color: C.critText }}>Não reconheci nada nessa foto{program.error ? ` (${program.error})` : ''}.</div>}
          {candidates.length > 0 && (
            <>
              {onAddMany && (
                <Button icon={<Plus size={20} />} onClick={addAll}>
                  Cadastrar todas as lidas ({candidates.length})
                </Button>
              )}
              <div style={{ fontSize: 14, color: C.muted }}>{onAddMany ? 'Ou toque numa pra preencher o formulário e conferir antes:' : 'Toque na ferramenta lida pra preencher:'}</div>
              <ChipRow wrap>
                {candidates.map((c) => <Chip key={c.slot} small mono onClick={() => useCandidate(c)}>{c.slot} · {c.bman || 'sem código'}</Chip>)}
              </ChipRow>
            </>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Slot" style={{ flex: '0 0 120px' }}><SlotSelect value={t.slot} onChange={(v) => setT({ ...t, slot: v })} /></Field>
        <Field label="Código (BMAN)"><TextInput mono value={t.bman} onChange={(e) => setT({ ...t, bman: e.target.value })} placeholder="BMAN-0806" /></Field>
      </div>
      <Checkbox checked={t.isRoutine} onChange={(v) => setT({ ...t, isRoutine: v })}>Ferramenta de rotina (sem vida útil, ex: limpeza)</Checkbox>
      <div style={{ display: 'flex', gap: 10 }}>
        {!t.isRoutine && (
          <Field label="Vida útil" hint={vuFromPhoto ? '✓ lida da foto — confira' : null}>
            <TextInput mono inputMode="decimal" value={t.vidaUtil} placeholder="480"
              onChange={(e) => { setT({ ...t, vidaUtil: e.target.value }); setVuFromPhoto(false); }}
              style={{ borderColor: vuFromPhoto ? C.ok : C.borderStrong }} />
          </Field>
        )}
        <Field label={`Desgaste/pç (${blockPreset})`}>
          <TextInput mono inputMode="decimal" value={t.desgastePeca} onChange={(e) => setT({ ...t, desgastePeca: e.target.value })} placeholder="1.5" />
        </Field>
      </div>
      <Field label={t.isRoutine ? 'Contador atual' : 'Vida atual'}>
        <TextInput mono inputMode="decimal" value={t.vidaAtual} onChange={(e) => setT({ ...t, vidaAtual: e.target.value })} placeholder="0" />
      </Field>
      <Button disabled={!t.slot.trim()} icon={<Plus size={20} />} onClick={submit}>Adicionar ferramenta</Button>
    </div>
  );
}

/* Lista de T/BMAN lidos do programa, pra marcar quais cadastrar. */
export function ProgramFoundList({ found, existingSlots, selected, onToggle, onEdit }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {found.map((f) => {
        const exists = existingSlots.has(f.slot);
        const on = !exists && selected.has(f.slot);
        return (
          <div key={f.slot} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 58, borderBottom: `1px solid ${C.divider}`, opacity: exists ? 0.6 : 1 }}>
            <input type="checkbox" aria-label={`Cadastrar ${f.slot}`} disabled={exists} checked={on} onChange={() => onToggle(f.slot)} style={{ width: 24, height: 24, accentColor: C.navy, flexShrink: 0 }} />
            <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, width: 46, flexShrink: 0 }}>{f.slot}</span>
            {exists ? (
              <>
                <span style={{ fontFamily: MONO, fontSize: 15, color: C.muted, flex: 1 }}>{f.bman}</span>
                <Badge tone="muted">já cadastrada</Badge>
              </>
            ) : (
              <TextInput mono value={f.bman} placeholder="sem código" aria-label={`Código da ${f.slot}`} onChange={(e) => onEdit?.(f.slot, e.target.value.toUpperCase())}
                style={{ flex: 1, height: 44, fontSize: 15.5, borderColor: /^[A-Z]{3,6}-\d{4}$/.test(f.bman) ? C.borderStrong : C.warn }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
