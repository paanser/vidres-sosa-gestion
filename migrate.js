"use strict";
// Migración de presupuestos antiguos (schema 1, líneas planas) al nuevo
// modelo (schema 2, con capítulos y tipos de línea). Conserva el importe.
(function (root) {
  const U =
    typeof module !== "undefined" ? require("./utils.js") : root.VSUtils;
  const { num } = U;

  // Extrae el espesor (mm) del nombre del vidrio si es posible ("Templado 8 mm").
  function espesorDe(nombre) {
    const m = String(nombre || "").match(/(\d+(?:[.,]\d+)?)\s*mm/i);
    return m ? num(m[1].replace(",", ".")) : 0;
  }

  function migrateLine(l, index) {
    const glass = l.glass || "";
    const tratamientos = [];
    if ((l.sides || []).length) {
      tratamientos.push({
        id: "T1",
        nombre: "Canto",
        forma: "ml",
        precio: l.edgePrice ?? 0,
        sides: l.sides,
      });
    }
    return {
      id: "L" + (index + 1),
      tipo: "vidrio",
      nombre: glass || "Vidrio",
      w: l.w ?? "",
      h: l.h ?? "",
      qty: l.qty ?? 1,
      vidrio: glass,
      tariff: l.tariff || "",
      precioM2: l.price ?? "",
      coste: "",
      redondeo: 6,
      minimoM2: "",
      minimoImporte: "",
      espesor: espesorDe(glass),
      tratamientos,
      descuento: { tipo: "%", valor: 0 },
      iva: null,
      opcional: false,
      alternativa: "",
    };
  }

  function quote(q, config = {}) {
    if (!q || q.schema) return q;
    const pricing = q.pricing || { vat: 21, energyMode: "pending", energy: "" };
    return {
      schema: 2,
      id: q.id,
      version: q.version || 1,
      client: q.client || "",
      obra: q.obra || "",
      job: q.job || "",
      status: q.status || "Borrador",
      date: q.date || "",
      validezDias: q.validezDias ?? Number(config.validity || 30),
      caducidad: q.caducidad || "",
      pago: q.pago || "",
      plazo: q.plazo || "",
      notasInternas: q.notasInternas || "",
      notasCliente: q.notasCliente || "",
      descuentoGlobal: q.descuentoGlobal || { tipo: "%", valor: 0 },
      recargos: q.recargos || [],
      anticipo: q.anticipo || { tipo: "%", valor: 0 },
      pricing,
      historial: q.historial || [
        { fecha: q.date || "", estado: q.status || "Borrador" },
      ],
      enviado: q.enviado,
      seguimiento: q.seguimiento,
      capitulos: [
        {
          id: "C1",
          nombre: "",
          lineas: (q.lines || []).map((l, i) => migrateLine(l, i)),
        },
      ],
    };
  }

  const api = {
    quote,
    list: (arr, config) =>
      Array.isArray(arr) ? arr.map((q) => quote(q, config)) : [],
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.VSMigrate = api;
})(globalThis);
