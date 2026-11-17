const { test } = require("node:test");
const assert = require("node:assert/strict");
global.jspdf = require("../vendor/jspdf.umd.min.js");
const { build } = require("../job-sheet-pdf.js");

test("La hoja normal es A4 de una página, con contacto y sin costes internos", () => {
  const job = {
    id: "VS-123",
    cliente: "Ana",
    descripcion: "Cambiar vidrio",
    operativa: { venta: 987654 },
    notas: "Llamar antes",
  };
  const before = JSON.stringify(job);
  const doc = build(job, { telefono: "600123456" });
  assert.equal(doc.getNumberOfPages(), 1);
  assert.ok(Math.abs(doc.internal.pageSize.getWidth() - 210) < 0.01);
  assert.ok(Math.abs(doc.internal.pageSize.getHeight() - 297) < 0.01);
  const commands = doc.internal.pages.flat().join("\n");
  for (const value of ["VS-123", "600123456", "Ana", "Llamar antes"])
    assert.ok(commands.includes(value));
  assert.ok(!commands.includes("987654"));
  assert.equal(JSON.stringify(job), before);
  assert.ok(doc.output("arraybuffer").byteLength > 1000);
});

test("Los textos largos continúan sin perder el final y reservan cuadrícula", () => {
  const doc = build({
    id: "VS-LARGO",
    descripcion: "Medidas de la ventana. ".repeat(1800) + "FIN_TRABAJO",
    notas: "Nota\n".repeat(100) + "FIN_NOTAS",
  });
  assert.ok(doc.getNumberOfPages() > 2);
  const pages = doc.internal.pages.slice(1);
  const commands = pages.flat().join("\n");
  assert.ok(commands.includes("FIN_TRABAJO"));
  assert.ok(commands.includes("FIN_NOTAS"));
  assert.ok(pages.every((page) => page.join("\n").includes("VS-LARGO")));
  const last = pages.at(-1).join("\n");
  assert.ok(last.includes("MEDIDAS, CROQUIS Y ANOTACIONES"));
  assert.ok((last.match(/ l\n/g) || []).length >= 60);
});

test("Se pueden imprimir expedientes sin datos opcionales", () => {
  assert.equal(build({ id: "VACIO" }).getNumberOfPages(), 1);
});

test("El logo VS se imprime bajo la cuadrícula con opacidad suave", () => {
  const doc = build({ id: "VS-LOGO" });
  const commands = doc.internal.pages[1].join("\n");
  const image = commands.indexOf("/GS1 gs");
  assert.ok(image > 0);
  assert.ok(commands.slice(image).includes(" c"));
  assert.ok((commands.slice(image).match(/ l\n/g) || []).length >= 60);
  const pdf = doc.output();
  assert.ok(pdf.includes("/ca 0.06"));
  assert.ok(!pdf.includes("/Subtype /Image"));
  assert.ok(!commands.includes("Cuadr"));
});

test("Las medidas y notas guardadas aparecen dentro de la cuadrícula", () => {
  const pieces = [
    {
      ancho: 120,
      alto: 80,
      cantidad: 2,
      tipo: "Templado",
      espesor: 6,
      observaciones: "Canto pulido",
      croquis: { notes: "NOTA_DEL_BLOC" },
    },
  ];
  const before = JSON.stringify(pieces);
  const doc = build({ id: "MEDIDO" }, {}, {}, pieces);
  const commands = doc.internal.pages.flat().join("\n");
  for (const value of [
    "Pieza 1",
    "120 cm",
    "80 cm",
    "Cantidad: 2",
    "Templado",
    "6 mm",
    "Canto pulido",
    "NOTA_DEL_BLOC",
  ])
    assert.ok(commands.includes(value), value);
  assert.equal(JSON.stringify(pieces), before);
});

test("Los trazos y las cotas se imprimen como imagen y las notas largas continúan", () => {
  const seen = [];
  global.window = {
    vidresSketch: {
      preview(sketch) {
        seen.push(sketch);
        return (
          "data:image/png;base64," +
          require("node:fs")
            .readFileSync(
              require("node:path").join(__dirname, "../icons/icon-192.png"),
            )
            .toString("base64")
        );
      },
    },
  };
  try {
    const sketches = [
      {
        strokes: [
          {
            points: [
              [1, 1],
              [2, 2],
            ],
          },
        ],
      },
      {
        dims: [{ valor: "125" }],
        notes: "Nota extensa ".repeat(2200) + "FIN_BLOC",
      },
    ];
    const doc = build(
      { id: "DIBUJADO" },
      {},
      {},
      sketches.map((croquis) => ({ croquis })),
    );
    assert.deepEqual(seen, sketches);
    assert.ok(doc.output().includes("/Subtype /Image"));
    assert.ok(doc.getNumberOfPages() > 2);
    const pages = doc.internal.pages.slice(1);
    assert.ok(pages.at(-1).join("\n").includes("FIN_BLOC"));
    assert.ok(
      pages.every((p) =>
        p.join("\n").includes("MEDIDAS, CROQUIS Y ANOTACIONES"),
      ),
    );
  } finally {
    delete global.window;
  }
});
