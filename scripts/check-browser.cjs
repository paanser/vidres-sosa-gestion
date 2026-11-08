const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright",
);
const fs = require("node:fs/promises");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const { setup } = require(root + "/tests/helpers/backend.cjs");
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
        (rel.includes("/") && !rel.startsWith("icons/"))
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
  console.log("PASS login, cambio obligatorio y carga privada");
  assert.equal(await page.locator(".global-text-controls").count(), 0);
  assert.equal(await page.locator("[data-text-scale]").count(), 0);
  await page.locator('#nav [data-page="ajustes"]').click();
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
  await require("./check-quotes-browser.cjs")(page, context, root);

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
  assert.equal(await page.locator("#form [name=duracion]").isVisible(), false);
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
  await page.locator("[data-new-measure=ancho]").fill("100");
  await page.locator("[data-new-measure=alto]").fill("80");
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
  console.log(
    "PASS parte, medición y foto en servidor, sin copia local de negocio",
  );
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
  await page.locator('[data-tool-go="ajustes-plantillas"]').click();
  await page.locator("#plantilla-new").click();
  await page
    .locator("#plantilla-form [name=nombre]")
    .fill("Plantilla de prueba");
  await page.locator("#plantilla-form [type=submit]").click();
  await page.locator("#plantilla-editor").waitFor({ state: "hidden" });
  await page.getByText("Plantilla de prueba", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "← Volver a Ajustes", exact: true })
    .click();
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
  await page.locator("[data-page=herramientas]").click();
  await page.locator("[data-tool-go=usuarios]").click();
  await page
    .getByRole("button", { name: "← Volver a Herramientas", exact: true })
    .click();
  assert.equal(
    await page
      .locator("#nav [data-page=herramientas]")
      .getAttribute("aria-current"),
    "page",
  );
  console.log(
    "PASS ajustes separados: usuarios bajo demanda, roles, navegación, configuración, tarifas, plantillas, copias e IA",
  );
  await page.locator("[data-page=ajustes]").click();
  await page.locator('[data-tool-go="ajustes-cuenta"]').click();
  await page.locator("#session-panel").waitFor();
  // A new page shares only the browser's persisted token, not the in-memory app state.
  const p2 = await context.newPage();
  p2.on("pageerror", (e) => errors.push(e.message));
  await p2.goto("https://paanser.github.io/vidres-sosa-gestion/");
  await p2.locator("#title").filter({ hasText: "Inicio" }).waitFor();
  assert.equal(await p2.locator("#auth-screen").isVisible(), false);
  await p2.close();
  console.log(
    "PASS sesión persistente y datos compartidos al abrir otra página",
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
  await page.locator("[data-page=herramientas]").click();
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
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
