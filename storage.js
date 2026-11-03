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
      const tx = d.transaction(["mediciones", "meta"]),
        records = tx.objectStore("mediciones").getAll(),
        order = tx.objectStore("meta").get("measurements-order");
      tx.oncomplete = () => {
        const map = new Map(records.result.map((x) => [x.id, x])),
          result = [];
        for (const id of order.result || []) {
          if (map.has(id)) {
            result.push(map.get(id));
            map.delete(id);
          }
        }
        resolve([...result, ...map.values()]);
      };
      tx.onerror = tx.onabort = () =>
        reject(tx.error || Error("No se pudieron leer las mediciones"));
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
      const tx = d.transaction(["mediciones", "meta"], "readwrite"),
        store = tx.objectStore("mediciones");
      tx.objectStore("meta").put(
        items.map((x) => x.id),
        "measurements-order",
      );
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
  async function getMeta(key) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const r = d.transaction("meta").objectStore("meta").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function setMeta(key, value) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction("meta", "readwrite");
      if (value === undefined) tx.objectStore("meta").delete(key);
      else tx.objectStore("meta").put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(tx.error);
    });
  }
  window.VSStorage = {
    meta: { get: getMeta, set: setMeta },
    local,
    read,
    write,
    ready,
    measurements: { all, replace, get: () => structuredClone(cache) },
  };
})();
