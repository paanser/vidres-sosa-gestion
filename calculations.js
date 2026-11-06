"use strict";
(function (root) {
  const U =
    typeof module !== "undefined" ? require("./utils.js") : root.VSUtils;
  const { num, round6 } = U;
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
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
  // Los importes adicionales son por línea completa, no por pieza.
  // Nuevos presupuestos: incremento solo del vidrio; los antiguos conservan su fórmula.
  function quoteDetails(quote) {
    const config = quote.pricing || {},
      marginRate = num(config.margin),
      factor =
        config.marginScope !== "glass" && config.marginMode === "sale"
          ? marginRate < 100
            ? 1 / (1 - marginRate / 100)
            : NaN
          : 1 + marginRate / 100,
      lines = quote.lines.map((line) => {
        const dimensions = calc(line, config),
          glassCost = round2(
            line.kind === "concept" ? num(line.amount) : dimensions.total,
          ),
          extraCost =
            line.kind === "concept" ? 0 : round2(num(line.extraAmount)),
          cost = round2(glassCost + extraCost),
          marginBase =
            config.marginScope === "glass"
              ? line.kind === "concept"
                ? 0
                : dimensions.area * num(line.price) * dimensions.qty
              : cost,
          sale = round2(
            config.marginScope === "glass"
              ? cost + marginBase * (factor - 1)
              : cost * factor,
          ),
          separate = line.extraMode === "separate",
          extraSale = separate
            ? round2(extraCost * (config.marginScope === "glass" ? 1 : factor))
            : 0;
        return {
          ...dimensions,
          glassCost,
          extraCost,
          cost,
          margin: round2(sale - cost),
          sale,
          glassSale: round2(sale - extraSale),
          extraSale,
          separate,
        };
      });
    // Sin opciones nuevas se conserva el redondeo de presupuestos anteriores.
    const legacy =
        !marginRate &&
        !quote.lines.some((l) => num(l.extraAmount) || l.kind === "concept"),
      base = legacy
        ? totals(quote.lines, config).base
        : round2(lines.reduce((n, l) => n + l.sale, 0)),
      cost = legacy ? base : round2(lines.reduce((n, l) => n + l.cost, 0)),
      rate = config.vat === "" || config.vat == null ? 21 : num(config.vat),
      iva = round2((base * rate) / 100);
    return {
      lines,
      cost,
      margin: round2(base - cost),
      totals: { base, iva, total: round2(base + iva) },
    };
  }
  const api = { calc, totals, quoteDetails, round2 };
  if (typeof module !== "undefined") module.exports = api;
  else root.VSCalculations = api;
})(globalThis);
