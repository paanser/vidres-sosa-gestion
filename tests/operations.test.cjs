const { test } = require("node:test");
const assert = require("node:assert/strict");
const { finances, overlaps, alerts } = require("../operations-model.js");
test("cobros parciales suman en céntimos y permiten saldo a favor", () => {
  assert.deepEqual(
    finances({
      venta: 0.3,
      ventaNeta: 0.3,
      pagos: [{ importe: 0.1 }, { importe: 0.2 }],
      costes: [{ importe: 0.1 }],
    }),
    {
      paid: 0.3,
      balance: 0,
      costs: 0.1,
      profit: 0.2,
      margin: 66.66666666666666,
    },
  );
  assert.equal(
    finances({ venta: 100, pagos: [{ importe: 120 }] }).balance,
    -20,
  );
});
test("agenda: intervalos adyacentes no chocan; otro responsable tampoco", () => {
  const a = {
    id: "a",
    fecha: "2026-11-13",
    hora: "10:00",
    duracion: 60,
    responsable: "Pau",
  };
  assert.equal(overlaps(a, { ...a, id: "b", hora: "11:00" }), false);
  assert.equal(overlaps(a, { ...a, id: "b", hora: "10:59" }), true);
  assert.equal(overlaps(a, { ...a, id: "b", responsable: "Otro" }), false);
  assert.equal(overlaps(a, { ...a, id: "b", duracion: "" }), false);
});
test("avisos siguen las recepciones parciales y la confirmación del montaje", () => {
  const j = {
    estado: "Para instalar",
    operativa: {
      pedidos: [
        {
          proveedor: "Fábrica",
          entrega: "2026-11-12",
          piezas: [{ cantidad: 8, recibidas: 6 }],
        },
      ],
    },
  };
  assert.equal(alerts(j, "2026-11-13").length, 2);
  j.operativa.pedidos[0].piezas[0].recibidas = 8;
  j.operativa.montajeConfirmado = true;
  assert.deepEqual(alerts(j, "2026-11-13"), []);
});
test("servidor valida pedidos, importes, firma y conserva expedientes antiguos", async () => {
  const { checked, KEYS } = await import("../worker/data.js");
  const j = { id: "VS-TEST", cliente: "Obra", estado: "Pendiente" };
  const validate = (x) => checked({ [KEYS.trabajos]: [x] });
  assert.doesNotThrow(() => validate(j));
  const o = {
    venta: 121,
    ventaNeta: 100,
    pagos: [{ id: "p", importe: 30, concepto: "Señal", fecha: "2026-11-13" }],
    costes: [
      {
        id: "c",
        importe: 40,
        concepto: "Vidrio",
        fecha: "2026-11-13",
        tipo: "Material",
      },
    ],
    pedidos: [
      {
        id: "order",
        proveedor: "Fábrica",
        referencia: "",
        fecha: "2026-11-13",
        entrega: "",
        notas: "Cantos pulidos",
        piezas: [
          {
            id: "piece",
            ancho: 100,
            alto: 50,
            cantidad: 8,
            recibidas: 6,
            tipo: "Templado",
            espesor: "6",
            observaciones: "",
          },
        ],
      },
    ],
    cierre: {
      fecha: "2026-11-13",
      nombre: "Cliente",
      conforme: true,
      incidencias: "",
      pendiente: "",
      fotos: [],
      firma: [
        [
          [0, 0],
          [1, 1],
        ],
      ],
    },
  };
  assert.deepEqual(
    validate({ ...j, operativa: o })[KEYS.trabajos][0].operativa,
    o,
  );
  for (const change of [
    (o) => {
      o.ventaNeta = -1;
    },
    (o) => {
      o.pagos[0].importe = 0.001;
    },
    (o) => {
      o.pagos[0].fecha = "2026-02-30";
    },
    (o) => {
      o.pedidos[0].piezas[0].recibidas = 9;
    },
    (o) => {
      o.pedidos[0].piezas[0].ancho = 0;
    },
    (o) => {
      o.pedidos[0].piezas = [];
    },
    (o) => {
      o.cierre.firma = [[[2, 0]]];
    },
    (o) => {
      o.cierre.firma = [Array.from({ length: 601 }, () => [0, 0])];
    },
  ]) {
    const copy = structuredClone(o);
    change(copy);
    assert.throws(() => validate({ ...j, operativa: copy }));
  }
  assert.throws(() => validate({ ...j, duracion: "-1" }));
  assert.throws(() => validate({ ...j, hora: "25:30" }));
});
