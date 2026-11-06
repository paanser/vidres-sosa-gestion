const { test } = require("node:test");
const assert = require("node:assert/strict");

test("servidor: admite presupuestos antiguos, conceptos libres y margen sin relajar la validación", async () => {
  const { checked, KEYS } = await import("../worker/data.js");
  const glass = { w: 120, h: 60, qty: 1, price: 100, sides: [] };
  const q = { id: "P-PRUEBA", client: "Cliente ficticio", lines: [glass] };
  const validate = (quote) => checked({ [KEYS.presupuestos]: [quote] });
  assert.doesNotThrow(() => validate(q));
  const concept = {
    kind: "concept",
    description: "Montaje especial",
    amount: 100,
  };
  assert.doesNotThrow(() =>
    validate({
      ...q,
      lines: [concept],
      pricing: { margin: 20, marginMode: "sale" },
    }),
  );
  assert.doesNotThrow(() =>
    validate({
      ...q,
      lines: [
        {
          ...glass,
          extraDescription: "Transporte",
          extraAmount: 20,
          extraMode: "separate",
        },
      ],
      pricing: { margin: "", marginMode: "cost" },
    }),
  );
  for (const pricing of [
    { margin: -1 },
    { margin: "no" },
    { margin: 100, marginMode: "sale" },
    { margin: 101, marginMode: "sale" },
    { marginMode: "otro" },
  ])
    assert.throws(() => validate({ ...q, pricing }));
  for (const line of [
    { ...concept, amount: -1 },
    { ...concept, amount: "" },
    { ...concept, description: " " },
    { ...concept, description: "x".repeat(301) },
    { ...glass, extraAmount: -1 },
    { ...glass, extraAmount: 10, extraMode: "separate" },
    { ...glass, extraMode: "otro" },
    { ...glass, w: 0 },
    { ...glass, kind: "otro" },
  ])
    assert.throws(() => validate({ ...q, lines: [line] }));
});
