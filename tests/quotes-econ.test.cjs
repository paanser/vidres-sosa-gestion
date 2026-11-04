const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  discountAmount,
  lineNet,
  breakdown,
  margen,
  reverseMargin,
  priceWithVat,
} = require("../calculations.js");

test("descuento por línea en porcentaje y en euros", () => {
  const pct = lineNet(
    { tipo: "servicio", precio: 100, descuento: { tipo: "%", valor: 10 } },
    { vat: 21 },
  );
  assert.equal(pct.subtotal, 100);
  assert.equal(pct.descuento, 10);
  assert.equal(pct.base, 90);
  assert.equal(pct.iva, 18.9);
  assert.equal(pct.total, 108.9);

  const eur = lineNet(
    { tipo: "servicio", precio: 100, descuento: { tipo: "€", valor: 25 } },
    { vat: 21 },
  );
  assert.equal(eur.base, 75);
  assert.equal(eur.iva, 15.75);
  assert.equal(eur.total, 90.75);
});

test("IVA mixto: cada línea con su tipo", () => {
  const b = breakdown(
    [
      { tipo: "servicio", precio: 100, iva: 21 },
      { tipo: "servicio", precio: 100, iva: 10 },
      { tipo: "servicio", precio: 100, iva: 0 },
    ],
    { vat: 21 },
  );
  assert.equal(b.baseLineas, 300);
  assert.equal(b.totalIva, 31);
  assert.equal(b.total, 331);
  assert.equal(b.ivaPorTipo["21"].iva, 21);
  assert.equal(b.ivaPorTipo["10"].iva, 10);
  assert.equal(b.ivaPorTipo["0"].iva, 0);
});

test("descuento global y recargo", () => {
  const b = breakdown([{ tipo: "servicio", precio: 100 }], {
    vat: 21,
    descuentoGlobal: { tipo: "%", valor: 10 },
    recargos: [{ nombre: "Urgencia", tipo: "%", valor: 10 }],
  });
  assert.equal(b.baseLineas, 100);
  assert.equal(b.descuentoGlobal, 10);
  assert.equal(b.recargos[0].importe, 9);
  assert.equal(b.base, 99);
  assert.equal(b.total, 120);
});

test("anticipo en porcentaje y en euros", () => {
  const pct = breakdown([{ tipo: "servicio", precio: 100 }], {
    vat: 21,
    anticipo: { tipo: "%", valor: 50 },
  });
  assert.equal(pct.total, 121);
  assert.equal(pct.anticipo, 60.5);
  assert.equal(pct.pendiente, 60.5);

  const eur = breakdown([{ tipo: "servicio", precio: 100 }], {
    vat: 21,
    anticipo: { tipo: "€", valor: 40 },
  });
  assert.equal(eur.anticipo, 40);
  assert.equal(eur.pendiente, 81);
});

test("margen y calculadoras inversas", () => {
  assert.deepEqual(margen(150, 100), { enEuros: 50, enPct: 33.33 });
  assert.equal(reverseMargin(30, 100), 142.86);
  assert.equal(priceWithVat(121, 21), 100);
});

test("descuento global no aplica a importes inexistentes", () => {
  assert.equal(discountAmount(100, { tipo: "%", valor: 0 }), 0);
  assert.equal(discountAmount(100, null), 0);
});
