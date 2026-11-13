"use strict";
((root) => {
  const cents = (v) => Math.round(Number(v || 0) * 100);
  function finances(op = {}) {
    const payments = (op.pagos || []).reduce((s, p) => s + cents(p.importe), 0);
    const costs = (op.costes || []).reduce((s, c) => s + cents(c.importe), 0);
    const sale = cents(op.venta);
    return {
      paid: payments / 100,
      balance: (sale - payments) / 100,
      costs: costs / 100,
      profit: (sale - costs) / 100,
      margin: sale ? ((sale - costs) / sale) * 100 : null,
    };
  }
  function overlaps(a, b) {
    if (
      a.id === b.id ||
      !a.fecha ||
      a.fecha !== b.fecha ||
      !a.responsable ||
      a.responsable !== b.responsable ||
      !a.hora ||
      !b.hora ||
      !Number(a.duracion) ||
      !Number(b.duracion)
    )
      return false;
    const minutes = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    return (
      minutes(a.hora) < minutes(b.hora) + Number(b.duracion) &&
      minutes(b.hora) < minutes(a.hora) + Number(a.duracion)
    );
  }
  function alerts(job, today) {
    const op = job.operativa || {},
      list = [];
    for (const p of op.pedidos || []) {
      const remaining = p.piezas.reduce(
        (s, x) => s + x.cantidad - x.recibidas,
        0,
      );
      if (remaining && p.entrega && p.entrega < today)
        list.push(
          `Entrega vencida: ${p.proveedor} (${remaining} piezas pendientes)`,
        );
      else if (remaining && job.estado === "Para instalar")
        list.push(
          `Material incompleto: ${p.proveedor} (${remaining} piezas pendientes)`,
        );
    }
    if (job.estado === "Para instalar" && !op.montajeConfirmado)
      list.push("Montaje sin confirmar con el cliente");
    return list;
  }
  const api = { finances, overlaps, alerts };
  if (typeof module !== "undefined") module.exports = api;
  else root.VSOperationsModel = api;
})(globalThis);
