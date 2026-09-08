// Wrapper mínimo de IndexedDB para persistir o FileSystemDirectoryHandle da pasta
// de importação entre sessões. Usa a API nativa, sem biblioteca.
//
// DB: 'appfinancas'  Store: 'handles'  Key fixa: 'pastaImport'

const DB_NOME = 'appfinancas';
const DB_VER  = 1;
const STORE   = 'handles';
const CHAVE   = 'pastaImport';

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VER);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

export async function salvarHandle(handle) {
  try {
    const db = await abrirDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(handle, CHAVE);
      req.onsuccess = resolve;
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch {
    // IDB indisponível (private mode, etc.) — não quebra.
  }
}

export async function lerHandle() {
  try {
    const db = await abrirDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(CHAVE);
      req.onsuccess = (e) => resolve(e.target.result ?? null);
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch {
    return null;
  }
}

export async function removerHandle() {
  try {
    const db = await abrirDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(CHAVE);
      req.onsuccess = resolve;
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch {
    // Silencioso — se não havia nada, tudo bem.
  }
}

// true apenas em Chromium desktop com contexto seguro; false em SSR, Firefox, Safari.
export function suportaPastaImport() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}
