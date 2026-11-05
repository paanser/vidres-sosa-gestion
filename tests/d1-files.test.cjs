const { test } = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/backend.cjs");
const moduleFiles = () => import("../worker/d1-files.js");
test("adjuntos D1 privados: varios bloques se recuperan completos y se borran en cascada", async () => {
  const { D1Files } = await moduleFiles(),
    env = setup(),
    files = new D1Files(env.DB),
    bytes = new Uint8Array(900000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  await files.put("file-a", bytes);
  const found = await files.get("file-a");
  assert.deepEqual(
    new Uint8Array(await new Response(found.body).arrayBuffer()),
    bytes,
  );
  assert.equal(
    env.DB.db.prepare("SELECT COUNT(*) c FROM file_chunks").get().c,
    4,
  );
  assert.ok(
    env.DB.db.prepare("SELECT used FROM file_storage").get().used >
      bytes.length,
  );
  await files.delete("file-a");
  assert.equal(await files.get("file-a"), null);
  assert.equal(
    env.DB.db.prepare("SELECT COUNT(*) c FROM file_chunks").get().c,
    0,
  );
  assert.equal(
    env.DB.db.prepare("SELECT used FROM file_storage").get().used,
    0,
  );
});
test("cuota D1 se aplica de forma transaccional y el tamaño máximo es 8 MB", async () => {
  const { D1Files } = await moduleFiles(),
    env = setup(),
    files = new D1Files(env.DB);
  env.DB.db.prepare("UPDATE file_storage SET used=349999999").run();
  await assert.rejects(
    () => files.put("too-full", new Uint8Array(20)),
    /STORAGE_FULL/,
  );
  assert.equal(
    env.DB.db.prepare("SELECT COUNT(*) c FROM file_objects").get().c,
    0,
  );
  assert.equal(
    env.DB.db.prepare("SELECT COUNT(*) c FROM file_chunks").get().c,
    0,
  );
  await assert.rejects(
    () => files.put("too-large", new Uint8Array(8000001)),
    (e) => e.status === 413,
  );
});
test("listado de archivos D1 paginado y limpieza en lotes", async () => {
  const { D1Files } = await moduleFiles(),
    env = setup(),
    files = new D1Files(env.DB);
  for (const key of ["a", "b", "c"]) await files.put(key, new Uint8Array([1]));
  const first = await files.list({ limit: 2 });
  assert.equal(first.truncated, true);
  assert.deepEqual(
    first.objects.map((o) => o.key),
    ["a", "b"],
  );
  const second = await files.list({ cursor: first.cursor, limit: 2 });
  assert.deepEqual(
    second.objects.map((o) => o.key),
    ["c"],
  );
  assert.equal(second.truncated, false);
  await files.delete(["a", "b", "c"]);
  assert.equal((await files.list({})).objects.length, 0);
});

test("API real del Worker usa adjuntos D1 cuando no existe binding R2 y exige sesión", async () => {
  const worker = (await import("../worker/worker.js")).default,
    env = setup();
  delete env.FILES;
  async function call(path, method = "GET", body, token) {
    const r = await worker.fetch(
      new Request("https://worker.invalid" + path, {
        method,
        headers: {
          Origin: "https://paanser.github.io",
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
    return { r, data: await r.json() };
  }
  let auth = (
    await call("/auth/login", "POST", {
      usuario: "pau",
      password: env.ADMIN_INITIAL_PASSWORD,
    })
  ).data;
  auth = (
    await call(
      "/auth/change-password",
      "POST",
      { actual: env.ADMIN_INITIAL_PASSWORD, password: "changed-fixture-123" },
      auth.token,
    )
  ).data;
  const current = (await call("/api/state", "GET", undefined, auth.token)).data;
  current.values["vidres-sosa-demo-v01"] = [
    {
      id: "VS-1",
      cliente: "Prueba",
      descripcion: "Archivo privado",
      estado: "Pendiente",
    },
  ];
  assert.equal(
    (await call("/api/state", "PUT", current, auth.token)).r.status,
    200,
  );
  const id = "d".repeat(32),
    bytes = new Uint8Array(650000).fill(76);
  const response = await worker.fetch(
    new Request("https://worker.invalid/api/files/" + id, {
      method: "PUT",
      headers: {
        Origin: "https://paanser.github.io",
        Authorization: "Bearer " + auth.token,
        "Content-Type": "text/plain",
        "X-File-Metadata": encodeURIComponent(
          JSON.stringify({
            kind: "documents",
            nombre: "privado.txt",
            trabajo: "VS-1",
            revision: 1,
          }),
        ),
      },
      body: bytes,
    }),
    env,
  );
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await call("/api/files/" + id)).r.status, 401);
  const download = await worker.fetch(
    new Request("https://worker.invalid/api/files/" + id, {
      headers: {
        Origin: "https://paanser.github.io",
        Authorization: "Bearer " + auth.token,
      },
    }),
    env,
  );
  assert.equal(download.status, 200);
  assert.deepEqual(new Uint8Array(await download.arrayBuffer()), bytes);
  assert.equal(
    (await call("/api/files/" + id, "DELETE", { revision: 2 }, auth.token)).r
      .status,
    200,
  );
  assert.equal(
    env.DB.db.prepare("SELECT COUNT(*) c FROM file_chunks").get().c,
    0,
  );
});
