const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calc, totals, quoteDetails } = require("../calculations.js");
const { round6, num } = require("../utils.js");
test("redondeo comercial y múltiplos exactos", () => {
  assert.equal(round6(180), 180);
  assert.equal(round6(83), 84);
  assert.equal(round6(84), 84);
  assert.equal(round6("83,5"), 84);
  assert.ok(round6(0) === 0);
});
test("área real y aplicada", () => {
  const v = calc({ w: 180, h: 83, qty: 1 });
  assert.equal(v.real, 1.494);
  assert.equal(v.area, 1.512);
});
test("cada canto usa dimensiones reales y sin duplicar lados", () => {
  for (const [side, ml] of [
    ["top", 1.8],
    ["bottom", 1.8],
    ["left", 0.83],
    ["right", 0.83],
  ])
    assert.equal(calc({ w: 180, h: 83, sides: [side, side] }).ml, ml);
  assert.equal(
    calc({ w: 180, h: 83, sides: ["top", "bottom", "left", "right"] }).ml,
    5.26,
  );
});
test("cantidad y redondeo fiscal", () => {
  const line = {
    w: 101,
    h: 65,
    qty: 2,
    price: 100,
    edgePrice: 10,
    sides: ["top", "left"],
  };
  assert.ok(Math.abs(calc(line).total - 167.84) < 1e-9);
  assert.deepEqual(totals([line]), { base: 167.84, iva: 35.25, total: 203.09 });
  assert.deepEqual(totals([{ w: 6, h: 6, price: 1, qty: 1 }]), {
    base: 0,
    iva: 0,
    total: 0,
  });
});
test("vacíos negativos y coma decimal sin NaN", () => {
  assert.equal(num("-10"), 0);
  assert.equal(num("83,5"), 83.5);
  assert.equal(calc({ w: "", h: -10, price: -30 }).total, 0);
  assert.deepEqual(totals([]), { base: 0, iva: 0, total: 0 });
});
test("IVA y recargo explícito por porcentaje o m²", () => {
  const line = { w: 100, h: 100, price: 100, qty: 2 };
  assert.deepEqual(
    totals([line], { vat: 10, energy: 10, energyMode: "percent" }),
    { base: 228.89, iva: 22.89, total: 251.78 },
  );
  assert.deepEqual(totals([line], { vat: 0, energy: 5, energyMode: "m2" }), {
    base: 218.48,
    iva: 0,
    total: 218.48,
  });
  assert.deepEqual(
    totals([line], { energy: 50, energyMode: "pending" }),
    totals([line]),
  );
});

test("presupuestos antiguos conservan importes y redondeo fiscal", () => {
  const lines = [
    { w: 6, h: 6, price: 1 },
    { w: 6, h: 6, price: 1 },
  ];
  assert.deepEqual(quoteDetails({ lines }).totals, totals(lines));
  assert.deepEqual(
    quoteDetails({ lines, pricing: { vat: 0, margin: "" } }).totals,
    totals(lines, { vat: 0 }),
  );
});

test("margen seleccionable sobre coste o venta y conceptos sin tarifa ni medidas", () => {
  const q = {
    lines: [
      {
        kind: "concept",
        description: "Trabajo fuera de tarifa",
        amount: "100",
      },
    ],
    pricing: { margin: 20, marginMode: "cost", vat: 21 },
  };
  assert.deepEqual(quoteDetails(q).totals, {
    base: 120,
    iva: 25.2,
    total: 145.2,
  });
  q.pricing.marginMode = "sale";
  assert.deepEqual(quoteDetails(q).totals, {
    base: 125,
    iva: 26.25,
    total: 151.25,
  });
  assert.equal(quoteDetails(q).margin, 25);
  q.pricing.margin = 100;
  assert.ok(!Number.isFinite(quoteDetails(q).totals.total));
  q.pricing.margin = 0;
  assert.deepEqual(quoteDetails(q).totals, { base: 100, iva: 21, total: 121 });
});

test("margen sobre coste, importe libre por línea y presentación sin cambiar el total", () => {
  const q = {
    lines: [{ w: 120, h: 120, qty: 2, price: 100, extraAmount: "50,50" }],
    pricing: { margin: "20", vat: 21 },
  };
  const included = quoteDetails(q);
  assert.equal(included.cost, 338.5);
  assert.equal(included.margin, 67.7);
  assert.deepEqual(included.totals, { base: 406.2, iva: 85.3, total: 491.5 });
  assert.equal(included.lines[0].glassSale, 406.2);
  assert.equal(included.lines[0].extraSale, 0);
  q.lines[0].extraMode = "separate";
  const separate = quoteDetails(q);
  assert.deepEqual(separate.totals, included.totals);
  assert.equal(separate.lines[0].glassSale, 345.6);
  assert.equal(separate.lines[0].extraSale, 60.6);
});

test("margen incluye cantos y energía; suma de conceptos coincide con base y total", () => {
  const q = {
    lines: [
      {
        w: 83,
        h: 101,
        qty: 3,
        price: 42.17,
        edgePrice: 5.23,
        sides: ["top"],
        extraAmount: 19.99,
        extraMode: "separate",
      },
      { w: 120, h: 60, qty: 1, price: 70.15, extraAmount: 12.34 },
    ],
    pricing: { margin: "12,5", energy: 5, energyMode: "percent", vat: 10 },
  };
  const result = quoteDetails(q);
  const { round2 } = require("../calculations.js");
  assert.equal(
    result.lines[0].glassCost,
    round2(calc(q.lines[0], q.pricing).total),
  );
  assert.equal(
    round2(result.lines.reduce((n, l) => n + l.glassSale + l.extraSale, 0)),
    result.totals.base,
  );
  assert.equal(round2(result.cost + result.margin), result.totals.base);
  assert.equal(result.totals.iva, round2(result.totals.base * 0.1));
});

test("incremento solo sobre vidrio, sin margen en cantos, energía ni mano de obra", () => {
  const q = {
    pricing: {
      marginScope: "glass",
      marginMode: "cost",
      margin: 20,
      energyMode: "percent",
      energy: 10,
      vat: 21,
    },
    lines: [
      {
        w: 120,
        h: 120,
        qty: 2,
        price: 100,
        edgePrice: 10,
        sides: ["top"],
        extraAmount: 50,
        extraMode: "separate",
      },
      { kind: "concept", description: "Mano de obra", amount: 100 },
    ],
  };
  const result = quoteDetails(q);
  assert.equal(result.margin, 57.6);
  assert.equal(result.lines[0].extraSale, 50);
  assert.equal(result.lines[1].sale, 100);
  assert.equal(result.cost, 493.2);
  assert.deepEqual(result.totals, { base: 550.8, iva: 115.67, total: 666.47 });
  q.lines[0].extraMode = "included";
  assert.deepEqual(quoteDetails(q).totals, result.totals);
  q.pricing.margin = 100;
  assert.equal(quoteDetails(q).margin, 288);
});

test("aluminio: incremento propio, vidrio independiente e IVA sobre venta", () => {
  const q = {
    pricing: { margin: 10, marginScope: "glass", vat: 21 },
    lines: [
      {
        kind: "aluminum",
        description: "Puerta",
        amount: 800,
        aluminumMargin: 25,
      },
      { w: 100, h: 100, qty: 2, price: 50 },
      { kind: "concept", description: "Montaje", amount: 100 },
    ],
  };
  const a = quoteDetails(q);
  assert.equal(a.lines[0].sale, 1000);
  assert.equal(a.lines[0].margin, 200);
  assert.equal(a.lines[1].sale, 114.44);
  assert.equal(a.lines[2].sale, 100);
  assert.equal(a.totals.base, 1214.44);
  assert.equal(a.totals.total, 1469.47);
  assert.equal(
    quoteDetails({
      lines: [{ kind: "aluminum", amount: 800, aluminumMargin: 0 }],
    }).totals.base,
    800,
  );
});

test("aluminio devuelve desglose completo sin alterar coste ni venta", () => {
  const { quoteDetails } = require("../calculations.js");
  const result = quoteDetails({
    lines: [{ kind: "aluminum", amount: 560, aluminumMargin: 100 }],
  });
  const line = result.lines[0];
  assert.equal(line.cost, 560);
  assert.equal(line.sale, 1120);
  assert.equal(line.glassCost, 0);
  assert.equal(line.extraCost, 0);
  assert.equal(line.glassSale, 1120);
  assert.equal(line.extraSale, 0);
  assert.equal(line.separate, false);
  assert.equal(result.totals.total, 1355.2);
});

test("metraje mínimo por pieza: automático, selección manual y presupuestos anteriores", () => {
  const line = {
    w: 20,
    h: 30,
    qty: 2,
    price: 100,
    sides: ["top"],
    edgePrice: 10,
  };
  assert.equal(calc(line, { minimumArea: "auto" }).area, 0.5);
  assert.equal(
    calc({ ...line, doubleGlazing: true }, { minimumArea: "auto" }).area,
    0.7,
  );
  for (const minimumArea of [0.35, 0.5, 0.7, 1]) {
    const result = calc({ ...line, doubleGlazing: true }, { minimumArea });
    assert.equal(result.area, minimumArea);
    assert.equal(result.ml, 0.2);
    assert.equal(result.total, (minimumArea * 100 + 2) * 2);
  }
  assert.equal(calc(line).area, 0.072);
  assert.equal(
    calc({ ...line, w: 120, h: 120 }, { minimumArea: 1 }).area,
    1.44,
  );
  assert.equal(calc({}, { minimumArea: "auto" }).area, 0);
  assert.equal(calc({ kind: "concept" }, { minimumArea: "auto" }).total, 0);
  const q = {
    pricing: { minimumArea: "auto", margin: 20, marginScope: "glass", vat: 21 },
    lines: [
      { w: 20, h: 30, price: 100 },
      { w: 20, h: 30, price: 100, doubleGlazing: true },
    ],
  };
  assert.deepEqual(quoteDetails(q).totals, {
    base: 144,
    iva: 30.24,
    total: 174.24,
  });
});
