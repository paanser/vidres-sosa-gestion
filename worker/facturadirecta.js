import calculations from "../calculations.js";
import utils from "../utils.js";
import { KEYS } from "./data.js";
import { atomic, audit, digest, fail, readJSON, text } from "./security.js";
import {
  ClassicApiError,
  classicClientXml,
  classicEstimateXml,
  classicInvoiceXml,
  createClassicApi,
} from "./facturadirecta-classic.js";

const cents = (value) => Math.round(Number(value) * 100);
const euro = (c) => (c / 100).toFixed(2);
const taxKey = (value) =>
  String(value ?? "")
    .replace(/[ .-]/g, "")
    .toUpperCase();

export function quoteInvoice(quote, tariffs = []) {
  const result = calculations.quoteDetails(quote);
  const lines = quote.lines.flatMap((line, index) => {
    const value = result.lines[index];
    if (["concept", "aluminum"].includes(line.kind))
      return [{ description: line.description, amount: cents(value.sale) }];
    const name = (
      line.glass ||
      tariffs.find((tariff) => tariff.id === line.tariff)?.name ||
      ""
    )
      .replace(/^tarifa\s+[^·]+\s*·\s*/i, "")
      .replace(/\s*·\s*(MF|Sustituciones|Templado)\s*$/i, "")
      .trim();
    const description = `${name || "Vidrio"} · ${utils.formatMeters(value.w)} × ${utils.formatMeters(value.h)} m · ${value.qty} ud.`;
    const extra = calculations.customerExtra(line, value);
    return [
      { description, amount: cents(value.glassSale) },
      ...(extra
        ? [{ description: extra.description, amount: cents(extra.amount ?? 0) }]
        : []),
      ...(value.energySale
        ? [
            {
              description: "Recargo energético",
              amount: cents(value.energySale),
            },
          ]
        : []),
    ];
  });
  const base = cents(result.totals.base);
  const difference =
    base - lines.reduce((total, line) => total + line.amount, 0);
  // The legacy calculator rounds the sum of raw lines, not each line.
  if (difference)
    lines.push({
      description: "Ajuste de redondeo del presupuesto",
      amount: difference,
    });
  return {
    vatRate:
      quote.pricing?.vat === "" || quote.pricing?.vat == null
        ? 21
        : utils.num(quote.pricing.vat),
    lines: lines.map(({ amount, description }) => ({
      description,
      quantity: 1,
      unitPrice: euro(amount),
    })),
    totals: {
      base: euro(base),
      vat: euro(cents(result.totals.iva)),
      total: euro(cents(result.totals.total)),
    },
  };
}

async function quoteSnapshot(db, id, type) {
  const row = await db
    .prepare(
      `
    SELECT w.revision, q.data AS quote, c.data AS client,
      CASE WHEN EXISTS(SELECT 1 FROM json_each(q.data,'$.lines') AS l
        WHERE COALESCE(json_extract(l.value,'$.glass'),'')='' AND json_extract(l.value,'$.tariff') IS NOT NULL)
      THEN (SELECT json_group_array(json(r.data)) FROM records r WHERE r.collection=?) ELSE '[]' END AS tariffs
    FROM workspace w JOIN records q ON q.collection=? AND q.id=?
    LEFT JOIN records c ON c.collection=? AND c.id=json_extract(q.data,'$.clientId')
      AND COALESCE(json_extract(q.data,'$.clientSource'),'')!='quote'
    WHERE w.id=1
  `,
    )
    .bind(KEYS.tarifas, KEYS.presupuestos, id, KEYS.clientes)
    .first();
  if (!row) fail(404, "El presupuesto no está guardado en el servidor");
  const quote = JSON.parse(row.quote);
  if (!quote.client.trim() || quote.client === "Sin cliente")
    fail(400, "Asigna un cliente y guarda el presupuesto");
  const card = row.client && JSON.parse(row.client);
  const saved = quote.clientData || {};
  const customer = {
    name: quote.client,
    taxCode: taxKey(card ? card.nif || card.cif : saved.taxId),
    address: (card ? card.direccion : saved.address) || "",
    email: (card ? card.email : saved.email) || "",
    phone: (card ? card.telefono : saved.phone) || "",
  };
  if (!customer.taxCode)
    fail(
      400,
      "Guarda el NIF del cliente para comprobar si ya existe en FacturaDirecta",
    );
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts()
    .filter(({ type }) => type !== "literal");
  const date = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  const invoice = {
    ...quoteInvoice(quote, JSON.parse(row.tariffs)),
    date:
      type === "estimate" && /^\d{4}-\d{2}-\d{2}$/.test(quote.date || "")
        ? quote.date.replace(/-/g, "")
        : date.year + date.month + date.day,
    sourceReference: `Vidres Sosa ${id}`,
    ...(type === "estimate" &&
    quote.pdfOptions?.observations !== false &&
    quote.observations
      ? { notes: quote.observations }
      : {}),
  };
  if (Number(invoice.totals.total) <= 0)
    fail(400, "El importe del presupuesto debe ser positivo");
  return { revision: row.revision, customer, invoice };
}

function createCustomer(customer, input) {
  if (!["F", "J"].includes(input.legalType))
    fail(400, "Selecciona el tipo de cliente que se creará");
  const name = input.legalType === "J" ? customer.name : undefined;
  const personName =
    input.legalType === "F" ? text(input.personName, 100, 1).trim() : undefined;
  const personSurname =
    input.legalType === "F"
      ? text(input.personSurname, 100, 1).trim()
      : undefined;
  return {
    legalType: input.legalType,
    name,
    personName,
    personSurname,
    taxCode: customer.taxCode,
    email: customer.email,
    phone: customer.phone,
    address: { line1: customer.address },
  };
}

const findExport = (db, id, type) =>
  db
    .prepare(
      "SELECT status,draft,document_id AS documentId,formatted_number AS number FROM facturadirecta_exports WHERE quote_id=? AND document_type=?",
    )
    .bind(id, type)
    .first();

async function preview(db, id, api, type) {
  const { revision, customer, invoice } = await quoteSnapshot(db, id, type);
  const matches = await api.findClientsByTaxCode(customer.taxCode);
  if (
    matches.length > 1 ||
    matches.some((record) => taxKey(record.taxCode) !== customer.taxCode)
  )
    fail(409, "Revisa las coincidencias del NIF en FacturaDirecta");
  const existing = matches[0] || null;
  if (!existing) {
    const reserved = await db
      .prepare("SELECT client_id FROM facturadirecta_clients WHERE tax_code=?")
      .bind(customer.taxCode)
      .first();
    if (reserved)
      fail(
        409,
        "Hay un alta de cliente pendiente de verificar en FacturaDirecta",
      );
  }
  const review = { type, customer, existing, invoice };
  return {
    ...review,
    revision,
    confirmation: await digest(JSON.stringify(review)),
  };
}

export async function facturadirectaRoute(req, db, auth, env, path) {
  if (auth.user.role !== "administrador")
    fail(403, "Solo un administrador puede migrar documentos a FacturaDirecta");
  const diagnostic = path === "/api/facturadirecta/connection";
  if (diagnostic) {
    if (req.method !== "GET") fail(405, "Método no permitido");
    const number = new URL(req.url).searchParams.get("number") || "";
    if (!/^[a-z0-9-]{1,30}$/i.test(number))
      fail(400, "Indica el número impreso de la factura");
    try {
      const records = await createClassicApi(env).lookupInvoiceNumber(number);
      return {
        connected: true,
        matches: records.filter((entry) => entry.formattedNumber === number),
      };
    } catch (error) {
      if (!(error instanceof ClassicApiError)) throw error;
      fail(
        502,
        `No se pudo verificar la conexión con FacturaDirecta${error.status ? ` (HTTP ${error.status})` : ""}`,
      );
    }
  }

  if (!["GET", "POST"].includes(req.method)) fail(405, "Método no permitido");
  const id = path.slice("/api/facturadirecta/quotes/".length);
  if (!/^[a-z0-9_-]{1,150}$/i.test(id))
    fail(400, "Referencia de presupuesto no válida");
  const type = new URL(req.url).searchParams.get("kind") ?? "estimate";
  if (!["estimate", "invoice"].includes(type))
    fail(400, "Tipo de documento no válido");
  const isEstimate = type === "estimate";
  const stored = await findExport(db, id, type);
  if (stored) return { status: stored };
  if (
    isEstimate
      ? env.FACTURADIRECTA_CLASSIC_ESTIMATES_ENABLED !== "true"
      : env.FACTURADIRECTA_CLASSIC_ENABLED !== "true"
  )
    fail(
      503,
      isEstimate
        ? "La migración de presupuestos a FacturaDirecta está desactivada"
        : "La creación de facturas en FacturaDirecta está desactivada",
    );

  const api = createClassicApi(env);
  const readPreview = async () => {
    try {
      return await preview(db, id, api, type);
    } catch (error) {
      if (error instanceof ClassicApiError)
        fail(502, "No se pudo consultar el cliente en FacturaDirecta");
      throw error;
    }
  };

  if (req.method === "GET") {
    const { revision, ...review } = await readPreview();
    return { review };
  }

  const input = await readJSON(req);
  if (!isEstimate && typeof input.draft !== "boolean")
    fail(400, "Elige borrador o factura definitiva");
  const review = await readPreview();
  if (input.confirmation !== review.confirmation)
    fail(409, "Han cambiado los datos. Abre de nuevo la revisión");
  const customer = review.existing
    ? null
    : createCustomer(review.customer, input);
  const draft = !isEstimate && input.draft;
  const invoice = {
    ...review.invoice,
    clientId: review.existing?.id || "1",
    draft,
  };
  try {
    if (customer) classicClientXml(customer);
    if (isEstimate) classicEstimateXml(invoice);
    else classicInvoiceXml(invoice);
  } catch (error) {
    fail(400, error.message);
  }
  const result = await atomic(
    db,
    auth,
    [
      db
        .prepare(
          "INSERT INTO facturadirecta_exports (quote_id,document_type,status,draft) VALUES (?,?,'pending',?) ON CONFLICT DO NOTHING",
        )
        .bind(id, type, Number(draft)),
    ],
    { revision: review.revision, admin: true },
  );
  if (!result[1].meta.changes)
    return { status: await findExport(db, id, type) };

  if (customer) {
    const claim = await db
      .prepare(
        "INSERT INTO facturadirecta_clients (tax_code,quote_id) VALUES (?,?) ON CONFLICT DO NOTHING",
      )
      .bind(customer.taxCode, id)
      .run();
    if (!claim.meta.changes) {
      await db
        .prepare(
          "DELETE FROM facturadirecta_exports WHERE quote_id=? AND document_type=? AND status='pending'",
        )
        .bind(id, type)
        .run();
      fail(
        409,
        "Se está verificando el alta de ese cliente. Vuelve a abrir la revisión",
      );
    }
  }

  let response;
  try {
    if (customer) {
      const created = await api.createClient(customer);
      invoice.clientId = created.id;
      await db
        .prepare(
          "UPDATE facturadirecta_clients SET client_id=? WHERE tax_code=? AND quote_id=?",
        )
        .bind(created.id, customer.taxCode, id)
        .run();
    }
    response = await (isEstimate
      ? api.createEstimate(invoice)
      : api.createInvoice(invoice));
  } catch {
    await db
      .prepare(
        "UPDATE facturadirecta_exports SET status='uncertain' WHERE quote_id=? AND document_type=? AND status='pending'",
      )
      .bind(id, type)
      .run();
    return { status: await findExport(db, id, type) };
  }

  const matched = ["base", "vat", "total"].every(
    (key) =>
      response[key] != null &&
      Number(response[key]) === Number(invoice.totals[key]),
  );
  const correctState =
    (isEstimate || response.draft === String(draft)) &&
    (draft || Boolean(response.formattedNumber));
  await db.batch([
    db
      .prepare(
        "UPDATE facturadirecta_exports SET status=?,document_id=?,formatted_number=? WHERE quote_id=? AND document_type=? AND status='pending'",
      )
      .bind(
        matched && correctState ? "created" : "review",
        response.id,
        response.formattedNumber,
        id,
        type,
      ),
    audit(
      db,
      auth,
      isEstimate ? "facturadirecta_estimate_created" : "facturadirecta_created",
      id,
    ),
  ]);
  return { status: await findExport(db, id, type) };
}
