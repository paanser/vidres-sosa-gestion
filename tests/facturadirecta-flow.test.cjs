const assert = require("node:assert/strict");
const test = require("node:test");
const { setup } = require("./helpers/backend.cjs");

test("Gestión valida el presupuesto guardado, reserva el envío en D1 y conserva su referencia", async (t) => {
  const worker = (await import("../worker/worker.js")).default;
  const { digest } = await import("../worker/security.js");
  const { KEYS } = await import("../worker/data.js");
  const env = setup();
  const fakeToken = "f".repeat(64);
  const employeeToken = "e".repeat(64);
  for (const [id, role, token] of [
    ["admin", "administrador", fakeToken],
    ["worker", "empleado", employeeToken],
  ]) {
    env.DB.db
      .prepare(
        "INSERT INTO users(id,username,name,role,active,must_change,password_hash,salt,iterations,credential_version,created_at) VALUES (?,?,?,?,1,0,'x','x',1,1,'2026')",
      )
      .run(id, id, id, role);
    const now = new Date().toISOString();
    env.DB.db
      .prepare(
        "INSERT INTO sessions(token_hash,user_id,credential_version,created_at,last_used) VALUES(?,?,1,?,?)",
      )
      .run(await digest(token), id, now, now);
  }
  Object.assign(env, {
    FACTURADIRECTA_CLASSIC_ACCOUNT: "fixture",
    FACTURADIRECTA_API_KEY: "fixture-token",
  });

  const seed = env.DB.db.prepare(
    "INSERT INTO records(collection,id,ordinal,data) VALUES (?,?,0,?)",
  );
  const customer = {
    id: "customer",
    nombre: "Persona de prueba",
    nif: "12345678X",
    direccion: "Carrer A",
    email: "fixture@example.test",
  };
  seed.run(KEYS.clientes, customer.id, JSON.stringify(customer));
  const quote = {
    client: customer.nombre,
    date: "2026-11-03",
    observations: "Validez acordada & entrega",
    clientId: customer.id,
    lines: [
      {
        kind: "aluminum",
        description: "Ventana",
        amount: 100,
        aluminumMargin: 25,
      },
      { kind: "concept", description: "Colocación", amount: 25 },
      {
        w: 60,
        h: 60,
        qty: 2,
        glass: "Laminado",
        price: 50,
        extraMode: "separate",
        extraDescription: "Herrajes",
        extraAmount: 7,
      },
    ],
    pricing: { vat: 21, marginScope: "glass", margin: 10 },
  };
  for (const id of ["P-01", "P-02", "P-03", "P-04", "P-05", "P-06"])
    seed.run(KEYS.presupuestos, id, JSON.stringify({ id, ...quote }));
  const before = env.DB.db
    .prepare("SELECT data FROM records WHERE id='P-01'")
    .get().data;

  const request = async (
    id,
    method = "GET",
    body,
    token = fakeToken,
    type = "invoice",
  ) => {
    const response = await worker.fetch(
      new Request(
        "https://worker.example/api/facturadirecta/" +
          (id.startsWith("connection?")
            ? id
            : "quotes/" + id + "?kind=" + type),
        {
          method,
          headers: { Authorization: "Bearer " + token },
          body: body == null ? undefined : JSON.stringify(body),
        },
      ),
      env,
    );
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request("P-01")).status, 503);
  assert.equal(
    (await request("P-01", "GET", undefined, employeeToken)).status,
    403,
  );
  env.FACTURADIRECTA_CLASSIC_ENABLED = "true";

  let clientExists = true;
  let sentClient = 0;
  let sentInvoice = 0;
  let sentEstimate = 0;
  let estimateReached, estimateResume;
  const estimateEntered = new Promise((resolve) => {
    estimateReached = resolve;
  });
  const estimateWait = new Promise((resolve) => {
    estimateResume = resolve;
  });
  let behaviour = "success";
  let reachedFetch, resumeFetch;
  const fetchEntered = new Promise((resolve) => {
    reachedFetch = resolve;
  });
  const fetchWait = new Promise((resolve) => {
    resumeFetch = resolve;
  });
  const xml = (content) =>
    new Response(content, { headers: { "Content-Type": "application/xml" } });
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(url.hostname, "fixture.facturadirecta.com");
    if (options.method === "GET" && url.pathname.endsWith("/invoices.xml")) {
      return xml(
        "<invoices><invoice><id>66</id><invoiceSerial/><invoiceNumber>2898</invoiceNumber><invoiceNumberFormatted>02898</invoiceNumberFormatted></invoice></invoices>",
      );
    }
    if (options.method === "GET") {
      assert.equal(url.searchParams.get("taxCode"), "12345678X");
      return xml(
        clientExists
          ? "<clients><client><id>23</id><name>Nombre fiscal</name><taxCode>12345678X</taxCode></client></clients>"
          : "<clients/>",
      );
    }
    if (url.pathname.endsWith("/clients.xml")) {
      sentClient += 1;
      clientExists = true;
      assert.match(
        options.body,
        /<personName>Ana<\/personName><personSurname>Roca<\/personSurname>/,
      );
      return xml("<client><id>23</id></client>");
    }
    if (url.pathname === "/api/estimates.xml") {
      sentEstimate += 1;
      assert.match(
        options.body,
        /^<\?xml.*<estimate><client><id>23<\/id><\/client><documentDate>20261103<\/documentDate>/,
      );
      assert.match(
        options.body,
        /<notes>Validez acordada &amp; entrega<\/notes>/,
      );
      assert.match(
        options.body,
        /<documentLines><documentLine><description>Ventana<\/description>/,
      );
      assert.doesNotMatch(
        options.body,
        /invoice|draft|<sent>|margin|documentNumber/,
      );
      estimateReached();
      await estimateWait;
      if (behaviour === "interrupted") throw new TypeError("connection reset");
      return xml(`<estimate><id>72</id><documentNumberFormatted>00004</documentNumberFormatted>
        <netTotal>197.30</netTotal><tax1><total>41.43</total></tax1><grossTotal>238.73</grossTotal></estimate>`);
    }
    assert.equal(url.pathname, "/api/invoices.xml");
    sentInvoice += 1;
    assert.match(options.body, /<client><id>23<\/id><\/client>/);
    assert.match(options.body, /<localTag>Vidres Sosa P-0[1-5]<\/localTag>/);
    assert.doesNotMatch(
      options.body,
      /margin|amount|invoiceSerial|invoiceNumber/,
    );
    if (behaviour === "pending") {
      reachedFetch();
      await fetchWait;
    }
    if (behaviour === "interrupted") throw new TypeError("connection reset");
    const definitive = behaviour === "definitive";
    assert.match(
      options.body,
      new RegExp("<draft>" + String(!definitive) + "</draft>"),
    );
    return xml(`<invoice><id>${sentInvoice}</id><draft>${!definitive}</draft>
      ${definitive ? "<invoiceNumberFormatted>00009</invoiceNumberFormatted>" : ""}<netTotal>197.30</netTotal>
      <tax1><total>41.43</total></tax1><grossTotal>${behaviour === "mismatch" ? "240" : "238.73"}</grossTotal></invoice>`);
  };

  const diagnostic = await request("connection?number=02898");
  assert.equal(diagnostic.body.matches[0].serial, "");
  assert.equal(diagnostic.body.matches[0].formattedNumber, "02898");
  const preview = async (id) => (await request(id)).body.review;
  const submit = (id, review, extra) =>
    request(id, "POST", {
      confirmation: review.confirmation,
      draft: true,
      ...extra,
    });
  const review = await preview("P-01");
  assert.deepEqual(
    review.invoice.lines.map((line) => line.unitPrice),
    ["125.00", "25.00", "39.60", "7.70"],
  );
  assert.deepEqual(review.invoice.totals, {
    base: "197.30",
    vat: "41.43",
    total: "238.73",
  });
  assert.equal(sentInvoice, 0);
  assert.equal(
    (await submit("P-01", { confirmation: "obsoleta" })).status,
    409,
  );

  behaviour = "pending";
  const first = submit("P-01", review);
  await fetchEntered;
  assert.equal((await submit("P-01", review)).body.status.status, "pending");
  resumeFetch();
  assert.equal((await first).body.status.status, "created");
  assert.equal((await request("P-01")).body.status.documentId, "1");
  assert.equal((await submit("P-01", review)).body.status.documentId, "1");
  assert.equal(sentInvoice, 1);
  assert.equal(
    env.DB.db.prepare("SELECT data FROM records WHERE id='P-01'").get().data,
    before,
  );

  behaviour = "interrupted";
  const interrupted = await preview("P-02");
  assert.equal(
    (await submit("P-02", interrupted)).body.status.status,
    "uncertain",
  );
  assert.equal(
    (await submit("P-02", interrupted)).body.status.status,
    "uncertain",
  );
  assert.equal(sentInvoice, 2);

  behaviour = "mismatch";
  const mismatch = await preview("P-03");
  const result = await submit("P-03", mismatch);
  assert.equal(result.body.status.status, "review");
  assert.equal(result.body.status.documentId, "3");

  clientExists = false;
  behaviour = "success";
  const unknown = await preview("P-04");
  assert.equal(unknown.existing, null);
  assert.equal((await submit("P-04", unknown)).status, 400);
  assert.equal(sentClient, 0);
  assert.equal(
    (
      await submit("P-04", unknown, {
        legalType: "F",
        personName: "Ana",
        personSurname: "Roca",
      })
    ).body.status.status,
    "created",
  );
  assert.equal(sentClient, 1);
  const definitive = await preview("P-05");
  assert.equal(definitive.existing.id, "23");
  behaviour = "definitive";
  const issued = await submit("P-05", definitive, { draft: false });
  assert.deepEqual(issued.body.status, {
    status: "created",
    draft: 0,
    documentId: "5",
    number: "00009",
  });
  assert.equal((await request("P-05")).body.status.number, "00009");

  env.FACTURADIRECTA_CLASSIC_ENABLED = "false";
  const asEstimate = (id, method = "GET", data) =>
    request(id, method, data, fakeToken, "estimate");
  assert.equal((await asEstimate("P-05")).status, 503);
  env.FACTURADIRECTA_CLASSIC_ESTIMATES_ENABLED = "true";
  const estimate = (await asEstimate("P-05")).body.review;
  assert.equal(estimate.type, "estimate");
  assert.equal(estimate.invoice.date, "20261103");
  assert.equal(estimate.invoice.notes, "Validez acordada & entrega");
  assert.notEqual(estimate.confirmation, definitive.confirmation);
  const confirmation = { confirmation: estimate.confirmation };
  assert.equal(
    (await request("P-06", "POST", { ...confirmation, draft: false })).status,
    503,
  );
  const sending = asEstimate("P-05", "POST", confirmation);
  await estimateEntered;
  assert.equal(
    (await asEstimate("P-05", "POST", confirmation)).body.status.status,
    "pending",
  );
  estimateResume();
  assert.deepEqual((await sending).body.status, {
    status: "created",
    draft: 0,
    documentId: "72",
    number: "00004",
  });
  assert.equal((await asEstimate("P-05")).body.status.number, "00004");
  assert.equal((await request("P-05")).body.status.number, "00009");
  assert.equal(
    (await asEstimate("P-05", "POST", confirmation)).body.status.number,
    "00004",
  );
  assert.equal(sentEstimate, 1);

  behaviour = "interrupted";
  const nextEstimate = (await asEstimate("P-06")).body.review;
  const nextConfirmation = { confirmation: nextEstimate.confirmation };
  assert.equal(
    (await asEstimate("P-06", "POST", nextConfirmation)).body.status.status,
    "uncertain",
  );
  assert.equal(
    (await asEstimate("P-06", "POST", nextConfirmation)).body.status.status,
    "uncertain",
  );
  assert.equal(sentEstimate, 2);
  assert.equal(sentInvoice, 5);
});
