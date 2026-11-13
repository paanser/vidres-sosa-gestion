import { fail, text } from "./security.js";
const object = (x) => x && typeof x === "object" && !Array.isArray(x);
const amount = (x, max = 1e9) => {
  if (
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    x < 0 ||
    x > max ||
    Math.abs(x * 100 - Math.round(x * 100)) > 0.0001
  )
    fail(400, "Importe no válido");
};
const date = (x) => {
  text(x, 10, 1);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(x) ||
    !Number.isFinite(Date.parse(x)) ||
    new Date(x).toISOString().slice(0, 10) !== x
  )
    fail(400, "Fecha no válida");
};
const list = (x, max = 200) => {
  if (!Array.isArray(x) || x.length > max || x.some((v) => !object(v)))
    fail(400, "Lista operativa no válida");
  const ids = x.map((v) => {
    text(v.id, 150, 1);
    return v.id;
  });
  if (new Set(ids).size !== ids.length)
    fail(400, "Referencias operativas duplicadas");
};
export function validateOperations(j) {
  if (j.duracion) {
    const n = Number(j.duracion);
    if (!Number.isInteger(n) || n < 1 || n > 1440)
      fail(400, "Duración no válida");
  }
  if (j.hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(j.hora))
    fail(400, "Hora no válida");
  if (j.fecha) date(j.fecha);
  if (j.operativa == null) return;
  const o = j.operativa;
  if (!object(o) || JSON.stringify(o).length > 350000)
    fail(400, "Gestión del expediente no válida o demasiado grande");
  if (o.venta != null) amount(o.venta);
  if (o.ventaNeta != null) amount(o.ventaNeta);
  if (o.montajeConfirmado != null && typeof o.montajeConfirmado !== "boolean")
    fail(400, "Confirmación no válida");
  for (const type of ["pagos", "costes"]) {
    if (o[type] == null) continue;
    list(o[type]);
    for (const x of o[type]) {
      amount(x.importe);
      date(x.fecha);
      text(x.concepto, 300, 1);
      if (
        type === "costes" &&
        ![
          "Material",
          "Mano de obra",
          "Desplazamiento",
          "Repetición",
          "Otro",
        ].includes(x.tipo)
      )
        fail(400, "Tipo de coste no válido");
    }
  }
  if (o.pedidos != null) {
    list(o.pedidos, 100);
    for (const p of o.pedidos) {
      text(p.proveedor, 150, 1);
      text(p.referencia, 150);
      text(p.notas, 1000);
      date(p.fecha);
      if (p.entrega) date(p.entrega);
      list(p.piezas);
      if (!p.piezas.length) fail(400, "Pedido sin piezas");
      for (const x of p.piezas) {
        for (const f of ["ancho", "alto"])
          if (
            typeof x[f] !== "number" ||
            !Number.isFinite(x[f]) ||
            x[f] <= 0 ||
            x[f] > 100000
          )
            fail(400, "Medida de pedido no válida");
        if (
          !Number.isInteger(x.cantidad) ||
          x.cantidad < 1 ||
          x.cantidad > 100000 ||
          !Number.isInteger(x.recibidas) ||
          x.recibidas < 0 ||
          x.recibidas > x.cantidad
        )
          fail(400, "Recepción no válida");
        text(x.tipo, 100);
        text(x.espesor, 50);
        text(x.observaciones, 1000);
        if (x.croquis) {
          if (
            !object(x.croquis) ||
            !Array.isArray(x.croquis.strokes) ||
            x.croquis.strokes.length > 5000 ||
            !Array.isArray(x.croquis.dims || []) ||
            (x.croquis.dims || []).length > 60
          )
            fail(400, "Croquis de pedido no válido");
          let points = 0;
          const point = (v) => {
            if (
              !Array.isArray(v) ||
              v.length !== 2 ||
              v.some((n) => !Number.isFinite(n) || typeof n !== "number")
            )
              fail(400, "Punto no válido");
          };
          for (const s of x.croquis.strokes) {
            if (!object(s) || !Array.isArray(s.points))
              fail(400, "Trazo no válido");
            points += s.points.length;
            s.points.forEach(point);
          }
          if (points > 5000) fail(400, "Croquis demasiado grande");
          for (const d of x.croquis.dims || []) {
            point(d.a);
            point(d.b);
            text(d.valor, 12);
            if (d.unit && !["m", "cm", "mm"].includes(d.unit))
              fail(400, "Unidad no válida");
          }
        }
      }
    }
  }
  if (o.cierre != null) {
    const c = o.cierre;
    if (!object(c)) fail(400, "Cierre no válido");
    date(c.fecha);
    text(c.nombre, 150, 1);
    text(c.incidencias, 2000);
    text(c.pendiente, 1000);
    if (typeof c.conforme !== "boolean") fail(400, "Conformidad no válida");
    if (c.firma) {
      listSignature(c.firma);
    }
    if (
      !Array.isArray(c.fotos) ||
      c.fotos.length > 20 ||
      c.fotos.some((s) => typeof s !== "string" || s.length > 150)
    )
      fail(400, "Fotos de cierre no válidas");
  }
}
function listSignature(strokes) {
  if (!Array.isArray(strokes) || strokes.length > 100)
    fail(400, "Firma no válida");
  let n = 0;
  for (const stroke of strokes) {
    if (!Array.isArray(stroke)) fail(400, "Firma no válida");
    n += stroke.length;
    for (const p of stroke)
      if (
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some(
          (x) => typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 1,
        )
      )
        fail(400, "Firma no válida");
  }
  if (n > 600) fail(400, "Firma demasiado grande");
}
