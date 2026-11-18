const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../calculations.js");
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
const rules = Object.fromEntries(C.surchargeRules.map((r) => [r.id, true]));
const config = {
  minimumArea: "auto",
  surchargeRules: rules,
  marginScope: "glass",
  margin: 20,
  vat: 21,
};
const line = {
  doubleGlazing: true,
  w: 250,
  h: 200,
  price: 40,
  qty: 1,
  thickness: 8,
};
const applied = (l) =>
  C.calc({ ...line, ...l }, config)
    .surcharges.filter((r) => r.applied)
    .map((r) => r.id);
test("umbrales estrictos por pieza y un solo tramo de superficie", () => {
  assert.deepEqual(applied({ w: 200, h: 200 }), []);
  assert.deepEqual(applied({ w: 240, h: 100 }), []);
  assert.deepEqual(applied({ w: 240.001, h: 100 }), ["longSide"]);
  assert.deepEqual(applied({}), ["longSide", "area4"]); // exactamente 5 m²
  assert.deepEqual(applied({ w: 250.001 }), ["longSide", "area5"]);
  assert.deepEqual(applied({ w: 400 }), ["longSide", "area5"]); // exactamente 8 m²
  assert.deepEqual(applied({ w: 400.001 }), ["longSide", "area8"]);
  assert.deepEqual(applied({ w: 100, h: 100, qty: 10 }), []);
});
test("suma de recargos sin cantos ni energía y casillas reversibles", () => {
  const l = { ...line, qty: 2, edgePrice: 10, sides: ["top"], thickness: 8 };
  const c = C.calc(l, { ...config, energyMode: "kg", energy: 0.5 });
  close(c.surcharge, 185.0688); // (20 % + 25 %) de 205,632 € × 2 (medidas comerciales)
  assert.equal(c.energy, 100);
  close(c.total, 796.3328); // vidrio 411,264 + cantos 100 + energía 100 + recargos 185,0688
  const off = C.calc(l, {
    ...config,
    surchargeRules: { ...rules, area4: false },
  });
  close(off.surcharge, 82.2528);
  assert.equal(off.surcharges.find((r) => r.id === "area4").applied, false);
  close(C.calc(l, {}).surcharge, c.surcharge); // presupuestos anteriores sin reglas guardadas
  assert.equal(C.calc({ ...l, doubleGlazing: false }, config).surcharge, 0);
});
test("mínimos y cantidades de formas por pieza, sin recargo para piezas incompletas", () => {
  const l = {
    ...line,
    w: 20,
    h: 20,
    qty: 3,
    surcharge_angles: 2,
    surcharge_curves: 1,
    surcharge_irregular: true,
  };
  const c = C.calc(l, config);
  assert.equal(c.area, 0.7);
  assert.equal(c.surcharge, (24 + 30 + 75) * 3);
  assert.equal(C.calc({ ...l, w: "" }, config).surcharge, 0);
  for (const kind of ["concept", "aluminum"])
    assert.equal(C.calc({ ...l, kind }, config).surcharge, 0);
});
test("recargos en venta, IVA, tarifa fija y FacturaDirecta", async () => {
  const q = { lines: [line], pricing: config };
  const d = C.quoteDetails(q);
  close(d.lines[0].surcharge, 92.5344);
  assert.equal(d.cost, 298.17);
  assert.equal(d.margin, 59.63);
  assert.deepEqual(d.totals, { base: 357.8, iva: 75.14, total: 432.94 });
  assert.equal(
    C.quoteDetails({
      ...q,
      pricing: { ...config, priceMode: "fixed", fixedPrice: 60 },
    }).totals.base,
    400.99,
  );
  const { quoteInvoice } = await import("../worker/facturadirecta.js");
  const invoice = quoteInvoice(q);
  assert.equal(invoice.lines[0].unitPrice, "357.80");
  const { checked, KEYS } = await import("../worker/data.js");
  const saved = { ...q, id: "P-1", client: "Prueba", date: "2026-11-18" };
  assert.doesNotThrow(() => checked({ [KEYS.presupuestos]: [saved] }));
  assert.throws(() =>
    checked({
      [KEYS.presupuestos]: [
        { ...saved, pricing: { ...config, surchargeRules: { area4: "true" } } },
      ],
    }),
  );
  assert.throws(() =>
    checked({
      [KEYS.presupuestos]: [
        { ...saved, lines: [{ ...line, surcharge_angles: 1.5 }] },
      ],
    }),
  );
});
