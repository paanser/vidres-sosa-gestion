const assert = require("node:assert/strict");
module.exports = async (page) => {
  await page.evaluate(() => {
    window.__sharedQuote = null;
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: ({ files }) => files[0] instanceof File,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__sharedQuote = {
          name: data.files[0].name,
          type: data.files[0].type,
          bytes: await data.files[0].text(),
          url: data.url,
        };
        throw new DOMException("Cancelled", "AbortError");
      },
    });
    vidresQuoteWhatsApp("HITO-Q");
  });
  await page.locator('#quote-message-form [type="submit"]').click();
  await page.waitForFunction(() => window.__sharedQuote?.bytes);
  const shared = await page.evaluate(() => window.__sharedQuote);
  assert.equal(shared.name, "Presupuesto-HITO-Q-cliente.pdf");
  assert.equal(shared.type, "application/pdf");
  assert.ok(shared.bytes.startsWith("%PDF-"));
  assert.equal(shared.url, undefined);
  assert.equal(
    await page.locator("#quote-message-dialog").evaluate((el) => el.open),
    true,
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => false,
    }),
  );
  const downloaded = page.waitForEvent("download");
  await page.locator('#quote-message-form [type="submit"]').click();
  assert.equal(
    (await downloaded).suggestedFilename(),
    "Presupuesto-HITO-Q-cliente.pdf",
  );
  await page.locator("#quote-message-cancel").click();
  console.log(
    "PASS WhatsApp: PDF adjunto real, cancelación y descarga alternativa sin enlace",
  );
};
