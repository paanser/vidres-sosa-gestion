const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync("tariffs.js", "utf8"), context);
const tariffs = context.window.vidresTariffs;
test("Reuglass preserves net price columns and omits unavailable prices", () => {
  const items = tariffs.catalog();
  assert.equal(items.length, 277);
  const price = (name) =>
    items.find((item) => item.name === `Tarifa Reuglass · ${name}`)?.price;
  assert.equal(price("Float 4 · MF"), 16.72);
  assert.equal(price("Float 4 · Sustituciones"), undefined);
  assert.equal(price("Float 4 · Templado"), 29.95);
  assert.equal(price("Climaguard Premium 4 · Sustituciones"), 9.44);
  assert.equal(price("Laminado 33.2 · Templado"), undefined);
  assert.equal(price("Laminado 1212.2 · Templado"), 300);
  assert.equal(price("1010.2 DOT translucido · MF"), 222.75);
  assert.ok(items.every((item) => item.price > 0 && item.edge === 0));
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
});
test("Reuglass coexists with imported tariffs without mutating them", () => {
  const imported = [
    { id: "custom", name: "Existing glass", price: 42, edge: 3 },
  ];
  const before = JSON.stringify(imported);
  assert.equal(tariffs.catalog(imported).length, 278);
  assert.equal(JSON.stringify(imported), before);
  assert.equal(tariffs.catalog([]).length, 277);
  assert.match(tariffs.documentPanel(), /recargos/);
  assert.ok(fs.existsSync("documents/tarifa-reuglass.pdf"));
});
