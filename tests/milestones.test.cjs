const { test } = require("node:test");
const assert = require("node:assert/strict");
test("hitos: conserva expedientes antiguos y valida booleanos y abreviaturas en ambas colecciones", async () => {
  const { checked, KEYS } = await import("../worker/data.js");
  const job = { id: "J", cliente: "Cliente", estado: "Pendiente" };
  const quote = {
    id: "Q",
    client: "Cliente",
    lines: [{ kind: "concept", description: "Montaje", amount: 100 }],
  };
  for (const [key, record] of [
    [KEYS.trabajos, job],
    [KEYS.presupuestos, quote],
  ]) {
    assert.doesNotThrow(() => checked({ [key]: [record] }));
    const hitos = { M: true, F: false, PM: true, MO: false };
    assert.deepEqual(
      checked({ [key]: [{ ...record, hitos }] })[key][0].hitos,
      hitos,
    );
    for (const invalid of [[], "M", { M: 1 }, { MO: "false" }, { X: true }])
      assert.throws(() => checked({ [key]: [{ ...record, hitos: invalid }] }));
  }
});
