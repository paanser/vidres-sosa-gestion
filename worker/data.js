import {
  fail,
  readJSON,
  text,
  random,
  digest,
  atomic,
  audit,
} from "./security.js";
export const KEYS = {
  trabajos: "vidres-sosa-demo-v01",
  clientes: "vidres-clientes-v1",
  presupuestos: "vs-quote-prototype-v1",
  tarifas: "vs-tariffs-prototype-v1",
  configuracion: "vs-config-v1",
  numeracion: "vs-quote-sequence-v1",
  notas: "vidres-notas-v1",
  plantillas: "vidres-plantillas-v1",
  catalogo: "vs-pdf-catalog-v1",
};
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const id = (v) => text(v, 150, 1);
const number = (v, min = 0, max = 1e12) => {
  if (
    !["number", "string"].includes(typeof v) ||
    String(v).trim() === "" ||
    !Number.isFinite(Number(v)) ||
    Number(v) < min ||
    Number(v) > max
  )
    fail(400, "Número no válido");
};
const strings = (v, fields) => {
  for (const [key, max] of Object.entries(fields))
    if (v[key] != null) text(v[key], max);
};
function tree(value, depth = 0, field = "") {
  if (depth > 20) fail(400, "Datos demasiado anidados");
  if (typeof value === "string")
    text(value, field === "drawing" ? 60000 : 10000);
  else if (typeof value === "number" && !Number.isFinite(value))
    fail(400, "Número no válido");
  else if (Array.isArray(value)) {
    if (value.length > 10000) fail(400, "Lista demasiado grande");
    value.forEach((x) => tree(x, depth + 1));
  } else if (object(value))
    for (const [key, v] of Object.entries(value)) {
      text(key, 100, 1);
      if (["__proto__", "constructor", "prototype"].includes(key))
        fail(400, "Clave no permitida");
      tree(v, depth + 1, key);
    }
}
export function validateValues(values) {
  if (!object(values)) fail(400, "Datos no válidos");
  tree(values);
  if (Object.keys(values).some((k) => !Object.values(KEYS).includes(k)))
    fail(400, "Colección no permitida");
  const result = {};
  for (const [name, key] of Object.entries(KEYS)) {
    const value =
      values[key] ?? (["configuracion", "numeracion"].includes(name) ? {} : []);
    if (["configuracion", "numeracion"].includes(name)) {
      if (!object(value)) fail(400, "Configuración no válida");
      if (name === "numeracion")
        for (const [year, n] of Object.entries(value)) {
          if (!/^\d{4}$/.test(year) || !Number.isSafeInteger(n) || n < 0)
            fail(400, "Numeración no válida");
        }
      if (name === "configuracion") {
        if (value.vat != null) number(value.vat, 0, 100);
        if (value.energy != null && value.energy !== "") number(value.energy);
        if (value.unit != null && !["mm", "cm", "m"].includes(value.unit))
          fail(400, "Unidad no válida");
        if (value.company != null && !object(value.company))
          fail(400, "Empresa no válida");
        if (value.company)
          strings(value.company, {
            name: 200,
            taxId: 100,
            address: 500,
            phone: 100,
            email: 200,
            conditions: 5000,
            logo: 9500,
          });
        if (
          value.company?.logo &&
          !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(
            value.company.logo,
          )
        )
          fail(400, "Logo no válido");
      }
    } else {
      if (
        !Array.isArray(value) ||
        value.length > 5000 ||
        value.some((x) => !object(x))
      )
        fail(400, "Lista no válida");
      if (name !== "catalogo") {
        const ids = value.map((x) =>
          name === "clientes" ? id(x.nombre) : id(x.id),
        );
        if (new Set(ids).size !== ids.length)
          fail(400, "Referencias duplicadas");
      }
    }
    result[key] = value;
  }
  const jobs = new Set(result[KEYS.trabajos].map((j) => j.id));
  for (const j of result[KEYS.trabajos]) {
    text(j.cliente, 100, 1);
    strings(j, {
      descripcion: 180,
      direccion: 180,
      poblacion: 100,
      telefono: 30,
      responsable: 80,
      fecha: 10,
      hora: 5,
      estado: 40,
      notas: 1000,
      tipoCliente: 100,
      finalizadoEn: 40,
      archivadoEn: 40,
    });
    if (
      ![
        "Pendiente",
        "En medición",
        "Presupuestado",
        "En producción",
        "Para instalar",
        "Instalado",
        "Finalizado",
        "Crítico",
      ].includes(j.estado)
    )
      fail(400, "Estado no válido");
    if (j.historial && !Array.isArray(j.historial))
      fail(400, "Historial no válido");
    if (j.historial)
      j.historial.forEach((h) => {
        if (!object(h)) fail(400, "Historial no válido");
        strings(h, { de: 40, a: 40, fecha: 40, responsable: 100 });
      });
    for (const k of ["facturado", "cobrado"])
      if (j[k] != null && typeof j[k] !== "boolean")
        fail(400, "Control administrativo no válido");
  }
  for (const c of result[KEYS.clientes])
    strings(c, {
      nombre: 100,
      telefono: 100,
      direccion: 500,
      nif: 100,
      email: 200,
    });
  // Measurements are kept as a separate collection, including vector sketches.
  return result;
}
KEYS.mediciones = "vidres-mediciones-servidor-v1";
const baseValidate = validateValues;
export function checked(values) {
  const out = baseValidate(values),
    jobs = new Set(out[KEYS.trabajos].map((j) => j.id));
  for (const m of out[KEYS.mediciones]) {
    if (!jobs.has(m.trabajo)) fail(400, "Medición sin trabajo");
    number(m.ancho, 0.001);
    number(m.alto, 0.001);
    number(m.cantidad, 1, 100000);
    if (!Number.isInteger(Number(m.cantidad))) fail(400, "Cantidad no válida");
    strings(m, { tipo: 100, espesor: 50, observaciones: 1000 });
    if (m.croquis) {
      const s = m.croquis;
      if (
        !object(s) ||
        !Array.isArray(s.strokes) ||
        s.strokes.length > 5000 ||
        !Array.isArray(s.dims || []) ||
        (s.dims || []).length > 60
      )
        fail(400, "Croquis no válido");
      let count = 0;
      const point = (p) => {
        if (
          !Array.isArray(p) ||
          p.length !== 2 ||
          p.some((n) => typeof n !== "number" || !Number.isFinite(n))
        )
          fail(400, "Punto no válido");
      };
      s.strokes.forEach((t) => {
        if (!object(t) || !Array.isArray(t.points))
          fail(400, "Trazo no válido");
        count += t.points.length;
        t.points.forEach(point);
      });
      if (count > 5000) fail(400, "Croquis demasiado grande");
      (s.dims || []).forEach((d) => {
        if (!object(d)) fail(400, "Cota no válida");
        point(d.a);
        point(d.b);
        text(d.valor, 12);
        if (d.unit != null && !["m", "cm", "mm"].includes(d.unit))
          fail(400, "Unidad de cota no válida");
        id(d.id);
      });
      text(s.notes || "", 1000);
    }
  }
  for (const q of out[KEYS.presupuestos]) {
    text(q.client, 100);
    strings(q, {
      job: 150,
      date: 40,
      status: 40,
      enviado: 40,
      seguimiento: 40,
      observations: 3000,
    });
    if (q.clientSource != null && q.clientSource !== "quote")
      fail(400, "Origen de cliente no válido");
    if (q.clientData != null) {
      if (!object(q.clientData)) fail(400, "Datos de cliente no válidos");
      strings(q.clientData, {
        taxId: 100,
        phone: 100,
        address: 500,
        email: 200,
      });
    }
    if (q.pdfOptions != null) {
      if (
        !object(q.pdfOptions) ||
        Object.entries(q.pdfOptions).some(
          ([key, value]) =>
            ![
              "dimensions",
              "quantity",
              "area",
              "unitPrice",
              "observations",
              "conditions",
              "validity",
            ].includes(key) || typeof value !== "boolean",
        )
      )
        fail(400, "Opciones de PDF no válidas");
    }
    if (q.job && !jobs.has(q.job)) fail(400, "Presupuesto sin trabajo");
    if (!Array.isArray(q.lines) || !q.lines.length || q.lines.length > 200)
      fail(400, "Líneas no válidas");
    if (
      q.lines.reduce(
        (n, l) => n + (typeof l?.drawing === "string" ? l.drawing.length : 0),
        0,
      ) > 350000
    )
      fail(413, "Demasiados dibujos: reduce el tamaño o divide el presupuesto");
    q.lines.forEach((l) => {
      if (!object(l)) fail(400, "Línea no válida");
      if (l.kind === "aluminum") {
        text(l.description, 3000, 1);
        if (!l.description.trim()) fail(400, "Descripción no válida");
        number(l.amount);
        number(l.aluminumMargin ?? 0, 0, 10000);
        if (
          l.drawing != null &&
          l.drawing !== "" &&
          (typeof l.drawing !== "string" ||
            l.drawing.length > 60000 ||
            !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(l.drawing))
        )
          fail(400, "Dibujo no válido");
        return;
      }
      if (l.kind === "concept") {
        text(l.description, 300, 1);
        if (!l.description.trim()) fail(400, "Descripción no válida");
        number(l.amount);
        return;
      }
      if (l.kind != null) fail(400, "Tipo de línea no válido");
      number(l.w, 0.001);
      number(l.h, 0.001);
      number(l.qty, 1, 100000);
      if (!Number.isInteger(Number(l.qty))) fail(400, "Cantidad no válida");
      number(l.price || 0);
      number(l.edgePrice || 0);
      strings(l, { glass: 200, tariff: 150 });
      if (l.extraAmount != null && l.extraAmount !== "") number(l.extraAmount);
      strings(l, { extraDescription: 160 });
      if (
        l.extraMode != null &&
        !["included", "separate"].includes(l.extraMode)
      )
        fail(400, "Presentación del concepto no válida");
      if (
        Number(l.extraAmount) > 0 &&
        l.extraMode === "separate" &&
        !l.extraDescription?.trim()
      )
        fail(400, "Falta la descripción del concepto");
      if (
        l.sides &&
        (!Array.isArray(l.sides) ||
          l.sides.some((s) => !["top", "bottom", "left", "right"].includes(s)))
      )
        fail(400, "Cantos no válidos");
    });
    if (q.pricing) {
      if (!object(q.pricing)) fail(400, "Fiscalidad no válida");
      number(q.pricing.vat ?? 21, 0, 100);
      if (q.pricing.energy) number(q.pricing.energy);
      if (q.pricing.margin != null && q.pricing.margin !== "")
        number(q.pricing.margin);
      if (
        q.pricing.marginMode != null &&
        !["cost", "sale"].includes(q.pricing.marginMode)
      )
        fail(400, "Tipo de margen no válido");
      if (q.pricing.marginMode === "sale" && Number(q.pricing.margin) >= 100)
        fail(400, "El margen sobre venta debe ser inferior al 100 %");
    }
  }
  for (const t of out[KEYS.tarifas]) {
    text(t.name, 200, 1);
    number(t.price, 0.001);
    number(t.edge || 0);
  }
  for (const n of out[KEYS.notas]) {
    text(n.texto, 1000, 1);
    strings(n, { cliente: 100, aviso: 40, hora: 5, creada: 40, parte: 150 });
    if (typeof n.hecha !== "boolean") fail(400, "Nota no válida");
  }
  for (const p of out[KEYS.plantillas]) {
    text(p.nombre, 100, 1);
    strings(p, { descripcion: 180, tipoCliente: 100, notas: 1000 });
    if (!Array.isArray(p.piezas) || p.piezas.length > 200)
      fail(400, "Plantilla no válida");
    p.piezas.forEach((v) => {
      if (!object(v)) fail(400, "Pieza no válida");
      strings(v, { tipo: 100, espesor: 50, observaciones: 1000 });
    });
  }
  for (const p of out[KEYS.catalogo]) strings(p, { name: 200, date: 100 });
  return out;
}
export async function state(db) {
  // A single SELECT gives a consistent snapshot including revision, even during concurrent saves.
  const { results } = await db
    .prepare(
      "SELECT w.revision,r.collection,r.id,r.data FROM workspace w LEFT JOIN records r ON 1=1 WHERE w.id=1 ORDER BY r.collection,r.ordinal",
    )
    .all();
  const values = Object.fromEntries(
    Object.entries(KEYS).map(([n, k]) => [
      k,
      ["configuracion", "numeracion"].includes(n) ? {} : [],
    ]),
  );
  for (const r of results)
    if (r.collection in values) {
      const v = JSON.parse(r.data);
      if (Array.isArray(values[r.collection])) values[r.collection].push(v);
      else values[r.collection] = v;
    }
  return { revision: results[0].revision, values };
}
export function stateStatements(db, values) {
  const statements = [db.prepare("DELETE FROM records")];
  for (const [collection, value] of Object.entries(values)) {
    const rows = (Array.isArray(value) ? value : [value]).map(
      (data, ordinal) => ({
        id: Array.isArray(value)
          ? String(data.id || data.nombre || ordinal)
          : "singleton",
        ordinal,
        data,
      }),
    );
    // Bound chunks stay below D1's per-value limit; a large state is never stored in one SQL row.
    let chunk = [],
      size = 0;
    const flush = () => {
      if (!chunk.length) return;
      statements.push(
        db
          .prepare(
            "INSERT INTO records(collection,id,ordinal,data) SELECT ?,json_extract(value,'$.id'),json_extract(value,'$.ordinal'),json_extract(value,'$.data') FROM json_each(?)",
          )
          .bind(collection, JSON.stringify(chunk)),
      );
      chunk = [];
      size = 0;
    };
    for (const row of rows) {
      const bytes = new TextEncoder().encode(JSON.stringify(row)).length;
      if (bytes > 500000) fail(413, "Registro demasiado grande");
      if (size + bytes > 800000) flush();
      chunk.push(row);
      size += bytes;
    }
    flush();
  }
  statements.push(
    db
      .prepare(
        "DELETE FROM files WHERE import_id IS NULL AND NOT EXISTS(SELECT 1 FROM records r WHERE r.collection=? AND r.id=files.job_id)",
      )
      .bind(KEYS.trabajos),
  );
  statements.push(
    db.prepare("UPDATE workspace SET revision=revision+1 WHERE id=1"),
  );
  return statements;
}
export async function saveState(req, db, auth) {
  const b = await readJSON(req, 8_000_000);
  if (!Number.isSafeInteger(b.revision) || b.revision < 0)
    fail(400, "Revisión no válida");
  const values = checked(b.values),
    old = await state(db);
  // Do not reuse identifiers of deleted quotations; serialize reservation with the data write.
  for (const [year, n] of Object.entries(old.values[KEYS.numeracion]))
    values[KEYS.numeracion][year] = Math.max(
      n,
      values[KEYS.numeracion][year] || 0,
    );
  await atomic(db, auth, stateStatements(db, values), { revision: b.revision });
  return { revision: b.revision + 1, values };
}
export async function fileList(db) {
  const { results } = await db
    .prepare(
      "SELECT f.* FROM files f WHERE f.import_id IS NULL AND EXISTS(SELECT 1 FROM records r WHERE r.collection=? AND r.id=f.job_id)",
    )
    .bind(KEYS.trabajos)
    .all();
  return results;
}
export const publicFile = (r) => ({
  ...JSON.parse(r.metadata),
  id: r.id,
  trabajo: r.job_id,
  kind: r.kind,
  size: r.size,
  sha256: r.sha256,
  version: r.version,
});
export async function filesRoute(req, env, db, auth, path) {
  if (path === "/api/files" && req.method === "GET")
    return { files: (await fileList(db)).map(publicFile) };
  const m = path.match(/^\/api\/files\/([a-f0-9]{32})$/);
  if (!m) return null;
  const file = await db
    .prepare("SELECT * FROM files WHERE id=? AND import_id IS NULL")
    .bind(m[1])
    .first();
  if (req.method === "PUT") {
    const metaRaw = req.headers.get("X-File-Metadata");
    let meta;
    try {
      meta = JSON.parse(decodeURIComponent(metaRaw || ""));
    } catch {
      fail(400, "Metadatos no válidos");
    }
    if (!object(meta)) fail(400, "Metadatos no válidos");
    const kind = meta.kind;
    if (!["photos", "documents"].includes(kind)) fail(400, "Tipo no válido");
    id(meta.trabajo);
    text(meta.nombre, 160, 1);
    strings(meta, { tipo: 40, nota: 180, fecha: 40 });
    const importId = meta.importId || null;
    if (
      !importId &&
      (!Number.isSafeInteger(meta.revision) || meta.revision < 0)
    )
      fail(400, "Revisión no válida");
    if (file && importId) fail(409, "Referencia de archivo duplicada");
    if (importId) {
      if (auth.user.role !== "administrador")
        fail(403, "Solo un administrador puede importar");
      const imp = await db
        .prepare(
          "SELECT * FROM imports WHERE id=? AND owner_id=? AND status='staging'",
        )
        .bind(importId, auth.user.id)
        .first();
      if (!imp) fail(400, "Importación no válida");
    } else if (
      !(await db
        .prepare("SELECT id FROM records WHERE collection=? AND id=?")
        .bind(KEYS.trabajos, meta.trabajo)
        .first())
    )
      fail(400, "Trabajo no encontrado");
    const bytes = await readBytes(req, 8_000_000),
      hash = await digest(bytes);
    const mime = req.headers.get("Content-Type") || "application/octet-stream";
    if (
      kind === "photos" &&
      !["image/jpeg", "image/png", "image/webp"].includes(mime)
    )
      fail(400, "Imagen no admitida");
    const metadata = JSON.stringify({
      nombre: meta.nombre,
      tipo: meta.tipo || "",
      nota: meta.nota || "",
      fecha: meta.fecha || new Date().toISOString(),
      mime,
    });
    const objectKey = random();
    await env.FILES.put(objectKey, bytes, {
      httpMetadata: { contentType: mime },
    });
    try {
      const statements = [
        db
          .prepare(
            `INSERT INTO files(id,kind,job_id,object_key,metadata,size,sha256,owner_id,import_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET object_key=excluded.object_key,metadata=excluded.metadata,size=excluded.size,sha256=excluded.sha256,version=files.version+1 WHERE files.version=? AND files.import_id IS NULL AND files.job_id=excluded.job_id AND files.kind=excluded.kind AND excluded.import_id IS NULL`,
          )
          .bind(
            m[1],
            kind,
            meta.trabajo,
            objectKey,
            metadata,
            bytes.byteLength,
            hash,
            auth.user.id,
            importId,
            new Date().toISOString(),
            Number(meta.version) || 0,
          ),
        db.prepare(
          "INSERT INTO file_assertions(code) SELECT 'FILE_CONFLICT' WHERE changes()!=1",
        ),
      ];
      if (!importId)
        statements.push(
          db.prepare("UPDATE workspace SET revision=revision+1 WHERE id=1"),
        );
      await atomic(db, auth, statements, {
        admin: Boolean(importId),
        importId,
        revision: importId ? null : meta.revision,
      });
    } catch (e) {
      await env.FILES.delete(objectKey).catch(() => {});
      throw e;
    }
    if (file?.object_key)
      await env.FILES.delete(file.object_key).catch(() => {});
    return {
      ok: true,
      id: m[1],
      sha256: hash,
      ...(importId ? {} : { revision: meta.revision + 1 }),
    };
  }
  if (!file) fail(404, "Archivo no encontrado");
  if (
    !(await db
      .prepare("SELECT id FROM records WHERE collection=? AND id=?")
      .bind(KEYS.trabajos, file.job_id)
      .first())
  )
    fail(404, "Archivo no encontrado");
  if (req.method === "GET") {
    const obj = await env.FILES.get(file.object_key);
    if (!obj) fail(404, "Archivo no encontrado");
    const meta = JSON.parse(file.metadata);
    return new Response(obj.body, {
      headers: {
        "Content-Type": meta.mime,
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(meta.nombre),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  }
  if (req.method === "DELETE") {
    const b = await readJSON(req);
    if (!Number.isSafeInteger(b.revision) || b.revision < 0)
      fail(400, "Revisión no válida");
    await atomic(
      db,
      auth,
      [
        db.prepare("DELETE FROM files WHERE id=?").bind(file.id),
        db.prepare("UPDATE workspace SET revision=revision+1 WHERE id=1"),
      ],
      { revision: b.revision },
    );
    await env.FILES.delete(file.object_key).catch(() => {});
    return { ok: true, revision: b.revision + 1 };
  }

  return null;
}
async function readBytes(req, max) {
  const reader = req.body?.getReader();
  if (!reader) fail(400, "Archivo vacío");
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      fail(413, "Archivo demasiado grande");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return bytes;
}
export async function importsRoute(req, db, auth, path) {
  if (auth.user.role !== "administrador")
    fail(403, "Solo un administrador puede importar");
  if (path === "/admin/imports" && req.method === "POST") {
    const b = await readJSON(req);
    if (!Number.isSafeInteger(b.revision)) fail(400, "Revisión no válida");
    const importId = random(16);
    await atomic(
      db,
      auth,
      [
        db
          .prepare("INSERT INTO imports VALUES(?,?,?,'staging',?)")
          .bind(importId, auth.user.id, b.revision, new Date().toISOString()),
      ],
      { revision: b.revision, admin: true },
    );
    return { id: importId };
  }
  const match = path.match(/^\/admin\/imports\/([a-f0-9]{32})$/);
  if (!match) return null;
  const imp = await db
    .prepare(
      "SELECT * FROM imports WHERE id=? AND owner_id=? AND status='staging'",
    )
    .bind(match[1], auth.user.id)
    .first();
  if (!imp) fail(404, "Importación no encontrada");
  if (req.method === "DELETE") {
    await atomic(
      db,
      auth,
      [
        db
          .prepare("UPDATE imports SET status='cancelled' WHERE id=?")
          .bind(imp.id),
      ],
      { admin: true },
    );
    return { ok: true };
  }
  if (req.method !== "POST") return null;
  const b = await readJSON(req, 8_000_000),
    values = checked(b.values);
  if (!Array.isArray(b.files) || b.files.length > 5000)
    fail(400, "Lista de archivos no válida");
  if (
    b.files.some(
      (f) =>
        !object(f) ||
        typeof f.id !== "string" ||
        !/^([a-f0-9]{32})$/.test(f.id) ||
        typeof f.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(f.sha256) ||
        !Number.isSafeInteger(f.size) ||
        f.size < 0,
    ) ||
    new Set(b.files.map((f) => f.id)).size !== b.files.length
  )
    fail(400, "Manifiesto no válido");
  const { results: files } = await db
    .prepare("SELECT * FROM files WHERE import_id=?")
    .bind(imp.id)
    .all();
  if (
    files.length !== b.files.length ||
    files.some(
      (f) =>
        !b.files.some(
          (x) => x.id === f.id && x.sha256 === f.sha256 && x.size === f.size,
        ),
    )
  )
    fail(400, "No se pudieron verificar los archivos importados");
  const jobs = new Set(values[KEYS.trabajos].map((j) => j.id));
  if (files.some((f) => !jobs.has(f.job_id))) fail(400, "Archivo sin trabajo");
  const old = await state(db);
  for (const [year, n] of Object.entries(old.values[KEYS.numeracion]))
    values[KEYS.numeracion][year] = Math.max(
      n,
      values[KEYS.numeracion][year] || 0,
    );
  await atomic(
    db,
    auth,
    [
      ...stateStatements(db, values),
      db.prepare("DELETE FROM files WHERE import_id IS NULL"),
      db
        .prepare("UPDATE files SET import_id=NULL WHERE import_id=?")
        .bind(imp.id),
      db
        .prepare(
          "UPDATE imports SET status='committed' WHERE id=? AND status='staging'",
        )
        .bind(imp.id),
      audit(db, auth, "data-import", imp.id),
    ],
    { revision: imp.revision, admin: true, importId: imp.id },
  );
  return { ok: true, revision: imp.revision + 1, values };
}

export async function reserveQuoteNumber(req, db, auth) {
  const body = await readJSON(req);
  if (!Number.isSafeInteger(body.revision) || body.revision < 0)
    fail(400, "Revisión no válida");
  const current = await state(db),
    year = new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Madrid",
      year: "numeric",
    }).format(new Date()),
    prefix = "P-" + year + "-";
  const sequence = { ...current.values[KEYS.numeracion] };
  const max = current.values[KEYS.presupuestos].reduce(
    (n, q) =>
      q.id.startsWith(prefix)
        ? Math.max(n, Number(q.id.slice(prefix.length)) || 0)
        : n,
    sequence[year] || 0,
  );
  if (!Number.isSafeInteger(max + 1)) fail(400, "Numeración agotada");
  sequence[year] = max + 1;
  await atomic(
    db,
    auth,
    [
      db
        .prepare(
          "INSERT INTO records(collection,id,ordinal,data) VALUES(?,'singleton',0,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data",
        )
        .bind(KEYS.numeracion, JSON.stringify(sequence)),
      db.prepare("UPDATE workspace SET revision=revision+1 WHERE id=1"),
    ],
    { revision: body.revision },
  );
  return {
    id: prefix + String(max + 1).padStart(4, "0"),
    numeracion: sequence,
    revision: body.revision + 1,
  };
}
