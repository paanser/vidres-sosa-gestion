const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  applyBulk,
  previewBulk,
  exportCsv,
  parseCsv,
  merge,
  precioVenta,
} = require("../tariffs.js");

test("applyBulk sube el precio solo al proveedor indicado", () => {
  const t = [
    { id: "1", name: "Float 4", price: 100, proveedor: "Vitro", redondeo: 6 },
    { id: "2", name: "Float 6", price: 200, proveedor: "Otro", redondeo: 6 },
  ];
  const r = applyBulk(t, "Vitro", 10);
  assert.equal(r[0].price, 110);
  assert.equal(r[1].price, 200);
  assert.equal(t[0].price, 100); // no muta
});

test("previewBulk devuelve el antes y el después", () => {
  const r = previewBulk(
    [{ name: "Float 4", price: 100, proveedor: "Vitro" }],
    "Vitro",
    10,
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].de, 100);
  assert.equal(r[0].a, 110);
});

test("exportCsv y parseCsv conservan las columnas nuevas", () => {
  const t = [
    {
      id: "1",
      name: "Templado 8",
      price: 95,
      edge: 6,
      familia: "templado",
      espesor: "8",
      coste: 60,
      margen: 58,
      proveedor: "Vitro",
      minimoM2: 0.5,
      minimoImporte: "",
      redondeo: 6,
    },
  ];
  const csv = exportCsv(t);
  const { items, errors } = parseCsv(csv);
  assert.equal(errors.length, 0);
  assert.equal(items.length, 1);
  assert.equal(items[0].name, "Templado 8");
  assert.equal(items[0].price, 95);
  assert.equal(items[0].familia, "templado");
  assert.equal(items[0].proveedor, "Vitro");
  assert.equal(items[0].minimoM2, "0.5");
});

test("parseCsv acepta el formato antiguo nombre;precio_m2;precio_ml", () => {
  const { items, errors } = parseCsv(
    "nombre;precio_m2;precio_ml\nFloat 4;45;3\nLaminado 6;80;4",
  );
  assert.equal(errors.length, 0);
  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Float 4");
  assert.equal(items[0].price, 45);
  assert.equal(items[0].edge, 3);
});

test("merge actualiza por nombre y conserva el id", () => {
  const current = [{ id: "A", name: "Float 4", price: 45 }];
  const r = merge(current, [{ name: "Float 4", price: 50, familia: "float" }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "A");
  assert.equal(r[0].price, 50);
  assert.equal(r[0].familia, "float");
});

test("precioVenta calcula coste + margen o usa el precio", () => {
  assert.equal(precioVenta({ coste: 100, margen: 20 }), 120);
  assert.equal(precioVenta({ price: 95 }), 95);
});
