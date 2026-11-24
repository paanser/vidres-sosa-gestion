const assert = require("node:assert/strict");
module.exports = async (page) => {
  const enabled = await page.evaluate(() => VSMilestones.enabled);
  await page.evaluate(async (enabled) => {
    await VSStorage.updateValues((v) => {
      v[VSStorage.keys.trabajos].push({
        id: "HITO-TEST",
        cliente: "Cliente Hitos",
        fecha: "2026-11-13",
        estado: "Pendiente",
        ...(enabled ? {} : { hitos: { M: true, F: false } }),
      });
    });
    vidresReloadData();
    vidresNavigate("trabajos");
  }, enabled);
  await page.locator("#search").fill("Cliente Hitos");
  const milestoneUI = page.locator(".milestones, .milestone-filters");
  if (!enabled) {
    assert.equal(await milestoneUI.count(), 0);
    await page.locator("#search").fill("13/11/2026");
    await page.locator('.job-open[data-id="HITO-TEST"]').click();
    const expediente = page.locator("#expediente");
    await expediente.locator('[data-exp-tab="resumen"]').click();
    assert.equal(await milestoneUI.count(), 0);
    await expediente.locator("[data-exp-close]").click();
    assert.deepEqual(
      await page.evaluate(
        () =>
          VSStorage.read(VSStorage.keys.trabajos, []).find(
            (j) => j.id === "HITO-TEST",
          ).hitos,
      ),
      { M: true, F: false },
    );
    console.log(
      "PASS hitos ocultos en trabajos y expediente, con datos guardados",
    );
  } else {
    const badge = page.locator(
      '[data-milestone-id="HITO-TEST"][data-milestone="M"]',
    );
    await badge.click();
    await page.waitForFunction(
      () =>
        VSStorage.read(VSStorage.keys.trabajos, []).find(
          (j) => j.id === "HITO-TEST",
        ).hitos?.M === true,
    );
    assert.equal(await badge.getAttribute("aria-pressed"), "true");
    const advanced = page.locator(".advanced-work-filters");
    if (await advanced.evaluate((details) => details.open))
      await advanced.locator("summary").click();
    const filters = ["#job-scope", "#jobs-milestone", "#jobs-completion"].map(
      (selector) => advanced.locator(selector),
    );
    for (const filter of filters) assert.equal(await filter.isVisible(), false);
    await advanced.locator("summary").click();
    for (const filter of filters) assert.equal(await filter.isVisible(), true);
    await page.locator("#jobs-milestone").selectOption("M");
    assert.equal(await page.locator(".job-card").count(), 1);
    await page.locator("#jobs-completion").selectOption("pending");
    assert.equal(await page.locator(".job-card").count(), 0);
    await advanced.locator("summary").click();
    await page.locator("#search").fill("HITO-TEST");
    for (const filter of filters) assert.equal(await filter.isVisible(), false);
    assert.equal(await page.locator(".job-card").count(), 0);
    await advanced.locator("summary").click();
    assert.equal(await page.locator("#jobs-milestone").inputValue(), "M");
    assert.equal(
      await page.locator("#jobs-completion").inputValue(),
      "pending",
    );
    await page.locator("#jobs-milestone").selectOption("");
    await page.locator("#search").fill("13/11/2026");
    assert.ok(await page.locator('[data-milestone-id="HITO-TEST"]').count());
    await page.evaluate(async () => {
      await VSStorage.refresh();
      vidresReloadData();
    });
    assert.equal(await badge.getAttribute("aria-pressed"), "true");
    await badge.click();
    await page.waitForFunction(
      () =>
        VSStorage.read(VSStorage.keys.trabajos, []).find(
          (j) => j.id === "HITO-TEST",
        ).hitos.M === false,
    );
  }
  await page.evaluate(async () => {
    await VSStorage.updateValues((v) => {
      for (const [id, job] of [
        ["HITO-Q", ""],
        ["HITO-LINK", "HITO-TEST"],
      ])
        v[VSStorage.keys.presupuestos].push({
          id,
          job,
          client: "Cliente Hitos",
          date: "2026-11-13",
          hitos: { F: true },
          lines: [{ kind: "concept", description: "Montaje", amount: 100 }],
        });
    });
    vidresNavigate("presupuestos");
  });
  const noQuoteMilestones = async () => {
    assert.equal(
      await page
        .locator("#content [data-milestone], #content .milestone-filters")
        .count(),
      0,
      "Los presupuestos no muestran hitos ni filtros de hitos",
    );
  };
  for (const view of ["compact", "cards"]) {
    for (const id of ["HITO-Q", "HITO-LINK"]) {
      await page.evaluate((view) => vidresQuoteSetView(view), view);
      await page.locator("#quote-search").fill(id);
      assert.equal(await page.locator("[data-saved-quote]:visible").count(), 1);
      await noQuoteMilestones();
      if (view === "compact") {
        await page.locator(`[data-saved-quote="${id}"] summary`).click();
        await noQuoteMilestones();
      }
      assert.equal(
        await page
          .locator(`[data-saved-quote="${id}"] [data-whatsapp]`)
          .isVisible(),
        true,
      );
      await page
        .locator(`[data-saved-quote="${id}"] button[data-load]`)
        .click();
      await page.locator(".quote-editor").waitFor();
      await noQuoteMilestones();
      await page.locator("#quote-close").click();
      await noQuoteMilestones();
    }
  }
  await page.locator("#quote-search").fill("13/11/2026");
  assert.equal(
    await page.locator('[data-saved-quote^="HITO-"]:visible').count(),
    2,
  );
  assert.deepEqual(
    await page.evaluate(() =>
      VSStorage.read(VSStorage.keys.presupuestos, [])
        .filter((q) => ["HITO-Q", "HITO-LINK"].includes(q.id))
        .map((q) => q.hitos),
    ),
    [{ F: true }, { F: true }],
    "Se conservan los datos de hitos de presupuestos antiguos",
  );
  await page.locator("#quote-search").fill("");
  if (enabled) {
    await page.evaluate(() => vidresNavigate("trabajos"));
    await page.locator("#search").fill("Cliente Hitos");
    await page.emulateMedia({ colorScheme: "dark" });
    const mounted = page.locator(
      '[data-milestone-id="HITO-TEST"][data-milestone="MO"]',
    );
    await mounted.click();
    await page.waitForFunction(
      () =>
        VSStorage.read(VSStorage.keys.trabajos, []).find(
          (j) => j.id === "HITO-TEST",
        ).hitos.MO === true,
    );
    assert.equal(await mounted.getAttribute("aria-pressed"), "true");
    await page.evaluate(() => vidresNavigate("presupuestos"));
  }
  console.log(
    "PASS presupuestos: sin hitos en lista, opciones, tarjetas y editor, con y sin parte vinculado; búsqueda y WhatsApp conservados",
  );
  if (enabled)
    console.log(
      "PASS hitos de trabajos: alternancia persistente, recarga D1, filtros por cliente, fecha y pendiente/completado y modo oscuro",
    );
};
