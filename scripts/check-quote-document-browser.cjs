const selectBySearch = require("./search-select-browser.cjs");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

// Usa exclusivamente el Worker simulado de check-browser.cjs.
module.exports = async function checkQuoteDocument(page, context, root) {
  const downloadPDF = async (filename) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.locator("#quote-pdf-result a[download]").click(),
    ]);
    await download.saveAs(path.join(root, "test-results", filename));
    const bytes = await fs.readFile(await download.path());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    if (filename === "presupuesto-multipagina.pdf") {
      const count = /\/Count (\d+)/.exec(bytes.toString("latin1"));
      assert.ok(
        Number(count?.[1]) > 1,
        "El PDF descargado debe contener varias páginas",
      );
    }
  };
  const original = await page.evaluate(() => ({
    config: VSStorage.read("vs-config-v1", {}),
    clients: VSStorage.read("vidres-clientes-v1", []),
  }));
  const set = async (selector, value) => {
    await page.locator(selector).fill(value);
    await page.locator(selector).dispatchEvent("change");
  };
  await page.evaluate(async () => {
    await VSStorage.write("vidres-clientes-v1", [
      {
        nombre: "Cliente de ejemplo",
        telefono: "600 000 000",
        direccion: "Calle de ejemplo 10",
        nif: "NIF DE EJEMPLO",
        email: "cliente@example.com",
      },
    ]);
    vidresReloadData();
    vidresNavigate("clientes");
  });
  await page.locator('[data-client-edit="Cliente de ejemplo"]').click();
  assert.equal(
    await page.locator('#client-form [name="nif"]').inputValue(),
    "NIF DE EJEMPLO",
  );
  await page.locator('#client-form [name="email"]').fill("cliente@example.com");
  await page.locator('#client-form [type="submit"]').click();
  await page.locator("#client-editor").waitFor({ state: "hidden" });
  await page.evaluate(() => vidresNavigate("ajustes-general"));
  for (const [key, value] of Object.entries({
    name: "Vidres Sosa",
    taxId: "CIF DE EJEMPLO",
    address: "Dirección de ejemplo",
    phone: "900 000 000",
    email: "empresa@example.com",
    validity: "15",
    conditions:
      "Condiciones de ejemplo.\nRevisar las medidas antes de aceptar.",
  }))
    await page.locator(`[data-company="${key}"]`).fill(value);
  await page.locator("#cfg-save").click();
  await page
    .getByText("Configuración guardada en el servidor.", { exact: true })
    .waitFor();
  await page.evaluate(() => vidresNavigate("presupuestos"));
  await page.locator("#quote-new").click();
  await set("#quote-client", "Cliente de ejemplo");
  await page.locator(".quote-customer summary").click();
  assert.equal(
    await page.locator('[data-quote-client="taxId"]').inputValue(),
    "NIF DE EJEMPLO",
  );
  assert.equal(
    await page.locator('[data-quote-client="phone"]').getAttribute("readonly"),
    "",
  );
  await set('[data-field="glass"]', "Vidrio con montaje incluido");
  await set('[data-field="w"]', "1.000");
  await set('[data-field="h"]', "1.000");
  await set('[data-field="qty"]', "2");
  await set('[data-field="price"]', "100");
  await set('[data-field="extraAmount"]', "80");
  await set('[data-field="extraDescription"]', "Coste reservado de montaje");
  await page.locator(".quote-document-options > summary").click();
  await set(
    "#quote-observations",
    "Ejemplo de presupuesto <texto>\nMontaje incluido.",
  );
  const total = await page.locator(".quote-grand-total").textContent();
  await page.locator('[data-pdf-option="unitPrice"]').check();
  await page.locator("#quote-pdf").click();
  let printed = await page.locator("#quote-print").textContent();
  assert.match(printed, /VidresSosa/);
  assert.match(printed, /NIF DE EJEMPLO/);
  assert.match(printed, /cliente@example.com/);
  assert.match(printed, /empresa@example.com/);
  assert.match(printed, /Precio €\/m²/);
  // Precio de venta por m²: incluye los 80 € de montaje de la línea.
  assert.match(printed, /138,45/);
  assert.ok(printed.includes(total));
  assert.doesNotMatch(printed, /Coste reservado|Margen|Recargo energético/);
  await fs.mkdir(path.join(root, "test-results"), { recursive: true });
  await downloadPDF("presupuesto-cliente-ejemplo.pdf");

  for (const key of [
    "dimensions",
    "quantity",
    "area",
    "unitPrice",
    "conditions",
    "observations",
    "validity",
  ])
    await page.locator(`[data-pdf-option="${key}"]`).uncheck();
  await page.locator("#quote-pdf").click();
  printed = await page.locator("#quote-print").textContent();
  assert.doesNotMatch(
    printed,
    /m²|Medidas|Und\.|Total unidades|Fecha validez|Validez:|OBSERVACIONES|CONDICIONES|<texto>|138,45/,
  );
  assert.ok(printed.includes(total));
  assert.equal(
    await page.locator("#quote-print .quote-doc-items thead th").count(),
    2,
  );
  assert.equal(await page.locator(".quote-grand-total").textContent(), total);
  await downloadPDF("presupuesto-cliente-sin-desglose.pdf");
  await page.locator("#quote-pdf-internal").click();
  printed = await page.locator("#quote-print").textContent();
  assert.match(printed, /m²|Coste reservado de montaje/);
  assert.match(printed, /No entregar al cliente/);
  assert.match(printed, /OBSERVACIONES|CONDICIONES/);
  await downloadPDF("presupuesto-interno-ejemplo.pdf");
  await page.locator("#quote-save").click();
  await page.waitForFunction(() =>
    VSStorage.read("vs-quote-prototype-v1", []).some(
      (q) => q.client === "Cliente de ejemplo",
    ),
  );
  const id = await page.evaluate(
    () =>
      VSStorage.read("vs-quote-prototype-v1", []).find(
        (q) => q.client === "Cliente de ejemplo",
      ).id,
  );
  await page.reload();
  await page.locator("#title").filter({ hasText: "Inicio" }).waitFor();
  await page.evaluate((id) => vidresQuoteOpenSaved(id), id);
  for (const key of [
    "dimensions",
    "quantity",
    "area",
    "unitPrice",
    "conditions",
    "observations",
    "validity",
  ])
    assert.equal(
      await page.locator(`[data-pdf-option="${key}"]`).isChecked(),
      false,
    );
  await page.locator(`[data-duplicate="${id}"]`).click();
  assert.equal(
    await page.locator('[data-pdf-option="area"]').isChecked(),
    false,
  );
  assert.equal(
    await page.locator("#quote-observations").inputValue(),
    "Ejemplo de presupuesto <texto>\nMontaje incluido.",
  );

  await page.locator("#quote-quick").click();
  await set("#quick-client", "Cliente rápido");
  await page.locator(".quote-customer summary").click();
  await set('[data-quote-client="taxId"]', "NIF RÁPIDO");
  await set('[data-quote-client="phone"]', "611 000 000");
  await set(
    '[data-quote-client="address"]',
    "Dirección del presupuesto rápido",
  );
  await set('[data-quote-client="email"]', "rapido@example.com");
  await set("#quick-w", "1.000");
  await set("#quick-h", "1.000");
  await selectBySearch(page, "#quick-glass", "reuglass-2-0");
  await page.locator(".quote-document-options > summary").click();
  await page.locator('[data-pdf-option="area"]').uncheck();
  await page.locator("#quote-pdf").click();
  printed = await page.locator("#quote-print").textContent();
  assert.match(printed, /NIF RÁPIDO/);
  assert.match(printed, /Dirección del presupuesto rápido/);
  assert.match(printed, /rapido@example.com/);
  assert.doesNotMatch(printed, /m²/);
  await page.locator("#quick-save").click();
  await page.locator("#quote-save").waitFor();
  await page.locator("#quote-pdf").click();
  assert.match(await page.locator("#quote-print").textContent(), /NIF RÁPIDO/);
  await page.evaluate(async () => {
    const clients = VSStorage.read("vidres-clientes-v1", []);
    clients.push({
      nombre: "Cliente rápido",
      telefono: "999 999 999",
      direccion: "No debe sustituir los datos del presupuesto",
    });
    await VSStorage.write("vidres-clientes-v1", clients);
  });
  await page.locator("#quote-pdf").click();
  assert.doesNotMatch(
    await page.locator("#quote-print").textContent(),
    /999 999 999|No debe sustituir/,
  );

  // Carga, persistencia y uso del logo, sin recursos ni imágenes externos.
  await page.evaluate(() => vidresNavigate("ajustes-general"));
  await page.locator("#cfg-logo-file").setInputFiles({
    name: "logo-prueba.png.gif",
    mimeType: "image/gif",
    buffer: Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      "base64",
    ),
  });
  await page.locator("#cfg-logo-preview img").waitFor();
  assert.match(
    await page.locator('[data-company="logo"]').inputValue(),
    /^data:image\/webp;base64,/,
  );
  assert.equal(
    await page.locator("#cfg-logo-preview img").evaluate(async (img) => {
      await img.decode();
      return img.naturalWidth;
    }),
    1,
  );
  const logo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#15523e";
    ctx.font = "bold 28px Arial";
    ctx.fillText("Vidres Sosa", 12, 50);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#cfg-logo-file").setInputFiles({
    name: "logo-prueba.png",
    mimeType: "image/png",
    buffer: Buffer.from(logo, "base64"),
  });
  await page.locator("#cfg-logo-preview img").waitFor();
  await page.locator("#cfg-save").click();
  await page
    .getByText("Configuración guardada en el servidor.", { exact: true })
    .waitFor();
  await page.reload();
  await page.locator("#title").filter({ hasText: "Inicio" }).waitFor();
  await page.evaluate((id) => vidresQuoteOpenSaved(id), id);
  await page.evaluate(() => {
    window.addEventListener("vidres-pdf-ready", () => {
      window.logoPrinted = true;
    });
  });
  await page.locator("#quote-pdf").click();
  await page.waitForFunction(() => window.logoPrinted);
  assert.equal(await page.locator("#quote-print .quote-doc-logo").count(), 1);
  assert.equal(
    await page
      .locator("#quote-print .quote-doc-logo")
      .evaluate((img) => img.complete && img.naturalWidth > 0),
    true,
  );
  await page.evaluate(() => vidresNavigate("ajustes-general"));
  await page.locator("#cfg-logo-remove").click();
  await page.locator("#cfg-save").click();
  await page
    .getByText("Configuración guardada en el servidor.", { exact: true })
    .waitFor();

  // Un documento largo debe poder partirse en varias páginas, conservando totales.
  await page.evaluate(async (id) => {
    const quotes = VSStorage.read("vs-quote-prototype-v1", []),
      quote = quotes.find((q) => q.id === id);
    quote.lines = Array.from({ length: 65 }, (_, i) => ({
      kind: "concept",
      description: `Concepto de ejemplo ${i + 1}`,
      amount: 10,
    }));
    await VSStorage.write("vs-quote-prototype-v1", quotes);
    vidresQuoteOpenSaved(id);
  }, id);
  await page.locator("#quote-pdf").click();
  await downloadPDF("presupuesto-multipagina.pdf");
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `PDF selector: desbordamiento a ${width}`,
    );
  }
  await page.evaluate(async (original) => {
    await VSStorage.write("vs-config-v1", original.config);
    await VSStorage.write("vidres-clientes-v1", original.clients);
    vidresReloadData();
    vidresNavigate("inicio");
  }, original);
  await page.setViewportSize({ width: 390, height: 844 });
  console.log(
    "PASS PDF: ficha de cliente, datos rápidos, logo, columnas ocultas sin filtrar datos, totales, guardado/reapertura/duplicado, multipágina y móvil",
  );
};
