const assert = require("node:assert/strict");
module.exports = async (page, context, root) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const slowSave = async (route) => {
    if (route.request().method() === "PUT")
      await new Promise((resolve) => setTimeout(resolve, 150));
    await route.fallback();
  };
  await page.route("**/api/state", slowSave);
  await page.evaluate(async () => {
    const keys = VSStorage.keys,
      values = VSStorage.values();
    values[keys.trabajos].push({
      id: "VS-OPS",
      cliente: "Obra de prueba",
      descripcion: "Sustitución de templado",
      estado: "Para instalar",
      responsable: "Pau",
      fecha: "2026-11-13",
      hora: "10:00",
      duracion: "60",
    });
    values[keys.trabajos].push({
      id: "VS-OPS-B",
      cliente: "Conflicto",
      estado: "Pendiente",
      responsable: "Pau",
      fecha: "2026-11-13",
      hora: "10:30",
      duracion: "60",
    });
    values[keys.mediciones].push({
      id: "measure-ops",
      trabajo: "VS-OPS",
      ancho: 120,
      alto: 50,
      cantidad: 8,
      tipo: "Templado",
      espesor: "6",
      observaciones: "Canto pulido",
      croquis: {
        strokes: [
          {
            points: [
              [10, 10],
              [150, 10],
              [150, 100],
              [10, 100],
              [10, 10],
            ],
          },
        ],
        dims: [],
      },
    });
    await VSStorage.replaceValues(values);
    vidresReloadData();
    VSOperations.open("VS-OPS");
  });
  const dialog = page.locator("#operations-dialog");
  const submit = async () => {
    await dialog.locator('form button[type="submit"]').click();
    await dialog
      .getByText("Guardado y confirmado por el servidor.", { exact: true })
      .waitFor();
  };
  await dialog.locator('[data-op="order"]').click();
  await dialog.locator('[name="proveedor"]').fill("Fábrica <prueba>");
  await dialog.locator('[name="entrega"]').fill("2026-11-12");
  await dialog.locator('[name="reviewed"]').check();
  await submit();
  assert.equal(await dialog.locator("script").count(), 0);
  await dialog.locator('[data-op="receive"]').click();
  await dialog.locator('input[type="number"]').fill("6");
  await submit();
  await dialog.getByText("6 de 8 piezas recibidas", { exact: true }).waitFor();
  await dialog.locator('[data-op="edit-order"]').click();
  await dialog.locator('[name="referencia"]').fill("FAB-2026");
  await submit();
  await dialog.locator('[data-op="order-pdf"]').click();
  let downloadPromise = page.waitForEvent("download");
  await dialog.locator("#operations-pdf a[download]").click();
  let download = await downloadPromise;
  const fs = require("node:fs/promises");
  assert.ok(
    (await fs.readFile(await download.path())).subarray(0, 5).toString() ===
      "%PDF-",
  );
  // Supplier snapshots survive later changes to job measurements.
  await page.evaluate(async () => {
    const m = VSStorage.measurements.get();
    m.find((x) => x.id === "measure-ops").ancho = 999;
    await VSStorage.measurements.replace(m);
  });
  assert.equal(
    await page.evaluate(
      () =>
        VSStorage.read(VSStorage.keys.trabajos, []).find(
          (x) => x.id === "VS-OPS",
        ).operativa.pedidos[0].piezas[0].ancho,
    ),
    120,
  );
  await dialog.locator('form[data-op-form="sale"] [name="venta"]').fill("1210");
  await dialog.locator('form[data-op-form="sale"] [type="submit"]').click();
  await dialog
    .getByText("Guardado y confirmado por el servidor.", { exact: true })
    .waitFor();
  await dialog
    .locator('form[data-op-form="net-sale"] [name="ventaNeta"]')
    .fill("1000");
  await dialog.locator('form[data-op-form="net-sale"] [type="submit"]').click();
  await dialog
    .getByText("Guardado y confirmado por el servidor.", { exact: true })
    .waitFor();
  await dialog.locator('[data-op="payment"]').click();
  await dialog.locator('[name="concepto"]').fill("Anticipo transferencia");
  await dialog.locator('[name="importe"]').fill("210");
  await submit();
  await dialog.locator('[data-op="cost"]').click();
  await dialog.locator('[name="concepto"]').fill("Vidrio y montaje");
  await dialog.locator('[name="importe"]').fill("400");
  await submit();
  await dialog.getByText(/Beneficio provisional:/).waitFor();
  const balance = await page.evaluate(() =>
    VSOperationsModel.finances(
      VSStorage.read(VSStorage.keys.trabajos, []).find((x) => x.id === "VS-OPS")
        .operativa,
    ),
  );
  assert.equal(balance.balance, 1000);
  assert.equal(balance.costs, 400);
  await dialog.locator('[data-op="schedule"]').click();
  await dialog.locator('form [type="submit"]').click();
  await dialog
    .locator("[data-op-message]")
    .filter({ hasText: "ya tiene un trabajo" })
    .waitFor();
  await dialog.locator('[name="hora"]').fill("12:00");
  await dialog.locator('[name="confirmed"]').check();
  await submit();
  await dialog.locator('[data-op="closure"]').click();
  await dialog.locator('[name="nombre"]').fill("Cliente prueba");
  await dialog.locator('[name="conforme"]').check();
  await dialog.locator('[name="incidencias"]').fill("Sin incidencias");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
    "base64",
  );
  await dialog
    .locator('[name="photos"]')
    .setInputFiles({ name: "montaje.png", mimeType: "image/png", buffer: png });
  await dialog.locator("canvas").scrollIntoViewIfNeeded();
  const canvas = await dialog.locator("canvas").boundingBox();
  await page.mouse.move(canvas.x + 20, canvas.y + 40);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 100, canvas.y + 90, { steps: 8 });
  await page.mouse.up();
  await submit();
  await dialog.locator('[data-op="close-pdf"]').click();
  await dialog.locator("#operations-pdf a[download]").waitFor();
  const closure = await page.evaluate(
    () =>
      VSStorage.read(VSStorage.keys.trabajos, []).find((x) => x.id === "VS-OPS")
        .operativa.cierre,
  );
  assert.ok(closure.firma.flat().length > 1);
  assert.equal(closure.fotos.length, 1);
  assert.match(closure.fotos[0], /^[a-f0-9]{32}$/);
  // Persist, reload and verify all business state through the real Worker fixture.
  await dialog.locator('[data-op="close"]').click();
  await page.reload();
  await page
    .locator("#nav button[disabled]")
    .first()
    .waitFor({ state: "detached" });
  await page.evaluate(() => VSOperations.open("VS-OPS"));
  await dialog.getByText("6 de 8 piezas recibidas", { exact: true }).waitFor();
  await dialog.locator('[data-op="close-pdf"]').click();
  await dialog.locator("#operations-pdf a[download]").waitFor();
  await dialog.locator('[data-op="overview"]').click();
  await dialog.getByText(/Entrega vencida:/).waitFor();
  await dialog.locator('[data-op="drafts"]').click();
  await context.setOffline(true);
  await dialog.locator('[data-op="draft-new"]').click();
  await dialog.locator('[name="nombre"]').fill("Medición local");
  await dialog.locator('[name="ancho"]').fill("1.2");
  await dialog.locator('[name="alto"]').fill("0.5");
  await dialog
    .locator('[name="photos"]')
    .setInputFiles({ name: "medidas.png", mimeType: "image/png", buffer: png });
  await dialog.locator('form [type="submit"]').click();
  await dialog
    .getByText("Borrador guardado en este dispositivo.", { exact: true })
    .waitFor();
  await context.setOffline(false);
  await dialog.locator('[data-op="close"]').click();
  await page.reload();
  await page
    .locator("#nav button[disabled]")
    .first()
    .waitFor({ state: "detached" });
  await page.evaluate(() => VSOperations.open());
  await dialog.locator('[data-op="drafts"]').click();
  await dialog.locator('[data-op="draft-open"]').click();
  await dialog.locator('[name="job"]').selectOption("VS-OPS");
  const failPhoto = async (route) => {
    if (route.request().method() === "PUT") await route.abort("failed");
    else await route.fallback();
  };
  await page.route("**/api/files/*", failPhoto);
  await dialog
    .locator('form[data-op-form="draft-import"] [type="submit"]')
    .click();
  await dialog
    .locator("[data-op-message]")
    .filter({ hasText: "No se pudo guardar" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        VSStorage.measurements
          .get()
          .filter((m) => m.id.startsWith("draft-") && m.trabajo === "VS-OPS")
          .length,
    ),
    1,
  );
  await page.unroute("**/api/files/*", failPhoto);
  await dialog
    .locator('form[data-op-form="draft-import"] [type="submit"]')
    .click();
  await dialog
    .getByText(
      "Medición y fotos confirmadas por el servidor. Se ha retirado el borrador local.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.evaluate(
      () =>
        VSStorage.measurements
          .get()
          .filter((m) => m.id.startsWith("draft-") && m.trabajo === "VS-OPS")
          .length,
    ),
    1,
  );
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await dialog.locator('[data-op="overview"]').click();
    assert.equal(
      await dialog.evaluate((d) => d.scrollWidth > d.clientWidth + 1),
      false,
    );
    await page.screenshot({
      path: `${root}/test-results/operations-${width}.png`,
    });
    await page.evaluate(() => VSOperations.open("VS-OPS"));
  }
  page.removeAllListeners("dialog");
  page.once("dialog", (d) => d.accept("Plantilla de templado"));
  await dialog.locator('[data-op="template"]').click();
  await dialog
    .locator("[data-op-message]")
    .filter({ hasText: "Plantilla guardada" })
    .waitFor();
  page.on("dialog", (d) => d.accept());
  await dialog.locator('[data-op="close"]').click();
  await page.locator("#add").click();
  const templateId = await page.evaluate(
    () =>
      vidresPlantillasList().find((t) => t.nombre === "Plantilla de templado")
        .id,
  );
  await page.locator("#job-template").selectOption(templateId);
  assert.equal(
    await page.locator('#form [name="descripcion"]').inputValue(),
    "Sustitución de templado",
  );
  assert.ok((await page.locator(".new-measure-piece").count()) > 0);
  await page.locator("#cancel").click();
  await page.unroute("**/api/state", slowSave);
  console.log(
    "PASS pedidos con copia de medidas, recepción parcial, PDF, cobros, rentabilidad, solapamientos, firma/fotos y borradores offline con importación",
  );
};
