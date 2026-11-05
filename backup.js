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
  };
  const stamp = "vidres-last-backup-v1",
    start = "vidres-backup-start-v1";
  if (!VSStorage.local.getItem(start))
    VSStorage.local.setItem(start, new Date().toISOString());
  async function snapshot() {
    const result = {
      format: "vidres-sosa-backup",
      version: 2,
      exportado: new Date().toISOString(),
      mediciones: VSStorage.measurements.get(),
    };
    for (const [name, key] of Object.entries(keys))
      result[name] = VSStorage.read(
        key,
        ["configuracion", "numeracion"].includes(name) ? {} : [],
      );
    result.photos = await VSFiles.all("photos");
    result.documents = await VSFiles.all("documents");
    return result;
  }
  function toValues(data) {
    const values = {};
    for (const [name, key] of Object.entries(keys))
      values[key] =
        data[name] ??
        (["configuracion", "numeracion"].includes(name) ? {} : []);
    values[VSStorage.keys.mediciones] = data.mediciones || [];
    return values;
  }
  async function transaction(after) {
    const current = VSStorage.values(),
      next = toValues(after),
      partial = {};
    for (const [key, value] of Object.entries(next))
      if (JSON.stringify(current[key]) !== JSON.stringify(value))
        partial[key] = value;
    await VSStorage.patchValues(partial);
    await VSFiles.refresh();
  }
  async function recover() {} // Server commits are transactional; no browser recovery journal.
  const dataURL = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  async function encode(data, files) {
    const out = { ...data };
    delete out.photos;
    delete out.documents;
    if (files) {
      out.archivos = {};
      for (const kind of ["photos", "documents"])
        out.archivos[kind] = await Promise.all(
          data[kind].map(async ({ blob, ...record }) => ({
            ...record,
            data: await dataURL(blob),
          })),
        );
    }
    return out;
  }
  function download(data, name) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    VSStorage.local.setItem(stamp, new Date().toISOString());
  }
  async function exportData(files = false) {
    const data = await snapshot();
    if (files) {
      const bytes = [...data.photos, ...data.documents].reduce(
        (n, x) => n + x.blob.size,
        0,
      );
      if (
        !confirm(
          "La copia incluirá fotos y documentos (aprox. " +
            ((bytes * 1.4) / 1e6).toFixed(1) +
            " MB más los datos). Puede tardar y ocupar memoria. ¿Continuar?",
        )
      )
        return;
    }
    download(
      await encode(data, files),
      "vidres-sosa-" +
        (files ? "completa-" : "datos-") +
        new Date().toISOString().slice(0, 10) +
        ".json",
    );
    window.vidresRefresh?.();
  }
  function decodeFile(item) {
    if (
      !item ||
      typeof item.id !== "string" ||
      typeof item.trabajo !== "string" ||
      typeof item.nombre !== "string" ||
      typeof item.data !== "string"
    )
      throw Error("Adjunto no válido");
    const m = item.data.match(/^data:([^,]*);base64,([A-Za-z0-9+/]*={0,2})$/);
    if (!m) throw Error("Contenido de archivo inválido");
    const binary = atob(m[2]),
      bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const { data, ...rest } = item;
    return {
      ...rest,
      blob: new Blob([bytes], { type: m[1] || "application/octet-stream" }),
    };
  }
  const text = (x, k) => typeof x?.[k] === "string";
  function unique(items) {
    return new Set(items.map((x) => x.id)).size === items.length;
  }
  function validate(data) {
    if (
      data?.format !== "vidres-sosa-backup" ||
      ![1, 2].includes(data.version) ||
      !Array.isArray(data.trabajos) ||
      data.trabajos.some(
        (j) => !text(j, "id") || !text(j, "cliente") || !text(j, "descripcion"),
      ) ||
      !unique(data.trabajos)
    )
      throw Error("Trabajos o formato de copia no válidos");
    const ids = new Set(data.trabajos.map((j) => j.id));
    if (
      data.clientes !== undefined &&
      (!Array.isArray(data.clientes) ||
        data.clientes.some(
          (c) =>
            !text(c, "nombre") ||
            (c.telefono !== undefined && !text(c, "telefono")),
        ))
    )
      throw Error("Clientes no válidos");
    if (
      data.notas !== undefined &&
      (!Array.isArray(data.notas) ||
        !unique(data.notas) ||
        data.notas.some(
          (n) =>
            !text(n, "id") ||
            !text(n, "texto") ||
            !text(n, "cliente") ||
            !text(n, "aviso") ||
            typeof n.hecha !== "boolean" ||
            !text(n, "creada") ||
            !text(n, "parte"),
        ))
    )
      throw Error("Notas rápidas no válidas");
    if (
      data.plantillas !== undefined &&
      (!Array.isArray(data.plantillas) ||
        !unique(data.plantillas) ||
        data.plantillas.some(
          (t) =>
            !text(t, "id") ||
            !text(t, "nombre") ||
            (t.descripcion !== undefined && !text(t, "descripcion")) ||
            (t.tipoCliente !== undefined && !text(t, "tipoCliente")) ||
            (t.notas !== undefined && !text(t, "notas")) ||
            !Array.isArray(t.piezas) ||
            t.piezas.some(
              (p) =>
                !p ||
                !text(p, "tipo") ||
                (p.espesor !== undefined && !text(p, "espesor")) ||
                (p.observaciones !== undefined && !text(p, "observaciones")),
            ),
        ))
    )
      throw Error("Plantillas no válidas");
    if (
      data.mediciones !== undefined &&
      (!Array.isArray(data.mediciones) ||
        !unique(data.mediciones) ||
        data.mediciones.some(
          (m) =>
            !text(m, "id") ||
            !ids.has(m.trabajo) ||
            !Number.isFinite(Number(m.ancho)) ||
            Number(m.ancho) <= 0 ||
            !Number.isFinite(Number(m.alto)) ||
            Number(m.alto) <= 0 ||
            !Number.isInteger(Number(m.cantidad)) ||
            Number(m.cantidad) < 1,
        ))
    )
      throw Error("Mediciones no válidas");
    for (const m of data.mediciones || []) {
      if (!m.croquis) continue;
      const s = m.croquis;
      if (
        !Array.isArray(s.strokes) ||
        s.strokes.some(
          (t) =>
            !Array.isArray(t.points) ||
            t.points.some(
              (p) =>
                !Array.isArray(p) ||
                p.length !== 2 ||
                p.some((n) => typeof n !== "number" || !Number.isFinite(n)),
            ),
        )
      )
        throw Error("Croquis no válido");
      if (
        s.dims !== undefined &&
        (!Array.isArray(s.dims) ||
          s.dims.some(
            (d) =>
              !d ||
              typeof d.id !== "string" ||
              !Array.isArray(d.a) ||
              d.a.length !== 2 ||
              !Array.isArray(d.b) ||
              d.b.length !== 2 ||
              [d.a, d.b].some((p) =>
                p.some((n) => typeof n !== "number" || !Number.isFinite(n)),
              ) ||
              typeof d.valor !== "string",
          ))
      )
        throw Error("Cotas del croquis no válidas");
    }
    if (
      data.presupuestos !== undefined &&
      (!Array.isArray(data.presupuestos) ||
        !unique(data.presupuestos) ||
        data.presupuestos.some(
          (q) =>
            !text(q, "id") ||
            !text(q, "client") ||
            (q.job && !ids.has(q.job)) ||
            !Array.isArray(q.lines) ||
            q.lines.some(
              (l) =>
                !l ||
                !Number.isFinite(Number(l.w)) ||
                Number(l.w) <= 0 ||
                !Number.isFinite(Number(l.h)) ||
                Number(l.h) <= 0 ||
                !Number.isInteger(Number(l.qty || 1)) ||
                Number(l.qty || 1) < 1 ||
                !Number.isFinite(Number(l.price || 0)) ||
                Number(l.price || 0) < 0,
            ),
        ))
    )
      throw Error("Presupuestos no válidos");
    if (
      data.tarifas !== undefined &&
      (!Array.isArray(data.tarifas) ||
        !unique(data.tarifas) ||
        data.tarifas.some(
          (t) =>
            !text(t, "id") ||
            !text(t, "name") ||
            !Number.isFinite(Number(t.price)) ||
            Number(t.price) <= 0 ||
            !Number.isFinite(Number(t.edge)) ||
            Number(t.edge) < 0,
        ))
    )
      throw Error("Tarifas no válidas");
    for (const k of ["configuracion", "numeracion"])
      if (
        data[k] !== undefined &&
        (!data[k] || typeof data[k] !== "object" || Array.isArray(data[k]))
      )
        throw Error("Configuración no válida");
    if (
      data.configuracion?.vat !== undefined &&
      (!Number.isFinite(Number(data.configuracion.vat)) ||
        Number(data.configuracion.vat) < 0 ||
        Number(data.configuracion.vat) > 100)
    )
      throw Error("IVA no válido");
    if (data.configuracion?.company) {
      const c = data.configuracion.company;
      if (
        typeof c !== "object" ||
        Array.isArray(c) ||
        ["name", "taxId", "address", "phone", "email", "conditions"].some(
          (k) => c[k] !== undefined && typeof c[k] !== "string",
        ) ||
        (c.validity !== undefined &&
          (!Number.isInteger(Number(c.validity)) || Number(c.validity) < 1))
      )
        throw Error("Datos de empresa no válidos");
    }
    if (
      data.numeracion &&
      Object.entries(data.numeracion).some(
        ([year, n]) => !/^\d{4}$/.test(year) || !Number.isInteger(n) || n < 0,
      )
    )
      throw Error("Numeración no válida");
    if (data.archivos) {
      for (const kind of ["photos", "documents"]) {
        if (!Array.isArray(data.archivos[kind]) || !unique(data.archivos[kind]))
          throw Error("Lista de archivos no válida");
        data[kind] = data.archivos[kind].map(decodeFile);
        if (data[kind].some((x) => !ids.has(x.trabajo)))
          throw Error("Archivo sin trabajo asociado");
      }
    }
    return data;
  }

  async function importFile(file) {
    if (!file || file.size > 250000000)
      throw Error("Selecciona una copia JSON de hasta 250 MB");
    if (VSAuth.user.rol !== "administrador")
      throw Error("Solo un administrador puede importar");
    const data = validate(
      JSON.parse(await file.text(), (key, value) => {
        if (["__proto__", "prototype", "constructor"].includes(key))
          throw Error("Clave no permitida");
        return value;
      }),
    );
    await VSMigration.importData(data);
  }
  const last = () => VSStorage.local.getItem(stamp),
    overdue = () =>
      Date.now() -
        new Date(last() || VSStorage.local.getItem(start)).getTime() >
      14 * 86400000;
  window.VSBackup = {
    snapshot,
    toValues,
    transaction,
    recover,
    exportData,
    importFile,
    validate,
    last,
    overdue,
    encode,
    download,
    keys,
  };
})();
