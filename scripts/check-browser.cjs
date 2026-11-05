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
  await page.locator("#form [type=submit]").click();
  await page.locator("#editor").waitFor({ state: "hidden" });
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
  await page.locator("[data-page=ajustes]").click();
  await page.locator(".settings-home").waitFor();
  assert.equal(await page.locator(".user-list").count(), 0);
  assert.equal(await page.locator("#cfg-unit").count(), 0);
  assert.equal(requests.includes("/admin/users"), false);
  await page.locator('[data-tool-go="usuarios"]').click();
  await page
    .getByRole("heading", { name: "Gestión de usuarios", exact: true })
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
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
