import React from 'react';
import { X, ChevronLeft, Loader2 } from 'lucide-react';
import { C, SANS, MONO, STATUS, SAFE_TOP, SAFE_BOTTOM } from './theme.js';
import { ALL_SLOTS } from './logic.js';

/* Peças pequenas e reaproveitáveis da interface — tudo com área de toque
   de pelo menos 44px e fonte grande, pensando em uso na fábrica. */

export function TopBar({ title, subtitle, onBack, actions, children, big }) {
  return (
    <div style={{
      background: C.navy, color: '#fff',
      padding: `calc(12px + ${SAFE_TOP}) 12px 16px ${onBack ? 4 : 16}px`,
      display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
        {onBack && (
          <IconButton label="Voltar" onNavy plain onClick={onBack}><ChevronLeft size={26} /></IconButton>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: big ? 24 : 21, fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 13.5, color: C.onNavyMuted, marginTop: 1 }}>{subtitle}</div>}
        </div>
        {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function IconButton({ label, onClick, children, onNavy, plain, badge, active, disabled }) {
  const bg = plain ? 'transparent' : onNavy ? (active ? '#fff' : C.onNavyGlass) : (active ? C.navy : C.navyTint);
  const fg = onNavy ? (active ? C.navy : '#fff') : (active ? '#fff' : C.navy);
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 44, height: 44, borderRadius: 22, border: 'none', background: bg, color: fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: disabled ? 'default' : 'pointer',
        position: 'relative', flexShrink: 0, opacity: disabled ? 0.5 : 1, padding: 0,
      }}
    >
      {children}
      {badge ? (
        <span style={{
          position: 'absolute', top: 3, right: 3, minWidth: 17, height: 17, borderRadius: 9, padding: '0 4px',
          background: onNavy ? '#fff' : C.navy, color: onNavy ? C.navy : '#fff',
          fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge}</span>
      ) : null}
    </button>
  );
}

const BTN = {
  primary: { background: C.navy, color: '#fff', border: 'none' },
  secondary: { background: C.surface, color: C.text, border: `1.5px solid ${C.borderStrong}` },
  soft: { background: C.navyTint, color: C.navy, border: 'none' },
  ghost: { background: 'transparent', color: C.navy, border: 'none' },
  danger: { background: C.crit, color: '#fff', border: 'none' },
  dangerSoft: { background: C.critSoft, color: C.critText, border: 'none' },
  warn: { background: C.warn, color: '#fff', border: 'none' },
};

export function Button({ variant = 'primary', icon, children, onClick, disabled, busy, size = 'md', full = true, style, type = 'button' }) {
  const h = size === 'lg' ? 56 : size === 'sm' ? 40 : 50;
  const v = disabled ? { background: C.divider, color: C.muted, border: 'none' } : BTN[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        ...v, height: h, borderRadius: 14, padding: '0 18px', width: full ? '100%' : 'auto',
        fontFamily: SANS, fontSize: size === 'lg' ? 17 : size === 'sm' ? 14.5 : 16, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
        cursor: disabled || busy ? 'default' : 'pointer', flexShrink: 0, ...style,
      }}
    >
      {busy ? <Loader2 size={20} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Chip({ selected, onNavy, children, onClick, mono, small }) {
  let s;
  if (onNavy) {
    s = selected
      ? { background: '#fff', color: C.navy, border: '1px solid #fff' }
      : { background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.45)' };
  } else {
    s = selected
      ? { background: C.navy, color: '#fff', border: `1.5px solid ${C.navy}` }
      : { background: C.surface, color: C.text, border: `1.5px solid ${C.borderStrong}` };
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={!!selected}
      style={{
        ...s, height: small ? 36 : 42, padding: small ? '0 12px' : '0 17px', borderRadius: 21, flexShrink: 0,
        fontFamily: mono ? MONO : SANS, fontSize: small ? 14 : 15.5, fontWeight: selected ? 600 : 500, cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

export function ChipRow({ children, wrap }) {
  return (
    <div style={{
      display: 'flex', gap: 8, flexWrap: wrap ? 'wrap' : 'nowrap', overflowX: wrap ? 'visible' : 'auto',
      scrollbarWidth: 'none', paddingBottom: 2,
    }}>{children}</div>
  );
}

export function Card({ children, style, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', cursor: onClick ? 'pointer' : 'default', ...style }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, margin: '4px 2px 10px' }}>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.text }}>{children}</div>
      {right && <div style={{ fontSize: 14, color: C.muted }}>{right}</div>}
    </div>
  );
}

export function Badge({ tone = 'navy', children, mono }) {
  const tones = {
    navy: { background: C.navySoft, color: C.navy },
    solid: { background: C.navy, color: '#fff' },
    warn: { background: C.warnTint, color: C.warnText },
    crit: { background: C.critSoft, color: C.critText },
    muted: { background: C.divider, color: C.muted },
  };
  return (
    <span style={{
      ...tones[tone], borderRadius: 7, padding: '3px 8px', fontSize: 12.5, fontWeight: 600,
      fontFamily: mono ? MONO : SANS, whiteSpace: 'nowrap', display: 'inline-block',
    }}>{children}</span>
  );
}

export function LifeBar({ pct, status, height = 9 }) {
  const s = STATUS[status] || STATUS.ok;
  return (
    <div style={{ height, borderRadius: height / 2, background: s.soft, overflow: 'hidden', width: '100%' }}>
      <div style={{ width: `${Math.max(status === 'routine' ? 0 : 3, pct)}%`, height: '100%', borderRadius: height / 2, background: s.bar, transition: 'width 300ms ease' }} />
    </div>
  );
}

export function Field({ label, hint, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 0, ...style }}>
      <span style={{ fontSize: 14, fontWeight: 600, color: C.muted }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 13, color: C.muted }}>{hint}</span>}
    </label>
  );
}

const inputBase = {
  width: '100%', height: 50, borderRadius: 12, border: `1.5px solid ${C.borderStrong}`, background: C.surface,
  padding: '0 14px', fontSize: 17, color: C.text, outline: 'none', fontFamily: SANS,
};

export const TextInput = React.forwardRef(function TextInput({ mono, style, onFocus, ...props }, ref) {
  return (
    <input
      {...props}
      ref={ref}
      onFocus={(e) => {
        onFocus?.(e);
        // espera o teclado abrir antes de rolar, senão o campo fica atrás dele
        setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
      }}
      style={{ ...inputBase, fontFamily: mono ? MONO : SANS, ...style }}
    />
  );
});

export function TextArea(props) {
  return (
    <textarea
      {...props}
      style={{ ...inputBase, height: 'auto', minHeight: 110, padding: '12px 14px', lineHeight: 1.45, resize: 'vertical', ...props.style }}
    />
  );
}

export function SlotSelect({ value, onChange }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...inputBase, fontFamily: MONO, color: value ? C.text : C.muted, appearance: 'none' }}
    >
      <option value="">Escolher…</option>
      {ALL_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
    </select>
  );
}

export function Select({ style, ...props }) {
  return <select {...props} style={{ ...inputBase, appearance: 'none', ...style }} />;
}

export function Checkbox({ checked, onChange, children }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 44, cursor: 'pointer', fontSize: 15.5, color: C.text }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ width: 22, height: 22, accentColor: C.navy, flexShrink: 0 }} />
      <span>{children}</span>
    </label>
  );
}

/* Folha que sobe de baixo — usada pra tudo que é "uma tarefa": ficha da
   ferramenta, ler foto, cadastrar, anotar. Fecha tocando fora ou no X. */
export function Sheet({ title, subtitle, onClose, children, footer, tall }) {
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(16,33,63,0.55)', zIndex: 50, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.surface, width: '100%', maxWidth: 520, borderRadius: '22px 22px 0 0',
          maxHeight: tall ? '94vh' : '90vh', minHeight: tall ? '70vh' : undefined,
          display: 'flex', flexDirection: 'column', fontFamily: SANS, color: C.text,
        }}
      >
        <div style={{ padding: '10px 16px 0 20px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <div style={{ width: 40, height: 5, borderRadius: 3, background: C.borderStrong }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              {typeof title === 'string' ? <div style={{ fontSize: 21, fontWeight: 700 }}>{title}</div> : title}
              {subtitle && <div style={{ fontSize: 14.5, color: C.muted, marginTop: 2 }}>{subtitle}</div>}
            </div>
            <IconButton label="Fechar" onClick={onClose}><X size={22} /></IconButton>
          </div>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: `12px 20px calc(16px + ${SAFE_BOTTOM})`, borderTop: `1px solid ${C.divider}`, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
            {footer}
          </div>
        )}
        {!footer && <div style={{ height: `calc(8px + ${SAFE_BOTTOM})`, flexShrink: 0 }} />}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, padding: '36px 20px' }}>
      {icon && <div style={{ width: 64, height: 64, borderRadius: 32, background: C.navyTint, color: C.navy, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>}
      <div style={{ fontSize: 18, fontWeight: 600 }}>{title}</div>
      {text && <div style={{ fontSize: 15, color: C.muted, lineHeight: 1.45, maxWidth: 300 }}>{text}</div>}
      {action && <div style={{ marginTop: 8, width: '100%', maxWidth: 280 }}>{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'navy', icon, children, action }) {
  const tones = {
    navy: { background: C.navyTint, border: `1.5px solid ${C.navy}`, color: C.text, ic: C.navy },
    warn: { background: C.warnTint, border: `1.5px solid ${C.warn}`, color: C.text, ic: C.warnText },
    crit: { background: C.critSoft, border: `1.5px solid ${C.crit}`, color: C.text, ic: C.critText },
  };
  const t = tones[tone];
  return (
    <div style={{ background: t.background, border: t.border, borderRadius: 14, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        {icon && <span style={{ color: t.ic, flexShrink: 0, marginTop: 1 }}>{icon}</span>}
        <div style={{ fontSize: 15, lineHeight: 1.45, color: t.color, flex: 1 }}>{children}</div>
      </div>
      {action}
    </div>
  );
}

export function StatRow({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 8 }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 13, color: C.muted }}>{it.label}</div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: it.color || C.text }}>{it.value}</div>
          {it.hint && <div style={{ fontSize: 12, color: it.hintColor || C.muted }}>{it.hint}</div>}
        </div>
      ))}
    </div>
  );
}
