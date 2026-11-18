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
    assert.equal(result.total, (minimumArea * 100 + 0.2 * 2 * 10) * 2);
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

test("tarifa fija sustituye solo venta de vidrio y conserva costes, extras e IVA", () => {
  const { quoteDetails } = require("../calculations.js");
  const q = {
    pricing: {
      priceMode: "fixed",
      fixedPrice: 80,
      margin: 200,
      minimumArea: "auto",
      vat: 21,
    },
    lines: [
      {
        w: 120,
        h: 120,
        qty: 2,
        price: 20,
        edgePrice: 5,
        sides: ["top"],
        extraAmount: 10,
        extraMode: "separate",
      },
      { kind: "concept", amount: 30 },
      { kind: "aluminum", amount: 100, aluminumMargin: 20 },
    ],
  };
  q.pricing.marginScope = "glass";
  const d = quoteDetails(q);
  assert.equal(d.lines[0].cost, 79.6);
  assert.equal(d.lines[0].sale, 252.4);
  assert.equal(d.lines[0].extraSale, 10);
  assert.equal(d.totals.base, 402.4);
  assert.equal(d.totals.total, 486.9);
  assert.equal(q.lines[0].price, 20);
  q.pricing.fixedPrice = 0;
  assert.equal(quoteDetails(q).lines[0].sale, 22);
});

test("energía por kg usa superficie real, espesor y cantidad sin mínimo facturable", () => {
  const line = { w: 50, h: 50, qty: 2, thickness: "8", price: 100 };
  const result = calc(line, {
    energyMode: "kg",
    energy: "0,5",
    minimumArea: "1",
  });
  assert.equal(result.weight, 10);
  assert.equal(result.energy, 5);
  assert.equal(result.area, 1);
  assert.equal(result.total, 205);
  assert.equal(
    calc({ ...line, kind: "aluminum" }, { energyMode: "kg", energy: 1 }).energy,
    0,
  );
  assert.equal(
    calc({ ...line, kind: "concept" }, { energyMode: "kg", energy: 1 }).energy,
    0,
  );
});

test("doble 1 × 1: 8 metros de canto; energía solo por kilos de vidrio", () => {
  const line = {
    w: 100,
    h: 100,
    qty: 1,
    thickness: 8,
    doubleGlazing: true,
    edgePrice: 3,
    sides: ["top", "bottom", "left", "right"],
  };
  // Las opciones antiguas de energía del pulido y número de piezas se ignoran.
  const pricing = { energyMode: "kg", energy: "0,5", energyPolishing: true };
  const both = calc({ ...line, edgeParts: "1", polishedThickness: 4 }, pricing);
  assert.equal(both.ml, 4);
  assert.equal(both.edgeParts, 2);
  assert.equal(both.weight, 20);
  assert.equal(both.energy, 10);
  assert.equal(both.total, 34); // 4 m × 2 vidrios × 3 € + 20 kg × 0,5 €
  const unpolished = calc({ ...line, sides: [] }, pricing);
  assert.equal(unpolished.energy, both.energy);
  assert.equal(unpolished.weight, both.weight);
  const twoSides = calc({ ...line, sides: ["top", "left"] }, pricing);
  assert.equal(twoSides.ml * twoSides.edgeParts, 4);
  assert.equal(twoSides.total, 22);
  const mono = calc({ ...line, doubleGlazing: false, thickness: 4 }, pricing);
  assert.equal(mono.edgeParts, 1);
  assert.equal(mono.weight, 10);
  assert.equal(mono.energy, 5);
  assert.equal(mono.total, 17);
  const twoUnits = calc({ ...line, qty: 2 }, pricing);
  assert.equal(twoUnits.total, 68);
  assert.equal(twoUnits.energy, 20);
  assert.equal(
    quoteDetails({ lines: [line], pricing: { ...pricing, vat: 21 } }).totals
      .total,
    41.14,
  );
});

test("recargo separado conserva venta, coste, IVA y suma de conceptos", () => {
  const line = {
    w: 83,
    h: 100,
    qty: 3,
    thickness: 8,
    price: 52.37,
    extraAmount: 17,
    extraMode: "separate",
  };
  for (const profile of [
    { marginScope: "glass", margin: 20 },
    { priceMode: "fixed", fixedPrice: 85 },
    { margin: 20 },
    { marginMode: "sale", margin: 20 },
    {},
  ]) {
    const pricing = { ...profile, energyMode: "kg", energy: "0,43", vat: 21 };
    const included = quoteDetails({ lines: [line], pricing });
    const separate = quoteDetails({
      lines: [line],
      pricing: { ...pricing, energySeparate: true },
    });
    assert.deepEqual(separate.totals, included.totals);
    assert.equal(separate.cost, included.cost);
    assert.equal(separate.margin, included.margin);
    const a = separate.lines[0];
    assert.ok(a.energySale > 0);
    assert.equal(
      Math.round((a.glassSale + a.extraSale + a.energySale) * 100),
      Math.round(a.sale * 100),
    );
    assert.equal(included.lines[0].energySale, 0);
  }
});

test("expediente: peso real sin mínimo, tarifa decimal y piezas incompletas", () => {
  const { jobGlassDetails } = require("../calculations.js");
  const measures = [{ ancho: 50, alto: 40, cantidad: 2, espesor: 8 }];
  const config = { energyMode: "kg", energy: "0,5", minimumArea: 1 };
  assert.deepEqual(jobGlassDetails(measures, config), {
    weight: 8,
    energy: 4,
    rate: 0.5,
    pending: 0,
  });
  assert.equal(
    jobGlassDetails([...measures, { ancho: 100, alto: 100 }], config).pending,
    1,
  );
  assert.equal(jobGlassDetails(measures, {}).energy, null);
  assert.equal(
    jobGlassDetails(measures, { energyMode: "percent", energy: 5 }).energy,
    null,
  );
  assert.equal(
    jobGlassDetails(measures, { energyMode: "kg", energy: 0 }).energy,
    0,
  );
});

test("espesor desde la composición: excluye cámara y códigos de capas", () => {
  const { inferThickness } = require("../calculations.js");
  assert.equal(inferThickness({ doubleGlazing: true }), 8);
  assert.equal(
    inferThickness({ doubleGlazing: true, doubleComposition: "6/20/4" }),
    10,
  );
  assert.equal(
    inferThickness({
      doubleGlazing: true,
      faceOne: "sun",
      faceOneName: "Guardian Sun 44.2 P2A",
      faceTwo: "float",
      faceTwoName: "Float 6",
    }),
    14,
  );
  for (const [glass, mm] of [
    ["Float 6", 6],
    ["Laminado 1010.2", 20],
    ["Laminado 4+4", 8],
    ["SN 70/35 44.1", 8],
    ["Vidrio sin espesor", 0],
    ["SN 70/35", 0],
  ])
    assert.equal(inferThickness({ glass }), mm, glass);
});

test("espesor en nombres de tarifa completos y laminado triple", () => {
  const { inferThickness } = require("../calculations.js");
  for (const [glass, mm] of [
    ["Tarifa Reuglass · Float 4 · MF", 4],
    ["Tarifa Reuglass · Guardian Sun 44.2 Acustico P2A · Sustituciones", 8],
    ["Tarifa Reuglass · Laminado 1010.2 · MF", 20],
    ["Tarifa Reuglass · Laminado 666.2 · MF", 18],
    ["Tarifa Reuglass · Pyrobel EI-30 · MF", 0],
  ])
    assert.equal(inferThickness({ glass }), mm, glass);
});

test("medidas especiales: límites estrictos del doble y porcentaje mayor por pieza", () => {
  const config = { specialSizeMode: "auto", minimumArea: "auto" };
  const line = { doubleGlazing: true, price: 100, qty: 1 };
  for (const [w, h, rate] of [
    [240, 100, 0],
    [240.1, 100, 20],
    [100, 240.1, 20],
    [200, 200, 0],
    [200, 200.1, 25],
    [200, 250, 25],
    [200, 250.1, 50],
    [200, 400, 50],
    [200, 400.1, 100],
    [160, 250, 20],
    [240, 240, 50],
  ]) {
    const result = calc({ ...line, w, h }, config);
    assert.equal(result.sizeRate, rate, `${w} × ${h}`);
    assert.equal(result.sizeSurcharge, (result.area * 100 * rate) / 100);
  }
  const small = calc({ ...line, w: 100, h: 100, qty: 10 }, config);
  assert.equal(
    small.sizeRate,
    0,
    "no usa la superficie conjunta de la cantidad",
  );
  const large = { ...line, w: 250, h: 200 };
  for (const specialSizeMode of [undefined, "none"]) {
    const result = calc(large, { specialSizeMode });
    assert.equal(result.detectedSizeRate, 25);
    assert.equal(result.sizeSurcharge, 0);
    assert.equal(result.total, result.area * 100);
  }
  for (const patch of [
    { doubleGlazing: false },
    { kind: "concept" },
    { kind: "aluminum" },
    { w: 0 },
  ])
    assert.equal(calc({ ...large, ...patch }, config).sizeSurcharge, 0);
});

test("recargo dimensional solo sobre vidrio, con margen, tarifa fija, energía y extras", () => {
  const line = {
    doubleGlazing: true,
    w: 300,
    h: 300,
    qty: 2,
    price: 100,
    sides: ["top"],
    edgePrice: 10,
    thickness: 8,
    extraAmount: 30,
  };
  const config = {
    specialSizeMode: "auto",
    marginScope: "glass",
    margin: 20,
    energyMode: "kg",
    energy: 0.5,
    vat: 21,
  };
  const result = calc(line, config);
  assert.equal(result.sizeSurcharge, 1800);
  assert.equal(result.energy, 180);
  assert.equal(result.total, 3900); // Vidrio 1800 + recargo 1800 + cantos 120 + energía 180.
  const quote = { lines: [line], pricing: config };
  assert.deepEqual(quoteDetails(quote).totals, {
    base: 4290,
    iva: 900.9,
    total: 5190.9,
  });
  assert.equal(
    quoteDetails({
      ...quote,
      pricing: { ...config, priceMode: "fixed", fixedPrice: 80 },
    }).totals.base,
    3570,
  );
  assert.equal(calc(line, { ...config, specialSizeMode: "none" }).energy, 180);
});
