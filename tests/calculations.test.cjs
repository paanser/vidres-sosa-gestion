const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calc, totals } = require("../calculations.js");
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
