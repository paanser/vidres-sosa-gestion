const assert = require("node:assert/strict");
module.exports = async (page) => {
  await page.evaluate(() => vidresQuoteWhatsApp("HITO-Q"));
  assert.equal(
    await page.locator('#quote-message-form [type="submit"]').textContent(),
    "Descargar PDF y abrir WhatsApp",
  );
  assert.ok(
    await page.locator('#quote-message-form [name="mensaje"]').inputValue(),
  );
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (payload) => {
        const [pdf] = payload.files;
        window.__quoteAttachment = {
          keys: Object.keys(payload),
          type: pdf.type,
          name: pdf.name,
          header: await pdf.slice(0, 5).text(),
        };
      },
    });
  });
  await page.locator("#quote-message-share button").click();
  await page.waitForFunction(() => window.__quoteAttachment);
  assert.deepEqual(await page.evaluate(() => window.__quoteAttachment), {
    keys: ["files"],
    type: "application/pdf",
    name: "Presupuesto-HITO-Q-cliente.pdf",
    header: "%PDF-",
  });
  await page.evaluate(() => {
    delete navigator.canShare;
    delete navigator.share;
    delete window.__quoteAttachment;
  });
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
  const downloaded = page.waitForEvent("download");
  await page.locator('#quote-message-form [type="submit"]').click();
  assert.equal(
    (await downloaded).suggestedFilename(),
    "Presupuesto-HITO-Q-cliente.pdf",
  );
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
  await page.evaluate(() => vidresQuoteFollowupWhatsApp("HITO-Q"));
  assert.equal(
    await page.locator('#quote-message-form [type="submit"]').textContent(),
    "Abrir WhatsApp",
  );
  assert.equal(
    await page.locator("#quote-message-attachment").isHidden(),
    true,
  );
  await page.locator("#quote-message-cancel").click();
  console.log(
    "PASS WhatsApp: PDF del cliente como adjunto o descarga y seguimiento por texto",
  );
};
