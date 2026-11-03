"use strict";
(() => {
  const definitions = {
    photos: ["vidres-fotos-v1", "fotos"],
    documents: ["vidres-documentos-v1", "documentos"],
  };
  async function open(kind) {
    const [name, store] = definitions[kind];
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () =>
        r.result.createObjectStore(store, { keyPath: "id" });
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function all(kind) {
    const d = await open(kind);
    try {
      return await new Promise((resolve, reject) => {
        const r = d
          .transaction(definitions[kind][1])
          .objectStore(definitions[kind][1])
          .getAll();
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
    } finally {
      d.close();
    }
  }
  async function replace(kind, items) {
    const d = await open(kind);
    try {
      await new Promise((resolve, reject) => {
        const tx = d.transaction(definitions[kind][1], "readwrite"),
          store = tx.objectStore(definitions[kind][1]);
        store.clear();
        items.forEach((x) => store.put(x));
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () =>
          reject(tx.error || Error("No se pudo guardar los adjuntos"));
      });
    } finally {
      d.close();
    }
  }
  window.VSFiles = { all, replace };
})();
