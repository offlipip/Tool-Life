// Identidade Toolpy: branco + azul-marinho (inspirado no azul Tupy, sem
// usar a marca). Fundo claro, cartões brancos, azul como cor principal.
// Cores de status também diferem em claridade, não só em tom, pra serem
// distinguíveis mesmo com sol batendo na tela.

export const C = {
  bg: '#F2F5FA',
  surface: '#FFFFFF',
  border: '#DCE3EE',
  divider: '#E8EDF4',
  borderStrong: '#C5CEDB',
  text: '#10213F',
  muted: '#5A6B85',
  navy: '#0F2D5C',
  navyDark: '#0A1F42',
  navySoft: '#E3EAF6',
  navyTint: '#E9EFF8',
  onNavyMuted: '#C9D6EC',
  onNavyGlass: 'rgba(255,255,255,0.14)',

  ok: '#1E7F4F', okText: '#1A6B43', okSoft: '#D5EBDF',
  warn: '#B45309', warnText: '#9A4508', warnSoft: '#F6E3CC', warnTint: '#FBEBD9',
  crit: '#B42328', critText: '#B42328', critSoft: '#F3D9DA',
};

export const SANS = '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
export const MONO = '"IBM Plex Mono", ui-monospace, "SF Mono", "Roboto Mono", Menlo, Consolas, monospace';

export const STATUS = {
  routine: { bar: C.borderStrong, soft: C.divider, text: C.muted },
  expired: { bar: C.crit, soft: C.critSoft, text: C.critText },
  critical: { bar: C.crit, soft: C.critSoft, text: C.critText },
  warning: { bar: C.warn, soft: C.warnSoft, text: C.warnText },
  ok: { bar: C.ok, soft: C.okSoft, text: C.okText },
};

export const SAFE_TOP = 'env(safe-area-inset-top)';
export const SAFE_BOTTOM = 'env(safe-area-inset-bottom)';
