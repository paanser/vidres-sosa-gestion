"use strict";
(() => {
  const { esc, money } = VSUtils;
  const { finances, overlaps, alerts } = VSOperationsModel;
  const jobs = () => VSStorage.read(VSStorage.keys.trabajos, []);
  const job = (id) => jobs().find((j) => j.id === id);
  const today = () => new Date().toLocaleDateString("en-CA");
  const uid = () => crypto.randomUUID().replaceAll("-", "");
  const dialog = document.createElement("dialog");
  dialog.id = "operations-dialog";
  dialog.className = "operations-dialog";
  dialog.setAttribute("aria-labelledby", "operations-title");
  document.body.append(dialog);
  let selected = "",
    week = today(),
    person = "",
    signature = [],
    drawing = false;
  let pdfUrl = null;
  const button = (action, text, value = "") =>
    `<button type="button" data-op="${action}" data-value="${esc(value)}">${text}</button>`;
  const input = (name, label, type = "text", value = "", extra = "") =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(String(value))}" ${extra}></label>`;
  const textarea = (name, label, value = "", max = 1000) =>
    `<label>${label}<textarea name="${name}" maxlength="${max}">${esc(value)}</textarea></label>`;
  const select = (name, label, values, value = "") =>
    `<label>${label}<select name="${name}">${values.map((v) => `<option value="${esc(v)}" ${value === v ? "selected" : ""}>${esc(v || "Todos")}</option>`).join("")}</select></label>`;
  function form(name, html, submit = "Guardar") {
    return `<form data-op-form="${name}" class="operations-form">${html}<button class="primary" type="submit">${submit}</button></form>`;
  }
  function notify(message) {
    dialog.querySelector("[data-op-message]").textContent = message;
  }
  function header(title) {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      pdfUrl = null;
    }
    dialog.innerHTML = `<div class="operations-heading"><h2 id="operations-title">${esc(title)}</h2>${button("close", "Cerrar")}</div><p data-op-message role="status" aria-live="polite"></p><div id="operations-body"></div><div id="operations-pdf"></div>`;
    return dialog.querySelector("#operations-body");
  }
  async function mutate(id, change) {
    // Read inside the existing mutation queue, so simultaneous form saves cannot lose changes.
    await VSStorage.updateValues((values) => {
      const list = values[VSStorage.keys.trabajos];
      const target = list.find((j) => j.id === id);
      if (!target)
        throw Error("El expediente ya no existe. Actualiza los datos.");
      const op = structuredClone(target.operativa || {});
      change(op, target);
      target.operativa = op;
      if (op.venta != null)
        target.cobrado = op.venta > 0 && finances(op).balance <= 0;
    });
    window.vidresReloadData();
  }
  function monday(value) {
    const d = new Date(value + "T12:00:00");
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  const dayString = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  function weekHtml() {
    const all = jobs().filter(
      (j) => !j.archivadoEn && j.estado !== "Finalizado",
    );
    const start = monday(week);
    return `<div class="operations-week-controls">${input("week", "Semana", "date", week)}${select("person", "Responsable", ["", ...new Set(all.map((j) => j.responsable).filter(Boolean))], person)}</div><div class="operations-week">${Array.from(
      { length: 7 },
      (_, i) => {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const date = dayString(d);
        const items = all
          .filter(
            (j) => j.fecha === date && (!person || j.responsable === person),
          )
          .sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99"));
        return `<section><h3>${esc(d.toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" }))}</h3>${items.map((j) => `<article>${button("job", `${esc(j.hora || "Sin hora")} · ${esc(j.cliente)}`, j.id)}<p>${esc(j.responsable || "Sin responsable")} · ${esc(j.descripcion || j.estado)}${j.duracion ? ` · ${esc(j.duracion)} min` : ""}</p>${all.some((b) => overlaps(j, b)) ? '<strong class="operations-warning">Horario solapado</strong>' : ""}${!j.hora || !j.duracion ? "<small>Falta hora o duración para comprobar conflictos</small>" : ""}</article>`).join("") || '<p class="muted">Sin trabajos</p>'}</section>`;
      },
    ).join("")}</div>`;
  }
  function overview() {
    selected = "";
    const host = header("Gestión · Agenda y avisos");
    host.innerHTML = `<div class="operations-actions">${button("drafts", "Mediciones sin cobertura")}</div><h3>Avisos de material y montaje</h3>${alertsHtml()}<h3>Agenda semanal</h3><div id="operations-agenda">${weekHtml()}</div><h3>Abrir un expediente</h3><label>Trabajo<select data-op-job><option value="">Selecciona un trabajo</option>${jobs()
      .filter((j) => !j.archivadoEn)
      .map(
        (j) =>
          `<option value="${esc(j.id)}">${esc(j.id)} · ${esc(j.cliente)}</option>`,
      )
      .join("")}</select></label>`;
  }
  function alertsHtml() {
    const items = jobs()
      .filter((j) => !j.archivadoEn && j.estado !== "Finalizado")
      .flatMap((j) =>
        alerts(j, today()).map(
          (a) => `<li>${button("job", esc(j.cliente), j.id)} ${esc(a)}</li>`,
        ),
      );
    return items.length
      ? `<ul class="operations-alerts">${items.join("")}</ul>`
      : '<p class="muted">No hay avisos de material o montaje.</p>';
  }
  function showJob(id) {
    const j = job(id);
    if (!j) throw Error("Expediente no encontrado");
    selected = id;
    const o = j.operativa || {},
      f = finances(o);
    const host = header(`${j.cliente} · ${j.id}`);
    host.innerHTML = `<div class="operations-actions">${button("overview", "Agenda y avisos")}${button("schedule", "Planificar visita o montaje")}${button("template", "Guardar como plantilla")}</div>
      <section><h3>Pedidos a proveedores</h3><p>Las medidas de corte se copian de las piezas del expediente, sin redondeo de facturación. Revisa medidas, acabados y croquis antes de enviar.</p>${(o.pedidos || []).map((p) => `<article class="operations-card"><strong>${esc(p.proveedor)} · ${esc(p.referencia || "Sin referencia")}</strong><p>Pedido: ${esc(p.fecha)} · Entrega: ${esc(p.entrega || "Sin fecha")}</p><p>${p.piezas.reduce((s, x) => s + x.recibidas, 0)} de ${p.piezas.reduce((s, x) => s + x.cantidad, 0)} piezas recibidas</p>${button("order-pdf", "Hoja de pedido PDF", p.id)}${button("receive", "Registrar recepción", p.id)}${button("edit-order", "Editar entrega y referencia", p.id)}</article>`).join("") || '<p class="muted">Sin pedidos registrados.</p>'}${button("order", "+ Pedido desde medidas")}</section>
      <section><h3>Importe y cobros</h3><p>Importes con IVA. Saldo pendiente: <strong>${money(f.balance)}</strong> · Cobrado: ${money(f.paid)}</p>${form("sale", input("venta", "Importe acordado con IVA (€)", "number", o.venta ?? "", 'min="0" max="1000000000" step="0.01" required'))}${ledger(o.pagos, "payment", "Registrar anticipo o pago")}</section>
      <section><h3>Costes y rentabilidad</h3><p>Registra costes sin IVA deducible. La rentabilidad usa la venta sin IVA indicada aquí.</p>${form("net-sale", input("ventaNeta", "Venta sin IVA (€)", "number", o.ventaNeta ?? "", 'min="0" max="1000000000" step="0.01" required'))}<p>Coste registrado: <strong>${money(f.costs)}</strong>${o.ventaNeta != null ? ` · Beneficio provisional: <strong>${money(f.profit)}</strong> · Margen sobre venta: ${o.ventaNeta ? f.margin.toFixed(1) : "0"} %` : " · Introduce la venta sin IVA para calcular el beneficio."}</p><p class="muted">Resultado provisional según los costes registrados; incluye horas y repeticiones para completarlo.</p>${ledger(o.costes, "cost", "Registrar coste")}</section>
      <section><h3>Cierre de montaje</h3>${o.cierre ? `<p>${esc(o.cierre.fecha)} · ${esc(o.cierre.nombre)} · ${o.cierre.conforme ? "Conforme" : "Con incidencias"}</p><p>${esc(o.cierre.incidencias)}</p><p>Pendiente: ${esc(o.cierre.pendiente || "Nada indicado")}</p>${button("close-pdf", "Parte de montaje PDF")}` : '<p class="muted">Todavía no se ha registrado el cierre.</p>'}${button("closure", o.cierre ? "Editar cierre" : "Registrar cierre y firma")}</section>`;
  }
  function ledger(list = [], action, text) {
    return (
      list
        .map(
          (x) =>
            `<article class="operations-card">${esc(x.fecha)} · ${esc(x.tipo || "Pago")} · ${esc(x.concepto)} · <strong>${money(x.importe)}</strong>${button(`delete-${action}`, "Eliminar", x.id)}</article>`,
        )
        .join("") + button(action, text)
    );
  }
  function freezeSketch(value) {
    const config = VSStorage.read(VSStorage.keys.configuracion, {});
    const unit =
      (config.legacyDimensionUnit || config.unit) === "mm" ? "mm" : "cm";
    const sketch = structuredClone(value);
    sketch.dims = (sketch.dims || []).map((d) => ({
      ...d,
      unit: d.unit || unit,
    }));
    return sketch;
  }
  function orderForm() {
    const measures = VSStorage.measurements
      .get()
      .filter((m) => m.trabajo === selected);
    if (!measures.length) {
      notify("Añade primero las medidas al expediente.");
      return;
    }
    const host = header("Nuevo pedido · Medidas de corte");
    host.innerHTML = form(
      "order",
      input("proveedor", "Proveedor", "text", "", 'maxlength="150" required') +
        input(
          "referencia",
          "Referencia del proveedor",
          "text",
          "",
          'maxlength="150"',
        ) +
        input("entrega", "Entrega prevista", "date") +
        textarea("notas", "Acabados e instrucciones al proveedor") +
        `<fieldset><legend>Piezas a incluir</legend>${measures.map((m) => `<label><input type="checkbox" name="piece" value="${esc(m.id)}" checked>${esc(m.tipo)} · ${(m.ancho * 10).toFixed(2)} × ${(m.alto * 10).toFixed(2)} mm · ${m.cantidad} ud. · ${esc(m.observaciones || "")}</label>`).join("")}</fieldset><label><input name="reviewed" type="checkbox" required>He revisado las medidas de corte y los acabados de las piezas seleccionadas.</label>`,
      "Crear pedido",
    );
  }
  function receiveForm(id) {
    const p = job(selected).operativa.pedidos.find((x) => x.id === id);
    header("Recepción · " + p.proveedor).innerHTML = form(
      "receive",
      `<input type="hidden" name="id" value="${esc(id)}">${p.piezas.map((x) => input(x.id, `${x.tipo} · ${x.ancho * 10} × ${x.alto * 10} mm · Total recibido de ${x.cantidad}`, "number", x.recibidas, `min="0" max="${x.cantidad}" step="1" required`)).join("")}`,
    );
  }
  function ledgerForm(type) {
    header(
      type === "payment" ? "Anticipo o pago recibido" : "Coste real",
    ).innerHTML = form(
      type,
      input("fecha", "Fecha", "date", today(), "required") +
        input(
          "concepto",
          type === "payment"
            ? "Concepto y medio de pago"
            : "Concepto (horas × coste/hora, material…)",
          "text",
          "",
          'maxlength="300" required',
        ) +
        (type === "cost"
          ? select(
              "tipo",
              "Tipo",
              [
                "Material",
                "Mano de obra",
                "Desplazamiento",
                "Repetición",
                "Otro",
              ],
              "Material",
            )
          : "") +
        input(
          "importe",
          type === "payment"
            ? "Importe recibido con IVA (€)"
            : "Coste sin IVA deducible (€)",
          "number",
          "",
          'min="0.01" max="1000000000" step="0.01" required',
        ),
    );
  }
  function scheduleForm() {
    const j = job(selected);
    header("Planificar · " + j.cliente).innerHTML = form(
      "schedule",
      input("fecha", "Fecha", "date", j.fecha || "", "required") +
        input("hora", "Hora", "time", j.hora || "", "required") +
        input(
          "duracion",
          "Duración (minutos)",
          "number",
          j.duracion || 60,
          'min="1" max="1440" step="1" required',
        ) +
        input(
          "responsable",
          "Responsable",
          "text",
          j.responsable || "",
          'maxlength="80" required',
        ) +
        `<label><input name="confirmed" type="checkbox" ${j.operativa?.montajeConfirmado ? "checked" : ""}>Fecha de montaje confirmada con el cliente</label><label><input name="allowConflict" type="checkbox">Guardar aunque coincida con otro trabajo del responsable</label>`,
    );
  }
  async function closureForm() {
    const id = selected,
      c = job(id).operativa?.cierre || {};
    const photos = (await VSFiles.all("photos")).filter(
      (p) => p.trabajo === id,
    );
    if (selected !== id || !dialog.open) return;
    signature = structuredClone(c.firma || []);
    header("Cierre de montaje").innerHTML = form(
      "closure",
      input("fecha", "Fecha", "date", c.fecha || today(), "required") +
        input(
          "nombre",
          "Nombre de quien firma",
          "text",
          c.nombre || "",
          'maxlength="150" required',
        ) +
        textarea(
          "incidencias",
          "Incidencias del montaje",
          c.incidencias || "",
          2000,
        ) +
        textarea(
          "pendiente",
          "Material o trabajos pendientes",
          c.pendiente || "",
        ) +
        `<label><input name="conforme" type="checkbox" ${c.conforme ? "checked" : ""}>El cliente confirma su conformidad con el montaje descrito</label><label>Fotos finales (hasta 20)<input name="photos" type="file" accept="image/*" multiple></label><fieldset><legend>Fotos del expediente incluidas en el parte</legend>${photos.map((p) => `<label><input name="existingPhoto" type="checkbox" value="${esc(p.id)}" ${(c.fotos || []).includes(p.id) ? "checked" : ""}>${esc(p.nombre || p.id)}</label>`).join("")}</fieldset><p>Firma de conformidad (opcional)</p><canvas id="operations-signature" width="600" height="180" aria-label="Área de firma manuscrita"></canvas>${button("clear-signature", "Borrar firma")}<p>Guardar el cierre conserva el estado del trabajo. Puedes finalizarlo desde el expediente cuando no quede nada pendiente.</p>`,
    );
    initSignature();
  }
  function paintSignature() {
    const canvas = dialog.querySelector("canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#152b25";
    for (const stroke of signature) {
      ctx.beginPath();
      stroke.forEach(([x, y], i) =>
        ctx[i ? "lineTo" : "moveTo"](x * canvas.width, y * canvas.height),
      );
      ctx.stroke();
    }
  }
  function initSignature() {
    const canvas = dialog.querySelector("canvas");
    paintSignature();
    const add = (e) => {
      if (signature.flat().length >= 550) return;
      const r = canvas.getBoundingClientRect();
      signature
        .at(-1)
        .push([
          Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
          Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
        ]);
      paintSignature();
    };
    canvas.addEventListener("pointerdown", (e) => {
      if (signature.length >= 100) return;
      drawing = true;
      signature.push([]);
      canvas.setPointerCapture(e.pointerId);
      add(e);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (drawing) add(e);
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
      canvas.addEventListener(name, () => {
        drawing = false;
      });
  }
  function pdfBase(title, j) {
    const doc = new jspdf.jsPDF();
    const company =
      VSStorage.read(VSStorage.keys.configuracion, {}).company || {};
    doc.setFontSize(17);
    doc.text(company.name || "Vidres Sosa", 14, 18);
    doc.setFontSize(12);
    doc.text(title, 14, 27);
    doc.setFontSize(10);
    doc.text(
      doc.splitTextToSize(
        `${j.id} · ${j.cliente}\n${j.direccion || ""}\n${j.telefono || ""}`,
        180,
      ),
      14,
      35,
    );
    return doc;
  }
  function offerPdf(doc, name) {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    const blob = doc.output("blob");
    pdfUrl = URL.createObjectURL(blob);
    const host = dialog.querySelector("#operations-pdf");
    host.innerHTML = `<p>PDF preparado</p><a target="_blank" rel="noopener" href="${pdfUrl}">Abrir PDF</a> <a download="${esc(name)}" href="${pdfUrl}">Guardar PDF</a>`;
    const file = new File([blob], name, { type: "application/pdf" });
    if (navigator.canShare?.({ files: [file] })) {
      const b = document.createElement("button");
      b.textContent = "Compartir PDF";
      b.onclick = () =>
        navigator.share({ files: [file] }).catch((e) => {
          if (e.name !== "AbortError") notify(e.message);
        });
      host.append(b);
    }
    host.scrollIntoView({ block: "nearest" });
  }
  function orderPdf(id) {
    const j = job(selected),
      p = j.operativa.pedidos.find((x) => x.id === id),
      doc = pdfBase("PEDIDO A PROVEEDOR · MEDIDAS DE CORTE", j);
    doc.autoTable({
      startY: 54,
      head: [["Proveedor", "Referencia", "Pedido", "Entrega prevista"]],
      body: [[p.proveedor, p.referencia, p.fecha, p.entrega || "Sin fecha"]],
      styles: { fontSize: 9 },
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 5,
      head: [
        [
          "Pieza",
          "Tipo / espesor",
          "Ancho mm",
          "Alto mm",
          "Ud.",
          "Acabados / observaciones",
        ],
      ],
      body: p.piezas.map((x, i) => [
        i + 1,
        `${x.tipo} / ${x.espesor} mm`,
        (x.ancho * 10).toFixed(2),
        (x.alto * 10).toFixed(2),
        x.cantidad,
        x.observaciones,
      ]),
      styles: { fontSize: 9 },
    });
    if (p.notas)
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 5,
        body: [["Instrucciones", p.notas]],
        styles: { fontSize: 9 },
      });
    p.piezas.forEach((x, i) => {
      if (!x.croquis?.strokes?.length) return;
      doc.addPage();
      doc.setFontSize(12);
      doc.text(`Pieza ${i + 1} · Croquis de referencia`, 14, 18);
      drawSketch(doc, x.croquis);
    });
    offerPdf(doc, `pedido-${j.id}-${p.id.slice(0, 8)}.pdf`);
  }
  function drawSketch(doc, sketch) {
    const image = window.vidresSketch.preview(sketch);
    const size = doc.getImageProperties(image);
    const scale = Math.min(180 / size.width, 215 / size.height);
    doc.addImage(image, 14, 30, size.width * scale, size.height * scale);
    if (sketch.notes)
      doc.autoTable({
        startY: 250,
        body: [["Notas del croquis", sketch.notes]],
        styles: { fontSize: 9 },
      });
    doc.setFontSize(9);
    doc.text(
      "Las medidas de corte válidas figuran en la tabla del pedido.",
      14,
      285,
    );
  }

  async function closePdf() {
    const j = job(selected),
      c = j.operativa.cierre,
      doc = pdfBase("PARTE DE MONTAJE", j);
    doc.autoTable({
      startY: 54,
      body: [
        ["Fecha", c.fecha],
        ["Cliente / firmante", c.nombre],
        ["Resultado", c.conforme ? "Conforme" : "Sin conformidad registrada"],
        ["Incidencias", c.incidencias || "Sin incidencias indicadas"],
        ["Pendiente", c.pendiente || "Sin pendientes indicados"],
      ],
      styles: { fontSize: 10 },
    });
    let y = doc.lastAutoTable.finalY + 12;
    if (c.firma?.length) {
      if (y + 45 > 275) {
        doc.addPage();
        y = 20;
      }
      doc.text("Firma", 14, y);
      for (const s of c.firma)
        for (let i = 1; i < s.length; i++)
          doc.line(
            14 + s[i - 1][0] * 160,
            y + 5 + s[i - 1][1] * 40,
            14 + s[i][0] * 160,
            y + 5 + s[i][1] * 40,
          );
    }
    const photos = await VSFiles.all("photos");
    for (const id of c.fotos) {
      const p = photos.find((x) => x.id === id && x.trabajo === j.id);
      if (!p) {
        doc.addPage();
        doc.text("Foto no disponible: " + id, 14, 20);
        continue;
      }
      const url = await dataURL(p.blob);
      const dimensions = doc.getImageProperties(url),
        scale = Math.min(180 / dimensions.width, 235 / dimensions.height);
      doc.addPage();
      doc.text(p.nombre || "Foto final", 14, 18);
      doc.addImage(
        url,
        14,
        27,
        dimensions.width * scale,
        dimensions.height * scale,
      );
    }
    offerPdf(doc, `montaje-${j.id}.pdf`);
  }
  const dataURL = (blob) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  async function template() {
    const name = prompt("Nombre de la plantilla de trabajo");
    if (!name?.trim()) return;
    const j = job(selected),
      list = VSStorage.read(VSStorage.keys.plantillas, []);
    list.push({
      id: uid(),
      nombre: name.trim().slice(0, 100),
      descripcion: j.descripcion || "",
      tipoCliente: j.tipoCliente || "Particular",
      notas: j.notas || "",
      piezas: VSStorage.measurements
        .get()
        .filter((m) => m.trabajo === j.id)
        .map((m) => ({
          tipo: m.tipo || "Otro",
          espesor: String(m.espesor || ""),
          observaciones: m.observaciones || "",
        })),
    });
    await VSStorage.write(VSStorage.keys.plantillas, list);
    notify(
      "Plantilla guardada. Disponible al crear un parte y en Ajustes → Plantillas.",
    );
  }
  dialog.addEventListener("change", (e) => {
    if (e.target.matches("[data-op-job]")) {
      if (e.target.value) showJob(e.target.value);
    }
    if (e.target.name === "week" || e.target.name === "person") {
      if (e.target.name === "week") week = e.target.value || today();
      else person = e.target.value;
      dialog.querySelector("#operations-agenda").innerHTML = weekHtml();
    }
  });
  dialog.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-op]");
    if (!b) return;
    b.disabled = true;
    try {
      const action = b.dataset.op,
        value = b.dataset.value;
      if (action === "close") dialog.close();
      else if (action === "overview") overview();
      else if (action === "job") showJob(value);
      else if (action === "order") orderForm();
      else if (action === "receive") receiveForm(value);
      else if (action === "edit-order") {
        const p = job(selected).operativa.pedidos.find((x) => x.id === value);
        header("Datos del pedido").innerHTML = form(
          "edit-order",
          `<input type="hidden" name="id" value="${esc(value)}">` +
            input(
              "proveedor",
              "Proveedor",
              "text",
              p.proveedor,
              'maxlength="150" required',
            ) +
            input(
              "referencia",
              "Referencia",
              "text",
              p.referencia,
              'maxlength="150"',
            ) +
            input("entrega", "Entrega prevista", "date", p.entrega) +
            textarea("notas", "Instrucciones", p.notas),
        );
      } else if (action === "payment" || action === "cost") ledgerForm(action);
      else if (action === "schedule") scheduleForm();
      else if (action === "closure") await closureForm();
      else if (action === "clear-signature") {
        signature = [];
        paintSignature();
      } else if (action === "order-pdf") orderPdf(value);
      else if (action === "close-pdf") await closePdf();
      else if (action === "template") await template();
      else if (action === "drafts") await draftsView();
      else if (action === "draft-new") draftForm();
      else if (action === "draft-open") await draftForm(value);
      else if (action === "draft-delete") {
        if (confirm("¿Eliminar este borrador del dispositivo?")) {
          await draftDelete(value);
          await draftsView();
        }
      } else if (action.startsWith("delete-")) {
        if (!confirm("¿Eliminar este movimiento?")) return;
        const key = action === "delete-payment" ? "pagos" : "costes";
        await mutate(selected, (o) => {
          o[key] = (o[key] || []).filter((x) => x.id !== value);
        });
        showJob(selected);
      }
    } catch (e) {
      notify(e.message);
    } finally {
      b.disabled = false;
    }
  });
  dialog.addEventListener("submit", async (e) => {
    const formEl = e.target.closest("[data-op-form]");
    if (!formEl) return;
    e.preventDefault();
    if (!formEl.reportValidity()) return;
    const b = formEl.querySelector('[type="submit"]');
    if (b.disabled) return;
    b.disabled = true;
    notify("Guardando…");
    dialog.querySelector("#operations-body").inert = true;
    const d = new FormData(formEl),
      type = formEl.dataset.opForm,
      id = selected;
    try {
      if (type === "draft") {
        await saveDraft(formEl, d);
        return;
      }
      if (type === "draft-import") {
        await importDraft(d);
        return;
      }
      if (type === "order") {
        const ids = d.getAll("piece"),
          pieces = VSStorage.measurements
            .get()
            .filter((m) => m.trabajo === id && ids.includes(m.id));
        if (!pieces.length) throw Error("Selecciona al menos una pieza.");
        const order = {
          id: uid(),
          proveedor: d.get("proveedor").trim(),
          referencia: d.get("referencia").trim(),
          notas: d.get("notas").trim(),
          fecha: today(),
          entrega: d.get("entrega"),
          piezas: pieces.map((m) => ({
            id: uid(),
            ancho: Number(m.ancho),
            alto: Number(m.alto),
            cantidad: Number(m.cantidad),
            recibidas: 0,
            tipo: m.tipo || "",
            espesor: String(m.espesor || ""),
            observaciones: m.observaciones || "",
            ...(m.croquis ? { croquis: freezeSketch(m.croquis) } : {}),
          })),
        };
        await mutate(id, (o) => {
          o.pedidos = [...(o.pedidos || []), order];
        });
      } else if (type === "edit-order") {
        await mutate(id, (o) => {
          const p = o.pedidos.find((x) => x.id === d.get("id"));
          if (!p) throw Error("Pedido no encontrado");
          for (const key of ["proveedor", "referencia", "entrega", "notas"])
            p[key] = d.get(key).trim();
        });
      } else if (type === "receive") {
        await mutate(id, (o) => {
          const p = o.pedidos.find((x) => x.id === d.get("id"));
          for (const x of p.piezas) x.recibidas = Number(d.get(x.id));
        });
      } else if (type === "payment" || type === "cost") {
        const key = type === "payment" ? "pagos" : "costes";
        await mutate(id, (o) => {
          o[key] = [
            ...(o[key] || []),
            {
              id: uid(),
              fecha: d.get("fecha"),
              concepto: d.get("concepto").trim(),
              importe: Number(d.get("importe")),
              ...(type === "cost" ? { tipo: d.get("tipo") } : {}),
            },
          ];
        });
      } else if (type === "sale" || type === "net-sale")
        await mutate(id, (o) => {
          const key = type === "sale" ? "venta" : "ventaNeta";
          o[key] = Number(d.get(key));
        });
      else if (type === "schedule") {
        const changes = {
          fecha: d.get("fecha"),
          hora: d.get("hora"),
          duracion: d.get("duracion"),
          responsable: d.get("responsable").trim(),
        };
        const collision = jobs().some(
          (x) =>
            !x.archivadoEn &&
            x.estado !== "Finalizado" &&
            overlaps({ ...job(id), ...changes }, x),
        );
        if (collision && !d.has("allowConflict"))
          throw Error(
            "El responsable ya tiene un trabajo en ese horario. Cambia la hora o marca la opción para guardar el solapamiento.",
          );
        await mutate(id, (o, j) => {
          Object.assign(j, changes);
          o.montajeConfirmado = d.has("confirmed");
        });
      } else if (type === "closure") {
        const files = d.getAll("photos").filter((f) => f.size),
          ids = d.getAll("existingPhoto");
        if (files.length + ids.length > 20)
          throw Error("Selecciona un máximo de 20 fotos finales.");
        formEl.uploadedPhotos ||= new Map();
        for (const file of files) {
          const key = `${file.name}:${file.size}:${file.lastModified}`;
          let photoId = formEl.uploadedPhotos.get(key);
          if (!photoId) {
            const blob = await VSFiles.compressImage(file);
            const result = await VSFiles.put("photos", {
              id: uid(),
              trabajo: id,
              nombre: file.name.slice(0, 160),
              fecha: new Date().toISOString(),
              blob,
            });
            photoId = result.id;
            formEl.uploadedPhotos.set(key, photoId);
          }
          ids.push(photoId);
        }
        const cierre = {
          fecha: d.get("fecha"),
          nombre: d.get("nombre").trim(),
          incidencias: d.get("incidencias").trim(),
          pendiente: d.get("pendiente").trim(),
          conforme: d.has("conforme"),
          firma: structuredClone(signature),
          fotos: ids,
        };
        await mutate(id, (o) => {
          o.cierre = cierre;
        });
      }
      showJob(id);
      notify("Guardado y confirmado por el servidor.");
    } catch (error) {
      notify("No se pudo guardar: " + error.message);
    } finally {
      b.disabled = false;
      dialog.querySelector("#operations-body").inert = false;
    }
  });
  // Drafts are deliberately local, explicitly saved, and never replayed automatically.
  // Each draft is scoped to the authenticated account, uses stable import IDs and keeps
  // photos after a partial upload so a retry cannot duplicate the measurement.
  const owner = () => String(VSAuth.user?.id || VSAuth.user?.usuario || "");
  const dbReady = new Promise((resolve, reject) => {
    const request = indexedDB.open("vidres-field-drafts-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  dbReady.catch(() => {});
  async function draftStore(mode, action) {
    const db = await dbReady;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("drafts", mode),
        req = action(tx.objectStore("drafts"));
      let result;
      req.onsuccess = () => {
        result = req.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error || Error("No se pudo guardar el borrador"));
    });
  }
  const draftList = async () =>
    (await draftStore("readonly", (s) => s.getAll())).filter(
      (d) => d.owner === owner(),
    );
  const draftGet = async (id) => (await draftList()).find((d) => d.id === id);
  const draftDelete = (id) => draftStore("readwrite", (s) => s.delete(id));
  async function draftsView() {
    const drafts = await draftList();
    header("Mediciones sin cobertura").innerHTML =
      `<p>Abre la app e inicia sesión con conexión antes de ir a la obra. Estos borradores se guardan solo en este dispositivo y no se envían hasta que elijas un expediente y pulses Importar. Borrar los datos del navegador elimina los borradores.</p>${button("draft-new", "+ Borrador de medición")}${drafts.map((d) => `<article class="operations-card"><strong>${esc(d.nombre)}</strong><p>${esc(d.tipo)} · ${d.ancho * 10} × ${d.alto * 10} mm · ${d.cantidad} ud. · ${d.photos.length} foto(s)</p>${button("draft-open", "Abrir / importar", d.id)}${button("draft-delete", "Eliminar del dispositivo", d.id)}</article>`).join("") || '<p class="muted">Sin borradores locales.</p>'}`;
  }
  async function draftForm(id = "") {
    const d = id ? await draftGet(id) : {};
    if (!d) throw Error("Borrador no encontrado para este usuario");
    const host = header("Borrador local de medición");
    host.innerHTML = form(
      "draft",
      `<input type="hidden" name="id" value="${esc(id)}">` +
        input(
          "nombre",
          "Obra / referencia",
          "text",
          d.nombre || "",
          'maxlength="150" required',
        ) +
        input(
          "ancho",
          "Ancho de corte (metros)",
          "number",
          d.ancho ? d.ancho / 100 : "",
          'min="0.001" max="100" step="0.001" required',
        ) +
        input(
          "alto",
          "Alto de corte (metros)",
          "number",
          d.alto ? d.alto / 100 : "",
          'min="0.001" max="100" step="0.001" required',
        ) +
        input(
          "cantidad",
          "Cantidad",
          "number",
          d.cantidad || 1,
          'min="1" max="100000" step="1" required',
        ) +
        select(
          "tipo",
          "Tipo de vidrio",
          ["Laminado", "Templado", "Cámara", "Monolítico", "Otro"],
          d.tipo || "Laminado",
        ) +
        input(
          "espesor",
          "Espesor (mm)",
          "text",
          d.espesor || "",
          'maxlength="50"',
        ) +
        textarea(
          "observaciones",
          "Acabados y observaciones",
          d.observaciones || "",
        ) +
        `<label>Fotos de medidas (hasta 12)<input name="photos" type="file" accept="image/*" multiple></label><p>${d.photos?.length || 0} foto(s) conservadas. Las nuevas se añaden al borrador.</p>`,
      "Guardar en este dispositivo",
    );
    if (id)
      host.insertAdjacentHTML(
        "beforeend",
        form(
          "draft-import",
          `<input type="hidden" name="id" value="${esc(id)}"><label>Importar al expediente<select name="job" required><option value="">Selecciona</option>${jobs()
            .filter((j) => !j.archivadoEn)
            .map(
              (j) =>
                `<option value="${esc(j.id)}">${esc(j.id)} · ${esc(j.cliente)}</option>`,
            )
            .join(
              "",
            )}</select></label><p>Importa la versión guardada del borrador. Guarda primero si has modificado sus datos.</p>`,
          "Importar al servidor",
        ),
      );
  }
  async function saveDraft(el, d) {
    const old = d.get("id") ? await draftGet(d.get("id")) : null;
    if (old?.importJob)
      throw Error(
        "Importación iniciada. Completa la importación antes de crear otro borrador con cambios.",
      );
    const files = d.getAll("photos").filter((f) => f.size);
    const photos = old?.photos || [];
    if (files.length + photos.length > 12)
      throw Error("Máximo 12 fotos por borrador.");
    for (const f of files)
      photos.push({
        id: uid(),
        nombre: f.name.slice(0, 160),
        blob: await VSFiles.compressImage(f),
      });
    const record = {
      id: old?.id || uid(),
      owner: owner(),
      nombre: d.get("nombre").trim(),
      ancho: Math.round(Number(d.get("ancho")) * 100000) / 1000,
      alto: Math.round(Number(d.get("alto")) * 100000) / 1000,
      cantidad: Number(d.get("cantidad")),
      tipo: d.get("tipo"),
      espesor: d.get("espesor"),
      observaciones: d.get("observaciones"),
      photos,
      ...(old?.importJob ? { importJob: old.importJob } : {}),
    };
    await draftStore("readwrite", (s) => s.put(record));
    await draftsView();
    notify("Borrador guardado en este dispositivo.");
  }
  async function importDraft(data) {
    const d = await draftGet(data.get("id")),
      id = data.get("job");
    if (!d || !job(id))
      throw Error("Selecciona un borrador y un expediente válidos.");
    if (d.importJob && d.importJob !== id)
      throw Error(
        "Este borrador ya se empezó a importar a otro expediente. Completa la importación allí.",
      );
    d.importJob = id;
    await draftStore("readwrite", (s) => s.put(d));
    const measures = VSStorage.measurements.get(),
      measurementId = "draft-" + d.id;
    if (!measures.some((m) => m.id === measurementId)) {
      measures.push({
        id: measurementId,
        trabajo: id,
        ancho: d.ancho,
        alto: d.alto,
        cantidad: d.cantidad,
        tipo: d.tipo,
        espesor: d.espesor,
        observaciones: d.observaciones,
      });
      await VSStorage.measurements.replace(measures);
    }
    for (const p of d.photos)
      await VSFiles.put("photos", {
        ...p,
        trabajo: id,
        fecha: new Date().toISOString(),
      });
    await draftDelete(d.id);
    window.vidresReloadData();
    showJob(id);
    notify(
      "Medición y fotos confirmadas por el servidor. Se ha retirado el borrador local.",
    );
  }
  window.VSOperations = {
    open(id = "") {
      if (id) showJob(id);
      else overview();
      if (!dialog.open) dialog.showModal();
    },
    decorate(page) {
      if (!["inicio", "calendario"].includes(page)) return;
      const content = document.querySelector("#content");
      const section = document.createElement("section");
      section.className = "panel operations-summary";
      section.innerHTML = `<div class="operations-actions">${button("overview", "Agenda semanal, pedidos y cobros")}${button("drafts", "Mediciones sin cobertura")}</div>${page === "inicio" ? alertsHtml() : ""}`;
      content.prepend(section);
    },
  };
  document.addEventListener("click", async (e) => {
    const b = e.target.closest(
      "[data-operations-job], .operations-summary [data-op]",
    );
    if (!b) return;
    try {
      if (b.dataset.operationsJob) VSOperations.open(b.dataset.operationsJob);
      else {
        VSOperations.open();
        if (b.dataset.op === "drafts") await draftsView();
      }
    } catch (error) {
      alert(error.message);
    }
  });
  dialog.addEventListener("close", () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      pdfUrl = null;
    }
    signature = [];
  });
  window.vidresRefresh();
})();
