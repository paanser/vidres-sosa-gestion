"use strict";
(() => {
  const legacy = "vidres-mediciones-v1";
  let cache = [];
  function warn(error) {
    alert(
      "No se pudieron guardar o leer los datos. Comprueba el espacio y los permisos del navegador. " +
        error.message,
    );
  }
  const local = {
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch (e) {
        warn(e);
        throw e;
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        warn(e);
        throw e;
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        warn(e);
        throw e;
      }
    },
  };
  const read = (key, fallback) => {
    try {
      return JSON.parse(local.getItem(key)) ?? fallback;
    } catch (e) {
      console.error("Lectura inválida:", key);
      return fallback;
    }
  };
  const write = (key, value) => local.setItem(key, JSON.stringify(value));
  let connection;
  function db() {
    if (!connection)
      connection = new Promise((resolve, reject) => {
        const r = indexedDB.open("vidres-gestion-v1", 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("mediciones", { keyPath: "id" });
          r.result.createObjectStore("meta");
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.onblocked = () =>
          reject(
            Error("Cierra otras pestañas para actualizar el almacenamiento"),
          );
      });
    return connection;
  }
  async function all() {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("mediciones");
      const r = tx.objectStore("mediciones").getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function replace(items) {
    if (
      !Array.isArray(items) ||
      items.some((x) => !x || typeof x.id !== "string") ||
      new Set(items.map((x) => x.id)).size !== items.length
    )
      throw Error("Mediciones no válidas o referencias duplicadas");
    const d = await db();
    await new Promise((resolve, reject) => {
      const tx = d.transaction("mediciones", "readwrite"),
        store = tx.objectStore("mediciones");
      store.clear();
      items.forEach((x) => store.put(x));
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () =>
        reject(tx.error || Error("Guardado cancelado"));
    });
    cache = structuredClone(items);
  }
  const ready = (async () => {
    cache = await all();
    const raw = local.getItem(legacy);
    if (raw === null) return;
    const old = JSON.parse(raw);
    if (!Array.isArray(old))
      throw Error(
        "La copia antigua de mediciones no es válida; se conserva sin modificar",
      );
    const merged = new Map(cache.map((x) => [x.id, x]));
    for (const item of old) {
      if (
        merged.has(item.id) &&
        JSON.stringify(merged.get(item.id)) !== JSON.stringify(item)
      )
        throw Error(
          "Hay dos versiones de la medición " +
            item.id +
            ". Se conserva el original y no se inicia la migración",
        );
      merged.set(item.id, item);
    }
    await replace([...merged.values()]);
    const verified = new Map((await all()).map((x) => [x.id, x]));
    if (
      !old.every(
        (x) => JSON.stringify(verified.get(x.id)) === JSON.stringify(x),
      )
    )
      throw Error("La migración no se pudo verificar");
    if (local.getItem(legacy) !== raw)
      throw Error(
        "Otra pestaña modificó las mediciones. Recarga para repetir la migración",
      );
    local.removeItem(legacy);
  })();
  ready.catch(() => {});
  window.VSStorage = {
    local,
    read,
    write,
    ready,
    measurements: { all, replace, get: () => structuredClone(cache) },
  };
})();
