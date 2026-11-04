const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  roundTo,
  calcGlass,
  calcLine,
  treatmentPrice,
  isCounted,
  quoteTotals,
  planchas,
} = require("../calculations.js");

test("roundTo redondea al múltiplo configurable", () => {
  assert.equal(roundTo(180, 6), 180);
  assert.equal(roundTo(83, 6), 84);
  assert.equal(roundTo(83, 5), 85);
  assert.equal(roundTo(83, 10), 90);
  assert.equal(roundTo(83.5, 0), 83.5); // sin redondeo
  assert.equal(roundTo(0, 6), 0);
});

test("calcGlass 180×83 con redondeo 6 da medida aplicada 180×84", () => {
  const v = calcGlass({ w: 180, h: 83, qty: 1, redondeo: 6 });
  assert.equal(v.aw, 180);
  assert.equal(v.ah, 84);
  assert.equal(v.area, 1.512);
  assert.equal(v.real, 1.494);
});

test("calcGlass aplica superficie mínima facturable", () => {
  const v = calcGlass({
    w: 10,
    h: 10,
    precioM2: 100,
    minimoM2: 0.5,
    qty: 1,
    redondeo: 0,
  });
  assert.equal(v.area, 0.01);
  assert.equal(v.facturable, 0.5);
  assert.equal(v.subtotal, 50);
});

test("calcGlass aplica importe mínimo facturable", () => {
  const v = calcGlass({
    w: 10,
    h: 10,
    precioM2: 100,
    minimoImporte: 30,
    qty: 1,
    redondeo: 0,
  });
  assert.equal(v.subtotal, 30);
});

test("tratamientos: ml, unidad, m2 y fijo", () => {
  const dims = { w: 100, h: 100, aw: 102, ah: 102, area: 1.5, qty: 1 };
  assert.equal(
    treatmentPrice({ forma: "ml", precio: 6, sides: ["top", "bottom"] }, dims),
    12,
  );
  assert.equal(
    treatmentPrice({ forma: "unidad", precio: 5, cantidad: 3 }, dims),
    15,
  );
  assert.equal(treatmentPrice({ forma: "m2", precio: 10 }, dims), 15);
  assert.equal(treatmentPrice({ forma: "fijo", precio: 45 }, dims), 45);
});

test("peso estimado: espesor mm × 2.5 kg/m²", () => {
  const v = calcGlass({ w: 100, h: 100, espesor: 8, qty: 2, redondeo: 0 });
  assert.equal(v.pesoPieza, 20);
  assert.equal(v.peso, 40);
});

test("líneas de mano de obra, material y servicio", () => {
  assert.equal(calcLine({ tipo: "mano_obra", horas: 2, tarifa: 30 }).total, 60);
  assert.equal(
    calcLine({ tipo: "material", cantidad: 5, precio: 4 }).total,
    20,
  );
  assert.equal(calcLine({ tipo: "servicio", precio: 120 }).total, 120);
  assert.equal(calcLine({ tipo: "texto", nombre: "Nota" }).total, 0);
});

test("opcional y alternativa no suman al total", () => {
  const lineas = [
    { tipo: "servicio", precio: 100 },
    { tipo: "servicio", precio: 50, opcional: true },
    { tipo: "servicio", precio: 80, alternativa: "B" },
  ];
  assert.equal(isCounted(lineas[0]), true);
  assert.equal(isCounted(lineas[1]), false);
  assert.equal(isCounted(lineas[2]), false);
  const t = quoteTotals(lineas, { vat: 21 });
  assert.equal(t.base, 100);
  assert.equal(t.iva, 21);
  assert.equal(t.total, 121);
});

test("planchas: estimación de planchas y merma", () => {
  // 3 piezas de 102×102 cm en plancha de 321×225 cm: caben 3×2=6 por plancha.
  const r = planchas(
    [{ tipo: "vidrio", w: 100, h: 100, qty: 3, redondeo: 6 }],
    { planchaW: 321, planchaH: 225 },
  );
  assert.equal(r.planchas, 1);
  assert.ok(Math.abs(r.usadaM2 - 3.12) < 0.01);
});
