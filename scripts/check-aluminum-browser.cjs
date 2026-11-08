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
  await page.evaluate(() => window.vidresNavigate("inicio"));
  console.log(
    "PASS aluminio: dibujo, cálculo, guardado, recarga, duplicado y PDF cliente/interno",
  );
};
