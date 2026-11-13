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

test("servidor: conserva datos del cliente, presentación del PDF y logo, y rechaza valores inválidos", async () => {
  const { checked, KEYS } = await import("../worker/data.js");
  const q = {
    id: "P-DOCUMENTO",
    client: "Cliente rápido",
    clientSource: "quote",
    clientData: {
      taxId: "NIF ejemplo",
      phone: "600000000",
      address: "Dirección",
      email: "cliente@example.com",
    },
    pdfOptions: { area: false, unitPrice: false, conditions: true },
    observations: "Montaje incluido",
    lines: [{ kind: "concept", description: "Trabajo", amount: 100 }],
  };
  const validate = (quote) => checked({ [KEYS.presupuestos]: [quote] });
  assert.deepEqual(validate(q)[KEYS.presupuestos][0], q);
  for (const patch of [
    { clientSource: "otro" },
    { clientData: [] },
    { clientData: { address: "x".repeat(501) } },
    { clientData: { taxId: 10 } },
    { pdfOptions: [] },
    { pdfOptions: { area: "false" } },
    { pdfOptions: { unknown: true } },
    { observations: "x".repeat(3001) },
  ])
    assert.throws(() => validate({ ...q, ...patch }));
  const logo = "data:image/png;base64,aGVsbG8=";
  const config = { company: { name: "Vidres Sosa", logo } };
  assert.deepEqual(
    checked({ [KEYS.configuracion]: config })[KEYS.configuracion],
    config,
  );
  for (const logo of [
    "https://example.com/logo.png",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/png;base64," + "A".repeat(9500),
  ])
    assert.throws(() =>
      checked({ [KEYS.configuracion]: { company: { logo } } }),
    );
});

test("servidor: aluminio y dibujo privado se conservan y validan", async () => {
  const { checked, KEYS } = await import("../worker/data.js");
  const line = {
    kind: "aluminum",
    description: "Puerta\nDos hojas",
    amount: 800,
    aluminumMargin: 25,
    drawing: "data:image/jpeg;base64,/9j/",
  };
  const validate = (lines) =>
    checked({
      [KEYS.presupuestos]: [{ id: "P-ALU", client: "Prueba", lines }],
    });
  assert.deepEqual(validate([line])[KEYS.presupuestos][0].lines[0], line);
  for (const patch of [
    { amount: -1 },
    { description: " " },
    { aluminumMargin: -1 },
    { aluminumMargin: 10001 },
    { drawing: "https://example.com/x.jpg" },
    { drawing: "data:image/svg+xml;base64,PHN2Zz4=" },
    { drawing: "data:image/jpeg;base64," + "A".repeat(60000) },
  ]) {
    assert.throws(() => validate([{ ...line, ...patch }]));
  }
  assert.throws(() =>
    validate(
      Array.from({ length: 7 }, () => ({
        ...line,
        drawing: "data:image/jpeg;base64," + "A".repeat(59000),
      })),
    ),
  );
});

test("servidor: valida y conserva la selección de metraje mínimo", async () => {
  const { checked, KEYS } = await import("../worker/data.js");
  const validate = (minimumArea) =>
    checked({
      [KEYS.presupuestos]: [
        {
          id: "P-MIN",
          client: "Cliente",
          lines: [{ w: 20, h: 30, qty: 1, price: 100 }],
          pricing: { minimumArea },
        },
      ],
    });
  for (const value of ["auto", "0.35", "0.5", "0.7", "1", 0.7])
    assert.equal(
      validate(value)[KEYS.presupuestos][0].pricing.minimumArea,
      value,
    );
  for (const value of ["", -1, 0, 2, {}, true])
    assert.throws(() => validate(value));
});
