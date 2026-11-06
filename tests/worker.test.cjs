const { test, before } = require("node:test");
const assert = require("node:assert/strict");
let worker, security;
before(async () => {
  worker = (await import("../worker/worker.js")).default;
  security = await import("../worker/security.js");
});
const { D1, setup } = require("./helpers/backend.cjs");
function req(path, method = "GET", body, token, extra = {}) {
  const headers = {
    Origin: "https://paanser.github.io",
    "CF-Connecting-IP": "192.0.2.1",
    ...extra,
  };
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request("https://worker.invalid" + path, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function call(env, path, method, body, token, extra) {
  const r = await worker.fetch(req(path, method, body, token, extra), env);
  return { status: r.status, data: await r.json(), headers: r.headers };
}
async function admin(env) {
  let r = await call(env, "/auth/login", "POST", {
    usuario: "pau",
    password: env.ADMIN_INITIAL_PASSWORD,
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.user.cambioObligatorio, true);
  r = await call(
    env,
    "/auth/change-password",
    "POST",
    { actual: env.ADMIN_INITIAL_PASSWORD, password: "changed-fixture-123" },
    r.data.token,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const empty = () =>
  Object.fromEntries(
    Object.entries({
      trabajos: "vidres-sosa-demo-v01",
      clientes: "vidres-clientes-v1",
      presupuestos: "vs-quote-prototype-v1",
      tarifas: "vs-tariffs-prototype-v1",
      configuracion: "vs-config-v1",
      numeracion: "vs-quote-sequence-v1",
      notas: "vidres-notas-v1",
      plantillas: "vidres-plantillas-v1",
      catalogo: "vs-pdf-catalog-v1",
      mediciones: "vidres-mediciones-servidor-v1",
    }).map(([n, k]) => [
      k,
      ["configuracion", "numeracion"].includes(n) ? {} : [],
    ]),
  );
const job = {
  id: "VS-0001",
  cliente: "Cliente <img src=x onerror=alert(1)>",
  descripcion: "Prueba",
  estado: "Pendiente",
  fecha: "",
};
test("bootstrap secreto, cambio obligatorio y hashes sin credenciales en claro", async () => {
  const env = setup();
  let r = await call(env, "/auth/login", "POST", {
    usuario: "pau",
    password: "temporary-fixture",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const old = r.data.token;
  assert.match(old, /^[a-f0-9]{64}$/);
  assert.equal(
    (await call(env, "/api/state", "GET", undefined, old)).status,
    403,
  );
  assert.equal(
    (
      await call(
        env,
        "/auth/change-password",
        "POST",
        { actual: "temporary-fixture", password: "short" },
        old,
      )
    ).status,
    400,
  );
  r = await call(
    env,
    "/auth/change-password",
    "POST",
    { actual: "temporary-fixture", password: "changed-fixture-123" },
    old,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(
    (await call(env, "/auth/me", "GET", undefined, old)).status,
    401,
  );
  assert.equal(
    (await call(env, "/auth/me", "GET", undefined, r.data.token)).status,
    200,
  );
  const u = env.DB.db.prepare("SELECT * FROM users").get();
  assert.equal(u.must_change, 0);
  assert.notEqual(u.password_hash, "changed-fixture-123");
  assert.equal(u.salt.length, 32);
  const s = env.DB.db.prepare("SELECT * FROM sessions").get();
  assert.notEqual(s.token_hash, r.data.token);
  assert.equal("expires_at" in s, false);
  delete env.ADMIN_INITIAL_PASSWORD;
  assert.equal(
    (
      await call(env, "/auth/login", "POST", {
        usuario: "pau",
        password: "changed-fixture-123",
      })
    ).status,
    200,
  );
});
test("empleado: datos permitidos, usuarios/importación rechazados y no se revela el hash", async () => {
  const env = setup(),
    a = await admin(env);
  let r = await call(
    env,
    "/admin/users",
    "POST",
    {
      nombre: "Empleado <script>",
      usuario: "operario",
      password: "employee-fixture",
      rol: "empleado",
    },
    a.token,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const e = (
    await call(env, "/auth/login", "POST", {
      usuario: "OPERARIO",
      password: "employee-fixture",
    })
  ).data;
  for (const [p, m, b] of [
    ["/admin/users", "GET"],
    [
      "/admin/users",
      "POST",
      {
        nombre: "No",
        usuario: "no",
        password: "employee-fixture",
        rol: "administrador",
      },
    ],
    ["/admin/imports", "POST", { revision: 0 }],
  ])
    assert.equal((await call(env, p, m, b, e.token)).status, 403);
  assert.equal(
    (await call(env, "/api/state", "GET", undefined, e.token)).status,
    200,
  );
  r = await call(env, "/admin/users", "GET", undefined, a.token);
  assert.ok(!JSON.stringify(r.data).includes("password_hash"));
  assert.ok(!JSON.stringify(r.data).includes("salt"));
});
test("último administrador, desactivación, eliminación y revocación de todas las sesiones", async () => {
  const env = setup(),
    a = await admin(env);
  for (const method of ["PATCH", "DELETE"])
    assert.equal(
      (
        await call(
          env,
          "/admin/users/" + a.user.id,
          method,
          method === "PATCH" ? { activo: false } : undefined,
          a.token,
        )
      ).status,
      409,
    );
  await call(
    env,
    "/admin/users",
    "POST",
    {
      nombre: "Equipo",
      usuario: "equipo",
      password: "employee-fixture",
      rol: "empleado",
    },
    a.token,
  );
  const e = (
      await call(env, "/auth/login", "POST", {
        usuario: "equipo",
        password: "employee-fixture",
      })
    ).data,
    e2 = (
      await call(env, "/auth/login", "POST", {
        usuario: "equipo",
        password: "employee-fixture",
      })
    ).data;
  let r = await call(
    env,
    "/admin/users/" + e.user.id + "/password",
    "POST",
    { password: "replacement-fixture" },
    a.token,
  );
  assert.equal(r.status, 200);
  for (const t of [e.token, e2.token])
    assert.equal(
      (await call(env, "/auth/me", "GET", undefined, t)).status,
      401,
    );
  const next = (
    await call(env, "/auth/login", "POST", {
      usuario: "equipo",
      password: "replacement-fixture",
    })
  ).data;
  assert.equal(
    (
      await call(
        env,
        "/admin/users/" + e.user.id,
        "PATCH",
        { activo: false },
        a.token,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call(env, "/auth/me", "GET", undefined, next.token)).status,
    401,
  );
  assert.equal(
    (
      await call(env, "/auth/login", "POST", {
        usuario: "equipo",
        password: "replacement-fixture",
      })
    ).status,
    401,
  );
  assert.equal(
    (await call(env, "/admin/users/" + e.user.id, "DELETE", undefined, a.token))
      .status,
    200,
  );
});
test("cinco fallos por usuario y por IP; bloqueo temporal y errores genéricos", async () => {
  const env = setup();
  await admin(env);
  for (let i = 0; i < 5; i++) {
    const r = await call(env, "/auth/login", "POST", {
      usuario: "nadie",
      password: "incorrecta",
    });
    assert.equal(r.status, 401);
    assert.equal(r.data.error, "Usuario o contraseña incorrectos");
  }
  assert.equal(
    (
      await call(env, "/auth/login", "POST", {
        usuario: "pau",
        password: "changed-fixture-123",
      })
    ).status,
    429,
  );
  assert.equal(
    (
      await call(
        env,
        "/auth/login",
        "POST",
        { usuario: "nadie", password: "incorrecta" },
        undefined,
        { "CF-Connecting-IP": "192.0.2.2" },
      )
    ).status,
    429,
  );
  env.DB.db.prepare("UPDATE attempts SET window_start=0,blocked_until=0").run();
  assert.equal(
    (
      await call(env, "/auth/login", "POST", {
        usuario: "pau",
        password: "changed-fixture-123",
      })
    ).status,
    200,
  );
});
test("sesión sin caducidad, cierre y nueva comprobación en la mutación atómica", async () => {
  const env = setup(),
    a = await admin(env);
  env.DB.db.prepare("UPDATE sessions SET created_at='2000-01-01'").run();
  assert.equal(
    (await call(env, "/auth/me", "GET", undefined, a.token)).status,
    200,
  );
  const auth = await security.authenticate(
    req("/api/state", "GET", undefined, a.token),
    env.DB,
  );
  assert.equal(
    (await call(env, "/auth/logout", "POST", {}, a.token)).status,
    200,
  );
  await assert.rejects(
    () =>
      security.atomic(env.DB, auth, [
        env.DB.prepare("UPDATE workspace SET revision=999"),
      ]),
    /AUTH_REQUIRED/,
  );
  assert.equal(
    env.DB.db.prepare("SELECT revision FROM workspace").get().revision,
    0,
  );
});
test("sin sesión no hay datos, archivos, usuarios ni consumo de OpenAI; CORS y preflight", async () => {
  const env = setup();
  for (const [p, m, b] of [
    ["/api/state", "GET"],
    ["/api/files", "GET"],
    ["/admin/users", "GET"],
    ["/ai/interpretar", "POST", { text: "Cliente de prueba" }],
    ["/", "POST", { text: "Parte de prueba" }],
  ])
    assert.equal((await call(env, p, m, b)).status, 401);
  let r = await worker.fetch(req("/api/state", "OPTIONS"), env);
  assert.equal(r.status, 204);
  assert.equal(
    r.headers.get("Access-Control-Allow-Origin"),
    "https://paanser.github.io",
  );
  r = await worker.fetch(
    req("/api/state", "GET", undefined, undefined, {
      Origin: "https://otro.invalid",
    }),
    env,
  );
  assert.equal(r.status, 403);
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), null);
});
test("datos compartidos, validación, conflictos sin sobrescritura y transacción con mediciones", async () => {
  const env = setup(),
    a = await admin(env),
    values = empty();
  values["vidres-sosa-demo-v01"] = [job];
  values["vidres-mediciones-servidor-v1"] = [
    { id: "M-1", trabajo: job.id, ancho: "100", alto: "80", cantidad: "1" },
  ];
  let r = await call(
    env,
    "/api/state",
    "PUT",
    { revision: 0, values },
    a.token,
  );
  assert.equal(r.status, 200, JSON.stringify(r.data));
  r = await call(
    env,
    "/api/state",
    "PUT",
    { revision: 0, values: empty() },
    a.token,
  );
  assert.equal(r.status, 409, JSON.stringify(r.data));
  r = await call(env, "/api/state", "GET", undefined, a.token);
  assert.equal(r.data.values["vidres-sosa-demo-v01"][0].cliente, job.cliente);
  assert.equal(r.data.revision, 1);
  values["vidres-mediciones-servidor-v1"][0].trabajo = "inexistente";
  assert.equal(
    (await call(env, "/api/state", "PUT", { revision: 1, values }, a.token))
      .status,
    400,
  );
  assert.equal(
    env.DB.db.prepare("SELECT revision FROM workspace").get().revision,
    1,
  );
});
test("archivos privados, versión contra sobrescritura e importación verificada", async () => {
  const env = setup(),
    a = await admin(env),
    values = empty();
  values["vidres-sosa-demo-v01"] = [job];
  await call(env, "/api/state", "PUT", { revision: 0, values }, a.token);
  const id = "a".repeat(32),
    meta = {
      kind: "documents",
      nombre: "prueba.txt",
      trabajo: job.id,
      revision: 1,
    },
    upload = async (id, meta, token = a.token) =>
      worker.fetch(
        new Request("https://worker.invalid/api/files/" + id, {
          method: "PUT",
          headers: {
            Origin: "https://paanser.github.io",
            Authorization: "Bearer " + token,
            "Content-Type": "text/plain",
            "X-File-Metadata": encodeURIComponent(JSON.stringify(meta)),
          },
          body: "contenido de prueba",
        }),
        env,
      );
  let r = await upload(id, meta);
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await worker.fetch(req("/api/files/" + id), env)).status, 401);
  assert.equal(
    await (
      await worker.fetch(
        req("/api/files/" + id, "GET", undefined, a.token),
        env,
      )
    ).text(),
    "contenido de prueba",
  );
  r = await upload(id, meta);
  assert.ok(r.status >= 400);
  assert.equal(
    (await call(env, "/api/files", "GET", undefined, a.token)).data.files[0]
      .version,
    1,
  );
  r = await upload(id, { ...meta, version: 1, revision: 2 });
  assert.equal(r.status, 200, await r.clone().text());
  const imp = (
    await call(env, "/admin/imports", "POST", { revision: 3 }, a.token)
  ).data;
  r = await upload("b".repeat(32), { ...meta, importId: imp.id });
  assert.equal(r.status, 200, await r.clone().text());
  const stored = await r.json();
  assert.equal(
    (await call(env, "/api/files", "GET", undefined, a.token)).data.files
      .length,
    1,
  );
  assert.equal(
    (
      await call(
        env,
        "/admin/imports/" + imp.id,
        "POST",
        { values, files: [] },
        a.token,
      )
    ).status,
    400,
  );
  r = await worker.fetch(
    req(
      "/admin/imports/" + imp.id,
      "POST",
      {
        values,
        files: [{ id: "b".repeat(32), sha256: stored.sha256, size: 19 }],
      },
      a.token,
    ),
    env,
  );
  assert.equal(r.status, 200, await r.clone().text());
  assert.equal(
    (await call(env, "/api/files", "GET", undefined, a.token)).data.files[0].id,
    "b".repeat(32),
  );
});
test("cuota atómica de IA, respuesta revisable y proveedor simulado", async () => {
  const env = setup(),
    a = await admin(env),
    original = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls++;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '{"cliente":"Prueba","estado":"Crítico","fecha":"2026-02-31"}',
            },
          },
        ],
      }),
    );
  };
  try {
    for (let i = 0; i < 10; i++) {
      const r = await call(
        env,
        "/ai/interpretar",
        "POST",
        { text: "Cliente ficticio, cambiar vidrio" },
        a.token,
      );
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(r.data.fields.estado, "");
      assert.equal(r.data.fields.fecha, "");
    }
    assert.equal(
      (
        await call(
          env,
          "/ai/interpretar",
          "POST",
          { text: "Cliente ficticio" },
          a.token,
        )
      ).status,
      429,
    );
    assert.equal(calls, 10);
  } finally {
    global.fetch = original;
  }
});

test("contraseñas mínimas, pepper obligatorio y ausencia de Origin sin sesión", async () => {
  const env = setup(),
    a = await admin(env);
  assert.equal(
    (
      await call(
        env,
        "/admin/users",
        "POST",
        {
          nombre: "Corta",
          usuario: "corta",
          password: "1234567",
          rol: "empleado",
        },
        a.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        env,
        "/admin/users/" + a.user.id + "/password",
        "POST",
        { password: "1234567" },
        a.token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await call(
        env,
        "/auth/change-password",
        "POST",
        { actual: "changed-fixture-123", password: "😀😀😀😀" },
        a.token,
      )
    ).status,
    400,
  );
  const noPepper = setup();
  delete noPepper.PASSWORD_PEPPER;
  assert.equal(
    (
      await call(noPepper, "/auth/login", "POST", {
        usuario: "pau",
        password: noPepper.ADMIN_INITIAL_PASSWORD,
      })
    ).status,
    503,
  );
  const r = await worker.fetch(
    new Request("https://worker.invalid/api/state"),
    env,
  );
  assert.equal(r.status, 401);
});

test("cancelación de importación durante subida no confirma ni expone el archivo", async () => {
  const env = setup(),
    a = await admin(env),
    imp = (await call(env, "/admin/imports", "POST", { revision: 0 }, a.token))
      .data;
  const original = env.FILES.put;
  env.FILES.put = async (key, bytes) => {
    await original(key, bytes);
    const r = await call(
      env,
      "/admin/imports/" + imp.id,
      "DELETE",
      undefined,
      a.token,
    );
    assert.equal(r.status, 200);
  };
  const r = await worker.fetch(
    new Request("https://worker.invalid/api/files/" + "c".repeat(32), {
      method: "PUT",
      headers: {
        Origin: "https://paanser.github.io",
        Authorization: "Bearer " + a.token,
        "Content-Type": "text/plain",
        "X-File-Metadata": encodeURIComponent(
          JSON.stringify({
            kind: "documents",
            nombre: "privado.txt",
            trabajo: "VS-1",
            importId: imp.id,
          }),
        ),
      },
      body: "contenido",
    }),
    env,
  );
  assert.equal(r.status, 409, await r.clone().text());
  assert.equal(env.map.size, 0);
  assert.equal(env.DB.db.prepare("SELECT COUNT(*) c FROM files").get().c, 0);
  assert.equal(
    env.DB.db.prepare("SELECT revision FROM workspace").get().revision,
    0,
  );
});

test("mantenimiento limpia huérfanos y contadores sin caducar sesiones", async () => {
  const env = setup(),
    a = await admin(env),
    { maintenance } = await import("../worker/maintenance.js");
  env.map.set("orphan", new Uint8Array([1]));
  env.map.set("live", new Uint8Array([2]));
  env.map.set("recent", new Uint8Array([3]));
  env.FILES.list = async () => ({
    objects: [
      { key: "orphan", uploaded: new Date(0) },
      { key: "live", uploaded: new Date(0) },
      { key: "recent", uploaded: new Date() },
    ],
    truncated: false,
  });
  env.FILES.delete = async (keys) => {
    for (const k of Array.isArray(keys) ? keys : [keys]) env.map.delete(k);
  };
  env.DB.db
    .prepare(
      "INSERT INTO files(id,kind,job_id,object_key,metadata,size,sha256,owner_id,created_at) VALUES('live','documents','VS-1','live','{}',1,'digest',?,'2000-01-01')",
    )
    .run(a.user.id);
  env.DB.db.prepare("INSERT INTO quotas VALUES('old',1,0)").run();
  await maintenance(env);
  assert.equal(env.map.has("orphan"), false);
  assert.equal(env.map.has("live"), true);
  assert.equal(env.map.has("recent"), true);
  assert.equal(env.DB.db.prepare("SELECT COUNT(*) c FROM quotas").get().c, 0);
  assert.equal(
    (await call(env, "/auth/me", "GET", undefined, a.token)).status,
    200,
  );
});

test("active user directory exposes only id and name to authenticated workers", async () => {
  const env = setup();
  await admin(env);
  assert.equal((await call(env, "/api/users")).status, 401);
  await env.DB.prepare(
    "INSERT INTO users(id,name,username,role,active,password_hash,salt,iterations,must_change,credential_version,created_at) SELECT 'worker','Operario','operario','empleado',1,password_hash,salt,iterations,0,1,created_at FROM users LIMIT 1",
  ).run();
  await env.DB.prepare(
    "INSERT INTO users(id,name,username,role,active,password_hash,salt,iterations,must_change,credential_version,created_at) SELECT 'inactive','Inactivo','inactivo','empleado',0,password_hash,salt,iterations,0,1,created_at FROM users LIMIT 1",
  ).run();
  const login = await call(env, "/auth/login", "POST", {
    usuario: "operario",
    password: "changed-fixture-123",
  });
  const result = await call(
    env,
    "/api/users",
    "GET",
    undefined,
    login.data.token,
  );
  assert.equal(result.status, 200);
  assert.ok(result.data.users.some((u) => u.id === "worker"));
  assert.ok(!result.data.users.some((u) => u.id === "inactive"));
  for (const user of result.data.users)
    assert.deepEqual(Object.keys(user).sort(), ["id", "nombre"]);
});
