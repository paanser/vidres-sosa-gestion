const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseDimension, dimensionToCm } = require("../utils.js");

test("parseDimension acepta valores válidos", () => {
  assert.deepEqual(parseDimension("183"), { ok: true, value: 183 });
  assert.deepEqual(parseDimension("183,5"), { ok: true, value: 183.5 });
  assert.deepEqual(parseDimension("183.5"), { ok: true, value: 183.5 });
  assert.deepEqual(parseDimension("0,5"), { ok: true, value: 0.5 });
  assert.deepEqual(parseDimension("12,55"), { ok: true, value: 12.55 });
});

test("parseDimension rechaza valores no válidos", () => {
  assert.equal(parseDimension("").ok, false);
  assert.equal(parseDimension("   ").ok, false);
  assert.equal(parseDimension("0").ok, false);
  assert.equal(parseDimension("-5").ok, false);
  assert.equal(parseDimension("1,2,3").ok, false);
  assert.equal(parseDimension("1,234").ok, false);
  assert.equal(parseDimension("1234567890123").ok, false);
  assert.equal(parseDimension("abc").ok, false);
  assert.equal(parseDimension("1,").ok, false);
  assert.equal(parseDimension(",5").ok, false);
});

test("dimensionToCm convierte mm a cm y redondea", () => {
  assert.equal(dimensionToCm("183,5", "cm"), 183.5);
  assert.equal(dimensionToCm("1835", "mm"), 183.5);
  assert.equal(dimensionToCm("835", "mm"), 83.5);
  assert.equal(dimensionToCm("83,55", "cm"), 83.55);
});
