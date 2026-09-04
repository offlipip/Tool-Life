const KEY = 'vida-ferramentas-data-v2';
const OLD_KEY = 'vida-ferramentas-data-v1';

export function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { cells: Array.isArray(parsed.cells) ? parsed.cells : [] };
    }
  } catch (e) {
    // segue pro fallback abaixo
  }

  // Migração de uma versão anterior (sem Célula/Máquina): as operações
  // que já existiam viram uma única máquina dentro de uma célula nova,
  // pra ninguém perder o que já tinha cadastrado.
  try {
    const oldRaw = localStorage.getItem(OLD_KEY);
    if (oldRaw) {
      const oldParsed = JSON.parse(oldRaw);
      const operations = Array.isArray(oldParsed.operations) ? oldParsed.operations : [];
      if (operations.length > 0) {
        return {
          cells: [
            {
              id: 'cell_migrated',
              name: 'Célula (dados antigos)',
              machines: [
                { id: 'machine_migrated', name: 'Máquina 1', operations },
              ],
            },
          ],
        };
      }
    }
  } catch (e) {
    // ignora, começa vazio
  }

  return { cells: [] };
}

export function saveData(cells) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ cells }));
    return true;
  } catch (e) {
    // Armazenamento cheio ou indisponível — os dados continuam na tela,
    // só não vão persistir se a página for fechada.
    return false;
  }
}

