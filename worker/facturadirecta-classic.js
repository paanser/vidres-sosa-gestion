import { SaxesParser } from "saxes";

const XML = "application/xml";
const MAX_RESPONSE_BYTES = 512 * 1024;

export class ClassicApiError extends Error {
  constructor(message, { status, uncertain = false } = {}) {
    super(message);
    this.name = "ClassicApiError";
    this.status = status;
    this.uncertain = uncertain;
  }
}

function element(name, value) {
  if (value == null || value === "") return "";
  const content = String(value);
  if (
    /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(
      content,
    )
  ) {
    throw new TypeError("El texto contiene caracteres incompatibles con XML");
  }
  const escaped = content.replace(
    /[&<>]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
      })[char],
  );
  return tag(name, escaped);
}

function tag(name, content) {
  return `<${name}>${content}</${name}>`;
}

function document(name, content) {
  return '<?xml version="1.0" encoding="UTF-8"?>' + tag(name, content);
}

function id(value) {
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw new TypeError("Identificador de FacturaDirecta no válido");
  }
  return String(value);
}

function decimal(value) {
  const number = String(value);
  if (!/^-?\d+(\.\d+)?$/.test(number) || !Number.isFinite(Number(number))) {
    throw new TypeError("Importe o cantidad no válido");
  }
  return number;
}

export function classicClientXml(client) {
  const { legalType, name, personName, personSurname } = client;
  const company = legalType === "J";
  if (
    (!company && legalType !== "F") ||
    (company ? !name?.trim() : !personName?.trim() || !personSurname?.trim())
  ) {
    throw new TypeError("Indica el tipo y el nombre fiscal del cliente");
  }
  const address = ["line1", "line2", "city", "province", "zipcode", "country"]
    .map((field) => element(field, client.address?.[field]))
    .join("");
  return document(
    "client",
    element("legalType", legalType) +
      (company
        ? element("name", name)
        : element("personName", personName) +
          element("personSurname", personSurname)) +
      element("taxCode", client.taxCode) +
      (address ? tag("address", address) : "") +
      element("email", client.email) +
      element("phone", client.phone),
  );
}

export function classicInvoiceXml(invoice) {
  return salesDocumentXml(invoice, true);
}

export function classicEstimateXml(estimate) {
  return salesDocumentXml(estimate, false);
}

function salesDocumentXml(data, isInvoice) {
  const { clientId, draft, lines, vatRate, date, sourceReference } = data;
  if (
    (isInvoice && typeof draft !== "boolean") ||
    !Array.isArray(lines) ||
    !lines.length
  ) {
    throw new TypeError(
      "Indica al menos un concepto y el estado si vas a crear una factura",
    );
  }
  if (date && !/^\d{8}$/.test(date))
    throw new TypeError("Fecha del documento no válida");
  const rate = decimal(vatRate);
  if (Number(rate) < 0 || Number(rate) > 100) {
    throw new TypeError("Tipo de IVA no válido");
  }
  const xmlLines = lines
    .map(({ description, quantity, unitPrice, discountRate }) => {
      if (!description?.trim() || Number(decimal(quantity)) <= 0) {
        throw new TypeError(
          "Cada concepto requiere una descripción y una cantidad positiva",
        );
      }
      const discount = discountRate == null ? null : decimal(discountRate);
      if (
        discount != null &&
        (Number(discount) < 0 || Number(discount) > 100)
      ) {
        throw new TypeError("Descuento no válido");
      }
      return tag(
        isInvoice ? "invoiceLine" : "documentLine",
        element("description", description) +
          element("quantity", decimal(quantity)) +
          element("unitPrice", decimal(unitPrice)) +
          element("discountRate", discount) +
          element("applyTax1", true),
      );
    })
    .join("");
  return document(
    isInvoice ? "invoice" : "estimate",
    tag("client", element("id", id(clientId))) +
      element(isInvoice ? "invoiceDate" : "documentDate", date) +
      element("currency", "EUR") +
      (sourceReference
        ? tag("tags", element("localTag", sourceReference))
        : "") +
      tag("tax1", element("name", "IVA") + element("rate", rate)) +
      (isInvoice
        ? element("draft", draft) + element("sent", false)
        : element("notes", data.notes)) +
      element("linePricesIncludeTaxes", false) +
      tag(isInvoice ? "invoiceLines" : "documentLines", xmlLines),
  );
}

function parseXml(xml, expectedRoot) {
  let root;
  const parents = [];
  const parser = new SaxesParser();
  parser.on("doctype", () => {
    throw new Error("DOCTYPE inesperado");
  });
  parser.on("opentag", ({ name }) => {
    if (parents.length >= 32) throw new Error("XML demasiado anidado");
    const node = { name, value: "", children: [] };
    if (parents.length) parents.at(-1).children.push(node);
    else root = node;
    parents.push(node);
  });
  const append = (value) => {
    if (parents.length) parents.at(-1).value += value;
  };
  parser.on("text", append);
  parser.on("cdata", append);
  parser.on("closetag", () => parents.pop());
  parser.write(xml).close();
  if (root?.name !== expectedRoot) throw new Error("Formato XML inesperado");
  return root;
}

function children(node, name) {
  return node?.children.filter((child) => child.name === name) ?? [];
}

function child(node, name) {
  const matches = children(node, name);
  if (matches.length > 1) throw new Error("Campo XML duplicado");
  return matches[0];
}

function field(node, name) {
  return child(node, name)?.value.trim() ?? null;
}

async function responseXml(response, root) {
  if (
    !/^((application|text)\/xml)(\s*;|$)/i.test(
      response.headers.get("Content-Type") ?? "",
    )
  ) {
    await response.body?.cancel();
    throw new Error("Content-Type inesperado");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Respuesta vacía");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let xml = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES)
        throw new Error("Respuesta demasiado grande");
      xml += decoder.decode(value, { stream: true });
    }
    return parseXml(xml + decoder.decode(), root);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function salesTotals(record) {
  return {
    base: field(record, "netTotal"),
    vat: field(child(record, "tax1"), "total"),
    total: field(record, "grossTotal"),
  };
}

function invoiceReference(invoice) {
  return {
    id: id(field(invoice, "id")),
    serial: field(invoice, "invoiceSerial"),
    number: field(invoice, "invoiceNumber"),
    formattedNumber: field(invoice, "invoiceNumberFormatted"),
    draft: field(invoice, "draft"),
  };
}

export function createClassicApi(env, fetcher = fetch) {
  const configured = String(env.FACTURADIRECTA_CLASSIC_ACCOUNT ?? "").trim();
  const account =
    /^(?:https:\/\/)?([a-z0-9]+)(?:\.facturadirecta\.com\/?)?$/i.exec(
      configured,
    )?.[1];
  const key =
    typeof env.FACTURADIRECTA_API_KEY === "string"
      ? env.FACTURADIRECTA_API_KEY.trim()
      : "";
  if (!account || !/^[\x21-\x39\x3b-\x7e]+$/.test(key)) {
    throw new ClassicApiError("FacturaDirecta Clásico no está configurado");
  }
  const base = `https://${account}.facturadirecta.com/api/`;
  const headers = {
    Authorization: `Basic ${btoa(`${key}:x`)}`,
    Accept: XML,
    "Content-Type": XML,
  };

  async function request(path, root, project, { query, body } = {}) {
    const url = new URL(path, base);
    if (query) url.search = new URLSearchParams(query).toString();
    const writing = body != null;
    let response;
    try {
      response = await fetcher(url, {
        method: writing ? "POST" : "GET",
        headers,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new ClassicApiError("FacturaDirecta rechazó la consulta", {
          status: response.status,
          uncertain: writing,
        });
      }
      return project(await responseXml(response, root));
    } catch (error) {
      if (error instanceof ClassicApiError) throw error;
      throw new ClassicApiError(
        writing
          ? "FacturaDirecta no confirmó el resultado. Comprueba si se creó antes de volver a intentar."
          : "No se pudo leer la respuesta de FacturaDirecta",
        { status: response?.status, uncertain: writing },
      );
    }
  }

  return {
    lookupInvoiceNumber(formattedNumber) {
      if (typeof formattedNumber !== "string" || !formattedNumber.trim()) {
        throw new TypeError("Indica el número de factura tal como se imprime");
      }
      return request(
        "invoices.xml",
        "invoices",
        (list) => children(list, "invoice").map(invoiceReference),
        { query: { invoiceNumberFormatted: formattedNumber, limit: 2 } },
      );
    },
    findClientsByTaxCode(taxCode) {
      if (typeof taxCode !== "string" || !taxCode.trim()) {
        throw new TypeError("Indica el NIF del cliente");
      }
      return request(
        "clients.xml",
        "clients",
        (list) =>
          children(list, "client").map((client) => ({
            id: id(field(client, "id")),
            name: field(client, "name"),
            taxCode: field(client, "taxCode"),
            address: [
              "line1",
              "line2",
              "zipcode",
              "city",
              "province",
              "country",
            ]
              .map((key) => field(child(client, "address"), key))
              .filter(Boolean)
              .join(", "),
          })),
        { query: { taxCode, limit: 2 } },
      );
    },
    createClient(client) {
      return request(
        "clients.xml",
        "client",
        (record) => ({
          id: id(field(record, "id")),
        }),
        { body: classicClientXml(client) },
      );
    },
    createEstimate(estimate) {
      return request(
        "estimates.xml",
        "estimate",
        (record) => ({
          id: id(field(record, "id")),
          formattedNumber: field(record, "documentNumberFormatted"),
          ...salesTotals(record),
        }),
        { body: classicEstimateXml(estimate) },
      );
    },
    createInvoice(invoice) {
      return request(
        "invoices.xml",
        "invoice",
        (record) => ({
          ...invoiceReference(record),
          ...salesTotals(record),
        }),
        { body: classicInvoiceXml(invoice) },
      );
    },
  };
}
