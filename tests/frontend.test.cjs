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
function authContext(b, local, timers = { setTimeout, clearTimeout }) {
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
    screen = { hidden: true },
    startup = { hidden: false },
    startupMessage = { textContent: "" },
    retry = { hidden: true, addEventListener() {} },
    goToLogin = {
      hidden: true,
      addEventListener(event, handler) {
        this[event] = handler;
      },
    },
    layout = { hidden: true, inert: true },
    message = { textContent: "" };
  for (const form of [login, change]) {
    form.button = { disabled: false };
    form.listeners = {};
    form.addEventListener = (n, fn) => (form.listeners[n] = fn);
    form.querySelector = () => form.button;
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
    "#startup-screen": startup,
    "#startup-message": startupMessage,
    "#startup-retry": retry,
    "#startup-login": goToLogin,
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
    querySelectorAll: (s) => (s === "body > .layout" ? [layout] : []),
    addEventListener: (e, fn) => (events[e] = fn),
  };
  const ctx = {
    document: doc,
    localStorage: local,
    URL,
    Headers,
    AbortController,
    ...timers,
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
    startup,
    startupMessage,
    retry,
    goToLogin,
    layout,
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
  assert.equal(a.startup.hidden, false);
  assert.equal(a.layout.hidden, true);
  assert.equal(a.layout.inert, true);
  a.ctx.VSAuth.showApp();
  assert.equal(a.startup.hidden, true);
  assert.equal(a.layout.hidden, false);
  assert.equal(a.layout.inert, false);
  assert.equal(a.classes.has("authenticated"), true);
  assert.notEqual(local.getItem("vidres-session-v1"), first);
  const reload = authContext(b, local);
  assert.equal(reload.screen.hidden, true);
  assert.equal(reload.startup.hidden, false);
  await reload.ctx.VSAuth.ready;
  assert.equal(reload.screen.hidden, true);
  assert.equal(reload.layout.hidden, true);
  assert.equal(reload.ctx.VSAuth.user.nombre, "Pau");
  await reload.ctx.VSAuth.logout();
  assert.equal(local.getItem("vidres-session-v1"), null);
  assert.equal(reload.reloads, 1);
  assert.equal(reload.classes.has("authenticated"), false);
  assert.equal(reload.content.cleared, true);
});
test("fallo de red al recuperar la sesión ofrece reintentar sin mostrar login ni datos", async () => {
  const local = store([["vidres-session-v1", "session-fixture"]]);
  const page = authContext(
    {
      request: async () => {
        throw Error("offline");
      },
    },
    local,
  );
  await until(() => !page.retry.hidden);
  assert.equal(page.screen.hidden, true);
  assert.equal(page.startup.hidden, false);
  assert.equal(page.layout.hidden, true);
  assert.equal(local.getItem("vidres-session-v1"), "session-fixture");
  assert.match(page.startupMessage.textContent, /No se puede conectar/);
  page.ctx.VSAuth.showApp();
  assert.equal(page.layout.hidden, true);
});
test("la verificación termina aunque el cuerpo no responda a la cancelación", async () => {
  const local = store([["vidres-session-v1", "session-fixture"]]);
  let expire, readingBody;
  const page = authContext(
    {
      async request(path, { signal }) {
        assert.equal(path, "/auth/me");
        return {
          ok: true,
          json() {
            readingBody = signal;
            return new Promise(() => {});
          },
        };
      },
    },
    local,
    {
      setTimeout(callback, delay) {
        assert.equal(delay, 15000);
        expire = callback;
      },
      clearTimeout() {},
    },
  );
  await until(() => readingBody);
  assert.equal(page.retry.hidden, true);
  expire();
  await until(() => !page.retry.hidden);
  assert.equal(readingBody.aborted, true);
  assert.match(page.startupMessage.textContent, /tarda demasiado/);
  assert.equal(page.layout.hidden, true);
  assert.equal(page.screen.hidden, true);
  assert.equal(local.getItem("vidres-session-v1"), "session-fixture");
});
test("el formulario recupera el botón y conserva las credenciales si el login se atasca", async () => {
  let expire,
    signal,
    calls = 0;
  const page = authContext(
    {
      request(path, options) {
        assert.equal(path, "/auth/login");
        calls++;
        signal = options.signal;
        return new Promise(() => {});
      },
    },
    store(),
    {
      setTimeout(callback, delay) {
        assert.equal(delay, 30000);
        expire = callback;
      },
      clearTimeout() {},
    },
  );
  page.login.elements.usuario.value = "operario";
  page.login.elements.password.value = "fixture-password";
  const event = { preventDefault() {} };
  page.login.listeners.submit(event);
  page.login.listeners.submit(event);
  assert.equal(calls, 1);
  assert.equal(page.login.button.disabled, true);
  expire();
  await until(() => !page.login.button.disabled);
  assert.equal(signal.aborted, true);
  assert.match(page.message.textContent, /tarda demasiado en iniciar sesión/);
  assert.equal(page.login.elements.usuario.value, "operario");
  assert.equal(page.login.elements.password.value, "fixture-password");
  assert.equal(page.layout.hidden, true);
});
test("la carga de datos inicial termina si el servidor se queda esperando", async () => {
  let expire, signal;
  const { ctx, layout } = authContext(
    {
      request(path, options) {
        assert.equal(path, "/api/state");
        signal = options.signal;
        return new Promise(() => {});
      },
    },
    store(),
    {
      setTimeout(callback, delay) {
        assert.equal(delay, 15000);
        expire = callback;
      },
      clearTimeout() {},
    },
  );
  const pending = ctx.VSAuth.json("/api/state");
  expire();
  await assert.rejects(pending, /tarda demasiado en cargar los datos/);
  assert.equal(signal.aborted, true);
  assert.equal(layout.hidden, true);
});
test("una sesión rechazada muestra el formulario sin esperar el cuerpo ni recargar", async () => {
  const local = store([["vidres-session-v1", "session-fixture"]]);
  const page = authContext(
    {
      request: async () => ({
        status: 401,
        ok: false,
        json: () => new Promise(() => {}),
      }),
    },
    local,
  );
  await until(() => !page.screen.hidden);
  assert.equal(page.reloads, 0);
  assert.equal(page.startup.hidden, true);
  assert.equal(page.layout.hidden, true);
  assert.equal(local.getItem("vidres-session-v1"), null);
});
test("se puede iniciar sesión mientras la comprobación anterior sigue pendiente", async () => {
  const b = await backend();
  const a = await admin(b);
  const local = store([["vidres-session-v1", "session-fixture"]]);
  let rejectOldSession;
  const page = authContext(
    {
      request(path, options) {
        if (path === "/auth/me")
          return new Promise((resolve) => {
            rejectOldSession = () =>
              resolve(new Response(null, { status: 401 }));
          });
        assert.equal(options.headers.has("Authorization"), false);
        return b.request(path, options);
      },
    },
    local,
  );
  assert.equal(page.goToLogin.hidden, false);
  page.goToLogin.click();
  assert.equal(page.screen.hidden, false);
  assert.equal(local.getItem("vidres-session-v1"), "session-fixture");
  page.login.elements.usuario.value = a.user.usuario;
  page.login.elements.password.value = "changed-fixture-123";
  page.login.listeners.submit({ preventDefault() {} });
  await until(() => page.classes.has("authenticated"));
  rejectOldSession();
  await pause();
  assert.equal(page.reloads, 0);
  assert.equal(page.ctx.VSAuth.user.nombre, "Pau");
  assert.match(local.getItem("vidres-session-v1"), /^[a-f0-9]{64}$/);
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
  await s.refresh();
  assert.equal(s.read(s.keys.trabajos, [])[0].descripcion, "Otro dispositivo");
  await s.write(s.keys.configuracion, { unit: "cm" });
  disconnected = true;
  const currentRevision = s.revision();
  await assert.rejects(() => s.refresh(), /Sin red/);
  assert.equal(s.revision(), currentRevision);
  assert.equal(s.read(s.keys.trabajos, [])[0].descripcion, "Otro dispositivo");
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
    form = {
      dataset: {},
      querySelectorAll: (selector) =>
        selector === '[type="submit"]' ? [button] : [],
    },
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

test("comprobar sesión conserva contenido y almacenamiento ante red o 5xx y reintenta", async () => {
  const b = await backend(),
    session = await admin(b),
    local = store([["vidres-session-v1", session.token]]);
  const a = authContext(b, local);
  await a.ctx.VSAuth.ready;
  let cleared = 0;
  a.ctx.VSStorage = {
    clear() {
      cleared++;
    },
  };
  for (const failure of ["network", 500, 503]) {
    a.ctx.fetch = async () => {
      if (failure === "network") throw Error("offline");
      return new Response("{}", { status: failure });
    };
    await a.events.interval();
    assert.equal(a.classes.has("authenticated"), true);
    assert.equal(a.content.cleared, undefined);
    assert.equal(cleared, 0);
    assert.equal(local.getItem("vidres-session-v1"), session.token);
    assert.match(a.message.textContent, /Sin conexión/);
  }
  a.ctx.fetch = (url, options) => b.request(new URL(url).pathname, options);
  await a.events.interval();
  assert.equal(a.classes.has("authenticated"), true);
  for (const status of [401, 403]) {
    a.ctx.fetch = async () => new Response("{}", { status });
    await a.events.interval();
    assert.equal(a.classes.has("authenticated"), false);
  }
});
