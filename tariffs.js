"use strict";
(() => {
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
  // Familias de vidrio disponibles (C2).
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
    return {
      id: item.id || "T-" + crypto.randomUUID(),
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
  window.vidresTariffs = { merge, key, familias, normalize, precioVenta };
})();
