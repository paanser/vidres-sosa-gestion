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
  await page.locator(`[data-load="${saved.id}"]`).click();
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
  console.log(
    "PASS recargos: detección, tramo único, casillas, formas, guardado/reapertura y presupuesto rápido",
  );
};
