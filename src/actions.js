import React from 'react';

// Tudo que as telas precisam (dados + ações + navegação) chega por aqui,
// em vez de passar dezenas de props de componente em componente.
export const AppCtx = React.createContext(null);
export function useApp() {
  return React.useContext(AppCtx);
}
