"use strict";
(function (root) {
  const U =
    typeof module !== "undefined" ? require("./utils.js") : root.VSUtils;
  const { num, round6 } = U;
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // Redondea hacia arriba al múltiplo de step (0 o vacío = sin redondeo).
  // roundTo(cm, 6) equivale a round6(cm), pero es configurable.
  function roundTo(cm, step) {
    const s = num(step);
    if (!s) return num(cm);
    const n = num(cm);
    if (!n) return 0;
    return Math.ceil((n - 1e-9) / s) * s;
  }

  // ---------------------------------------------------------------------
  // Compatibilidad con presupuestos antiguos (schema 1, sin capítulos).
  // ---------------------------------------------------------------------
  function calc(line, config = {}) {
    const w = num(line.w),
      h = num(line.h),
      aw = round6(w),
      ah = round6(h),
      qty = Math.max(1, Math.floor(num(line.qty) || 1));
    const sides = [...new Set(line.sides || [])].filter((s) =>
      ["top", "bottom", "left", "right"].includes(s),
    );
    const ml = sides.reduce(
        (n, s) => n + (s === "top" || s === "bottom" ? w : h) / 100,
        0,
      ),
      area = (aw * ah) / 10000,
      real = (w * h) / 10000;
    const subtotal = (area * num(line.price) + ml * num(line.edgePrice)) * qty;
    let energy = 0;
    if (config.energyMode === "percent")
      energy = (subtotal * num(config.energy)) / 100;
    if (config.energyMode === "m2") energy = area * qty * num(config.energy);
    return {
      w,
      h,
      aw,
      ah,
      real,
      area,
      ml,
      qty,
      energy,
      total: subtotal + energy,
    };
  }
  function totals(lines, config = {}) {
    const base = round2(lines.reduce((n, l) => n + calc(l, config).total, 0)),
      rate = config.vat === "" || config.vat == null ? 21 : num(config.vat),
      iva = round2((base * rate) / 100);
    return { base, iva, total: round2(base + iva) };
  }

  // ---------------------------------------------------------------------
  // C2 · Calculadora de vidrio y líneas (schema 2)
  // ---------------------------------------------------------------------

  // Precio de un tratamiento aplicado a una pieza de vidrio.
  // dims = { w, h, aw, ah, area, facturable, qty }
  function treatmentPrice(t, dims) {
    const precio = num(t.precio);
    const qty = dims.qty || 1;
    const forma = t.forma || "ml";
    if (forma === "ml") {
      const ml = [...new Set(t.sides || [])].reduce(
        (n, s) => n + (s === "top" || s === "bottom" ? dims.w : dims.h) / 100,
        0,
      );
      return precio * ml * qty;
    }
    if (forma === "m2") return precio * dims.area * qty;
    if (forma === "fijo") return precio * qty;
    return precio * num(t.cantidad || 1) * qty; // "unidad"
  }

  // Línea de tipo "vidrio": medidas, redondeo configurable, mínimo
  // facturable, tratamientos y peso estimado.
  function calcGlass(line, config = {}) {
    const w = num(line.w),
      h = num(line.h);
    const step = num(line.redondeo ?? config.redondeo ?? 6);
    const aw = roundTo(w, step),
      ah = roundTo(h, step);
    const qty = Math.max(1, Math.floor(num(line.qty) || 1));
    const area = (aw * ah) / 10000,
      real = (w * h) / 10000;
    const precioM2 = num(line.precioM2 ?? line.price);
    const minimoM2 = num(line.minimoM2 ?? line.minimo);
    const minimoImporte = num(line.minimoImporte);
    const facturable = Math.max(area, minimoM2);
    let subtotal = facturable * precioM2;
    if (minimoImporte > 0) subtotal = Math.max(subtotal, minimoImporte);
    subtotal = round2(subtotal * qty);

    const dims = { w, h, aw, ah, area, facturable, qty };
    const tratamientos = round2(
      (line.tratamientos || []).reduce(
        (n, t) => n + treatmentPrice(t, dims),
        0,
      ),
    );

    const espesor = num(line.espesor);
    const pesoPieza = espesor * 2.5 * area;
    const peso = pesoPieza * qty;

    const base = round2(subtotal + tratamientos);
    let energy = 0;
    if (config.energyMode === "percent")
      energy = round2((base * num(config.energy)) / 100);
    if (config.energyMode === "m2")
      energy = round2(area * qty * num(config.energy));

    return {
      tipo: "vidrio",
      w,
      h,
      aw,
      ah,
      real,
      area,
      facturable,
      qty,
      espesor,
      pesoPieza,
      peso,
      tratamientos,
      subtotal,
      energy,
      total: round2(base + energy),
    };
  }

  // Calcula una línea de cualquier tipo. Devuelve al menos { tipo, subtotal, total }.
  function calcLine(line, config = {}) {
    const tipo = line.tipo || "vidrio";
    switch (tipo) {
      case "vidrio":
        return calcGlass(line, config);
      case "tratamiento": {
        const forma = line.forma || "ml";
        const cantidad =
          forma === "fijo" ? 1 : num(line.cantidad ?? line.ml ?? 1);
        const total = round2(num(line.precio) * cantidad);
        return { tipo, nombre: line.nombre, subtotal: total, total, cantidad };
      }
      case "mano_obra": {
        const total = round2(num(line.horas) * num(line.tarifa));
        return {
          tipo,
          nombre: line.nombre,
          subtotal: total,
          total,
          horas: num(line.horas),
          tarifa: num(line.tarifa),
        };
      }
      case "desplazamiento": {
        const total =
          line.forma === "km"
            ? round2(num(line.km) * num(line.precio))
            : round2(num(line.precio));
        return { tipo, nombre: line.nombre, subtotal: total, total };
      }
      case "material": {
        const total = round2(num(line.cantidad) * num(line.precio));
        return { tipo, nombre: line.nombre, subtotal: total, total };
      }
      case "servicio":
      case "residuos": {
        const total = round2(num(line.precio));
        return { tipo, nombre: line.nombre, subtotal: total, total };
      }
      case "texto":
      default:
        return {
          tipo: "texto",
          nombre: line.nombre || "",
          subtotal: 0,
          total: 0,
        };
    }
  }

  // ¿La línea suma al total? Las opcionales y las alternativas no suman.
  function isCounted(line) {
    return !line.opcional && !line.alternativa;
  }

  // Total de un presupuesto schema 2: suma las líneas que cuentan,
  // aplica IVA (tipo único por ahora; C3 ampliará a IVA por tipo).
  function quoteTotals(lines, config = {}) {
    const base = round2(
      lines
        .filter(isCounted)
        .reduce((n, l) => n + calcLine(l, config).total, 0),
    );
    const rate = config.vat === "" || config.vat == null ? 21 : num(config.vat);
    const iva = round2((base * rate) / 100);
    return { base, iva, total: round2(base + iva) };
  }

  // Estimación simple de planchas y merma (sin optimización de corte).
  function planchas(lines, config = {}) {
    const pw = num(config.planchaW || 321),
      ph = num(config.planchaH || 225);
    let planchasN = 0,
      usada = 0,
      totalM2 = 0;
    for (const l of lines) {
      if ((l.tipo || "vidrio") !== "vidrio") continue;
      const c = calcGlass(l, config);
      if (c.area <= 0 || c.qty <= 0) continue;
      const perSheet =
        pw > 0 && ph > 0 ? Math.floor(pw / c.aw) * Math.floor(ph / c.ah) : 0;
      const sheets = perSheet > 0 ? Math.ceil(c.qty / perSheet) : c.qty;
      planchasN += sheets;
      usada += c.area * c.qty;
      totalM2 += sheets * ((pw * ph) / 10000);
    }
    const merma =
      totalM2 > 0
        ? round2(Math.max(0, ((totalM2 - usada) / totalM2) * 100))
        : 0;
    return {
      planchas: planchasN,
      merma,
      usadaM2: round2(usada),
      totalM2: round2(totalM2),
    };
  }

  const api = {
    calc,
    totals,
    round2,
    roundTo,
    calcGlass,
    calcLine,
    treatmentPrice,
    isCounted,
    quoteTotals,
    planchas,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.VSCalculations = api;
})(globalThis);
