const { test } = require("node:test");
const assert = require("node:assert/strict");
const { quote } = require("../migrate.js");
const { totals, quoteTotals } = require("../calculations.js");

test("migración a schema 2 conserva el importe total", () => {
  const antiguo = {
    id: "P-2026-0001",
    client: "Antonio Pérez",
    job: "VS-0001",
    status: "Enviado",
    date: "2026-11-01",
    pricing: { vat: 21, energyMode: "pending", energy: "" },
    lines: [
      {
        w: 180,
        h: 83,
        qty: 1,
        price: 95,
        edgePrice: 6,
        sides: ["top", "bottom"],
        glass: "Templado 8 mm",
        tariff: "T1",
      },
    ],
  };

  const migrado = quote(antiguo, { validity: 30 });

  assert.equal(migrado.schema, 2);
  assert.equal(migrado.capitulos.length, 1);
  assert.equal(migrado.capitulos[0].lineas.length, 1);

  const linea = migrado.capitulos[0].lineas[0];
  assert.equal(linea.tipo, "vidrio");
  assert.equal(linea.precioM2, 95);
  assert.equal(linea.redondeo, 6);
  assert.equal(linea.espesor, 8); // extraído de "Templado 8 mm"
  assert.equal(linea.tratamientos.length, 1);
  assert.equal(linea.tratamientos[0].precio, 6);

  const totalAntiguo = totals(antiguo.lines, antiguo.pricing);
  const lineas = migrado.capitulos.flatMap((c) => c.lineas);
  const totalMigrado = quoteTotals(lineas, migrado.pricing);

  assert.equal(totalMigrado.base, totalAntiguo.base);
  assert.equal(totalMigrado.total, totalAntiguo.total);
});

test("migración: un presupuesto ya en schema 2 no cambia", () => {
  const schema2 = { schema: 2, id: "P-2026-0002", capitulos: [] };
  assert.equal(quote(schema2), schema2);
});
