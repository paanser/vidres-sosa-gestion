"use strict";
(function (root) {
  const U =
    typeof module !== "undefined" ? require("./utils.js") : root.VSUtils;
  const { num, round6 } = U;
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  // Solo espesores explícitos; los códigos de capas y las cámaras no son vidrio.
  function glassThickness(name) {
    const text = String(name || "")
      .replace(/^tarifa\s+[^·]+·\s*/i, "")
      .split("·")[0];
    const plus = text.match(
      /(?:^|\s)(\d+(?:[.,]\d+)?(?:\s*\+\s*\d+(?:[.,]\d+)?)+)(?:\s|$)/,
    );
    if (plus) return plus[1].split("+").reduce((sum, n) => sum + num(n), 0);
    const laminate = text.match(/(?:^|\s)(\d{2}|\d{3}|\d{4})[.,][1-9](?=\s|$)/);
    if (laminate) {
      const digits = laminate[1],
        half = digits.length / 2;
      if (digits.length === 3)
        return [...digits].reduce((sum, n) => sum + Number(n), 0);
      return Number(digits.slice(0, half)) + Number(digits.slice(half));
    }
    const parts = text
      .split(/\s+/)
      .filter((p) => /^\d+(?:[.,]\d+)?(?:mm)?$/i.test(p));
    const value = num((parts.pop() || "").replace(/mm$/i, ""));
    return value > 0 && value <= 30 ? value : 0;
  }
  function inferThickness(line) {
    if (["concept", "aluminum"].includes(line.kind)) return 0;
    if (!line.doubleGlazing) return glassThickness(line.glass);
    const base = (line.doubleComposition || "4/16/4").split("/");
    if (base.length !== 3) return 0;
    const first = glassThickness(line.faceOne ? line.faceOneName : base[0]);
    const second = glassThickness(line.faceTwo ? line.faceTwoName : base[2]);
    return first && second ? first + second : 0;
  }
  // Tabla de recargos de doble acristalamiento. Medidas internas en cm.
  const surchargeRules = [
    {
      id: "angles",
      label: "Cada ángulo distinto de 90°",
      percent: 15,
      minimum: 12,
      count: true,
    },
    { id: "blunt", label: "Punta roma", percent: 20, minimum: 10 },
    {
      id: "curves",
      label: "Cada lado con forma curva",
      percent: 50,
      minimum: 30,
      count: true,
    },
    { id: "circles", label: "Círculos", percent: 100, minimum: 50 },
    {
      id: "drills",
      label: "Taquillas / Escuadras / Taladros",
      percent: 100,
      minimum: 50,
    },
    { id: "regular", label: "Formas regulares", percent: 100, minimum: 50 },
    { id: "template", label: "Formas s/plantilla", percent: 150, minimum: 50 },
    { id: "irregular", label: "Formas irregulares", percent: 200, minimum: 75 },
    {
      id: "longSide",
      label: "Un lado superior a 2.400 mm",
      percent: 20,
      automatic: true,
    },
    {
      id: "area4",
      label: "Superficie superior a 4 m²",
      percent: 25,
      automatic: true,
    },
    {
      id: "area5",
      label: "Superficie superior a 5 m²",
      percent: 50,
      automatic: true,
    },
    {
      id: "area8",
      label: "Superficie superior a 8 m²",
      percent: 100,
      automatic: true,
    },
  ];
  function glassSurcharges(line, config, area, qty) {
    if (
      !line.doubleGlazing ||
      ["concept", "aluminum"].includes(line.kind) ||
      num(line.w) <= 0 ||
      num(line.h) <= 0
    )
      return [];
    const real = Math.round(num(line.w) * num(line.h) * 10000) / 100000000;
    const tier =
      real > 8 ? "area8" : real > 5 ? "area5" : real > 4 ? "area4" : "";
    return surchargeRules.flatMap((rule) => {
      const count = rule.automatic
        ? (
            rule.id === "longSide"
              ? Math.max(num(line.w), num(line.h)) > 240
              : rule.id === tier
          )
          ? 1
          : 0
        : rule.count
          ? Math.max(0, Math.floor(num(line["surcharge_" + rule.id])))
          : line["surcharge_" + rule.id] === true
            ? 1
            : 0;
      if (!count) return [];
      const applied = config.surchargeRules?.[rule.id] === true;
      const amount =
        Math.max(
          (area * num(line.price) * rule.percent) / 100,
          rule.minimum || 0,
        ) *
        count *
        qty;
      return [{ ...rule, count, applied, amount: applied ? amount : 0 }];
    });
  }
  function supplements(line, area, qty) {
    if (line.doubleGlazing)
      return { size: 0, surface: 0, shape: 0, supplementTotal: 0 };
    const family =
      line.supplementFamily ||
      (line.doubleGlazing
        ? "double"
        : /laminad|\+|\b\d{2}[.,][1-9]/i.test(line.glass || "")
          ? "laminated"
          : "mono");
    const side = Math.max(num(line.w), num(line.h));
    const real = (num(line.w) * num(line.h)) / 10000;
    const sizeRate =
      side > 321 && family === "laminated" ? 30 : side > 240 ? 20 : 0;
    const areaRate =
      family === "double"
        ? real > 8
          ? 100
          : real > 5
            ? 50
            : real > 4
              ? 25
              : 0
        : real > 6
          ? 20
          : real > 4
            ? 10
            : 0;
    const base = area * num(line.price) * qty;
    const size = line.sizeSupplement === true ? (base * sizeRate) / 100 : 0;
    const surface = line.areaSupplement === true ? (base * areaRate) / 100 : 0;
    const rules =
      family === "double"
        ? [
            [15, 12],
            [20, 10],
            [50, 30],
            [100, 50],
            [150, 50],
            [200, 75],
          ]
        : family === "laminated"
          ? [
              [15, 10],
              [20, 10],
              [40, 20],
              [100, 30],
              [150, 50],
              [200, 75],
            ]
          : [
              [12, 7],
              [15, 7],
              [30, 15],
              [100, 25],
              [150, 50],
              [200, 75],
            ];
    const rule = rules[Number(line.shape) - 1];
    const shape =
      rule && real > 0 ? Math.max((base * rule[0]) / 100, rule[1] * qty) : 0;
    return {
      size,
      surface,
      shape,
      sizeRate,
      areaRate,
      supplementTotal: size + surface + shape,
    };
  }
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
      area = Math.max(
        (aw * ah) / 10000,
        w > 0 && h > 0 && !["concept", "aluminum"].includes(line.kind)
          ? config.minimumArea === "auto"
            ? line.doubleGlazing
              ? 0.7
              : 0.5
            : num(config.minimumArea)
          : 0,
      ),
      real = (w * h) / 10000;
    const edgeParts = line.doubleGlazing ? 2 : 1;
    const subtotal =
      (area * num(line.price) + ml * edgeParts * num(line.edgePrice)) * qty;
    const thickness = num(line.thickness);
    const weight = ["concept", "aluminum"].includes(line.kind)
      ? 0
      : real * qty * thickness * 2.5;
    let energy = 0;
    if (config.energyMode === "kg") energy = weight * num(config.energy);
    if (config.energyMode === "percent")
      energy = (subtotal * num(config.energy)) / 100;
    if (config.energyMode === "m2") energy = area * qty * num(config.energy);
    const extras = supplements(line, area, qty);
    const surcharges = glassSurcharges(line, config, area, qty);
    const surcharge = surcharges.reduce((sum, item) => sum + item.amount, 0);
    return {
      ...extras,
      surcharges,
      surcharge,
      w,
      h,
      aw,
      ah,
      real,
      area,
      ml,
      edgeParts,
      qty,
      weight,
      thickness,
      energy,
      total: subtotal + energy + surcharge + extras.supplementTotal,
    };
  }
  function totals(lines, config = {}) {
    const base = round2(lines.reduce((n, l) => n + calc(l, config).total, 0)),
      rate = config.vat === "" || config.vat == null ? 21 : num(config.vat),
      iva = round2((base * rate) / 100);
    return { base, iva, total: round2(base + iva) };
  }
  // Los importes adicionales son por línea completa, no por pieza.
  // El incremento del vidrio incluye cantos, energía y extras asociados.
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
        if (line.kind === "aluminum") {
          const cost = round2(num(line.amount));
          const sale = round2(cost * (1 + num(line.aluminumMargin) / 100));
          return {
            ...calc({}, {}),
            cost,
            sale,
            margin: round2(sale - cost),
            glassCost: 0,
            extraCost: 0,
            glassSale: sale,
            extraSale: 0,
            separate: false,
            energySale: 0,
          };
        }
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
                : cost
              : cost,
          sale = round2(
            config.priceMode === "fixed" && line.kind !== "concept"
              ? cost +
                  dimensions.area *
                    dimensions.qty *
                    (num(config.fixedPrice) - num(line.price))
              : config.marginScope === "glass"
                ? cost + marginBase * (factor - 1)
                : cost * factor,
          ),
          separate = line.extraMode === "separate",
          extraSale = separate
            ? round2(extraCost * (config.priceMode === "fixed" ? 1 : factor))
            : 0,
          energySale =
            config.energySeparate === true && line.kind !== "concept"
              ? round2(
                  dimensions.energy *
                    (config.priceMode === "fixed" ? 1 : factor),
                )
              : 0;
        return {
          ...dimensions,
          glassCost,
          extraCost,
          cost,
          margin: round2(sale - cost),
          sale,
          glassSale: round2(sale - extraSale - energySale),
          energySale,
          extraSale,
          separate,
        };
      });
    // Sin opciones nuevas se conserva el redondeo de presupuestos anteriores.
    const legacy =
        config.priceMode !== "fixed" &&
        !marginRate &&
        !quote.lines.some(
          (l) => num(l.extraAmount) || ["concept", "aluminum"].includes(l.kind),
        ),
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
  function jobGlassDetails(measures, config = {}) {
    let weight = 0,
      pending = 0;
    for (const m of measures) {
      if (num(m.ancho) <= 0 || num(m.alto) <= 0 || num(m.espesor) <= 0) {
        pending++;
        continue;
      }
      weight += calc({
        w: m.ancho,
        h: m.alto,
        qty: m.cantidad,
        thickness: m.espesor,
      }).weight;
    }
    const rate =
      config.energyMode === "kg" &&
      config.energy !== "" &&
      config.energy != null
        ? num(config.energy)
        : null;
    return {
      weight,
      energy: rate == null ? null : round2(weight * rate),
      rate,
      pending,
    };
  }
  const api = {
    calc,
    surchargeRules,
    totals,
    quoteDetails,
    round2,
    jobGlassDetails,
    inferThickness,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.VSCalculations = api;
})(globalThis);
