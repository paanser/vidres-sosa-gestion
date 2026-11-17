const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
function setup(navigator) {
  const window = {};
  const context = vm.createContext({ window, navigator });
  vm.runInContext(
    fs.readFileSync(require.resolve("../utils.js"), "utf8"),
    context,
  );
  context.document = { createElement: () => ({}) };
  const file = { name: "presupuesto.pdf", type: "application/pdf" };
  let downloads = 0;
  const status = {};
  const button = window.VSSharePDF(
    file,
    {
      click() {
        downloads++;
      },
    },
    status,
  );
  return { button, file, status, downloads: () => downloads };
}
test("shares only the PDF attachment, without a URL or text", async () => {
  let payload;
  const s = setup({
    canShare: () => true,
    share: async (data) => {
      payload = data;
    },
  });
  await s.button.onclick();
  assert.deepEqual(Object.keys(payload), ["files"]);
  assert.equal(payload.files[0], s.file);
  assert.equal(s.downloads(), 0);
  assert.equal(s.button.disabled, false);
});
test("downloads the PDF when file sharing is unavailable", async () => {
  const s = setup({
    canShare: () => false,
    share: () => assert.fail("must not share a link"),
  });
  await s.button.onclick();
  assert.equal(s.downloads(), 1);
  assert.match(s.status.textContent, /Adjunta este archivo/);
});
test("cancelling does not download or report an error", async () => {
  const s = setup({
    share: async () => {
      throw { name: "AbortError" };
    },
  });
  await s.button.onclick();
  assert.equal(s.downloads(), 0);
  assert.equal(s.status.textContent, undefined);
});
test("unsupported file sharing falls back to the file download", async () => {
  const s = setup({
    share: async () => {
      throw { name: "TypeError" };
    },
  });
  await s.button.onclick();
  assert.equal(s.downloads(), 1);
});
