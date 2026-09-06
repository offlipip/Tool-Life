const KEY = 'vida-ferramentas-data-v2';
const OLD_KEY = 'vida-ferramentas-data-v1';

/**
 * O desgaste/peça costumava ser um número solto por ferramenta. Agora
 * é um objeto por bloco (ex: { '6cc': 1.5, '4cc': 1 }), porque a mesma
 * ferramenta desgasta diferente dependendo do bloco rodado. Essa função
 * converte dados antigos pro formato novo sem perder o valor já
 * calibrado — ele vira o valor do bloco que a célula estava usando.
 */
export function migrateCells(cells) {
  if (!Array.isArray(cells)) return [];
  return cells.map((c) => {
    const preset = c.blockPreset || '6cc';
    return {
      ...c,
      blockPreset: preset,
      machines: (c.machines || []).map((m) => ({
        ...m,
        operations: (m.operations || []).map((o) => ({
          ...o,
          tools: (o.tools || []).map((t) => {
            if (t.desgastePeca && typeof t.desgastePeca === 'object') return t;
            const oldValue = typeof t.desgastePeca === 'number' ? t.desgastePeca : null;
            return { ...t, desgastePeca: oldValue ? { [preset]: oldValue } : {} };
          }),
        })),
      })),
    };
  });
}

export function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { cells: migrateCells(parsed.cells) };
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
          cells: migrateCells([
            {
              id: 'cell_migrated',
              name: 'Célula (dados antigos)',
              machines: [
                { id: 'machine_migrated', name: 'Máquina 1', operations },
              ],
            },
          ]),
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

/** Baixa um arquivo .json com tudo que está cadastrado. */
export function exportBackup(cells) {
  const payload = { exportedAt: new Date().toISOString(), cells };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `vida-ferramentas-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Lê um arquivo .json exportado antes e devolve as células (já migradas). */
export async function importBackup(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const cells = Array.isArray(parsed.cells) ? parsed.cells : (Array.isArray(parsed) ? parsed : null);
  if (!cells) throw new Error('arquivo não parece um backup válido');
  return migrateCells(cells);
}

