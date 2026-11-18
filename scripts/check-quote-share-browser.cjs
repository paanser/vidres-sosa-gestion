const assert = require("node:assert/strict");
module.exports = async (page) => {
  await page.evaluate(() => vidresQuoteWhatsApp("HITO-Q"));
  assert.equal(
    await page.locator('#quote-message-form [type="submit"]').textContent(),
    "Abrir WhatsApp",
  );
  assert.ok(
    await page.locator('#quote-message-form [name="mensaje"]').inputValue(),
  );
  assert.doesNotMatch(
    await page.locator("#quote-message-dialog .muted").textContent(),
    /PDF adjunto/,
  );
  await page.locator("#quote-message-cancel").click();
  await page.evaluate(async () => {
    const key = "vs-quote-prototype-v1";
    await VSStorage.write(
      key,
      VSStorage.read(key, []).map((q) =>
        q.id === "HITO-Q"
          ? {
              ...q,
              clientSource: "quote",
              clientData: { phone: "612 345 678" },
            }
          : q,
      ),
    );
    window.__waOpened = [];
    window.__originalOpen = window.open;
    window.__originalConfirm = window.confirm;
    window.open = (url) => window.__waOpened.push(url);
    window.confirm = () => false;
    vidresQuoteWhatsApp("HITO-Q");
  });
  assert.equal(
    await page.locator('[name="destinatario"]').inputValue(),
    "card",
  );
  await page.locator('#quote-message-form [type="submit"]').click();
  assert.match(
    await page.evaluate(() => window.__waOpened[0]),
    /^https:\/\/wa.me\/34612345678\?text=/,
  );
  await page.evaluate(() => vidresQuoteWhatsApp("HITO-Q"));
  await page.locator('[name="destinatario"]').selectOption("other");
  await page.locator('#quote-message-form [name="telefono"]').fill("abc");
  await page.locator('#quote-message-form [type="submit"]').click();
  assert.equal(await page.evaluate(() => window.__waOpened.length), 1);
  await page
    .locator('#quote-message-form [name="telefono"]')
    .fill("+33 612345678");
  await page.locator('#quote-message-form [type="submit"]').click();
  assert.match(
    await page.evaluate(() => window.__waOpened[1]),
    /^https:\/\/wa.me\/33612345678\?text=/,
  );
  await page.evaluate(() => {
    window.open = window.__originalOpen;
    window.confirm = window.__originalConfirm;
    vidresQuoteWhatsApp("HITO-Q");
  });
  assert.equal(
    await page.locator('[name="destinatario"]').inputValue(),
    "card",
  );
  assert.equal(
    await page.locator('#quote-message-form [name="telefono"]').inputValue(),
    "",
  );
  await page.locator("#quote-message-cancel").click();
  console.log("PASS WhatsApp: conserva el diálogo de mensaje de texto");
};
