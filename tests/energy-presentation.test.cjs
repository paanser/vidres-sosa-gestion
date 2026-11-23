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
    ["124.85", "25.00", "24.00"],
  );
  assert.equal(separate.lines[1].description, "Montaje");
  assert.equal(separate.lines[2].description, "Recargo energético");
  const described = {
    ...quote,
    lines: [{ ...quote.lines[0], extraMode: "description" }],
  };
  const describedInvoice = quoteInvoice(described);
  assert.deepEqual(describedInvoice.totals, included.totals);
  assert.equal(describedInvoice.lines[0].unitPrice, "173.85");
  assert.deepEqual(describedInvoice.lines[1], {
    description: "Montaje",
    quantity: 1,
    unitPrice: "0.00",
  });
  const { checked, KEYS } = await import("../worker/data.js");
  assert.doesNotThrow(() => checked({ [KEYS.presupuestos]: [described] }));
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
