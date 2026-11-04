"use strict";
// Tarifas de vidrio: modelo, importación/exportación CSV y actualización
// masiva. Sin dependencias del DOM para poder probarlo con node:test.
(function (root) {
  const key = "vs-tariffs-prototype-v1";
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLocaleLowerCase("es");

  function merge(current, items) {
    const result = [],
      index = new Map();
    for (const item of [...current, ...items]) {
      const name = norm(item.name);
      if (!name) continue;
      if (index.has(name)) {
        const i = index.get(name);
        result[i] = { ...result[i], ...item, id: result[i].id };
      } else {
        index.set(name, result.length);
        result.push({ ...item });
      }
    }
    return result;
  }

  // Familias de vidrio disponibles.
  const familias = [
    "float",
    "laminado",
    "templado",
    "doble",
    "bajo emisivo",
    "mate",
    "espejo",
    "serigrafiado",
  ];

  // Normaliza una tarifa: rellena los campos nuevos opcionales.
  function normalize(item) {
    const uid =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    return {
      id: item.id || "T-" + uid,
      name: item.name || "",
      familia: item.familia || "",
      espesor: item.espesor || "",
      coste: item.coste ?? "",
      margen: item.margen ?? "",
      price: item.price ?? "",
      edge: item.edge ?? "",
      proveedor: item.proveedor || "",
      minimoM2: item.minimoM2 ?? "",
      minimoImporte: item.minimoImporte ?? "",
      redondeo: item.redondeo ?? 6,
      updatedAt: item.updatedAt || "",
    };
  }

  // Precio de venta: coste + margen, o el precio explícito.
  function precioVenta(t) {
    const coste = Number(String(t.coste ?? "").replace(",", "."));
    const margen = Number(String(t.margen ?? "").replace(",", "."));
    if (Number.isFinite(coste) && coste > 0 && Number.isFinite(margen))
      return (
        Math.round((coste * (1 + margen / 100) + Number.EPSILON) * 100) / 100
      );
    return Number(String(t.price ?? "").replace(",", ".")) || 0;
  }

  // Sube el precio un % a las tarifas de un proveedor (o a todas).
  // Devuelve una lista nueva; no muta la original.
  function applyBulk(items, proveedor, pct) {
    const p = Number(pct);
    if (!Number.isFinite(p)) return items;
    const target = norm(proveedor || "");
    const today = new Date().toISOString().slice(0, 10);
    return items.map((t) => {
      if (target && norm(t.proveedor) !== target) return t;
      const precio = Number(String(t.price ?? "").replace(",", "."));
      if (!Number.isFinite(precio) || precio <= 0) return t;
      const nuevo =
        Math.round((precio * (1 + p / 100) + Number.EPSILON) * 100) / 100;
      return { ...t, price: nuevo, updatedAt: today };
    });
  }

  // Vista previa de la actualización masiva (sin aplicar).
  function previewBulk(items, proveedor, pct) {
    const p = Number(pct);
    if (!Number.isFinite(p)) return [];
    const target = norm(proveedor || "");
    return items
      .filter(
        (t) => (!target || norm(t.proveedor) === target) && Number(t.price) > 0,
      )
      .map((t) => {
        const nuevo =
          Math.round((Number(t.price) * (1 + p / 100) + Number.EPSILON) * 100) /
          100;
        return {
          name: t.name,
          proveedor: t.proveedor,
          de: Number(t.price),
          a: nuevo,
        };
      });
  }

  // Exporta a CSV con las columnas nuevas.
  function exportCsv(items) {
    const head = [
      "nombre",
      "precio_m2",
      "precio_ml",
      "familia",
      "espesor",
      "coste",
      "margen",
      "proveedor",
      "minimo_m2",
      "minimo_importe",
      "redondeo",
    ];
    const esc = (v) => {
      const s = String(v ?? "");
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = items.map((t) =>
      [
        t.name,
        t.price,
        t.edge,
        t.familia,
        t.espesor,
        t.coste,
        t.margen,
        t.proveedor,
        t.minimoM2,
        t.minimoImporte,
        t.redondeo,
      ]
        .map(esc)
        .join(";"),
    );
    return [head.join(";"), ...rows].join("\r\n");
  }

  // Lee un CSV (compatible con el formato antiguo "nombre;precio_m2;precio_ml").
  function parseCsv(text) {
    const raw = String(text || "")
      .replace(/^\uFEFF/, "")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    if (!raw.length) return { items: [], errors: ["CSV vacío"] };
    const sep = raw[0].includes(";") ? ";" : ",";
    const head = raw
      .shift()
      .split(sep)
      .map((x) => x.trim().toLowerCase());
    const col = (name) => head.indexOf(name);
    const iName = col("nombre"),
      iPrecio = col("precio_m2"),
      iMl = col("precio_ml");
    if (iName < 0 || iPrecio < 0)
      return {
        items: [],
        errors: ["Columnas necesarias: nombre y precio_m2."],
      };
    const items = [],
      errors = [];
    raw.forEach((line, i) => {
      const parts = line.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
      const name = parts[iName];
      const precio = Number((parts[iPrecio] || "").replace(",", "."));
      if (!name || !Number.isFinite(precio) || precio <= 0) {
        errors.push("Fila " + (i + 2));
        return;
      }
      const g = (idx) => (idx >= 0 ? parts[idx] || "" : "");
      const edge = iMl >= 0 ? Number(g(iMl).replace(",", ".")) || 0 : 0;
      items.push(
        normalize({
          id: "T-" + Date.now() + "-" + i,
          name,
          price: precio,
          edge,
          familia: g(col("familia")),
          espesor: g(col("espesor")),
          coste: g(col("coste")),
          margen: g(col("margen")),
          proveedor: g(col("proveedor")),
          minimoM2: g(col("minimo_m2")),
          minimoImporte: g(col("minimo_importe")),
          redondeo: Number(g(col("redondeo"))) || 6,
          updatedAt: new Date().toISOString().slice(0, 10),
        }),
      );
    });
    return { items, errors };
  }

  const api = {
    merge,
    key,
    familias,
    normalize,
    precioVenta,
    applyBulk,
    previewBulk,
    exportCsv,
    parseCsv,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.vidresTariffs = api;
})(globalThis);
