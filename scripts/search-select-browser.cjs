const assert = require("node:assert/strict");

module.exports = async function selectBySearch(page, selector, value, query) {
  const select = page.locator(selector);
  const label = await select.evaluate(
    (el, value) =>
      Array.from(el.options).find((option) => option.value === value).label,
    value,
  );
  await select
    .locator("xpath=preceding-sibling::*[1]")
    .locator(".select-search-trigger")
    .click();
  const picker = page.locator(".select-search-dialog");
  await picker.getByRole("searchbox").fill(query ?? label);
  await picker
    .locator(`.select-search-results button[value=${JSON.stringify(value)}]`)
    .click();
  assert.equal(await select.inputValue(), value);
};
