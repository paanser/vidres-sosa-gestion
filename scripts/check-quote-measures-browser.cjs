const assert = require("node:assert/strict");
const path = require("node:path");

module.exports = async function checkQuoteMeasures(page, context, root) {
  const fixture = await page.evaluate(async () => {
    const jobs = vidresGetJobs(),
      measures = vidresGetMeasurements(),
      config = VSStorage.read(VSStorage.keys.configuracion, {}),
      quotes = VSStorage.read(VSStorage.keys.presupuestos, []),
      first = jobs[0],
      second = { ...first, id: "VS-REFERENCIA-2", cliente: "Otro parte" };
    await VSStorage.patchValues({
      [VSStorage.keys.trabajos]: [...jobs, second],
      [VSStorage.keys.mediciones]: measures.map((m) => ({
        ...m,
        espesor: "6",
        observaciones: "Medida original <img src=x onerror=alert(1)>",
        croquis: {
          pageHeight: 700,
          notes: "Revisar hueco antes de instalar",
          strokes: [
            {
              color: "#17251e",
              width: 3,
              points: [
                [100, 100],
                [500, 100],
                [500, 450],
              ],
            },
          ],
          dims: [{ id: "D-REF", a: [100, 100], b: [500, 100], valor: "100" }],
        },
      })),
    });
    const paper = (
        await VSFiles.all("photos", { trabajo: first.id, tipo: "medidas" })
      )[0],
      otherPhoto = await VSFiles.put("photos", {
        ...paper,
        id: crypto.randomUUID(),
        trabajo: second.id,
        nombre: "otro-parte.jpg",
      }),
      normalPhoto = await VSFiles.put("photos", {
        ...paper,
        id: crypto.randomUUID(),
        tipo: "normal",
        nombre: "foto-trabajo.jpg",
      });
    vidresReloadData();
    vidresQuoteStartForJob(
      first.id,
      first.cliente,
      vidresGetMeasurements().filter((m) => m.trabajo === first.id),
    );
    return {
      jobs,
      measures,
      config,
      quotes,
      first: first.id,
      second: second.id,
      paper: paper.id,
      otherPhoto: otherPhoto.id,
      normalPhoto: normalPhoto.id,
    };
  });
  const fileRequests = [],
    track = (request) => {
      const id = new URL(request.url()).pathname.match(
        /^\/api\/files\/([^/]+)$/,
      )?.[1];
      if (request.method() === "GET" && id) fileRequests.push(id);
    };
  page.on("request", track);
  assert.equal(await page.locator("#quote-job").inputValue(), fixture.first);
  assert.equal(
    await page.locator("#quote-measures").getAttribute("open"),
    null,
  );
  await page.locator("#quote-measures > summary").click();
  await page.locator("[data-quote-paper] img").waitFor();
  assert.deepEqual(fileRequests, [fixture.paper]);
  assert.match(
    await page.locator("#quote-measures").textContent(),
    /100 × 80 cm · 1 ud. · Espesor: 6 mm/,
  );
  assert.match(
    await page.locator("#quote-measures").textContent(),
    /Revisar hueco antes de instalar/,
  );
  assert.equal(await page.locator(".quote-measure-grid img").count(), 1);
  assert.equal(await page.locator("[data-quote-paper] img").count(), 1);
  for (const selector of [
    ".quote-measure-grid [data-quote-reference]",
    "[data-quote-paper] [data-quote-reference]",
  ]) {
    await page.locator(selector).click();
    assert.equal(await page.locator("#measure-photo-viewer").isVisible(), true);
    assert.equal(
      await page
        .locator("#measure-photo-viewer img")
        .evaluate((img) => img.complete && img.naturalWidth > 0),
      true,
    );
    await page.locator(".measure-photo-close").click();
  }
  await page.locator('[data-field="price"]').fill("100");
  await page.locator('[data-field="price"]').dispatchEvent("change");
  assert.equal(
    await page.locator("#quote-measures").evaluate((panel) => panel.open),
    true,
  );
  assert.deepEqual(fileRequests, [fixture.paper]);
  await page.locator("#quote-save").click();
  await page.waitForFunction(() =>
    VSStorage.read(VSStorage.keys.presupuestos, []).some((q) => q.job),
  );
  const saved = await page.evaluate(
    (job) =>
      VSStorage.read(VSStorage.keys.presupuestos, []).find((q) => q.job === job)
        .id,
    fixture.first,
  );
  await page.locator("#quote-new").click();
  await page.locator(`[data-load="${saved}"]`).click();
  await page.locator("#quote-measures > summary").click();
  await page.locator("[data-quote-paper] img").waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `Desbordamiento a ${width}px`,
    );
    await page.screenshot({
      path: path.join(root, "test-results", `medidas-presupuesto-${width}.png`),
      fullPage: true,
    });
  }
  // La unidad del presupuesto cambia; las medidas originales siguen guardadas en cm.
  await page.evaluate(async () => {
    await VSStorage.write(VSStorage.keys.configuracion, {
      ...VSStorage.read(VSStorage.keys.configuracion, {}),
      unit: "mm",
    });
    vidresNavigate("inicio");
    vidresNavigate("presupuestos");
  });
  assert.match(
    await page.locator("#quote-measures").textContent(),
    /1000 × 800 mm/,
  );
  await page.locator("#quote-job").selectOption(fixture.second);
  await page.locator("#quote-measures > summary").click();
  await page.locator('[data-quote-paper] img[alt="otro-parte.jpg"]').waitFor();
  assert.equal(await page.locator(".quote-measure-grid article").count(), 0);
  assert.doesNotMatch(
    await page.locator("#quote-measures").textContent(),
    /Revisar hueco/,
  );
  assert.equal(await page.locator('[data-field="price"]').inputValue(), "100");
  await page.locator("#quote-job").selectOption("");
  assert.equal(await page.locator("#quote-measures").count(), 0);

  // Un fallo de descarga se puede reintentar sin salir del presupuesto.
  const failPhoto = (route) =>
    route.fulfill({
      status: 503,
      body: "Fallo de prueba",
      headers: { "Access-Control-Allow-Origin": "https://paanser.github.io" },
    });
  const photoUrl = `**/api/files/${fixture.paper}`;
  await context.route(photoUrl, failPhoto);
  await page.locator("#quote-job").selectOption(fixture.first);
  await page.locator("#quote-measures > summary").click();
  await page.locator("#quote-measures-retry").waitFor();
  await context.unroute(photoUrl, failPhoto);
  await page.locator("#quote-measures-retry").click();
  await page.locator("[data-quote-paper] img").waitFor();

  // Si cambia el parte durante la descarga, la foto anterior no se muestra.
  await page.locator("#quote-job").selectOption("");
  let releasePhoto;
  const gate = new Promise((resolve) => {
      releasePhoto = resolve;
    }),
    delayedPhoto = async (route) => {
      await gate;
      await route.fallback();
    };
  await context.route(photoUrl, delayedPhoto);
  await page.locator("#quote-job").selectOption(fixture.first);
  const started = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === `/api/files/${fixture.paper}`,
  );
  await page.locator("#quote-measures > summary").click();
  await started;
  await page.locator("#quote-job").selectOption(fixture.second);
  await page.locator("#quote-measures > summary").click();
  await page.locator('[data-quote-paper] img[alt="otro-parte.jpg"]').waitFor();
  const finished = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/files/${fixture.paper}`,
  );
  releasePhoto();
  await (await finished).finished();
  await context.unroute(photoUrl, delayedPhoto);
  assert.equal(
    await page.locator('[data-quote-paper] img[alt="medida.png"]').count(),
    0,
  );

  await page.locator("#quote-quick").click();
  await page.evaluate((id) => vidresQuoteOpenSaved(id), saved);
  assert.equal(await page.locator("#quote-job").inputValue(), fixture.first);
  await page.locator("#quote-quick").click();
  await page.evaluate(
    (id) => vidresQuoteStartForJob(id, "Otro parte"),
    fixture.second,
  );
  assert.equal(await page.locator("#quote-job").inputValue(), fixture.second);
  await page.evaluate((id) => VSFiles.remove("photos", id), fixture.otherPhoto);
  await page.locator("#quote-job").selectOption(fixture.first);
  await page.locator("#quote-job").selectOption(fixture.second);
  await page.locator("#quote-measures > summary").click();
  await page
    .locator("[data-quote-paper]")
    .filter({ hasText: "No hay fotos de medidas" })
    .waitFor();
  page.off("request", track);

  await page.evaluate(async (f) => {
    await VSFiles.remove("photos", f.normalPhoto);
    await VSStorage.patchValues({
      [VSStorage.keys.trabajos]: f.jobs,
      [VSStorage.keys.mediciones]: f.measures,
      [VSStorage.keys.configuracion]: f.config,
      [VSStorage.keys.presupuestos]: f.quotes,
    });
    vidresReloadData();
    vidresNavigate("inicio");
  }, fixture);
  await page.setViewportSize({ width: 390, height: 844 });
  console.log(
    "PASS medidas en presupuestador: piezas, notas escapadas, croquis, fotos filtradas, ampliación, edición, reapertura, cm/mm, reintento y 320/390/768/1440 px",
  );
};
