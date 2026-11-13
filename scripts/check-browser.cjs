const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright",
);
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const { setup } = require(root + "/tests/helpers/backend.cjs");
async function checkMobileFields(page) {
  const failures = await page
    .locator("input, select, textarea")
    .evaluateAll((fields) =>
      fields
        .filter((field) => field.getClientRects().length > 0)
        .filter((field) => {
          const bounds = field.getBoundingClientRect();
          return (
            parseFloat(getComputedStyle(field).fontSize) < 16 ||
            bounds.left < -1 ||
            bounds.right > innerWidth + 1
          );
        })
        .map((field) => field.id || field.name || field.outerHTML),
    );
  assert.deepEqual(
    failures,
    [],
    "Campos móviles legibles y dentro de pantalla",
  );
}
(async () => {
  const worker = (await import(root + "/worker/worker.js")).default,
    env = setup(),
    errors = [],
    requests = [];
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.route(
    "https://paanser.github.io/vidres-sosa-gestion/**",
    async (route) => {
      const rel =
        new URL(route.request().url()).pathname.replace(
          "/vidres-sosa-gestion/",
          "",
        ) || "index.html";
      if (
        rel.includes("..") ||
        (rel.includes("/") &&
          !rel.startsWith("icons/") &&
          !rel.startsWith("vendor/"))
      )
        return route.fulfill({ status: 404, body: "" });
      let data;
      try {
        data = await fs.readFile(path.join(root, rel));
      } catch {
        return route.fulfill({ status: 404, body: "" });
      }
      const ext = path.extname(rel);
      await route.fulfill({
        body: data,
        contentType:
          {
            ".js": "text/javascript",
            ".css": "text/css",
            ".html": "text/html",
            ".json": "application/json",
            ".png": "image/png",
          }[ext] || "text/plain",
      });
    },
  );
  await context.route(
    "https://vidres-sosa-ia.pausosagomez.workers.dev/**",
    async (route) => {
      const original = route.request();
      requests.push(new URL(original.url()).pathname);
      const r = await worker.fetch(
        new Request(original.url(), {
          method: original.method(),
          headers: original.headers(),
          ...(original.method() === "GET" || original.method() === "OPTIONS"
            ? {}
            : { body: original.postDataBuffer() }),
        }),
        env,
      );
      await route.fulfill({
        status: r.status,
        headers: Object.fromEntries(r.headers),
        body: Buffer.from(await r.arrayBuffer()),
      });
    },
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("https://paanser.github.io/vidres-sosa-gestion/");
  await page.locator("#login-form").waitFor();
  await checkMobileFields(page);
  assert.equal(await page.locator(".layout").isVisible(), false);
  assert.deepEqual(requests, []);
  await page.locator("#login-form [name=usuario]").fill("pau");
  await page.locator("#login-password").fill("temporary-fixture");
  await page.locator("#login-form [type=submit]").click();
  await page.locator("#password-form").waitFor({ state: "visible" });
  assert.equal(await page.locator(".layout").isVisible(), false);
  assert.ok(!requests.includes("/api/state"));
  await page.locator("#password-form [name=actual]").fill("temporary-fixture");
  await page.locator("#new-password").fill("changed-fixture-123");
  await page
    .locator("#password-form [name=confirmacion]")
    .fill("changed-fixture-123");
  await page.locator("#password-form [type=submit]").click();
  await page.locator("#title").filter({ hasText: "Inicio" }).waitFor();
  await page
    .locator("#nav button[disabled]")
    .first()
    .waitFor({ state: "detached" });
  assert.equal(await page.locator("#home-customize").isVisible(), false);
  const personalizeIcon = await page
    .locator("[data-home-customize]")
    .boundingBox();
  assert.ok(personalizeIcon.y > 630, "Icono en la parte inferior de Inicio");
  await page.locator("[data-home-customize]").click();
  await page.locator("[data-home-close]").click();
  assert.equal(await page.locator("#home-customize").isVisible(), false);
  await page.locator("[data-home-customize]").click();
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#home-customize").isVisible(), false);
  await page.locator("[data-home-customize]").click();
  await page.locator('[name="blocks"][value="jobs"]').uncheck();
  await page.locator('#home-preferences-form button[type="submit"]').click();
  await page.getByText("Preferencias guardadas en tu cuenta.").waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "Próximos trabajos" }).count(),
    0,
  );
  await page.reload();
  await page.locator("[data-home-customize]").click();
  assert.equal(
    await page.locator('[name="blocks"][value="jobs"]').isChecked(),
    false,
  );
  await page.locator("#home-preferences-form select").selectOption("calendar");
  await page.locator('#home-preferences-form button[type="submit"]').click();
  await page.locator(".cal-grid").waitFor();
  await page.locator("[data-home-customize]").click();
  await page.locator("[data-home-reset]").click();
  await page.getByRole("heading", { name: "Próximos trabajos" }).waitFor();
  console.log(
    "PASS inicio personal: ocultar bloques, recargar, calendario y restablecer",
  );
  console.log("PASS login, cambio obligatorio y carga privada");
  if (process.env.OPERATIONS_ONLY === "1") {
    await fs.mkdir(path.join(root, "test-results"), { recursive: true });
    await require("./check-operations-browser.cjs")(page, context, root);
    assert.deepEqual(errors, []);
    await require("./check-milestones-browser.cjs")(page);
    await browser.close();
    return;
  }
  assert.deepEqual(
    await page
      .locator("#nav [data-page]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.page)),
    ["inicio", "trabajos", "presupuestos", "calendario"],
  );
  assert.equal(await page.locator(".global-text-controls").count(), 0);
  assert.equal(await page.locator("[data-text-scale]").count(), 0);
  await page.locator('.header-actions [data-page="ajustes"]').click();
  await page.locator('[data-text-scale="1"]').click();
  assert.equal(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--vs-text-scale"),
    ),
    "1.1",
  );
  await page.locator('[data-text-scale="0"]').click();
  assert.equal(
    await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--vs-text-scale"),
    ),
    "1",
  );
  assert.equal(
    await page.evaluate(() => {
      const e = new Event("touchmove", { bubbles: true, cancelable: true });
      Object.defineProperty(e, "touches", { value: [{}, {}] });
      document.querySelector("#title").dispatchEvent(e);
      return e.defaultPrevented;
    }),
    true,
  );
  await page.locator('#nav [data-page="inicio"]').click();
  assert.equal(await page.locator("[data-text-scale]").count(), 0);
  console.log(
    "PASS tamaño de letra solo en Ajustes y bloqueo de pellizco general",
  );

  await context.setOffline(true);
  await page
    .locator("#save-status")
    .filter({ hasText: "Sin conexión" })
    .waitFor();
  await context.setOffline(false);
  await page
    .locator("#save-status")
    .filter({ hasText: "Sin cambios pendientes" })
    .waitFor();
  const stateUrl = "https://vidres-sosa-ia.pausosagomez.workers.dev/api/state";
  const failWrite = (route) =>
    route.request().method() === "PUT"
      ? route.abort("failed")
      : route.fallback();
  await context.route(stateUrl, failWrite);
  const error = await page.evaluate(() =>
    VSStorage.patchValues({}).then(
      () => "",
      (e) => e.message,
    ),
  );
  assert.ok(error);
  assert.match(
    await page.locator("#save-status").textContent(),
    /No se pudo guardar/,
  );
  await context.unroute(stateUrl, failWrite);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const slowWrite = async (route) => {
    if (route.request().method() === "PUT") await gate;
    return route.fallback();
  };
  await context.route(stateUrl, slowWrite);
  const saving = page.evaluate(() => VSStorage.patchValues({}));
  await page.locator("#save-status").filter({ hasText: "Guardando" }).waitFor();
  release();
  await saving;
  await page
    .locator("#save-status")
    .filter({ hasText: /^Guardado$/ })
    .waitFor();
  await context.unroute(stateUrl, slowWrite);
  const conflictWrite = (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({ error: "Conflicto de prueba" }),
          headers: {
            "Access-Control-Allow-Origin": "https://paanser.github.io",
          },
        })
      : route.fallback();
  await context.route(stateUrl, conflictWrite);
  await page.evaluate(() =>
    VSAuth.json("/api/state", "PUT", {}).catch(() => {}),
  );
  assert.match(
    await page.locator("#save-status").textContent(),
    /No se pudo guardar/,
  );
  await context.unroute(stateUrl, conflictWrite);
  console.log(
    "PASS guardado: desconexión, fallo, espera, confirmación y conflicto del servidor",
  );
  // Simulate a publication from another device: update the server directly,
  // without updating this tab's in-memory storage.
  const beforeRefresh = await page.evaluate(() => {
    window.refreshFixtureJobs = VSStorage.read(VSStorage.keys.trabajos, []);
    return window.vidresGetJobs().length;
  });
  await page.evaluate(async () => {
    const state = await VSAuth.json("/api/state");
    state.values[VSStorage.keys.trabajos] = [
      ...window.refreshFixtureJobs,
      {
        id: "remote-refresh-fixture",
        cliente: "Trabajo de otro dispositivo",
        descripcion: "Publicado mientras la app está abierta",
        estado: "Pendiente",
        fecha: "2026-11-13",
        prioridad: "Normal",
      },
    ];
    await VSAuth.json("/api/state", "PUT", {
      revision: state.revision,
      values: state.values,
    });
  });
  assert.equal(
    await page.evaluate(() => window.vidresGetJobs().length),
    beforeRefresh,
  );
  async function pull(distance) {
    await page.evaluate((distance) => {
      window.scrollTo(0, 0);
      const target = document.querySelector("#title");
      const touch = (y) =>
        new Touch({ identifier: 1, target, clientX: 160, clientY: y });
      target.dispatchEvent(
        new TouchEvent("touchstart", { bubbles: true, touches: [touch(80)] }),
      );
      target.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          cancelable: true,
          touches: [touch(80 + distance)],
        }),
      );
      target.dispatchEvent(
        new TouchEvent("touchend", { bubbles: true, touches: [] }),
      );
    }, distance);
  }
  const readsBefore = requests.filter((p) => p === "/api/state").length;
  await pull(35);
  assert.equal(requests.filter((p) => p === "/api/state").length, readsBefore);
  await pull(120);
  await page.waitForFunction(
    () =>
      document.querySelector(".pull-refresh-label").textContent ===
      "Actualizado",
  );
  assert.equal(
    await page.evaluate(() => window.vidresGetJobs().length),
    beforeRefresh + 1,
  );
  assert.equal(await page.locator(".layout").evaluate((el) => el.inert), false);
  await context.route("**/api/state", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Sin conexión" }),
    }),
  );
  await pull(120);
  await page.waitForFunction(() =>
    document
      .querySelector(".pull-refresh-label")
      .textContent.startsWith("No se pudo actualizar"),
  );
  assert.equal(
    await page.evaluate(() => window.vidresGetJobs().length),
    beforeRefresh + 1,
  );
  await context.unroute("**/api/state");
  await page.evaluate(async () => {
    await VSStorage.write(VSStorage.keys.trabajos, window.refreshFixtureJobs);
    window.vidresReloadData();
  });
  console.log(
    "PASS deslizar actualiza trabajos remotos; gesto corto y fallo de red conservan datos y sesión",
  );

  await require("./check-meters-browser.cjs")(page, context, root);
  await require("./check-price-profiles-browser.cjs")(page);
  await require("./check-quotes-browser.cjs")(page, context, root);
  await require("./check-quote-document-browser.cjs")(page, context, root);
  await require("./check-aluminum-browser.cjs")(page);

  await page.evaluate(async () => {
    await VSStorage.write(VSStorage.keys.clientes, [
      {
        nombre: "Cliente registrado",
        telefono: "+34 612 345 678",
        direccion: "Calle Fiscal 10",
      },
    ]);
    vidresReloadData();
  });
  await page.evaluate(() => window.vidresNavigate("clientes"));
  await checkMobileFields(page);
  for (const query of [
    "registrado",
    "fiscal 10",
    "CLIENTE",
    "612345678",
    "612-345-678",
    "no-coincide",
  ]) {
    await page.locator("#client-search").fill(query);
    assert.equal(
      await page.locator(".client-card:visible").count(),
      query === "no-coincide" ? 0 : 1,
    );
    assert.equal(await page.locator("#client-search").inputValue(), query);
  }
  await page.locator("#client-search").fill("");
  assert.equal(await page.locator(".client-card:visible").count(), 1);
  assert.equal(await page.locator("#client-no-results").isVisible(), false);
  await page.evaluate(() => window.vidresNavigate("inicio"));
  console.log(
    "PASS buscador de clientes por nombre, dirección y sin resultados",
  );
  await page.locator("#add").click();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    for (const scale of [0.9, 1, 1.5]) {
      await page.evaluate((value) => {
        document.documentElement.style.setProperty("--vs-text-scale", value);
      }, String(scale));
      await checkMobileFields(page);
      await page.locator("#form [name=descripcion]").fill("Texto de prueba");
      await page.locator("#form [name=descripcion]").blur();
      await checkMobileFields(page);
    }
  }
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--vs-text-scale", "1");
  });
  await page.setViewportSize({ width: 390, height: 844 });
  console.log("PASS campos móviles sin texto pequeño ni recortes al escribir");
  assert.equal(await page.locator("#form [name=duracion]").isVisible(), true);
  assert.equal(
    await page.locator("#form [name=responsable]").inputValue(),
    await page.evaluate(() => VSAuth.user.nombre),
  );
  await page.waitForFunction(
    () =>
      document.querySelector("#form select[name=responsable]").options.length >
      0,
  );
  assert.equal(await page.locator("#start-template").count(), 0);
  assert.equal(await page.locator("#form [name=facturado]").count(), 0);
  assert.equal(
    await page.locator(".job-extra-fields [name=hora]").isVisible(),
    true,
  );
  assert.equal(
    await page
      .locator('#known-clients option[value="Cliente registrado"]')
      .count(),
    1,
  );
  await page.locator("#form [name=cliente]").fill("Cliente registrado");
  assert.equal(
    await page.locator("#form [name=telefono]").inputValue(),
    "+34 612 345 678",
  );
  assert.equal(
    await page.locator("#form [name=direccion]").inputValue(),
    "Calle Fiscal 10",
  );
  assert.equal(
    await page
      .locator("#client-address-choice")
      .evaluate((el) => el.checkValidity()),
    false,
  );
  await page.locator("#client-address-choice").selectOption("other");
  assert.equal(await page.locator("#form [name=direccion]").inputValue(), "");
  await page.locator("#form [name=direccion]").fill("Calle Medidas 20");
  await page.locator("#form [name=poblacion]").fill("  La Seu d’Urgell  ");
  await page.locator("#form [name=telefono]").fill("  +34 611 222 333  ");
  await page.locator("#form button[type=submit]").click();
  await page.waitForFunction(() => !document.querySelector("#editor").open);
  const saved = await page.evaluate(() => ({
    job: vidresGetJobs().find((j) => j.cliente === "Cliente registrado"),
    client: VSStorage.read(VSStorage.keys.clientes, [])[0],
  }));
  assert.equal(saved.job.direccion, "Calle Medidas 20");
  assert.equal(saved.job.poblacion, "La Seu d’Urgell");
  assert.equal(saved.job.telefono, "+34 611 222 333");
  assert.equal(saved.client.telefono, "+34 612 345 678");
  assert.equal(saved.client.direccion, "Calle Fiscal 10");
  await page.evaluate(() => window.vidresNavigate("inicio"));
  assert.equal(await page.locator(".quick-notes h2").textContent(), "Notas");
  assert.equal(
    await page.locator("#nav #add, #nav #quick-note-add").count(),
    0,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    if (width <= 600) {
      const tabs = await page.locator("#nav button").evaluateAll((buttons) =>
        buttons.map((button) => {
          const box = button.getBoundingClientRect();
          const label = button.querySelector("span");
          const icon = button.querySelector("svg").getBoundingClientRect();
          return {
            y: box.y,
            right: box.right,
            height: box.height,
            labelFits: label.scrollWidth <= button.clientWidth,
            iconAbove: icon.bottom <= label.getBoundingClientRect().top,
          };
        }),
      );
      assert.equal(tabs.length, 4);
      assert.ok(
        tabs.every(
          (tab) =>
            tab.y === tabs[0].y &&
            tab.right <= width &&
            tab.height >= 44 &&
            tab.labelFits &&
            tab.iconAbove,
        ),
        `Menú móvil a ${width}px: ${JSON.stringify(tabs)}`,
      );
    }
    const bounds = await page.locator(".header-actions").boundingBox();
    const titleBounds = await page.locator("#title").boundingBox();
    assert.ok(bounds.x >= titleBounds.x + titleBounds.width);
    assert.ok(bounds.x + bounds.width <= width);
    assert.equal(
      await page.locator("#add").getAttribute("aria-label"),
      "Nuevo parte",
    );
    assert.equal(
      await page.locator("#quick-note-add").getAttribute("aria-label"),
      "Nueva nota",
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#quick-note-add").click();
  assert.equal(await page.locator("#quick-note-dialog").isVisible(), true);
  assert.equal(
    await page.locator("#quick-note-title").textContent(),
    "Nueva nota",
  );
  await page.locator("#quick-note-cancel").click();
  await page.locator("[data-note-new]").click();
  assert.equal(
    await page
      .locator('#quick-note-clients option[value="Cliente registrado"]')
      .count(),
    1,
  );
  await page
    .locator("#quick-note-form [name=texto]")
    .fill("Nota que debe conservarse");
  await page
    .locator("#quick-note-form [name=cliente]")
    .fill("Cliente registrado");
  await page.locator("#quick-note-form [type=submit]").click();
  await page.waitForFunction(() =>
    VSStorage.read("vidres-notas-v1", []).some(
      (n) => n.texto === "Nota que debe conservarse",
    ),
  );
  const note = page
    .locator(".quick-note")
    .filter({ hasText: "Nota que debe conservarse" });
  await note.locator("strong").click();
  assert.equal(await note.count(), 1);
  assert.equal(await note.locator("input[type=checkbox]").count(), 0);
  await note.locator("summary").click();
  assert.equal(await note.locator("[data-note-delete]").isVisible(), true);
  assert.equal(
    await page.evaluate(
      () =>
        VSStorage.read("vidres-notas-v1", []).find(
          (n) => n.texto === "Nota que debe conservarse",
        ).hecha,
    ),
    false,
  );
  await page.reload();
  await page.locator(".quick-notes").waitFor();
  assert.equal(
    await page.getByText("Nota que debe conservarse", { exact: true }).count(),
    1,
  );
  await note.locator("summary").click();
  await note.locator("[data-note-edit]").click();
  await page.locator("#quick-note-form [name=aviso]").fill("2026-12-20");
  await page.locator("#quick-note-form [name=hora]").fill("14:30");
  await page.locator("#quick-note-form [type=submit]").click();
  await page.locator("#quick-note-dialog").waitFor({ state: "hidden" });
  await page.locator("[data-note-new]").click();
  await page
    .locator("#quick-note-form [name=texto]")
    .fill("Segunda nota sin fecha ni hora");
  await page.locator("#quick-note-form [type=submit]").click();
  await page.locator("#quick-note-dialog").waitFor({ state: "hidden" });
  await page.reload();
  await page.locator(".quick-notes").waitFor();
  assert.match(await note.textContent(), /2026-12-20 · 14:30/);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const boxes = await page.locator(".quick-note").evaluateAll((cards) =>
      cards.slice(0, 2).map((card) => {
        const r = card.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    );
    assert.equal(boxes.length, 2);
    assert.ok(Math.abs(boxes[0].y - boxes[1].y) < 1);
    assert.ok(boxes[1].x > boxes[0].x);
    for (const box of boxes)
      assert.ok(Math.abs(box.width - box.height) < 2, "Nota cuadrada");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.vidresNavigate("presupuestos"));
  assert.equal(
    await page
      .locator('#quote-clients option[value="Cliente registrado"]')
      .count(),
    1,
  );
  await page.locator("#quote-client").fill("Cliente registrado");
  await page.locator("#quote-client").dispatchEvent("change");
  await page.locator("#quote-quick").click();
  await page.locator("#quick-client").waitFor();
  assert.equal(
    await page
      .locator('#quick-quote-clients option[value="Cliente registrado"]')
      .count(),
    1,
  );
  await page.locator("#quick-close").click();
  await page.evaluate(() => window.vidresNavigate("inicio"));
  console.log(
    "PASS notas sin borrado al tocar, Más opciones y clientes en todos los formularios",
  );
  await page.evaluate((id) => vidresOpenJobEditor(id), saved.job.id);
  assert.equal(
    await page.locator("#form [name=poblacion]").inputValue(),
    "La Seu d’Urgell",
  );
  assert.equal(
    await page.locator("#form [name=telefono]").inputValue(),
    "+34 611 222 333",
  );
  await page.locator("#form [name=poblacion]").fill("Puigcerdà");
  await page.locator("#form [name=telefono]").fill("+34 611 222 444");
  await page.locator("#form button[type=submit]").click();
  await page.waitForFunction(() => !document.querySelector("#editor").open);
  await page.reload();
  await page.waitForFunction(
    () => typeof window.vidresOpenJobEditor === "function",
  );
  await page.evaluate(() => window.vidresAppReady);
  await page.evaluate((id) => vidresOpenJobEditor(id), saved.job.id);
  assert.equal(
    await page.locator("#form [name=poblacion]").inputValue(),
    "Puigcerdà",
  );
  assert.equal(
    await page.locator("#form [name=telefono]").inputValue(),
    "+34 611 222 444",
  );
  assert.equal(
    await page.locator("#form [name=direccion]").inputValue(),
    "Calle Medidas 20",
  );
  await page.locator("#cancel").click();
  await page.locator("#add").click();
  assert.equal(await page.locator("#form [name=poblacion]").inputValue(), "");
  assert.equal(await page.locator("#form [name=telefono]").inputValue(), "");
  await page.locator("#form [name=cliente]").fill("Cliente registrado");
  assert.equal(
    await page.locator("#form [name=direccion]").inputValue(),
    "Calle Fiscal 10",
  );
  await page.locator("#client-address-choice").selectOption("same");
  await page.locator("#cancel").click();
  await page.evaluate(async (id) => {
    await VSStorage.write(
      VSStorage.keys.trabajos,
      vidresGetJobs().filter((j) => j.id !== id),
    );
    vidresReloadData();
  }, saved.job.id);
  console.log(
    "PASS nuevo parte: población y teléfono independientes, edición, recarga y reapertura",
  );

  await page.locator("#add").click();
  await page.locator("#form [name=cliente]").fill("Cliente de navegador");
  await page.locator("#form [name=descripcion]").fill("Prueba completa");
  await page.locator("#new-measure-add").click();
  await page.locator("[data-new-measure=ancho]").fill("1.000");
  await page.locator("[data-new-measure=alto]").fill("0.800");
  await page
    .locator(".job-measure-photo")
    .first()
    .setInputFiles({
      name: "medida.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
  let releasePart;
  const partGate = new Promise((resolve) => {
    releasePart = resolve;
  });
  const holdPart = async (route) => {
    if (route.request().method() === "PUT") await partGate;
    return route.fallback();
  };
  await context.route(stateUrl, holdPart);
  await page.locator("#form [type=submit]").click();
  await page
    .locator("#editor [data-save-status]")
    .filter({ hasText: "Guardando" })
    .waitFor({ state: "visible" });
  releasePart();

  await page.locator("#editor").waitFor({ state: "hidden" });
  await context.unroute(stateUrl, holdPart);
  assert.equal(
    env.DB.db
      .prepare(
        "SELECT COUNT(*) c FROM records WHERE collection='vidres-sosa-demo-v01'",
      )
      .get().c,
    1,
  );
  assert.equal(
    env.DB.db
      .prepare(
        "SELECT COUNT(*) c FROM records WHERE collection='vidres-mediciones-servidor-v1'",
      )
      .get().c,
    1,
  );
  assert.equal(env.DB.db.prepare("SELECT COUNT(*) c FROM files").get().c, 1);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("vidres-sosa-demo-v01")),
    null,
  );
  const measurementId = await page.evaluate(
    () => VSStorage.measurements.get()[0].id,
  );
  await page.evaluate((id) => vidresOpenMeasurement(id), measurementId);
  assert.equal(
    await page.locator("#measure-form [name=ancho]").inputValue(),
    "1.000",
  );
  await page.locator("#measure-form [name=ancho]").fill("1.234");
  await page.locator("#measure-form [name=alto]").fill("0.830");
  await page.locator("#measure-form [type=submit]").click();
  await page.locator("#measure-editor").waitFor({ state: "hidden" });
  assert.deepEqual(
    await page.evaluate(() => {
      const m = VSStorage.measurements.get()[0];
      return [m.ancho, m.alto];
    }),
    [123.4, 83],
  );
  console.log(
    "PASS parte, medición y foto en servidor, sin copia local de negocio",
  );
  await page.locator('[data-page="trabajos"]').click();
  await page.locator(".job-card [data-id]").first().click();
  await page.locator("[data-exp-sheet]").click();
  const sheet = page.locator("#exp-sheet-result");
  await sheet
    .getByText("Tu hoja de visita está lista.", { exact: false })
    .waitFor();
  const downloadReady = page.waitForEvent("download");
  await sheet.locator("a[download]").click();
  const sheetDownload = await downloadReady;
  assert.match(sheetDownload.suggestedFilename(), /^visita-.*\.pdf$/);
  const pdfBytes = await fs.readFile(await sheetDownload.path());
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdfBytes.length > 1000);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.locator("[data-exp-sheet]").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      }),
      true,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: path.join(root, "test-results", "hoja-visita-mobile.png"),
  });
  console.log("PASS hoja de visita PDF desde expediente a 390/768/1440 px");
  assert.equal(await page.locator("#exp-status").isVisible(), false);
  await page.getByRole("button", { name: /Estado ▾/ }).click();
  await page.locator("#exp-status").selectOption("Finalizado");
  await page.locator("[data-exp-status-save]").click();
  await page.getByText("Estado guardado.", { exact: true }).waitFor();
  assert.equal(await sheet.isVisible(), false);
  const closedJob = await page.evaluate(() => vidresGetJobs()[0]);
  assert.equal(closedJob.estado, "Finalizado");
  assert.ok(closedJob.finalizadoEn);
  assert.equal(closedJob.historial.at(-1).a, "Finalizado");
  await page.locator("[data-exp-status-save]").click();
  assert.equal(
    await page.evaluate(() => vidresGetJobs()[0].historial.length),
    closedJob.historial.length,
  );
  await page.locator("#exp-status").selectOption("Pendiente");
  await page.locator("[data-exp-status-save]").click();
  await page.getByText("Estado guardado.", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => vidresGetJobs()[0].finalizadoEn),
    null,
  );
  await checkMobileFields(page);
  await page.locator("[data-exp-close]").click();
  console.log("PASS cambio directo de estado, historial y reapertura");
  await require("./check-quote-measures-browser.cjs")(page, context, root);
  for (const focus of ["undated", "today", "late", ""]) {
    await page.locator('[data-page="trabajos"]').click();
    await page.locator("#search").fill("búsqueda-que-no-coincide");
    await page.locator('[data-page="inicio"]').click();
    await page.locator('[data-job-focus="' + focus + '"]').click();
    assert.equal(await page.locator("#search").inputValue(), "");
    assert.equal(
      await page.locator(".job-card").count(),
      focus === "undated" || !focus ? 1 : 0,
    );
    if (focus)
      assert.equal(await page.locator("[data-clear-focus]").count(), 1);
  }
  await page.locator('[data-page="inicio"]').click();
  await page.locator('[data-go="criticos"]').click();
  await page.locator("#title").filter({ hasText: "Críticos" }).waitFor();
  console.log(
    "PASS accesos de Inicio sin búsquedas anteriores y filtros correctos",
  );

  await page.locator("[data-page=ajustes]").click();
  await page.locator(".settings-home").waitFor();
  assert.equal(await page.locator(".user-list").count(), 0);
  assert.equal(await page.locator("#cfg-unit").count(), 0);
  assert.equal(requests.includes("/admin/users"), false);
  await page.locator('[data-tool-go="usuarios"]').click();
  await page
    .getByRole("heading", {
      name: "Gestión de usuarios",
      level: 2,
      exact: true,
    })
    .waitFor();
  await page.getByText("Tipos de usuario", { exact: true }).click();
  assert.equal(
    await page
      .getByText(
        "Empleado: gestiona el trabajo diario, sin acceso a la administración de usuarios.",
        { exact: true },
      )
      .isVisible(),
    true,
  );
  await page
    .locator(".users-panel form [name=nombre]")
    .fill("Operario <img src=x onerror=alert(1)>");
  await page.locator(".users-panel form [name=usuario]").fill("operario");
  await page
    .locator(".users-panel form [name=password]")
    .fill("employee-fixture");
  await page.locator(".users-panel form [type=submit]").click();
  await page
    .getByText("operario · empleado · Activo", { exact: true })
    .waitFor();
  assert.equal(await page.locator(".users-panel img").count(), 0);
  console.log("PASS gestión de usuarios y texto escapado");
  await page
    .getByRole("button", { name: "← Volver a Ajustes", exact: true })
    .click();
  await page.locator('[data-tool-go="ajustes-general"]').click();
  await page.locator("#cfg-unit").waitFor();
  assert.equal(await page.locator("#cfg-csv").count(), 0);
  await page.locator("#cfg-vat").fill("10");
  await page.locator("#cfg-save").click();
  await page
    .getByText("Configuración guardada en el servidor.", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "← Volver a Ajustes", exact: true })
    .click();
  await page.locator('[data-tool-go="ajustes-tarifas"]').click();
  await page.locator("#cfg-csv").setInputFiles({
    name: "tarifas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("nombre,precio_m2,precio_ml\nFloat,100,10\n"),
  });
  await page
    .getByText("1 artículos importados o actualizados.", { exact: true })
    .waitFor();
  await page.locator("[data-tariff-delete]").click();
  await page.getByText("No hay tarifas.", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "← Volver a Ajustes", exact: true })
    .click();
  assert.equal(
    await page.locator('[data-tool-go="ajustes-plantillas"]').count(),
    0,
  );
  await page.evaluate(() => window.vidresNavigate("ajustes-plantillas"));
  assert.equal(await page.locator(".settings-home").isVisible(), true);
  assert.equal(await page.locator("#plantilla-new").count(), 0);
  await page.locator('[data-tool-go="calendario"]').click();
  assert.equal(await page.locator(".cal-panel").isVisible(), true);
  assert.equal(
    await page
      .locator('#nav [data-page="calendario"]')
      .getAttribute("aria-current"),
    "page",
  );
  await page.locator('[data-month="1"]').click();
  await page.locator('[data-month="0"]').click();
  await page.locator('[data-page="ajustes"]').click();
  await page.locator('[data-tool-go="ajustes-copias"]').click();
  assert.equal(await page.locator("#backup-export").isVisible(), true);
  assert.equal(await page.locator("#backup-import").count(), 1);
  await page
    .getByRole("button", { name: "← Volver a Ajustes", exact: true })
    .click();
  await page.locator('[data-tool-go="ajustes-ia"]').click();
  assert.equal(await page.locator(".ai-usage").isVisible(), true);
  await page
    .getByRole("button", { name: "← Volver a Ajustes", exact: true })
    .click();
  assert.equal(await page.locator(".ai-usage").isVisible(), false);
  await page.locator("[data-tool-go=herramientas]").click();
  await page.locator("[data-tool-go=usuarios]").click();
  await page
    .getByRole("button", { name: "← Volver a Herramientas", exact: true })
    .click();
  assert.equal(
    await page
      .locator(".header-actions [data-page=ajustes]")
      .getAttribute("aria-current"),
    "page",
  );
  await page.locator('[data-tool-go="consultor"]').click();
  assert.equal(await page.locator("#consult-filter").isVisible(), true);
  await page
    .getByRole("button", { name: "← Volver a Herramientas", exact: true })
    .click();
  await page.locator('[data-tool-go="clientes"]').click();
  assert.equal(await page.locator("#title").textContent(), "Clientes");
  await page
    .getByRole("button", { name: "← Volver a Herramientas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "← Volver a Ajustes", exact: true })
    .click();
  assert.equal(await page.locator(".settings-home").isVisible(), true);
  console.log(
    "PASS ajustes: herramientas integradas, calendario en menú, plantillas ocultas, usuarios, configuración, tarifas, copias e IA",
  );
  await page.locator("[data-page=ajustes]").click();
  await page.locator('[data-tool-go="ajustes-cuenta"]').click();
  await page.locator("#session-panel").waitFor();
  // A new page shares only the browser's persisted token, not the in-memory app state.
  const p2 = await context.newPage();
  p2.on("pageerror", (e) => errors.push(e.message));
  const startupGate = () => {
    let release, arrive;
    return {
      pending: new Promise((resolve) => (release = resolve)),
      reached: new Promise((resolve) => (arrive = resolve)),
      release: () => release(),
      arrive: () => arrive(),
    };
  };
  const startupGates = new Map(
    ["/auth/me", "/api/state", "/api/files"].map((p) => [p, startupGate()]),
  );
  const lastModule = startupGate();
  await p2.route(
    "https://vidres-sosa-ia.pausosagomez.workers.dev/**",
    async (route) => {
      const hold = startupGates.get(new URL(route.request().url()).pathname);
      if (hold) {
        hold.arrive();
        await hold.pending;
      }
      await route.fallback();
    },
  );
  await p2.route("**/expediente.js*", async (route) => {
    lastModule.arrive();
    await lastModule.pending;
    await route.fallback();
  });
  await p2.goto("https://paanser.github.io/vidres-sosa-gestion/", {
    waitUntil: "domcontentloaded",
  });
  const checkLoading = async () => {
    assert.equal(await p2.locator("#startup-screen").isVisible(), true);
    assert.equal(await p2.locator("#auth-screen").isVisible(), false);
    assert.equal(await p2.locator(".layout").isVisible(), false);
  };
  await startupGates.get("/auth/me").reached;
  await lastModule.reached;
  await checkLoading();
  assert.equal(await p2.evaluate(() => typeof VSStorage), "undefined");
  startupGates.get("/auth/me").release();
  // Both requests must start before either response is released.
  await Promise.all(
    ["/api/state", "/api/files"].map((p) => startupGates.get(p).reached),
  );
  await checkLoading();
  startupGates.get("/api/state").release();
  await checkLoading();
  startupGates.get("/api/files").release();
  await p2
    .locator("#title")
    .filter({ hasText: "Inicio" })
    .waitFor({ state: "attached" });
  await checkLoading();
  lastModule.release();
  await p2.locator(".layout").waitFor({ state: "visible" });
  assert.equal(await p2.locator("#startup-screen").isVisible(), false);
  assert.equal(await p2.locator("#auth-screen").isVisible(), false);
  assert.equal(await p2.locator("#nav button[disabled]").count(), 0);
  assert.ok(await p2.locator("#content").innerHTML());
  await p2.close();
  console.log(
    "PASS sesión persistente: sin flash de login ni pantalla vacía, descargas anticipadas y datos en paralelo con red lenta",
  );
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await page.locator("#login-form").waitFor({ state: "visible" });
  await page.locator("#login-form [name=usuario]").fill("operario");
  await page.locator("#login-password").fill("employee-fixture");
  await page.locator("#login-form [type=submit]").click();
  await page.locator("#title").filter({ hasText: "Inicio" }).waitFor();
  await page
    .locator("#nav button[disabled]")
    .first()
    .waitFor({ state: "detached" });
  await page.locator("[data-page=ajustes]").click();
  await page.locator(".settings-home").waitFor();
  assert.equal(await page.locator('[data-tool-go="usuarios"]').count(), 0);
  await page.locator('[data-tool-go="ajustes-copias"]').click();
  assert.equal(await page.locator("#backup-import").count(), 0);
  assert.equal(
    await page
      .getByRole("heading", { name: "Importar datos existentes", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "← Volver a Ajustes", exact: true })
    .click();
  await page.locator("[data-tool-go=herramientas]").click();
  assert.equal(await page.locator('[data-tool-go="usuarios"]').count(), 0);
  const callsBefore = requests.filter((p) => p === "/admin/users").length;
  await page.evaluate(() => window.vidresNavigate("usuarios"));
  await page
    .getByText("Solo un administrador puede gestionar usuarios.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    requests.filter((p) => p === "/admin/users").length,
    callsBefore,
  );
  await page
    .getByRole("button", { name: "← Volver a Herramientas", exact: true })
    .click();
  await page.locator("[data-page=ajustes]").click();
  console.log("PASS empleado sin Usuarios ni importación administrativa");
  assert.deepEqual(errors, []);
  await fs.mkdir(path.join(root, "test-results"), { recursive: true });
  await page.screenshot({
    path: path.join(root, "test-results", "auth-mobile.png"),
    fullPage: true,
  });
  for (const width of [390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('[data-page="inicio"]').click();
    const sizes = await page.evaluate(() => ({
      body: parseFloat(getComputedStyle(document.body).fontSize),
      menu: parseFloat(
        getComputedStyle(document.querySelector("#nav button")).fontSize,
      ),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(sizes.body, width >= 901 ? 18 : 15);
    if (width >= 901) assert.equal(sizes.menu, 18);
    assert.equal(sizes.overflow, false, `Desbordamiento a ${width}px`);
    if (width === 1440)
      await page.screenshot({
        path: path.join(root, "test-results", "desktop-reading.png"),
        fullPage: true,
      });
  }
  console.log(
    "PASS lectura y navegación sin desbordamiento a 390/768/1024/1440/1920 px",
  );
  await require("./check-operations-browser.cjs")(page, context, root);
  assert.deepEqual(errors, []);
  await require("./check-milestones-browser.cjs")(page);
  await browser.close();
})().catch((e) => {
  console.error(e);
  if (process.env.GITHUB_ACTIONS)
    console.log(
      "::error::" +
        String(e.stack || e)
          .replaceAll("%", "%25")
          .replaceAll("\r", "%0D")
          .replaceAll("\n", "%0A"),
    );
  process.exit(1);
});
