const assert = require("node:assert/strict");
module.exports = async (page) => {
  const previousPreferences = await page.evaluate(() => ({
    order: localStorage.getItem("vidres-job-order-v1:" + VSAuth.user.id),
    view: localStorage.getItem(
      "vidres-section-view-v1:" + VSAuth.user.id + ":trabajos",
    ),
  }));
  await page.evaluate(async () => {
    window.jobListOriginal = window.vidresGetJobs();
    const fixture = (id, cliente, responsable, fecha) => ({
      id,
      cliente: "OrdenFixture " + cliente,
      responsable,
      estado: "Pendiente",
      fecha: "2027-01-01",
      descripcion: "Prueba de orden y filtros",
      historial: fecha ? [{ de: "", a: "Pendiente", fecha }] : [],
    });
    await VSStorage.write(VSStorage.keys.trabajos, [
      ...window.jobListOriginal,
      fixture("ORDER-10", "Zeta", "Pau", "2026-11-10T12:00:00Z"),
      fixture("ORDER-2", "Ana", "Pau", "2026-11-11T12:00:00Z"),
      fixture("ORDER-3", "Bea", "Otro", "2026-11-11T14:00:00Z"),
      fixture("ORDER-4", "Sin fecha", "Pau", ""),
    ]);
    window.vidresReloadData();
    window.vidresNavigate("trabajos");
  });
  const refs = () => page.locator(".job-ref").allTextContents();
  await page.locator("#search").fill("OrdenFixture");
  await page.locator("#job-order").selectOption("creation:desc");
  assert.deepEqual(await refs(), ["ORDER-3", "ORDER-2", "ORDER-10", "ORDER-4"]);
  await page.locator(".advanced-work-filters summary").click();
  await page.locator('[data-filter="createdFrom"]').fill("2026-11-11");
  await page.locator('[data-filter="createdTo"]').fill("2026-11-11");
  assert.deepEqual(await refs(), ["ORDER-3", "ORDER-2"]);
  await page.locator('[data-filter="responsable"]').selectOption("Pau");
  assert.deepEqual(await refs(), ["ORDER-2"]);
  await page.locator("#job-scope").selectOption("todos");
  assert.deepEqual(await refs(), ["ORDER-2"]);
  await page.locator("[data-section-customize]").click();
  await page.locator("[data-section-view]").selectOption("compact");
  await page.locator("[data-section-close]").click();
  assert.deepEqual(await refs(), ["ORDER-2"]);
  await page.locator('[data-filter="createdTo"]').fill("");
  await page.locator('[data-filter="createdFrom"]').fill("2026-11-12");
  assert.equal(await page.locator(".empty-state").count(), 1);
  await page.locator("[data-jobs-clear]").click();
  await page.locator("#search").fill("OrdenFixture");
  assert.equal((await refs()).length, 4);
  await page.locator("#job-order").selectOption("cliente:asc");
  assert.deepEqual(await refs(), ["ORDER-2", "ORDER-3", "ORDER-4", "ORDER-10"]);
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    window.vidresNavigate("inicio");
    window.vidresNavigate("trabajos");
  });
  assert.equal(await page.locator("#job-order").inputValue(), "cliente:asc");
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("vidres-job-order-v1:" + VSAuth.user.id),
    ),
    "cliente:asc",
  );
  await page
    .locator("#job-order")
    .selectOption(previousPreferences.order || "id:asc");
  await page.locator("[data-jobs-clear]").click();
  await page.locator(".advanced-work-filters summary").click();
  await page.locator("#job-scope").selectOption("activos");
  await page.evaluate(async (previous) => {
    for (const [key, value] of [
      ["vidres-job-order-v1:" + VSAuth.user.id, previous.order],
      ["vidres-section-view-v1:" + VSAuth.user.id + ":trabajos", previous.view],
    ]) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    await VSStorage.write(VSStorage.keys.trabajos, window.jobListOriginal);
    window.vidresReloadData();
    window.vidresNavigate("inicio");
  }, previousPreferences);
  console.log(
    "PASS orden personal, rango de creación inclusivo, responsable, vista compacta y tamaños móviles",
  );
};
