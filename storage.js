"use strict";
(() => {
  const keys = {
    trabajos: "vidres-sosa-demo-v01",
    clientes: "vidres-clientes-v1",
    presupuestos: "vs-quote-prototype-v1",
    tarifas: "vs-tariffs-prototype-v1",
    configuracion: "vs-config-v1",
    numeracion: "vs-quote-sequence-v1",
    notas: "vidres-notas-v1",
    plantillas: "vidres-plantillas-v1",
    catalogo: "vs-pdf-catalog-v1",
    mediciones: "vidres-mediciones-servidor-v1",
  };
  const business = new Set(Object.values(keys));
  const preferences = new Set([
    "vidres-text-scale",
    "vidres-home-view",
    "vidres-last-backup-v1",
    "vidres-backup-start-v1",
  ]);
  let values = {},
    revision = 0,
    queue = Promise.resolve(),
    dirtyConflict = false;
  function accept(state) {
    values = state.values;
    revision = state.revision;
  }
  const ready = VSAuth.json("/api/state").then(accept);
  function enqueue(task) {
    const result = queue.then(() => {
      if (dirtyConflict)
        throw Error(
          "Hay cambios de otro dispositivo. Conserva tu formulario y recarga antes de guardar.",
        );
      return task();
    });
    queue = result.catch(() => {});
    return result;
  }
  async function save(next) {
    try {
      const result = await VSAuth.json("/api/state", "PUT", {
        revision,
        values: next,
      });
      accept(result);
    } catch (e) {
      if (e.status === 409) dirtyConflict = true;
      throw e;
    }
  }
  const local = {
    getItem(key) {
      if (business.has(key))
        return key in values ? JSON.stringify(values[key]) : null;
      if (preferences.has(key)) return localStorage.getItem(key);
      throw Error("Almacenamiento no permitido: " + key);
    },
    setItem(key, value) {
      if (business.has(key)) {
        const data = JSON.parse(value);
        return enqueue(() => save({ ...structuredClone(values), [key]: data }));
      }
      if (preferences.has(key)) {
        localStorage.setItem(key, value);
        return;
      }
      throw Error("Almacenamiento no permitido: " + key);
    },
    removeItem(key) {
      if (preferences.has(key)) localStorage.removeItem(key);
      else throw Error("No se pueden borrar colecciones del servidor");
    },
  };
  const read = (key, fallback) => {
    const raw = local.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  };
  const write = (key, value) => local.setItem(key, JSON.stringify(value));
  window.VSStorage = {
    keys,
    local,
    read,
    write,
    ready,
    measurements: {
      get: () => structuredClone(values[keys.mediciones] || []),
      all: async () => structuredClone(values[keys.mediciones] || []),
      replace: (items) => write(keys.mediciones, items),
    },
    runMutation: enqueue,
    advanceRevision(next) {
      if (next !== revision + 1) {
        dirtyConflict = true;
        throw Error(
          "La revisión del servidor ha cambiado. Recarga antes de continuar.",
        );
      }
      revision = next;
    },
    reserveQuoteNumber: () =>
      enqueue(async () => {
        const r = await VSAuth.json("/api/quote-number", "POST", { revision });
        values[keys.numeracion] = r.numeracion;
        revision = r.revision;
        return r.id;
      }),
    patchValues: (partial) =>
      enqueue(() =>
        save({ ...structuredClone(values), ...structuredClone(partial) }),
      ),
    replaceValues: (next) => enqueue(() => save(structuredClone(next))),
    values: () => structuredClone(values),
    revision: () => revision,
    clear() {
      values = {};
      dirtyConflict = true;
    },
    // An error is surfaced globally for any overlooked asynchronous caller; never claim a local save.
  };
  window.addEventListener("unhandledrejection", (e) => {
    if (e.reason?.message) alert("No se pudo guardar: " + e.reason.message);
  });
})();
