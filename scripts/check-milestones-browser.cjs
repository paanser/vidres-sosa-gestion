const assert = require("node:assert/strict");
module.exports = async (page) => {
  await page.evaluate(async () => {
    await VSStorage.updateValues((v) => {
      v[VSStorage.keys.trabajos].push({
        id: "HITO-TEST",
        cliente: "Cliente Hitos",
        fecha: "2026-11-13",
        estado: "Pendiente",
      });
    });
    vidresReloadData();
    vidresNavigate("trabajos");
  });
  await page.locator("#search").fill("Cliente Hitos");
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
  await page.locator("#jobs-milestone").selectOption("M");
  assert.equal(await page.locator(".job-card").count(), 1);
  await page.locator("#jobs-completion").selectOption("pending");
  assert.equal(await page.locator(".job-card").count(), 0);
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
          lines: [{ kind: "concept", description: "Montaje", amount: 100 }],
        });
    });
    vidresNavigate("presupuestos");
  });
  await page.locator("#quote-search").fill("HITO-Q");
  assert.equal(await page.locator("[data-saved-quote]:visible").count(), 1);
  const qb = page.locator('[data-milestone-id="HITO-Q"][data-milestone="F"]');
  await qb.click();
  await page.waitForFunction(
    () =>
      VSStorage.read(VSStorage.keys.presupuestos, []).find(
        (q) => q.id === "HITO-Q",
      ).hitos?.F === true,
  );
  await page.locator("#quotes-milestone").selectOption("F");
  assert.equal(await page.locator("[data-saved-quote]:visible").count(), 1);
  await page.locator("#quotes-completion").selectOption("pending");
  assert.equal(await page.locator("[data-saved-quote]:visible").count(), 0);
  await page.locator("#quotes-milestone").selectOption("");
  await page.locator("#quote-search").fill("HITO-LINK");
  await page
    .locator('[data-saved-quote="HITO-LINK"] [data-milestone="MO"]')
    .click();
  await page.waitForFunction(
    () =>
      VSStorage.read(VSStorage.keys.trabajos, []).find(
        (j) => j.id === "HITO-TEST",
      ).hitos.MO === true,
  );
  await page.emulateMedia({ colorScheme: "dark" });
  assert.equal(
    await page
      .locator('[data-saved-quote="HITO-LINK"] [data-milestone="MO"]')
      .getAttribute("aria-pressed"),
    "true",
  );
  console.log(
    "PASS presupuestos: hitos propios y vinculados, búsqueda y filtros sin reemplazar el editor",
  );
  console.log(
    "PASS hitos: alternancia persistente, recarga D1 y filtros por cliente, fecha y pendiente/completado",
  );
};
