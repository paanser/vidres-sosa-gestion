const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  parseMeters,
  formatMeters,
  formatMeasure,
  dimensionToCm,
  round6,
} = require("../utils.js");
const { calc, totals, quoteDetails } = require("../calculations.js");

test("metros: punto y coma son decimales y se calculan milímetros enteros", () => {
  for (const [text, mm] of [
    ["1.234", 1234],
    ["1,234", 1234],
    ["1.23", 1230],
    ["1.5", 1500],
    ["0.830", 830],
    ["2", 2000],
    ["0.001", 1],
    [" 1.234 ", 1234],
  ]) {
    const result = parseMeters(text);
    assert.equal(result.ok, true, text);
    assert.equal(result.mm, mm, text);
    assert.equal(result.cm, mm / 10);
    assert.equal(dimensionToCm(text, "m"), mm / 10);
  }
});
test("metros: rechaza entradas ambiguas o inválidas y pide confirmar más de 6 m", () => {
  for (const text of [
    "",
    " ",
    "0",
    "0.000",
    "-1",
    "1.2345",
    "1.2.3",
    "1,2.3",
    "abc",
    "1e3",
    "Infinity",
    "1.",
    "1 234",
    "9007199254740991",
  ]) {
    assert.equal(parseMeters(text).ok, false, text);
    assert.equal(parseMeters(text).cm, null);
  }
  assert.equal(
    parseMeters("1.2345").error,
    "Máximo 3 decimales: son milímetros",
  );
  assert.equal(parseMeters("6").confirmation, "");
  assert.equal(parseMeters("6.001").confirmation, "¿Seguro? 6.001 m");
  assert.equal(parseMeters("12").confirmation, "¿Seguro? 12 m");
});
test("formatos de medidas y redondeo comercial sin cambios", () => {
  assert.equal(formatMeters(123.4), "1.234");
  assert.equal(formatMeters(83), "0.830");
  assert.equal(formatMeters(200), "2.000");
  assert.equal(formatMeasure(123.4), "1 m 23 cm 4 mm");
  assert.equal(formatMeasure(83), "83 cm");
  assert.equal(formatMeasure(200), "2 m");
  assert.equal(formatMeasure(0.1), "1 mm");
  assert.equal(round6(123.4), 126);
});
test("introducir metros conserva los cálculos antiguos percent/m2/pending", () => {
  const line = {
    w: 123.4,
    h: 83,
    qty: 3,
    price: 50,
    edgePrice: 6,
    sides: ["top", "bottom"],
  };
  const entered = {
    ...line,
    w: parseMeters("1.234").cm,
    h: parseMeters("0.830").cm,
  };
  for (const energyMode of ["percent", "m2", "pending"]) {
    const pricing = { energyMode, energy: 7, vat: 21 };
    assert.deepEqual(calc(entered, pricing), calc(line, pricing));
    assert.deepEqual(totals([entered], pricing), totals([line], pricing));
    assert.deepEqual(
      quoteDetails({ lines: [entered], pricing }),
      quoteDetails({ lines: [line], pricing }),
    );
  }
});
test("el servidor acepta m y conserva cm/mm; rechaza unidades desconocidas", async () => {
  const { checked, KEYS } = await import("../worker/data.js");
  for (const unit of ["m", "cm", "mm"])
    assert.equal(
      checked({ [KEYS.configuracion]: { unit } })[KEYS.configuracion].unit,
      unit,
    );
  assert.throws(() => checked({ [KEYS.configuracion]: { unit: "km" } }));
});
