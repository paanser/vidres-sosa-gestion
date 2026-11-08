const assert = require("node:assert/strict");
module.exports = async (page) => {
  await page.evaluate(() => window.vidresNavigate("presupuestos"));
  await page.locator("#quote-new").click();
  await page.locator("#quote-add-aluminum").click();
  assert.equal(await page.locator('[data-field="w"]').count(), 0);
  await page.locator("#quote-client").fill("Cliente aluminio ficticio");
  await page
    .locator('[data-field="description"]')
    .fill("Puerta de dos hojas\nBlanco <texto>");
  await page.locator('[data-field="amount"]').fill("800");
  await page.locator('[data-field="aluminumMargin"]').fill("25");
  const drawing = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 600;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 400, 600);
    ctx.strokeRect(20, 20, 360, 560);
    ctx.beginPath();
    ctx.moveTo(200, 20);
    ctx.lineTo(200, 580);
    ctx.stroke();
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator("[data-aluminum-upload]").setInputFiles({
    name: "puerta.png",
    mimeType: "image/png",
    buffer: Buffer.from(drawing, "base64"),
  });
  await page.locator(".quote-editor .quote-aluminum-drawing").waitFor();
  assert.match(
    await page.locator(".quote-aluminum-result").textContent(),
    /1\.?000,00/,
  );
  await page.locator("#quote-save").click();
  await page.waitForFunction(() =>
    VSStorage.read("vs-quote-prototype-v1", []).some(
      (q) => q.client === "Cliente aluminio ficticio",
    ),
  );
  const saved = await page.evaluate(() =>
    VSStorage.read("vs-quote-prototype-v1", []).find(
      (q) => q.client === "Cliente aluminio ficticio",
    ),
  );
  assert.ok(saved.lines[0].drawing.startsWith("data:image/jpeg;base64,"));
  await page.reload();
  await page.waitForFunction(
    () =>
      typeof window.vidresNavigate === "function" &&
      !document.querySelector("#nav button").disabled,
  );
  await page.evaluate(() => window.vidresNavigate("presupuestos"));
  await page.locator(`[data-load="${saved.id}"]`).click();
  assert.equal(
    await page
      .locator(".quote-editor .quote-aluminum-drawing")
      .getAttribute("src"),
    saved.lines[0].drawing,
  );
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.locator("#quote-pdf").click();
  const drawingDownload = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#quote-pdf-result a[download]").click(),
  ]);
  const drawingBytes = await require("node:fs/promises").readFile(
    await drawingDownload[0].path(),
  );
  assert.equal(drawingBytes.subarray(0, 5).toString(), "%PDF-");
  assert.match(drawingBytes.toString("latin1"), /\/Subtype \/Image/);
  assert.equal(
    await page.locator("#quote-print .quote-aluminum-drawing").count(),
    1,
  );
  const pdf = await page.locator("#quote-print").textContent();
  assert.match(pdf, /Blanco <texto>/);
  assert.match(pdf, /1\.?210,00/);
  assert.doesNotMatch(pdf, /800,00|Coste interno|Margen añadido/);
  await page.locator("#quote-pdf-internal").click();
  assert.match(await page.locator("#quote-print").textContent(), /800,00/);
  await page.locator(`[data-duplicate="${saved.id}"]`).click();
  assert.equal(
    await page
      .locator(".quote-editor .quote-aluminum-drawing")
      .getAttribute("src"),
    saved.lines[0].drawing,
  );
  await page.locator("[data-remove-drawing]").click();
  assert.equal(
    await page.locator(".quote-editor .quote-aluminum-drawing").count(),
    0,
  );
  // Regresión: conceptos solos y un vidrio vacío nunca deben exigir medidas.
  await page.locator("#quote-new").click();
  await page.locator("#quote-add-concept").click();
  assert.equal(await page.locator('[data-field="w"]').count(), 0);
  await page.locator("#quote-client").fill("Solo conceptos PDF");
  await page.locator('[data-field="description"]').fill("Montaje sin vidrio");
  await page.locator('[data-field="amount"]').fill("560");
  await page.locator("#quote-add").click();
  await page.evaluate(() => {
    window.pdfWithoutGlassCount = 0;
    window.addEventListener(
      "vidres-pdf-ready",
      () => window.pdfWithoutGlassCount++,
    );
  });
  await page.locator("#quote-pdf").click();
  await page.waitForFunction(() => window.pdfWithoutGlassCount === 1);
  assert.equal(await page.locator('[data-field="w"]').count(), 0);
  assert.match(
    await page.locator("#quote-print").textContent(),
    /Montaje sin vidrio/,
  );
  await page.locator("#quote-save").click();
  await page.waitForFunction(() =>
    VSStorage.read("vs-quote-prototype-v1", []).some(
      (q) =>
        q.client === "Solo conceptos PDF" &&
        q.lines.length === 1 &&
        q.lines[0].kind === "concept",
    ),
  );
  await page.locator("#quote-new").click();
  await page.locator("#quote-add-aluminum").click();
  await page.locator("#quote-client").fill("Solo aluminio PDF");
  await page.locator('[data-field="description"]').fill("Aluminio sin vidrio");
  await page.locator('[data-field="amount"]').fill("560");
  await page.locator('[data-field="aluminumMargin"]').fill("100");
  await page.locator("#quote-add").click();
  await page.locator("#quote-pdf").click();
  await page.waitForFunction(() => window.pdfWithoutGlassCount === 2);
  assert.match(await page.locator("#quote-print").textContent(), /1355,20/);
  const download = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#quote-pdf-result a[download]").click(),
  ]);
  assert.match(
    download[0].suggestedFilename(),
    /^Presupuesto-.*-cliente\.pdf$/,
  );
  const bytes = await require("node:fs/promises").readFile(
    await download[0].path(),
  );
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const streams = [
    ...bytes
      .toString("latin1")
      .matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g),
  ];
  const contents = streams
    .map((m) => {
      try {
        return require("node:zlib")
          .inflateSync(Buffer.from(m[1], "latin1"))
          .toString("latin1");
      } catch {
        return "";
      }
    })
    .join("\n");
  assert.match(contents, /Aluminio sin vidrio/);
  assert.match(contents, /1355,20/);
  assert.doesNotMatch(contents, /Coste interno|Margen a/);
  await download[0].saveAs(
    require("node:path").join(
      __dirname,
      "../test-results/aluminio-descarga-real.pdf",
    ),
  );
  // Compartir recibe un archivo PDF, no una llamada al diálogo de impresión.
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async ({ files }) => {
        window.sharedQuotePDF = {
          type: files[0].type,
          size: files[0].size,
          name: files[0].name,
        };
      },
    });
  });
  await page.locator("#quote-pdf").click();
  await page
    .getByRole("button", { name: "Compartir PDF", exact: true })
    .click();
  const shared = await page.evaluate(() => window.sharedQuotePDF);
  assert.equal(shared.type, "application/pdf");
  assert.ok(shared.size > 1000);
  await page.evaluate(() => {
    delete navigator.canShare;
    delete navigator.share;
  });

  assert.equal(await page.locator('[data-field="w"]').count(), 0);
  // Un vidrio parcialmente cumplimentado se conserva y se explica el fallo.
  await page.locator("#quote-add").click();
  await page.locator('[data-field="w"]').fill("1.000");
  const alerts = [];
  const capture = (dialog) => alerts.push(dialog.message());
  page.on("dialog", capture);
  await page.locator("#quote-pdf").click();
  assert.equal(await page.evaluate(() => window.pdfWithoutGlassCount), 3);
  assert.equal(await page.locator('[data-field="w"]').count(), 1);
  assert.equal(
    await page
      .locator('[data-field="h"]')
      .evaluate((input) => input.checkValidity()),
    false,
  );
  await page.locator('[data-field="h"]').fill("1.000");
  await page.locator("#quote-pdf").click();
  assert.match(alerts.at(-1), /Línea 2:.*vidrio/);
  await page.locator('[data-remove="1"]').click();
  await page.locator('[data-field="description"]').fill("");
  await page.locator("#quote-pdf").click();
  assert.match(alerts.at(-1), /Línea 1:.*descripción/);
  page.off("dialog", capture);
  await page.locator('[data-remove="0"]').click();
  assert.equal(await page.locator(".quote-line").count(), 0);
  await page.evaluate(() => window.vidresNavigate("inicio"));
  console.log(
    "PASS aluminio: dibujo, cálculo, guardado, recarga, duplicado y PDF cliente/interno",
  );
};
