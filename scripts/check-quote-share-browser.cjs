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
  console.log("PASS WhatsApp: conserva el diálogo de mensaje de texto");
};
