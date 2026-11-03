const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
let loaded;
async function moduleWorker() {
  return (loaded ||= fs
    .readFile(
      require("node:path").join(__dirname, "../worker/worker.js"),
      "utf8",
    )
    .then(
      (s) =>
        import(
          "data:text/javascript;base64," + Buffer.from(s).toString("base64")
        ),
    ));
}
function setup() {
  const map = new Map();
  return {
    map,
    env: {
      OPENAI_API_KEY: "fixture-not-a-key",
      ACCESS_CODE: "fixture-access",
      ALLOWED_ORIGIN: "https://paanser.github.io",
      USAGE: {
        get: async (k) => map.get(k),
        put: async (k, v) => map.set(k, v),
      },
    },
  };
}
function request({
  origin = "https://paanser.github.io",
  code = "fixture-access",
  text = "Cliente de prueba, cambiar vidrio",
  ip = "192.0.2.1",
} = {}) {
  return new Request("https://worker.invalid", {
    method: "POST",
    headers: {
      Origin: origin,
      "X-Access-Code": code,
      "CF-Connecting-IP": ip,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
}
function provider(content) {
  return async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
    });
}
test("código de acceso: correcto, distinto y distinta longitud", async () => {
  const { secureCompare } = await moduleWorker();
  assert.equal(await secureCompare("abc", "abc"), true);
  assert.equal(await secureCompare("abc", "abx"), false);
  assert.equal(await secureCompare("", "abc"), false);
});
test("rechaza origen y código sin llamar al proveedor", async () => {
  const { default: w } = await moduleWorker(),
    { env } = setup();
  assert.equal(
    (await w.fetch(request({ origin: "https://otra.invalid" }), env)).status,
    403,
  );
  assert.equal((await w.fetch(request({ code: "malo" }), env)).status, 401);
});
test("diez solicitudes por minuto y límite mensual; hash de IP", async () => {
  const { default: w } = await moduleWorker(),
    { env, map } = setup(),
    original = global.fetch;
  global.fetch = provider('{"cliente":"Prueba"}');
  try {
    for (let i = 0; i < 10; i++)
      assert.equal((await w.fetch(request(), env)).status, 200);
    assert.equal((await w.fetch(request(), env)).status, 429);
    assert.ok([...map.keys()].every((k) => !k.includes("192.0.2.1")));
    map.set("calls:" + new Date().toISOString().slice(0, 7), "500");
    assert.equal(
      (await w.fetch(request({ ip: "192.0.2.2" }), env)).status,
      429,
    );
  } finally {
    global.fetch = original;
  }
});
test("JSON inválido claro y campos para revisión sin marcar Crítico", async () => {
  const { default: w } = await moduleWorker(),
    { env } = setup(),
    original = global.fetch;
  try {
    global.fetch = provider("no es JSON");
    let r = await w.fetch(request(), env);
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /JSON no válido/);
    global.fetch = provider(
      '{"cliente":"Prueba","estado":"Crítico","fecha":"2026-02-31"}',
    );
    r = await w.fetch(request(), env);
    const data = await r.json();
    assert.equal(data.reviewRequired, true);
    assert.equal(data.fields.estado, "");
    assert.equal(data.fields.fecha, "");
  } finally {
    global.fetch = original;
  }
});
