const assert = require("node:assert/strict");
module.exports = async (page) => {
  await page.evaluate(() => vidresNavigate("presupuestos"));
  await page.locator("#quote-new").click();
  const set = async (selector, value) => {
    await page.locator(selector).fill(value);
    await page.locator(selector).dispatchEvent("change");
  };
  await set("#quote-client", "Recargos prueba");
  await page.locator('[data-field="doubleGlazing"]').check();
  await set('[data-field="w"]', "3.000");
  await set('[data-field="h"]', "1.800");
  const notice = page.locator(".quote-surcharge-notice");
  assert.match(await notice.textContent(), /2.400 mm.*20 %.*5 m².*50 %/);
  assert.doesNotMatch(await notice.textContent(), /superior a 4 m²/);
  await page.locator("#quote-surcharges > summary").click();
  await page.locator('[data-surcharge-rule="area5"]').uncheck();
  assert.match(await notice.textContent(), /50 %: desactivado/);
  await page
    .locator(".quote-line details > summary")
    .filter({ hasText: "Formas y mecanizados" })
    .click();
  await page.locator('[data-field="surcharge_circles"]').check();
  assert.match(await notice.textContent(), /Círculos.*100 %/);
  await page.locator("#quote-save").click();
  await page.waitForFunction(() =>
    VSStorage.read("vs-quote-prototype-v1", []).some(
      (q) => q.client === "Recargos prueba",
    ),
  );
  const saved = await page.evaluate(() =>
    VSStorage.read("vs-quote-prototype-v1", []).find(
      (q) => q.client === "Recargos prueba",
    ),
  );
  assert.equal(saved.pricing.surchargeRules.area5, false);
  assert.equal(saved.lines[0].surcharge_circles, true);
  await page.locator("#quote-close").click();
  await page.locator(`button[data-load="${saved.id}"]`).click();
  assert.match(await notice.textContent(), /50 %: desactivado/);
  assert.match(await notice.textContent(), /Círculos.*100 %/);
  await page.locator("#quote-close").click();
  await page.locator("#quote-quick").click();
  await page.locator('[data-field="doubleGlazing"]').check();
  await set("#quick-w", "3.000");
  await set("#quick-h", "1.800");
  assert.match(
    await page.locator("#quick-result").textContent(),
    /superior a 5 m²/,
  );
  await page.locator("#quote-surcharges > summary").click();
  await page.locator('[data-surcharge-rule="area5"]').uncheck();
  assert.match(
    await page.locator("#quick-result").textContent(),
    /50 %: desactivado/,
  );
  await page.locator("#quick-close").click();
  await page.evaluate(async (quote) => {
    const key = "vs-quote-prototype-v1";
    const legacyLine = {
      w: 275.4,
      h: 258.5,
      price: 29.95,
      thickness: 4,
      qty: 1,
    };
    const { surchargeRules, ...pricing } = quote.pricing;
    await VSStorage.write(key, [
      ...VSStorage.read(key, []),
      {
        ...quote,
        id: "P-LEGACY-RECARGOS",
        client: "Presupuesto anterior de prueba",
        pricing,
        lines: [
          legacyLine,
          { ...legacyLine, sizeSupplement: false },
          { ...quote.lines[0], surcharge_circles: false },
        ],
      },
    ]);
    vidresNavigate("inicio");
    vidresNavigate("presupuestos");
  }, saved);
  await page.locator('button[data-load="P-LEGACY-RECARGOS"]').click();
  const savedLine = page.locator('[data-line="0"]');
  assert.match(
    await savedLine.locator(".quote-result").textContent(),
    /Por medidas \(20 %\): 43,65/,
  );
  assert.match(
    await savedLine.locator(".quote-result").textContent(),
    /Por metraje \(20 %\): 43,65/,
  );
  assert.equal(
    await savedLine.locator('[data-field="sizeSupplement"]').isChecked(),
    true,
  );
  assert.equal(
    await page.locator('[data-surcharge-rule="longSide"]').isChecked(),
    true,
  );
  await page.locator("#quote-close").click();
  const duplicate = page.locator('[data-duplicate="P-LEGACY-RECARGOS"]');
  const options = duplicate.locator("xpath=ancestor::details");
  if (await options.count()) await options.locator("summary").click();
  await duplicate.click();
  const first = page.locator('[data-line="0"] .quote-result');
  const second = page.locator('[data-line="1"] .quote-result');
  assert.match(await first.textContent(), /Por medidas \(20 %\): 43,65/);
  assert.match(await first.textContent(), /Por metraje \(20 %\): 43,65/);
  assert.doesNotMatch(await second.textContent(), /Por medidas/);
  assert.match(await second.textContent(), /Por metraje \(20 %\): 43,65/);
  const third = page.locator('[data-line="2"] .quote-result');
  assert.match(await third.textContent(), /2.400 mm · 20 %: \d/);
  assert.match(await third.textContent(), /5 m² · 50 %: \d/);
  await page.locator("#quote-close").click();
  console.log(
    "PASS recargos: detección, tramo único, casillas, formas, presupuestos anteriores, duplicación y presupuesto rápido",
  );
};
