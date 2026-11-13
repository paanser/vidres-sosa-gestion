const selectBySearch = require("./search-select-browser.cjs");
const assert = require("node:assert/strict");
module.exports = async (page) => {
  await page.evaluate(async () => {
    await VSStorage.write(VSStorage.keys.clientes, [
      { nombre: "Cliente nuevo" },
      {
        nombre: "Perfil de prueba",
        priceProfile: { mode: "markup", value: 80 },
      },
    ]);
    vidresReloadData();
    vidresNavigate("clientes");
  });
  await page.locator('[data-client-edit="Cliente nuevo"]').click();
  assert.equal(await page.locator('[name="priceMode"]').inputValue(), "markup");
  assert.equal(await page.locator('[name="priceValue"]').inputValue(), "0");
  await page.locator('#client-form button[type="submit"]').click();
  await page.locator("#client-editor").waitFor({ state: "hidden" });
  await page.reload();
  await page.locator(".quick-notes").waitFor();
  await page.evaluate(() => vidresNavigate("clientes"));
  await page.locator('[data-client-edit="Cliente nuevo"]').click();
  assert.equal(await page.locator('[name="priceMode"]').inputValue(), "markup");
  assert.equal(await page.locator('[name="priceValue"]').inputValue(), "0");
  await page.locator("#client-form [data-dialog-close]").click();
  await page.locator('[data-client-edit="Perfil de prueba"]').click();
  assert.equal(await page.locator('[name="priceValue"]').inputValue(), "80");
  await selectBySearch(page, '[name="priceMode"]', "fixed");
  await page.locator('[name="priceValue"]').fill("95");
  await page.locator('#client-form button[type="submit"]').click();
  await page.locator("#client-editor").waitFor({ state: "hidden" });
  await page.evaluate(() => vidresQuoteStartForJob("", "Perfil de prueba"));
  assert.equal(await page.locator("#quote-price-mode").inputValue(), "fixed");
  assert.equal(await page.locator("#quote-fixed-price").inputValue(), "95");
  await page.locator("#quote-fixed-price").fill("110");
  await page.locator("#quote-fixed-price").dispatchEvent("change");
  assert.equal(
    await page.evaluate(
      () =>
        VSStorage.read(VSStorage.keys.clientes, []).find(
          (c) => c.nombre === "Perfil de prueba",
        ).priceProfile.value,
    ),
    95,
  );
  // Horizontal edge gesture returns within the app, while a short gesture stays put.
  await page.evaluate(() => {
    vidresNavigate("inicio");
    vidresNavigate("clientes");
  });
  const swipe = async (endX) =>
    page.evaluate((endX) => {
      const emit = (type, x, end) =>
        document.querySelector("#content").dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            cancelable: true,
            touches: end
              ? []
              : [
                  new Touch({
                    identifier: 1,
                    target: document.querySelector("#content"),
                    clientX: x,
                    clientY: 300,
                  }),
                ],
          }),
        );
      emit("touchstart", 8);
      emit("touchmove", endX);
      emit("touchend", endX, true);
    }, endX);
  await swipe(40);
  assert.equal(await page.locator("#client-search").count(), 1);
  await swipe(130);
  assert.equal(await page.locator("#client-search").count(), 0);
  await page.evaluate(() => vidresNavigate("presupuestos"));
  assert.equal(await page.locator("#quote-fixed-price").inputValue(), "110");
  await page.locator("#quote-new").click();
  console.log(
    "PASS perfiles: ficha, carga automática, ajuste aislado y retroceso táctil con borrador conservado",
  );
};
