const assert = require("node:assert/strict");
module.exports = async (page) => {
  const original = await page.evaluate(() => VSStorage.values());
  await page.evaluate(async () => {
    await VSStorage.patchValues({
      [VSStorage.keys.clientes]: [
        {
          id: "cliente-registrado",
          nombre: "Cliente Registrado",
          telefono: "600654321",
          direccion: "Plaza Registrada",
        },
      ],
      [VSStorage.keys.trabajos]: [
        {
          id: "T-CLIENTE-SIN-FICHA",
          cliente: "Ana García",
          estado: "Pendiente",
          telefono: "600123456",
          direccion: "Calle del ejemplo",
        },
      ],
      [VSStorage.keys.presupuestos]: [
        {
          id: "P-CLIENTE-SOLO-OFERTA",
          client: "Cliente Solo Oferta",
          clientSource: "quote",
          clientData: { phone: "600987654", address: "Avenida Oferta" },
          lines: [
            { kind: "concept", description: "Oferta anterior", amount: 50 },
          ],
        },
      ],
    });
    vidresReloadData();
    vidresNavigate("presupuestos");
  });
  await page.locator("#quote-new").click();
  // Los tres orígenes se buscan desde el selector y desde el nombre.
  await require("./search-select-browser.cjs")(
    page,
    "#quote-existing-client",
    "0",
    "Plaza Registrada",
  );
  assert.equal(
    await page.locator("#quote-client").inputValue(),
    "Cliente Registrado",
  );
  await page.locator("#quote-client").fill("solo oferta");
  await page
    .locator("[data-quote-client-option]")
    .filter({ hasText: "Cliente Solo Oferta" })
    .click();
  assert.equal(
    await page.locator("#quote-client").inputValue(),
    "Cliente Solo Oferta",
  );
  assert.equal(
    await page.locator('[data-quote-client="phone"]').inputValue(),
    "600987654",
  );
  // La búsqueda debe incluir a los clientes visibles en Clientes, aunque solo tengan un parte.
  assert.match(
    await page.locator("#quote-existing-client").textContent(),
    /Ana García/,
  );
  await page.locator("#quote-client").fill("garcia");
  await page
    .locator("[data-quote-client-option]")
    .filter({ hasText: "Ana García" })
    .click();
  assert.equal(await page.locator("#quote-client").inputValue(), "Ana García");
  assert.equal(
    await page.locator('[data-quote-client="phone"]').inputValue(),
    "600123456",
  );
  assert.equal(await page.locator("#quote-job").inputValue(), "");
  await page.locator("#quote-add-concept").click();
  await page.locator('[data-field="description"]').fill("Oferta sin parte");
  await page.locator('[data-field="amount"]').fill("100");
  await page.locator("#quote-save").click();
  await page.waitForFunction(
    () => VSStorage.read(VSStorage.keys.presupuestos, []).length === 2,
  );
  const linked = await page.evaluate(() =>
    VSStorage.read(VSStorage.keys.presupuestos, []).find(
      (q) => q.client === "Ana García",
    ),
  );
  assert.ok(linked.clientId);
  assert.equal(linked.job, "");
  await page.locator("#quote-new").click();
  await page.locator("#quote-client").fill("Ana García");
  assert.equal(await page.locator("[data-quote-client-option]").count(), 1);
  await page.locator("[data-quote-client-new]").click();
  assert.equal(
    await page.locator('[data-quote-client="phone"]').inputValue(),
    "",
  );
  await page.locator("#quote-add-concept").click();
  await page.locator('[data-field="description"]').fill("Oferta para otra Ana");
  await page.locator('[data-field="amount"]').fill("75");
  await page.locator("#quote-save").click();
  await page.waitForFunction(
    () => VSStorage.read(VSStorage.keys.presupuestos, []).length === 3,
  );
  const second = await page.evaluate(
    () =>
      VSStorage.read(VSStorage.keys.presupuestos, []).filter(
        (q) => q.client === "Ana García",
      )[1],
  );
  assert.notEqual(second.clientId, linked.clientId);
  await page.reload();
  await page.locator("#title").filter({ hasText: "Inicio" }).waitFor();
  await page.evaluate(() => vidresNavigate("clientes"));
  for (const q of [linked, second]) {
    const card = page
      .locator(".client-card")
      .filter({ has: page.locator(`[data-client-edit="${q.clientId}"]`) });
    assert.equal(await card.locator("[data-client-quote]").count(), 1);
    await card.locator("details").last().locator("summary").click();
    await card.locator("[data-client-quote]").click();
    assert.equal(await page.locator("#quote-job").inputValue(), "");
    await page.evaluate(() => vidresNavigate("clientes"));
  }
  await page.evaluate(async (values) => {
    await VSStorage.replaceValues(values);
    vidresReloadData();
    vidresNavigate("inicio");
  }, original);
  console.log(
    "PASS clientes en presupuestos: búsqueda de cliente registrado por dirección, cliente de presupuesto anterior y cliente de parte sin ficha, selección explícita, homónimo nuevo, presupuesto sin parte y fichas tras recargar",
  );
};
