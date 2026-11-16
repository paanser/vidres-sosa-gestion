const assert = require("node:assert/strict");
const test = require("node:test");

const adapter = import("../worker/facturadirecta-classic.js");
const env = {
  FACTURADIRECTA_CLASSIC_ACCOUNT: "https://a123456.facturadirecta.com/",
  FACTURADIRECTA_API_KEY: "  token-simulado\n",
};

const invoice = {
  clientId: "12",
  draft: true,
  vatRate: 21,
  lines: [
    { description: "Vidrio & canto <pulido>", quantity: 3, unitPrice: "24.91" },
    { description: "Montaje", quantity: "1.5", unitPrice: "31.00" },
  ],
};

function xml(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

test("consulta de solo lectura con Basic y límite, conserva ceros y serie vacía", async () => {
  const { createClassicApi } = await adapter;
  const api = createClassicApi(env, async (url, request) => {
    assert.equal(
      url.href,
      "https://a123456.facturadirecta.com/api/invoices.xml?invoiceNumberFormatted=02898&limit=2",
    );
    assert.equal(request.method, "GET");
    assert.equal(request.body, undefined);
    assert.equal(request.redirect, "manual");
    assert.equal(
      Buffer.from(request.headers.Authorization.slice(6), "base64").toString(),
      "token-simulado:x",
    );
    assert.equal(request.headers.Accept, "application/xml");
    return xml(`<invoices><invoice><client><id>12</id><name>Privado</name></client>
      <id>501</id><invoiceNumber>2898</invoiceNumber><invoiceNumberFormatted>02898</invoiceNumberFormatted>
      <invoiceSerial><![CDATA[]]></invoiceSerial><draft>false</draft></invoice></invoices>`);
  });
  assert.deepEqual(await api.lookupInvoiceNumber("02898"), [
    {
      id: "501",
      serial: "",
      number: "2898",
      formattedNumber: "02898",
      draft: "false",
    },
  ]);
});

test("busca clientes por NIF y conserva múltiples coincidencias", async () => {
  const { createClassicApi } = await adapter;
  const api = createClassicApi(env, async (url, request) => {
    assert.equal(request.method, "GET");
    assert.equal(url.pathname, "/api/clients.xml");
    assert.equal(url.searchParams.get("taxCode"), "X12345+");
    assert.equal(url.searchParams.get("limit"), "2");
    return xml(`<clients>
      <client><id>12</id><name><![CDATA[A & B]]></name><taxCode>X12345+</taxCode></client>
      <client><id>13</id><name>A &amp; B</name><taxCode>X12345+</taxCode></client>
      </clients>`);
  });
  assert.deepEqual(await api.findClientsByTaxCode("X12345+"), [
    { id: "12", name: "A & B", taxCode: "X12345+", address: "" },
    { id: "13", name: "A & B", taxCode: "X12345+", address: "" },
  ]);
});

test("alta de cliente con tipo legal explícito y solo campos permitidos", async () => {
  const { createClassicApi, classicClientXml } = await adapter;
  const client = {
    legalType: "F",
    personName: "Ana",
    personSurname: "Roca",
    taxCode: "12345678X",
    address: { line1: "Carrer A & B", zipcode: "04300" },
    notes: "uso interno",
  };
  const api = createClassicApi(env, async (url, request) => {
    assert.equal(url.pathname, "/api/clients.xml");
    assert.equal(request.method, "POST");
    assert.match(
      request.body,
      /<legalType>F<\/legalType><personName>Ana<\/personName><personSurname>Roca<\/personSurname>/,
    );
    assert.match(
      request.body,
      /<address><line1>Carrer A &amp; B<\/line1><zipcode>04300<\/zipcode><\/address>/,
    );
    assert.doesNotMatch(request.body, /uso interno/);
    return xml("<client><id>12</id></client>", 201);
  });
  assert.deepEqual(await api.createClient(client), { id: "12" });
  assert.match(
    classicClientXml({ legalType: "J", name: "Vidrios SL" }),
    /<legalType>J<\/legalType><name>Vidrios SL<\/name>/,
  );
  assert.throws(
    () => classicClientXml({ name: "Sin tipo" }),
    /tipo y el nombre fiscal/,
  );
});

test("factura XML envía solo precios de venta e IVA y devuelve importes y referencia", async () => {
  const { createClassicApi } = await adapter;
  const api = createClassicApi(env, async (url, request) => {
    assert.equal(url.pathname, "/api/invoices.xml");
    assert.equal(request.method, "POST");
    assert.equal(request.headers["Content-Type"], "application/xml");
    assert.match(
      request.body,
      /<draft>true<\/draft><sent>false<\/sent><linePricesIncludeTaxes>false<\/linePricesIncludeTaxes>/,
    );
    assert.match(
      request.body,
      /<tax1><name>IVA<\/name><rate>21<\/rate><\/tax1>/,
    );
    assert.match(
      request.body,
      /<description>Vidrio &amp; canto &lt;pulido&gt;<\/description><quantity>3<\/quantity><unitPrice>24.91<\/unitPrice><applyTax1>true<\/applyTax1>/,
    );
    assert.doesNotMatch(
      request.body,
      /invoiceSerial|invoiceNumber|cost|margin|interno|netTotal/,
    );
    return xml(
      `<invoice><id>31</id><draft>true</draft><netTotal>121.23</netTotal>
      <tax1><total>25.46</total></tax1><grossTotal>146.69</grossTotal></invoice>`,
      201,
    );
  });
  assert.deepEqual(
    await api.createInvoice({
      ...invoice,
      cost: 77,
      margin: 40,
      invoiceSerial: "inventada",
      lines: [
        { ...invoice.lines[0], cost: 14, notes: "interno" },
        invoice.lines[1],
      ],
    }),
    {
      id: "31",
      serial: null,
      number: null,
      formattedNumber: null,
      draft: "true",
      base: "121.23",
      vat: "25.46",
      total: "146.69",
    },
  );
});

test("error remoto o respuesta inválida de un POST nunca se reintenta automáticamente", async () => {
  const { createClassicApi } = await adapter;
  const failures = [
    () => {
      throw new Error("conexión interrumpida");
    },
    () => xml("<xml><errorCode>UNAUTHORIZED</errorCode></xml>", 401),
    () => xml("<invoice><client><id>12</id></client></invoice>", 201),
    () => xml("<invoice><id>31</id><id>32</id></invoice>", 201),
    () =>
      xml(
        '<!DOCTYPE invoice [<!ENTITY a "malicioso">]><invoice><id>&a;</id></invoice>',
      ),
    () => new Response("<html>Acceso</html>"),
  ];
  for (const fail of failures) {
    let calls = 0;
    const api = createClassicApi(env, async () => {
      calls += 1;
      return fail();
    });
    await assert.rejects(
      api.createInvoice(invoice),
      (error) => error.uncertain === true,
    );
    assert.equal(calls, 1);
  }
});

test("validación local falla antes de enviar XML y un GET 401 no implica escritura incierta", async () => {
  const { createClassicApi } = await adapter;
  let calls = 0;
  const api = createClassicApi(env, async () => {
    calls += 1;
    return xml("<xml><errorCode>UNAUTHORIZED</errorCode></xml>", 401);
  });
  assert.throws(
    () => api.createInvoice({ ...invoice, draft: undefined }),
    /estado/,
  );
  assert.throws(
    () =>
      api.createInvoice({
        ...invoice,
        lines: [{ ...invoice.lines[0], description: "\u0000" }],
      }),
    /incompatibles/,
  );
  assert.throws(
    () =>
      createClassicApi({
        ...env,
        FACTURADIRECTA_CLASSIC_ACCOUNT: "https://otro.example/",
      }),
    /configurado/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    api.lookupInvoiceNumber("02898"),
    (error) => error.status === 401 && error.uncertain === false,
  );
  assert.equal(calls, 1);
});
