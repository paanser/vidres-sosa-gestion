const assert = require("node:assert/strict");
const path = require("node:path");

// Solo usa el Worker de pruebas y presupuestos ficticios.
module.exports = async (page, context, root) => {
  await page.evaluate(() => vidresNavigate("presupuestos"));
  await page.locator("#quote-close").click();
  const original = await page.evaluate(async () => {
    const key = "vidres-section-view-v1:" + VSAuth.user.id + ":presupuestos";
    const previous = {
      quotes: VSStorage.read(VSStorage.keys.presupuestos, []),
      preference: localStorage.getItem(key),
    };
    localStorage.removeItem(key);
    await VSStorage.updateValues((values) => {
      values[VSStorage.keys.presupuestos].push(
        ...["Borrador", "Enviado", "Aceptado", "Rechazado"].map(
          (status, i) => ({
            id: "VISTA-" + [2, 10, 3, 4][i],
            client: "Cliente de vistas",
            date: i < 2 ? "2026-11-14" : "2026-11-13",
            status,
            lines: [
              {
                kind: "concept",
                description: 'Montaje <img src=x onerror="alert(1)">',
                amount: 100,
              },
            ],
          }),
        ),
      );
    });
    vidresNavigate("presupuestos");
    return previous;
  });
  assert.equal(await page.locator(".quote-editor").count(), 0);
  assert.equal(await page.locator("#quote-client, #quote-lines").count(), 0);
  assert.equal(await page.locator("#quote-new").isVisible(), true);
  assert.equal(await page.locator("#quote-quick").isVisible(), true);
  assert.equal(await page.locator(".quote-saved-panel").isVisible(), true);
  await page.locator("#quote-quick").click();
  assert.equal(await page.locator(".quick-quote-editor").isVisible(), true);
  assert.equal(await page.locator(".quote-editor").count(), 0);
  await page.locator("#quick-close").click();
  assert.equal(await page.locator(".quote-editor").count(), 0);
  assert.equal(await page.locator(".quote-saved-panel").isVisible(), true);
  await page.locator("#quote-new").click();
  assert.equal(await page.locator(".quote-editor").isVisible(), true);
  await page.locator("#quote-close").click();
  assert.equal(await page.locator(".quote-editor").count(), 0);
  await page.locator("#quote-search").fill("Cliente de vistas");
  assert.equal(
    await page.locator("#section-customize-dialog").isVisible(),
    false,
  );
  assert.equal(await page.locator("[data-section-customize]").count(), 1);
  assert.deepEqual(
    await page.locator(".quote-saved-table th").allTextContents(),
    [
      "Cliente / Detalle",
      "Estado",
      "Númeropresupuesto",
      "Fecha",
      "T. neto",
      "Total",
    ],
  );
  assert.deepEqual(
    await page
      .locator("[data-saved-quote]:visible")
      .evaluateAll((rows) => rows.map((row) => row.dataset.savedQuote)),
    ["VISTA-10", "VISTA-2", "VISTA-4", "VISTA-3"],
  );
  const row = page.locator('[data-saved-quote="VISTA-2"]');
  assert.equal(
    await row.locator(".quote-saved-date").textContent(),
    "14-11-2026",
  );
  assert.match(await row.locator("td").nth(4).textContent(), /100,00/);
  assert.match(await row.locator("td").nth(5).textContent(), /121,00/);
  assert.equal(await row.locator("img").count(), 0);
  assert.match(await row.locator(".quote-saved-detail").textContent(), /<img/);
  assert.equal(
    await row.locator('[role="img"]').getAttribute("aria-label"),
    "Presupuesto no enviado",
  );

  const fdUrl =
    /\/api\/facturadirecta\/quotes\/VISTA-2\?kind=(estimate|invoice)$/;
  let estimateRequests = 0;
  const fdMock = async (route) => {
    if (new URL(route.request().url()).searchParams.get("kind") === "invoice") {
      assert.equal(route.request().method(), "GET");
      return route.fulfill({
        status: 503,
        json: {
          error: "La creación de facturas en FacturaDirecta está desactivada",
        },
      });
    }
    if (route.request().method() === "POST") {
      estimateRequests++;
      assert.deepEqual(route.request().postDataJSON(), {
        confirmation: "fixture",
      });
    }
    await route.fulfill({
      json: estimateRequests
        ? { status: { status: "created", draft: 0, number: "00001" } }
        : {
            review: {
              customer: { name: "Ficha local", taxCode: "12345678X" },
              existing: { name: "Cliente de vistas", taxCode: "12345678X" },
              confirmation: "fixture",
              invoice: {
                sourceReference: "Vidres Sosa VISTA-2",
                vatRate: 21,
                lines: [
                  { description: "Montaje <script>", unitPrice: "100.00" },
                ],
                totals: { base: "100.00", vat: "21.00", total: "121.00" },
              },
            },
          },
    });
  };
  await page.route(fdUrl, fdMock);
  await row.locator(".quote-saved-options summary").click();
  await row.getByRole("button", { name: "Emigrar a FacturaDirecta" }).click();
  const review = page.getByRole("dialog", { name: "FacturaDirecta · VISTA-2" });
  await review.getByRole("button", { name: "Crear presupuesto" }).waitFor();
  assert.match(await review.innerText(), /Cliente de vistas/);
  assert.match(await review.innerText(), /121,00/);
  assert.equal(await review.locator("script").count(), 0);
  assert.equal(
    await review.evaluate(
      (dialog) =>
        dialog.getBoundingClientRect().right <= innerWidth &&
        dialog.scrollWidth <= dialog.clientWidth,
    ),
    true,
  );
  assert.equal(estimateRequests, 0);
  await review.getByRole("button", { name: "Cerrar" }).click();

  await row.locator("[data-load]").click();
  const mobileViewport = page.viewportSize();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .locator(".quote-editor")
    .getByRole("button", { name: "Emigrar a FacturaDirecta" })
    .click();
  const documentType = review.getByLabel("Documento en FacturaDirecta");
  await documentType.selectOption("invoice");
  await review
    .getByText("La creación de facturas en FacturaDirecta está desactivada")
    .waitFor();
  assert.equal(
    await review.getByRole("button", { name: /Emitir|Crear/ }).count(),
    0,
  );
  await documentType.selectOption("estimate");
  await review.getByRole("button", { name: "Crear presupuesto" }).click();
  await review
    .getByText("Presupuesto creado en FacturaDirecta. Número: 00001.")
    .waitFor();
  assert.equal(estimateRequests, 1);
  await review.getByRole("button", { name: "Cerrar" }).click();
  await page.unroute(fdUrl, fdMock);
  await page.setViewportSize(mobileViewport);
  console.log(
    "PASS FacturaDirecta: presupuestos en móvil y escritorio, referencia simulada y facturas desactivadas",
  );
  assert.equal(
    await page.locator("#quote-client").inputValue(),
    "Cliente de vistas",
  );
  await page.locator("#quote-margin").fill("17");
  await page.evaluate(() => {
    window.quoteViewEditor = document.querySelector(".quote-editor");
  });
  const choose = async (view) => {
    await page.locator("[data-section-customize]").click();
    await page.locator("[data-section-view]").selectOption(view);
    await page.locator("[data-section-close]").click();
  };
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const view of ["cards", "compact"]) {
      await choose(view);
      assert.equal(await page.locator("[data-saved-quote]:visible").count(), 4);
      assert.equal(
        await page.locator(".quote-saved-table").count(),
        view === "compact" ? 1 : 0,
      );
      assert.equal(await page.locator("#quote-margin").inputValue(), "17");
      assert.equal(
        await page.evaluate(
          () =>
            window.quoteViewEditor === document.querySelector(".quote-editor"),
        ),
        true,
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      const icon = await page.locator("[data-section-customize]").boundingBox();
      assert.ok(icon.x > width / 2 && icon.y > 750);
      await page.locator(".quote-saved-panel").screenshot({
        path: path.join(
          root,
          "test-results",
          `presupuestos-${view}-${width}.png`,
        ),
      });
    }
  }
  await page.locator("#quote-search").fill("sin coincidencias de vistas");
  assert.equal(await page.locator("#quote-search-empty").isVisible(), true);
  await page.locator("#quote-search").fill("14-11-2026");
  assert.equal(
    await page.locator('[data-saved-quote^="VISTA-"]:visible').count(),
    2,
  );
  await choose("cards");
  await page.reload();
  await page.locator("#title").filter({ hasText: "Inicio" }).waitFor();
  await page.evaluate(() => vidresNavigate("presupuestos"));
  await page.locator(".quote-saved-card").first().waitFor();
  assert.equal(await page.locator(".quote-saved-table").count(), 0);
  assert.equal(await page.locator(".quote-editor").count(), 0);
  await page.locator("[data-section-customize]").click();
  await page.keyboard.press("Escape");
  assert.equal(
    await page.locator("#section-customize-dialog").isVisible(),
    false,
  );
  await page.evaluate(async (previous) => {
    const key = "vidres-section-view-v1:" + VSAuth.user.id + ":presupuestos";
    if (previous.preference === null) localStorage.removeItem(key);
    else localStorage.setItem(key, previous.preference);
    await VSStorage.write(VSStorage.keys.presupuestos, previous.quotes);
    vidresNavigate("presupuestos");
  }, original);
  await page.locator("#quote-search").fill("");
  await page.locator("#quote-new").click();
  await page.setViewportSize({ width: 390, height: 844 });
  console.log(
    "PASS presupuestos: entrada directa a la lista, nuevo, rápido, volver, abrir guardado, tabla/tarjetas, filtros, borrador conservado y móvil/escritorio",
  );
};
