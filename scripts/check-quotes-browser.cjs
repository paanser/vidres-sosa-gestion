const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

// Se ejecuta desde check-browser.cjs contra su servidor simulado y datos ficticios.
module.exports = async function checkQuotes(page, context, root) {
  await page.evaluate(() => window.vidresNavigate("presupuestos"));
  const set = async (selector, value) => {
    await page.locator(selector).fill(value);
    await page.locator(selector).dispatchEvent("change");
  };
  await page.evaluate(() => {
    window.quotePrintCount = 0;
    window.print = () => window.quotePrintCount++;
  });
  await set("#quote-client", "Cliente ficticio de prueba");
  assert.equal(await page.locator('[name="quote-margin-mode"]').count(), 0);
  await page.locator('[data-field="tariff"]').selectOption("reuglass-2-0");
  assert.equal(
    await page.locator('[data-field="price"]').inputValue(),
    "16.72",
  );
  assert.match(
    await page.locator('[data-field="glass"]').inputValue(),
    /Float 4/,
  );
  await page.locator('[data-field="tariff"]').selectOption("");

  await set('[data-field="glass"]', "Vidrio especial sin tarifa");
  await set('[data-field="w"]', "120");
  await set('[data-field="h"]', "120");
  await set('[data-field="price"]', "100");
  await set('[data-field="extraDescription"]', "Montaje interno reservado");
  await set('[data-field="extraAmount"]', "50");
  await set("#quote-margin", "20");
  assert.match(
    await page.locator(".quote-grand-total").textContent(),
    /269,59/,
  );
  await page.locator("#quote-add-concept").click();
  const description = 'Trabajo especial <img src=x onerror="alert(1)">';
  await set('[data-field="description"]', description);
  await set('[data-field="amount"]', "100");
  assert.match(
    await page.locator(".quote-grand-total").textContent(),
    /390,59/,
  );
  await page.locator("#quote-pdf").click();
  let client = await page.locator("#quote-print").textContent();
  assert.match(client, /390,59/);
  assert.ok(client.includes(description));
  assert.doesNotMatch(client, /Coste|Margen|Montaje interno reservado/);
  assert.equal(await page.locator("#quote-print img").count(), 0);
  await page.locator("#quote-whatsapp").click();
  let message = await page
    .locator('#quote-message-form [name="mensaje"]')
    .inputValue();
  assert.match(message, /390,59/);
  assert.doesNotMatch(message, /Coste|Margen|Montaje interno reservado/);
  await page.locator("#quote-message-cancel").click();
  await page.locator('[data-field="extraMode"]').selectOption("separate");
  await page.locator("#quote-pdf").click();
  client = await page.locator("#quote-print").textContent();
  assert.match(client, /Montaje interno reservado/);
  assert.match(client, /50,00/);
  assert.match(client, /390,59/);
  await page.locator("#quote-whatsapp").click();
  message = await page
    .locator('#quote-message-form [name="mensaje"]')
    .inputValue();
  assert.match(message, /Montaje interno reservado:.*50,00/);
  await page.locator("#quote-message-cancel").click();
  await page.locator("#quote-pdf-internal").click();
  const internal = await page.locator("#quote-print").textContent();
  assert.match(internal, /No entregar al cliente/);
  assert.match(internal, /Coste interno/);
  assert.match(internal, /precio del vidrio.*20 %/);
  assert.match(internal, /Montaje interno reservado/);
  assert.match(internal, /390,59/);

  // El porcentaje comercial inválido y los costes negativos no se guardan.
  const key = "vs-quote-prototype-v1";
  const countBefore = await page.evaluate(
    (key) => VSStorage.read(key, []).length,
    key,
  );
  await set("#quote-margin", "-1");
  await page.locator("#quote-save").click();
  assert.equal(
    await page.evaluate((key) => VSStorage.read(key, []).length, key),
    countBefore,
  );
  await set("#quote-margin", "20");
  await set('[data-field="amount"]', "-5");
  await page.locator("#quote-save").click();
  assert.equal(
    await page.evaluate((key) => VSStorage.read(key, []).length, key),
    countBefore,
  );
  await set('[data-field="amount"]', "100");
  await page.locator("#quote-save").click();
  await page.waitForFunction(
    (key) =>
      VSStorage.read(key, []).some(
        (q) => q.client === "Cliente ficticio de prueba",
      ),
    key,
  );
  const saved = await page.evaluate(
    (key) =>
      VSStorage.read(key, []).find(
        (q) => q.client === "Cliente ficticio de prueba",
      ),
    key,
  );
  assert.equal(saved.pricing.marginMode, "cost");
  assert.equal(saved.pricing.marginScope, "glass");
  assert.equal(saved.lines[0].extraMode, "separate");
  assert.equal(saved.lines[1].description, description);
  await page.reload();
  await page.locator("#title").filter({ hasText: "Inicio" }).waitFor();
  await page.evaluate((id) => window.vidresQuoteOpenSaved(id), saved.id);
  assert.match(
    await page.locator(".quote-grand-total").textContent(),
    /390,59/,
  );
  assert.equal(
    await page.locator('[data-field="description"]').inputValue(),
    description,
  );
  await page.locator(`[data-duplicate="${saved.id}"]`).click();
  assert.match(
    await page.locator(".quote-grand-total").textContent(),
    /390,59/,
  );
  assert.equal(await page.locator('[data-field="price"]').inputValue(), "100");

  await fs.mkdir(path.join(root, "test-results"), { recursive: true });
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Desbordamiento a ${width} px`,
    );
    for (const selector of [
      "#quote-margin",
      '[data-field="amount"]',
      "#quote-pdf",
      "#quote-pdf-internal",
    ]) {
      assert.ok(await page.locator(selector).isVisible());
      const box = await page.locator(selector).boundingBox();
      assert.ok(box.width > 30 && box.x >= 0 && box.x + box.width <= width + 1);
    }
    await page.screenshot({
      path: path.join(root, "test-results", `presupuesto-${width}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // Un presupuesto puede contener solo un concepto libre, sin vidrio.
  await page.locator('[data-remove="0"]').click();
  assert.equal(await page.locator('[data-field="w"]').count(), 0);
  assert.match(
    await page.locator(".quote-grand-total").textContent(),
    /121,00/,
  );
  await page.locator("#quote-save").click();
  await page.waitForFunction(
    (key) =>
      VSStorage.read(key, []).some(
        (q) => q.lines.length === 1 && q.lines[0].kind === "concept",
      ),
    key,
  );
  await page.locator("#quote-pdf").click();
  assert.match(await page.locator("#quote-print").textContent(), /121,00/);
  await page.evaluate(() => window.vidresNavigate("inicio"));
  console.log(
    "PASS presupuestos: incremento solo vidrio y tarifas Reuglass, extras, concepto libre, PDF interno/cliente, WhatsApp, validación, persistencia y 390/768/1024/1440 px",
  );
};
