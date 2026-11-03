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
  async function put(kind, item) {
    const d = await open(kind);
    try {
      await new Promise((resolve, reject) => {
        const tx = d.transaction(definitions[kind][1], "readwrite");
        tx.objectStore(definitions[kind][1]).put(item);
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () =>
          reject(tx.error || Error("No se pudo guardar el archivo"));
      });
    } finally {
      d.close();
    }
  }
  async function remove(kind, id) {
    const d = await open(kind);
    try {
      await new Promise((resolve, reject) => {
        const tx = d.transaction(definitions[kind][1], "readwrite");
        tx.objectStore(definitions[kind][1]).delete(id);
        tx.oncomplete = resolve;
        tx.onerror = tx.onabort = () =>
          reject(tx.error || Error("No se pudo eliminar el archivo"));
      });
    } finally {
      d.close();
    }
  }
  function compressImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file),
        img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height)),
          canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas
          .getContext("2d")
          .drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(Error("No se pudo comprimir la imagen")),
          "image/jpeg",
          0.72,
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(Error("Imagen no válida"));
      };
      img.src = url;
    });
  }
  window.VSFiles = { all, replace, put, remove, compressImage };
})();
