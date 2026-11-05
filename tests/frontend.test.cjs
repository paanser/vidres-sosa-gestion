const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const { setup } = require("./helpers/backend.cjs");
const root = path.join(__dirname, "..");
const load = (context, file) =>
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, {
    filename: file,
  });
const store = (initial = []) => {
  const map = new Map(initial);
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
};
async function backend() {
  const worker = (await import("../worker/worker.js")).default,
    env = setup();
  return {
    env,
    async request(p, options = {}, token) {
      const headers = {
        Origin: "https://paanser.github.io",
        "CF-Connecting-IP": "192.0.2.1",
        ...Object.fromEntries(new Headers(options.headers || {})),
      };
      if (token) headers.Authorization = "Bearer " + token;
      return worker.fetch(
        new Request("https://worker.invalid" + p, { ...options, headers }),
        env,
      );
    },
  };
}
async function json(b, path, method = "GET", body, token) {
  const r = await b.request(
      path,
      {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      },
      token,
    ),
    data = await r.json();
  if (!r.ok) {
    const e = Error(data.error);
    e.status = r.status;
    throw e;
  }
  return data;
}
async function admin(b) {
  const a = await json(b, "/auth/login", "POST", {
    usuario: "pau",
    password: b.env.ADMIN_INITIAL_PASSWORD,
  });
  return json(
    b,
    "/auth/change-password",
    "POST",
    { actual: b.env.ADMIN_INITIAL_PASSWORD, password: "changed-fixture-123" },
    a.token,
  );
}
const pause = () => new Promise((r) => setTimeout(r, 5));
async function until(fn) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await pause();
  }
  assert.fail("La operación del frontend no terminó");
}
function authContext(b, local) {
  const events = {},
    classes = new Set();
  let reloads = 0;
  const input = () => ({ value: "", focus() {} });
  const login = {
      hidden: false,
      elements: { usuario: input(), password: input() },
    },
    change = {
      hidden: true,
      elements: { actual: input(), password: input(), confirmacion: input() },
    };
  const content = {
      replaceChildren() {
        this.cleared = true;
      },
    },
    screen = { hidden: false },
    message = { textContent: "" };
  for (const form of [login, change]) {
    form.listeners = {};
    form.addEventListener = (n, fn) => (form.listeners[n] = fn);
    form.querySelector = () => ({ disabled: false });
    form.reset = () =>
      Object.values(form.elements).forEach((x) => (x.value = ""));
  }
  const logout = {
    addEventListener(n, fn) {
      this.click = fn;
    },
  };
  const elements = {
    "#auth-screen": screen,
    "#login-form": login,
    "#password-form": change,
    "#auth-message": message,
    "#auth-logout": logout,
    "#content": content,
  };
  const doc = {
    body: {
      classList: {
        add: (x) => classes.add(x),
        remove: (x) => classes.delete(x),
      },
    },
    hidden: false,
    querySelector: (s) => elements[s],
    querySelectorAll: () => [],
    addEventListener: (e, fn) => (events[e] = fn),
  };
  const ctx = {
    document: doc,
    localStorage: local,
    URL,
    Headers,
    console,
    location: {
      reload() {
        reloads++;
      },
    },
    setInterval(fn) {
      events.interval = fn;
    },
    addEventListener: (e, fn) => (events[e] = fn),
    VIDRES_AI_ENDPOINT: "https://worker.invalid",
    fetch: (url, o) => b.request(new URL(url).pathname, o),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  load(ctx, "auth.js");
  return {
    ctx,
    login,
    change,
    screen,
    message,
    classes,
    events,
    content,
    get reloads() {
      return reloads;
    },
  };
}
test("login bloquea la aplicación, obliga al cambio y recupera la sesión persistente", async () => {
  const b = await backend(),
    local = store(),
    a = authContext(b, local);
  let ready = false;
  a.ctx.VSAuth.ready.then(() => (ready = true));
  assert.equal(ready, false);
  assert.equal(a.classes.has("authenticated"), false);
  a.login.elements.usuario.value = "pau";
  a.login.elements.password.value = b.env.ADMIN_INITIAL_PASSWORD;
  a.login.listeners.submit({ preventDefault() {} });
  await until(() => !a.change.hidden);
  assert.equal(ready, false);
  assert.equal(a.classes.has("authenticated"), false);
  const first = local.getItem("vidres-session-v1");
  assert.match(first, /^[a-f0-9]{64}$/);
  a.change.elements.actual.value = b.env.ADMIN_INITIAL_PASSWORD;
  a.change.elements.password.value = "changed-fixture-123";
  a.change.elements.confirmacion.value = "changed-fixture-123";
  a.change.listeners.submit({ preventDefault() {} });
  await a.ctx.VSAuth.ready;
  assert.equal(a.screen.hidden, true);
  assert.equal(a.classes.has("authenticated"), true);
  assert.notEqual(local.getItem("vidres-session-v1"), first);
  const reload = authContext(b, local);
  await reload.ctx.VSAuth.ready;
  assert.equal(reload.screen.hidden, true);
  assert.equal(reload.ctx.VSAuth.user.nombre, "Pau");
  await reload.ctx.VSAuth.logout();
  assert.equal(local.getItem("vidres-session-v1"), null);
  assert.equal(reload.reloads, 1);
  assert.equal(reload.classes.has("authenticated"), false);
  assert.equal(reload.content.cleared, true);
});
test("revocación detectada en frontend borra token y pantalla privada", async () => {
  const b = await backend(),
    a = await admin(b),
    local = store([["vidres-session-v1", a.token]]),
    page = authContext(b, local);
  await page.ctx.VSAuth.ready;
  b.env.DB.db.prepare("DELETE FROM sessions").run();
  await assert.rejects(() => page.ctx.VSAuth.json("/auth/me"));
  assert.equal(local.getItem("vidres-session-v1"), null);
  assert.equal(page.classes.has("authenticated"), false);
  assert.equal(page.reloads, 1);
});
test("almacenamiento remoto: cola, transacciones, fallo de red, conflicto y originales conservados", async () => {
  const b = await backend(),
    a = await admin(b),
    original = '[{"id":"antiguo"}]',
    local = store([["vidres-sosa-demo-v01", original]]);
  let disconnected = false;
  const ctx = {
    structuredClone,
    console,
    localStorage: local,
    addEventListener() {},
    alert() {},
    VSAuth: {
      json: (...args) => {
        if (disconnected) return Promise.reject(Error("Sin red"));
        return json(b, ...args, a.token);
      },
    },
  };
  ctx.window = ctx;
  // Explicit token position, including GET calls with no body.
  ctx.VSAuth.json = (p, m = "GET", body) => {
    if (disconnected) return Promise.reject(Error("Sin red"));
    return json(b, p, m, body, a.token);
  };
  vm.createContext(ctx);
  load(ctx, "storage.js");
  const s = ctx.VSStorage;
  await s.ready;
  assert.equal(JSON.stringify(s.read(s.keys.trabajos, [])), "[]");
  assert.equal(local.getItem("vidres-sosa-demo-v01"), original);
  const job = {
    id: "VS-0001",
    cliente: "Cliente",
    estado: "Pendiente",
    descripcion: "Prueba",
  };
  await Promise.all([
    s.write(s.keys.trabajos, [job]),
    s.write(s.keys.configuracion, { unit: "mm" }),
    s.patchValues({
      [s.keys.notas]: [
        {
          id: "N-1",
          texto: "Nota",
          cliente: "",
          aviso: "",
          creada: "2026-11-05",
          parte: "",
          hecha: false,
        },
      ],
    }),
  ]);
  assert.equal(s.revision(), 3);
  assert.equal(s.read(s.keys.configuracion, {}).unit, "mm");
  disconnected = true;
  await assert.rejects(() => s.write(s.keys.trabajos, []), /Sin red/);
  assert.equal(s.read(s.keys.trabajos, []).length, 1);
  assert.equal(s.revision(), 3);
  disconnected = false;
  const server = await json(b, "/api/state", "GET", undefined, a.token);
  server.values[s.keys.trabajos][0].descripcion = "Otro dispositivo";
  await json(b, "/api/state", "PUT", server, a.token);
  await assert.rejects(
    () => s.write(s.keys.trabajos, []),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () => s.write(s.keys.configuracion, {}),
    /otro dispositivo/i,
  );
  assert.equal(local.getItem("vidres-sosa-demo-v01"), original);
});
test("numeración de presupuesto reservada en servidor sin reutilizar referencias", async () => {
  const b = await backend(),
    a = await admin(b),
    ctx = {
      structuredClone,
      localStorage: store(),
      console,
      addEventListener() {},
      VSAuth: { json: (p, m = "GET", body) => json(b, p, m, body, a.token) },
    };
  ctx.window = ctx;
  vm.createContext(ctx);
  load(ctx, "storage.js");
  await ctx.VSStorage.ready;
  const first = await ctx.VSStorage.reserveQuoteNumber(),
    second = await ctx.VSStorage.reserveQuoteNumber();
  assert.match(first, /^P-\d{4}-0001$/);
  assert.match(second, /^P-\d{4}-0002$/);
  assert.equal(ctx.VSStorage.revision(), 2);
});
test("formularios esperan al servidor y bloquean doble envío sin borrar entradas", async () => {
  const ctx = { window: {}, console, alert() {} };
  vm.createContext(ctx);
  load(ctx, "utils.js");
  let resolve,
    calls = 0;
  const button = { disabled: false },
    form = { dataset: {}, querySelectorAll: () => [button] },
    event = { currentTarget: form, preventDefault() {} };
  const handler = ctx.window.VSForms.guard(async () => {
    calls++;
    await new Promise((r) => (resolve = r));
  });
  const pending = handler(event);
  assert.equal(button.disabled, true);
  await handler(event);
  assert.equal(calls, 1);
  resolve();
  await pending;
  assert.equal(button.disabled, false);
  assert.equal(form.dataset.saving, undefined);
});
test("XSS escapado, CSP sin scripts inline y archivos privados fuera del artefacto Pages", () => {
  const { esc } = require("../utils.js");
  assert.equal(
    esc('<img src=x onerror="alert(1)">'),
    "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
  );
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8"),
    css = fs.readFileSync(path.join(root, "styles.css"), "utf8"),
    flow = fs.readFileSync(
      path.join(root, ".github/workflows/pages.yml"),
      "utf8",
    );
  assert.match(html, /script-src 'self';/);
  assert.doesNotMatch(html, /\bon(?:click|error|load)=/);
  assert.match(css, /body:not\(\.authenticated\) > \.layout/);
  assert.match(flow, /path: public/);
  assert.doesNotMatch(flow, /cp.*\.dev\.vars/);
});
