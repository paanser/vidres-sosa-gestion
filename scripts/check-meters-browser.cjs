const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");

// Usa exclusivamente el servidor simulado y la base de datos en memoria del runner.
module.exports = async function checkMeters(page, context, root) {
  const original = await page.evaluate(() => VSStorage.values());
  await page.evaluate(() => window.vidresNavigate("presupuestos"));
  assert.equal(
    await page.locator('[data-field="w"]').getAttribute("type"),
    "text",
  );
  await page.locator("#quote-client").fill("Prueba ficticia de metros");
  await page.locator('[data-field="price"]').fill("50");
  const w = page.locator('[data-field="w"]'),
    h = page.locator('[data-field="h"]');
  await w.fill("1.234");
  assert.match(await w.locator("..").textContent(), /= 1 m 23 cm 4 mm/);
  await h.fill("0,830");
  assert.match(
    await page.locator(".quote-result").textContent(),
    /1.234 × 0.830 m/,
  );
  await w.evaluate((el) => {
    window.meterInput = el;
    el.focus();
  });
  await w.press("End");
  await w.press("Backspace");
  await w.press("4");
  assert.equal(
    await w.evaluate(
      (el) => el === window.meterInput && document.activeElement === el,
    ),
    true,
  );
  await h.click();
  assert.equal(await w.evaluate((el) => el === window.meterInput), true);
  for (const bad of ["1.2345", "0", "-1", "abc", "1.2.3"]) {
    await w.fill(bad);
    assert.equal(await w.getAttribute("aria-invalid"), "true");
    assert.ok(await w.evaluate((el) => !el.checkValidity()));
  }
  await w.fill("1.5");
  assert.match(await w.locator("..").textContent(), /= 1 m 50 cm/);
  await w.fill("1.234");
  await context.setOffline(true);
  await h.fill("0.831");
  assert.match(await page.locator(".quote-result").textContent(), /0.831 m/);
  await context.setOffline(false);
  await h.fill("0.830");
  const refuse = (dialog) => dialog.dismiss();
  page.removeAllListeners("dialog");
  page.on("dialog", refuse);
  await w.fill("12");
  await w.blur();
  assert.match(await w.evaluate((el) => el.validationMessage), /Confirma/);
  page.removeAllListeners("dialog");
  page.on("dialog", (dialog) => dialog.accept());
  await w.fill("1.234");
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.locator("#quote-pdf").click();
  assert.match(
    await page.locator("#quote-print").textContent(),
    /1.234 × 0.830 m/,
  );
  await page.locator("#quote-whatsapp").click();
  assert.match(
    await page.locator("#quote-message-form [name=mensaje]").inputValue(),
    /1.234 × 0.830 m/,
  );
  await page.locator("#quote-message-cancel").click();
  await fs.mkdir(path.join(root, "test-results"), { recursive: true });
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Desbordamiento a ${width}`,
    );
    const box = await w.boundingBox();
    assert.ok(box.height >= 44 && box.x >= 0 && box.x + box.width <= width + 1);
    assert.ok(
      await w.evaluate((el) => parseFloat(getComputedStyle(el).fontSize) >= 16),
    );
    await page.screenshot({
      path: path.join(root, "test-results", `medidas-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#quote-save").click();
  await page.waitForFunction(() =>
    VSStorage.read("vs-quote-prototype-v1", []).some(
      (q) =>
        q.client === "Prueba ficticia de metros" &&
        q.lines[0].w === 123.4 &&
        q.lines[0].h === 83,
    ),
  );
  // La reapertura no debe cuantizar medidas antiguas de centésimas de cm.
  const legacy = {
    id: "P-METROS-ANTIGUO",
    client: "Cliente ficticio",
    status: "Borrador",
    lines: [
      { w: 123.45, h: 83.54, qty: 2, price: 50, edgePrice: 6, sides: ["top"] },
    ],
    pricing: { energyMode: "percent", energy: 7, vat: 21 },
  };
  await page.evaluate(async (q) => {
    window.legacyMeterTotal = VSCalculations.quoteDetails(q).totals;
    await VSStorage.write("vs-quote-prototype-v1", [q]);
    vidresQuoteOpenSaved(q.id);
  }, legacy);
  await page.locator("#quote-client").fill("Cliente antiguo guardado");
  await page.locator("#quote-save").click();
  await page.waitForFunction(
    () =>
      VSStorage.read("vs-quote-prototype-v1", [])[0].client ===
        "Cliente antiguo guardado" &&
      VSStorage.read("vs-quote-prototype-v1", [])[0].lines[0].w === 123.45,
  );
  assert.deepEqual(
    await page.evaluate(
      () =>
        VSCalculations.quoteDetails(
          VSStorage.read("vs-quote-prototype-v1", [])[0],
        ).totals,
    ),
    await page.evaluate(() => window.legacyMeterTotal),
  );
  // Cambiar cm/mm/m no cambia el valor interno ni las cotas antiguas.
  for (const [unit, value] of [
    ["cm", "123.45"],
    ["mm", "1234.5"],
    ["m", "1.235"],
  ]) {
    await page.evaluate(
      async ({ unit, q }) => {
        await VSStorage.write("vs-config-v1", { unit });
        vidresQuoteOpenSaved(q.id);
      },
      { unit, q: legacy },
    );
    assert.equal(await w.inputValue(), value);
    if (unit === "mm") assert.equal(await h.inputValue(), "835.4");
    assert.equal(await h.getAttribute("aria-invalid"), "false");
    await page.locator("#quote-save").click();
    await page.waitForFunction(
      () =>
        VSStorage.read("vs-quote-prototype-v1", [])[0].lines[0].w === 123.45,
    );
  }
  await page.evaluate(async () => {
    await VSStorage.write("vs-config-v1", { unit: "m" });
    await VSStorage.write("vs-tariffs-prototype-v1", [
      { id: "T-METROS", name: "Vidrio ficticio", price: 50, edge: 6 },
    ]);
  });
  await page.locator("#quote-quick").click();
  await page.locator("#quick-w").fill("1.234");
  await page.locator("#quick-h").fill("0.830");
  await page.locator("#quick-glass").selectOption("T-METROS");
  assert.match(
    await page.locator("#quick-result").textContent(),
    /1.234 × 0.830 m/,
  );
  // Las piezas reutilizan el mismo conversor y el croquis conserva la unidad.
  await page.evaluate(() => vidresNavigate("inicio"));
  await page.locator("#add").click();
  await page.locator("#new-measure-add").click();
  const piece = page.locator(".new-measure-piece");
  await piece.locator('[data-new-measure="ancho"]').fill("1.234");
  await piece.locator('[data-new-measure="alto"]').fill("0.830");
  assert.match(await piece.locator(":scope > output").textContent(), /1.0242/);
  const dims = await page.evaluate(() => vidresNewMeasures.read("VS-FICTICIO"));
  assert.equal(dims[0].ancho, 123.4);
  assert.equal(dims[0].alto, 83);
  await piece.locator("summary").click();
  await piece.locator("[data-case-toggle]").click();
  await piece.locator("[data-sketch-cota]").click();
  const canvas = piece.locator("canvas");
  await canvas.click({ position: { x: 20, y: 50 } });
  await canvas.click({ position: { x: 150, y: 50 } });
  const keypad = page.locator(".sketch-keypad[open]");
  for (const key of ["1", ",", "2", "3", "4"])
    await keypad.locator(`[data-kp="${key}"]`).click();
  assert.match(
    await keypad.locator("[data-keypad-feedback]").textContent(),
    /= 1 m 23 cm 4 mm/,
  );
  await keypad.locator("[data-kp-accept]").click();
  assert.deepEqual(
    await page.evaluate(() => {
      const d = vidresNewMeasures.read("VS-FICTICIO")[0].croquis.dims[0];
      return { valor: d.valor, unit: d.unit };
    }),
    { valor: "1,234", unit: "m" },
  );
  await page.locator(".sketch-expanded[open] [data-sketch-return]").click();
  await page.locator("#cancel").click();
  await page.evaluate(
    async (values) => VSStorage.replaceValues(values),
    original,
  );
  await page.reload();
  await page.locator("#title").filter({ hasText: "Inicio" }).waitFor();
  console.log(
    "PASS metros: validación, foco, cálculo sin conexión, PDF, legado, unidades, rápido, piezas, croquis y cuatro anchuras",
  );
};
