const test = require("node:test");
const assert = require("node:assert/strict");

test("FacturaDirecta conserva el recargo separado y los importes del presupuesto", async () => {
  const { quoteInvoice } = await import("../worker/facturadirecta.js");
  const quote = {
    id: "P-1",
    client: "Prueba",
    date: "2026-11-18",
    pricing: {
      energyMode: "kg",
      energy: 0.5,
      marginScope: "glass",
      margin: 20,
      vat: 21,
    },
    lines: [
      {
        w: 100,
        h: 100,
        thickness: 8,
        qty: 2,
        price: 50,
        extraMode: "separate",
        extraAmount: 25,
        extraDescription: "Montaje",
      },
    ],
  };
  const included = quoteInvoice(quote);
  const separate = quoteInvoice({
    ...quote,
    pricing: { ...quote.pricing, energySeparate: true },
  });
  assert.deepEqual(separate.totals, included.totals);
  assert.deepEqual(
    separate.lines.map((l) => l.unitPrice),
    ["124.85", "20.00", "25.00"],
  );
  assert.equal(separate.lines[1].description, "Recargo energético");
  const { checked, KEYS } = await import("../worker/data.js");
  for (const energySeparate of [true, false])
    assert.doesNotThrow(() =>
      checked({
        [KEYS.presupuestos]: [
          { ...quote, pricing: { ...quote.pricing, energySeparate } },
        ],
      }),
    );
  assert.throws(() =>
    checked({
      [KEYS.presupuestos]: [
        {
          ...quote,
          id: "P-1",
          date: "2026-11-18",
          pricing: { ...quote.pricing, energySeparate: "true" },
        },
      ],
    }),
  );
});
