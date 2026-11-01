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
      // Anotações por célula (versões antigas não tinham)
      notes: Array.isArray(c.notes) ? c.notes : [],
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

import { Capacitor } from '@capacitor/core';

export function backupText(cells) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), cells }, null, 2);
}
function backupName() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return `toolpy-backup-${stamp}.json`;
}

// No apk, "baixar" arquivo não funciona dentro do app. Com os plugins de
// arquivo + compartilhar (apk 1.5+), abre o menu de compartilhar do
// Android (WhatsApp, Drive, Arquivos...). Em apk mais antigo não dá.
export function canShareNative() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Filesystem') && Capacitor.isPluginAvailable('Share');
}
export function isNativeWithoutShare() {
  return Capacitor.isNativePlatform() && !canShareNative();
}

/** Exporta: menu de compartilhar no apk, download no navegador. */
export async function exportBackup(cells) {
  const text = backupText(cells);
  if (canShareNative()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const r = await Filesystem.writeFile({ path: backupName(), data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: 'Backup do Toolpy', text: 'Backup do Toolpy', files: [r.uri], dialogTitle: 'Salvar backup em…' });
    return 'shared';
  }
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

/** Lê o texto de um backup (arquivo ou colado) e devolve as células migradas. */
export function parseBackupText(text) {
  const parsed = JSON.parse(String(text).trim());
  const cells = Array.isArray(parsed.cells) ? parsed.cells : (Array.isArray(parsed) ? parsed : null);
  if (!cells) throw new Error('não parece um backup válido');
  return migrateCells(cells);
}

export async function importBackup(file) {
  return parseBackupText(await file.text());
}
