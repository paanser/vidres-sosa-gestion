const { test } = require("node:test");
const assert = require("node:assert/strict");
const { num, priceError } = require("../utils.js");
test("importes españoles y errores de campo sin convertir entradas inválidas a cero", () => {
  for (const [value, expected] of [
    ["1.234,56", 1234.56],
    ["1234,56", 1234.56],
    ["1234.56", 1234.56],
    ["0", 0],
  ]) {
    assert.equal(num(value), expected);
    assert.equal(priceError(value), "");
  }
  for (const value of ["-1", "-1.234,56", "abc", "Infinity", "1,2,3"])
    assert.ok(priceError(value));
});

test("formulario bloquea importes negativos y texto con error del campo", async () => {
  const vm = require("node:vm"),
    fs = require("node:fs");
  const ctx = { console, alert() {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(require.resolve("../utils.js"), "utf8"), ctx);
  let error = "",
    reports = 0,
    saves = 0;
  const input = {
    value: "-1",
    validity: {},
    setCustomValidity(message) {
      error = message;
    },
    setAttribute() {},
    reportValidity() {
      reports++;
    },
  };
  const form = {
    dataset: {},
    querySelectorAll: (selector) =>
      selector === '[type="submit"]' ? [] : [input],
  };
  const submit = ctx.VSForms.guard(async () => {
    saves++;
  });
  for (const value of ["-1", "abc"]) {
    input.value = value;
    await submit({ currentTarget: form, preventDefault() {} });
    assert.ok(error);
  }
  assert.equal(reports, 2);
  assert.equal(saves, 0);
  input.value = "1.234,56";
  await submit({ currentTarget: form, preventDefault() {} });
  assert.equal(error, "");
  assert.equal(saves, 1);
});
