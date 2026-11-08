"use strict";
(() => {
  const { esc, num, money } = VSUtils,
    Q = "vs-quote-prototype-v1",
    T = "vs-tariffs-prototype-v1",
    C = "vs-config-v1";
  let draft = null,
    quickMode = false;
  const quotes = () => VSStorage.read(Q, []),
    tariffs = () => window.vidresTariffs.catalog(VSStorage.read(T, [])),
    config = () => VSStorage.read(C, {});
  const pricing = (q) =>
    q?.pricing || { vat: 21, energyMode: "pending", energy: "" };
  const calc = (line) => VSCalculations.calc(line, pricing(draft));
  const details = (q) => VSCalculations.quoteDetails(q);
  const sum = (q) => details(q).totals;
  const statuses = ["Borrador", "Enviado", "Aceptado", "Rechazado"];
  const pdfFields = [
    ["dimensions", "Medidas"],
    ["quantity", "Unidades"],
    ["area", "m² y superficie total"],
    ["unitPrice", "Precio por m²"],
    ["observations", "Observaciones"],
    ["conditions", "Condiciones"],
    ["validity", "Fecha de validez"],
  ];
  const pdfOptions = (q) => ({
    dimensions: true,
    quantity: true,
    area: true,
    unitPrice: false,
    observations: true,
    conditions: true,
    validity: true,
    ...q.pdfOptions,
  });
  const clientCard = (q) =>
    VSStorage.read("vidres-clientes-v1", []).find(
      (c) =>
        String(c.nombre).trim().toLocaleLowerCase("es") ===
        q.client.trim().toLocaleLowerCase("es"),
    );
  function clientData(q) {
    const c = clientCard(q);
    return q.clientSource === "quote" || !c
      ? q.clientData || {}
      : {
          taxId: c.nif || c.cif || "",
          phone: c.telefono || "",
          address: c.direccion || "",
          email: c.email || "",
        };
  }
  function customerFields() {
    const data = clientData(draft),
      fromCard = draft.clientSource !== "quote" && clientCard(draft);
    return `<details class="quote-customer"><summary>Datos del cliente${fromCard ? " · de su ficha" : " · de este presupuesto"}</summary><p class="muted">${fromCard ? "Estos datos se obtienen de la ficha del cliente. Puedes modificarlos en Clientes." : "Se guardan con el presupuesto, sin necesidad de crear una ficha."}</p><div class="quote-fields">${[
      ["taxId", "CIF/NIF", 100],
      ["phone", "Teléfono", 100],
      ["address", "Dirección", 500],
      ["email", "Correo", 200],
    ]
      .map(
        ([key, label, max]) =>
          `<label>${label}<input data-quote-client="${key}" maxlength="${max}" value="${esc(data[key] || "")}" ${fromCard ? "readonly" : ""}></label>`,
      )
      .join("")}</div></details>`;
  }
  function documentFields() {
    const options = pdfOptions(draft);
    return `<fieldset class="quote-document-options"><legend>Datos visibles en el PDF para cliente</legend><p>Marca los datos que quieres mostrar. Ocultarlos no cambia el cálculo ni el total. El precio por m² incluye los conceptos integrados en el vidrio.</p><div class="quote-document-checks">${pdfFields.map(([key, label]) => `<label><input type="checkbox" data-pdf-option="${key}" ${options[key] ? "checked" : ""}>${label}</label>`).join("")}</div><label>Observaciones del presupuesto<textarea id="quote-observations" maxlength="3000" rows="3">${esc(draft.observations || "")}</textarea></label></fieldset>`;
  }
  function readDocumentFields() {
    draft.pdfOptions = pdfOptions(draft);
    document.querySelectorAll("[data-pdf-option]").forEach((el) => {
      draft.pdfOptions[el.dataset.pdfOption] = el.checked;
    });
    if (draft.clientSource === "quote" || !clientCard(draft)) {
      draft.clientData = {};
      document
        .querySelectorAll("[data-quote-client]:not([readonly])")
        .forEach((el) => {
          draft.clientData[el.dataset.quoteClient] = el.value.trim();
        });
    }
    const observations = document.querySelector("#quote-observations");
    if (observations) draft.observations = observations.value.trim();
  }
  const localToday = () => new Date().toLocaleDateString("en-CA");
  function addDays(date, days) {
    const value = new Date(date + "T12:00:00");
    value.setDate(value.getDate() + days);
    return value.toLocaleDateString("en-CA");
  }
  const unit = () => VSMeasureInput.unit(),
    display = (v) => VSMeasureInput.display(v);
  const measures = (w, h) =>
    `${VSUtils.formatMeters(w)} × ${VSUtils.formatMeters(h)} m`;
  // Los nombres del catálogo incluyen la tarifa para distinguir precios internos.
  // Los documentos y mensajes al cliente muestran únicamente el vidrio.
  const glassName = (l) => {
    const name =
      l.glass || tariffs().find((t) => t.id === l.tariff)?.name || "";
    return name
      .replace(/^tarifa\s+[^·]+\s*·\s*/i, "")
      .replace(/\s*·\s*(MF|Sustituciones|Templado)\s*$/i, "")
      .trim();
  };
  const substitutions = () =>
    tariffs().filter((t) => /· Sustituciones$/.test(t.name));
  function doublePrice(line) {
    if (!line.doubleGlazing) return;
    line.price =
      Math.round(
        (num(line.doubleBase) +
          num(line.faceOnePrice) +
          num(line.faceTwoPrice)) *
          100,
      ) / 100;
    line.tariff = "";
    line.glass = `Doble acristalamiento ${line.doubleComposition || "4/16/4"} · ${line.faceOneName || "Float 4"} / ${line.faceTwoName || "Float 4"}`;
  }
  function readDouble(line) {
    line.doubleBase ??= 27;
    line.doubleComposition ||= "4/16/4";
    for (const [field, price, name] of [
      ["faceOne", "faceOnePrice", "faceOneName"],
      ["faceTwo", "faceTwoPrice", "faceTwoName"],
    ]) {
      const selected = substitutions().find((t) => t.id === line[field]);
      line[price] = selected?.price ?? 0;
      line[name] = selected ? glassName({ glass: selected.name }) : "Float 4";
    }
    doublePrice(line);
  }
  function doubleFields(l) {
    const face = (field, label) =>
      `<label>${label}<select data-field="${field}"><option value="">Float 4 · sin cambio (+0 €/m²)</option>${substitutions()
        .map(
          (t) =>
            `<option value="${esc(t.id)}" ${l[field] === t.id ? "selected" : ""}>${esc(glassName({ glass: t.name }))} · +${money(t.price)}/m²</option>`,
        )
        .join("")}</select></label>`;
    return `<label class="quote-edges"><input type="checkbox" data-field="doubleGlazing" ${l.doubleGlazing ? "checked" : ""}>Calcular doble acristalamiento</label>${l.doubleGlazing ? `<div class="quote-fields"><label>Composición base<input data-field="doubleComposition" maxlength="40" value="${esc(l.doubleComposition || "4/16/4")}"></label><label>Precio base del doble (€/m²)<input data-field="doubleBase" type="number" min="0" step="0.01" value="${esc(l.doubleBase ?? 27)}"></label>${face("faceOne", "Sustitución cara 1")}${face("faceTwo", "Sustitución cara 2")}</div><p>Base ${money(num(l.doubleBase))}/m² + cara 1 ${money(num(l.faceOnePrice))}/m² + cara 2 ${money(num(l.faceTwoPrice))}/m² = <strong>${money(num(l.price))}/m²</strong>. Selecciona solo las caras que cambian respecto al vidrio base de 4 mm.</p>` : ""}`;
  }
  const emptyLine = () => ({
    w: "",
    h: "",
    qty: 1,
    price: "",
    edgePrice: "",
    sides: [],
    glass: "",
    tariff: "",
  });
  function fresh() {
    const c = config();
    return {
      id: null,
      client: "",
      job: "",
      status: "Borrador",
      date: localToday(),
      pricing: {
        vat: c.vat ?? 21,
        energy: c.energy || "",
        energyMode: c.energyMode || "pending",
        margin: "",
        marginMode: "cost",
        marginScope: "glass",
      },
      lines: [emptyLine()],
    };
  }
  async function nextId() {
    return VSStorage.reserveQuoteNumber();
  }
  function measurePanel() {
    if (!draft.job)
      return '<p class="muted">Selecciona un parte relacionado para consultar sus medidas, croquis y fotos de medidas en papel.</p>';
    const measures = (window.vidresGetMeasurements?.() || []).filter(
      (m) => m.trabajo === draft.job,
    );
    return `<details id="quote-measures" class="quote-measures" data-job="${esc(draft.job)}"><summary>Ver medidas del parte · ${esc(draft.job)}${measures.length ? ` · ${measures.length} piezas` : ""}</summary><div class="quote-measures-body"><p class="muted">Medidas originales para consultar mientras preparas el presupuesto.</p><div class="quote-measure-grid">${measures.map((m, i) => `<article><h3>Pieza ${i + 1} · ${esc(m.tipo || "Vidrio")}</h3><p>${esc(display(m.ancho))} × ${esc(display(m.alto))} ${unit()} · ${esc(m.cantidad)} ud.${m.espesor ? ` · Espesor: ${esc(m.espesor)} mm` : ""}</p>${m.observaciones ? `<p class="quote-measure-notes">${esc(m.observaciones)}</p>` : ""}${m.croquis?.notes ? `<p class="quote-measure-notes">${esc(m.croquis.notes)}</p>` : ""}${m.croquis?.strokes?.length || m.croquis?.dims?.length ? `<button type="button" data-quote-reference aria-label="Ampliar croquis de la pieza ${i + 1}"><img src="${window.vidresSketch.preview(m.croquis)}" alt="Croquis de la pieza ${i + 1}"></button>` : ""}</article>`).join("")}</div>${measures.length ? "" : '<p class="muted">Todavía no hay piezas medidas en este parte.</p>'}<h3>Fotos de medidas en papel</h3><div class="measure-paper-grid" data-quote-paper aria-live="polite"></div></div></details>`;
  }
  async function loadMeasurePhotos(panel) {
    const host = panel.querySelector("[data-quote-paper]");
    if (host.dataset.loaded) return;
    host.dataset.loaded = "true";
    host.textContent = "Cargando fotos de medidas…";
    try {
      const photos = await VSFiles.all("photos", {
        trabajo: panel.dataset.job,
        tipo: "medidas",
      });
      const images = await Promise.all(
        photos.map(
          (photo) =>
            new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve({ ...photo, src: reader.result });
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(photo.blob);
            }),
        ),
      );
      if (!panel.isConnected) return;
      host.innerHTML = images.length
        ? images
            .map(
              (photo) =>
                `<figure><button type="button" data-quote-reference aria-label="Ampliar foto de medidas: ${esc(photo.nombre || "Medidas en papel")}"><img src="${esc(photo.src)}" alt="${esc(photo.nombre || "Medidas en papel")}"></button><figcaption class="quote-measure-notes">${esc(photo.nota || photo.nombre || "Medidas en papel")}</figcaption></figure>`,
            )
            .join("")
        : '<p class="muted">No hay fotos de medidas en papel en este parte.</p>';
    } catch {
      if (!panel.isConnected) return;
      delete host.dataset.loaded;
      host.innerHTML =
        '<p>No se pudieron cargar las fotos de medidas.</p><button type="button" id="quote-measures-retry">Reintentar</button>';
    }
  }
  function sync() {
    if (!draft) draft = fresh();
    if (quickMode) {
      quickSync();
      return;
    }
    const list = quotes(),
      jobs = window.vidresGetJobs?.() || [],
      breakdown = details(draft);
    const previousMeasures = document.querySelector("#quote-measures");
    document.querySelector("#content").innerHTML =
      `<div class="quote-toolbar"><button type="button" class="quick-quote-button" id="quote-quick">⚡ Presupuesto rápido</button><button type="button" class="primary" id="quote-new">+ Nuevo presupuesto</button><button type="button" id="quote-settings">Ajustes de tarifas</button></div>
 <section class="panel quote-editor"><h2>Presupuesto de vidrio · ${esc(draft.id || "Sin guardar")}</h2><div class="quote-fields"><label>Cliente<input id="quote-client" list="quote-clients" maxlength="100" value="${esc(draft.client)}"></label><datalist id="quote-clients">${(window.vidresClientNames?.() || []).map((name) => `<option value="${esc(name)}"></option>`).join("")}</datalist><label>Parte relacionado<select id="quote-job"><option value="">Sin vincular</option>${jobs.map((j) => `<option value="${esc(j.id)}" ${draft.job === j.id ? "selected" : ""}>${esc(j.id + " · " + j.cliente)}</option>`).join("")}</select></label><label>Estado<select id="quote-status">${statuses.map((s) => `<option ${s === (draft.status || "Borrador") ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
 ${measurePanel()}${customerFields()}<div class="quote-margin"><label>Margen (%)<input id="quote-margin" type="number" min="0" step="0.01" value="${esc(pricing(draft).margin || "")}"></label><p>Incremento sobre el precio del vidrio: 100 € con 20 % → 120 €. Mano de obra, cantos, recargos y conceptos adicionales sin margen. Antes del IVA; solo visible en la copia interna.</p>${pricing(draft).marginScope !== "glass" && num(pricing(draft).margin) ? "<p>Presupuesto anterior: conserva el cálculo guardado. Al editar se aplicará el incremento solo al vidrio.</p>" : ""}</div><div id="quote-lines">${draft.lines.map(row).join("")}</div><button type="button" id="quote-add">+ Añadir otro vidrio</button><button type="button" id="quote-add-concept">+ Añadir concepto libre</button><div class="quote-total"><div class="quote-total-breakdown">${totalResult(breakdown)}</div></div>${documentFields()}<div class="quote-toolbar"><button type="button" class="primary" id="quote-save">Guardar presupuesto</button><button type="button" id="quote-whatsapp">Enviar por WhatsApp</button><button type="button" id="quote-pdf">PDF para cliente</button><button type="button" id="quote-pdf-internal">PDF interno · Vidres Sosa</button></div></section>
 <section class="panel"><h2>Presupuestos guardados</h2>${list.length ? list.map((q) => `<article class="quote-saved"><span>${esc(q.id)} · ${esc(q.client)} · ${esc(q.status || "Borrador")} · Total: ${money(sum(q).total)}</span><div><button type="button" data-load="${esc(q.id)}">Abrir</button><button type="button" data-whatsapp="${esc(q.id)}">WhatsApp</button><button type="button" data-duplicate="${esc(q.id)}">Duplicar</button><button type="button" data-delete-quote="${esc(q.id)}">Eliminar</button></div></article>`).join("") : "<p>No hay presupuestos guardados.</p>"}</section>`;
    const panel = document.querySelector("#quote-measures");
    if (panel && previousMeasures?.dataset.job === draft.job) {
      panel.replaceWith(previousMeasures);
    } else if (panel) {
      panel.addEventListener("toggle", () => {
        if (panel.open) loadMeasurePhotos(panel);
      });
    }
    initMeasures();
  }
  function initMeasures() {
    VSMeasureInput.init(document.querySelector("#content"));
    document.querySelectorAll(".quote-line [data-measure]").forEach((input) => {
      VSMeasureInput.set(
        input,
        draft.lines[Number(input.closest(".quote-line").dataset.line)][
          input.dataset.field
        ],
      );
    });
    if (quickMode) {
      VSMeasureInput.set(document.querySelector("#quick-w"), draft.lines[0].w);
      VSMeasureInput.set(document.querySelector("#quick-h"), draft.lines[0].h);
    }
  }
  function quickSync() {
    const line = draft.lines[0] || emptyLine(),
      result = calc(line),
      total = sum(draft),
      names = window.vidresClientNames?.() || [];
    document.querySelector("#content").innerHTML = `
      <div class="quote-toolbar"><button type="button" id="quick-close">← Volver a presupuestos</button></div>
      <section class="panel quick-quote-editor">
        <h2>⚡ Presupuesto rápido</h2>
        <p class="muted">Calcula un precio sin crear antes un parte.</p>
        <div class="quote-fields">
          <label>Cliente (opcional)<input id="quick-client" list="quick-quote-clients" maxlength="100" value="${esc(draft.client)}"></label>
          <datalist id="quick-quote-clients">${names.map((name) => `<option value="${esc(name)}"></option>`).join("")}</datalist>
          <label>Ancho (${unit()})<input id="quick-w" data-measure type="text" inputmode="decimal" value="${esc(display(line.w))}"></label>
          <label>Alto (${unit()})<input id="quick-h" data-measure type="text" inputmode="decimal" value="${esc(display(line.h))}"></label>
          <label>Cantidad<input id="quick-qty" type="number" min="1" step="1" value="${esc(line.qty || 1)}"></label>
          <label>Tipo de vidrio<select id="quick-glass" ${line.doubleGlazing ? "disabled" : ""}><option value="">Selecciona una tarifa</option>${tariffs()
            .map(
              (tariff) =>
                `<option value="${esc(tariff.id)}" ${line.tariff === tariff.id ? "selected" : ""}>${esc(tariff.name)} · ${money(tariff.price)}/m²</option>`,
            )
            .join("")}</select></label>
        </div>
        ${customerFields()}<section class="quick-double">${doubleFields(line)}</section>
        <fieldset class="quote-edges"><legend>Cantos a pulir</legend>${[
          ["top", "Superior"],
          ["bottom", "Inferior"],
          ["left", "Izquierdo"],
          ["right", "Derecho"],
        ]
          .map(
            ([value, label]) =>
              `<label><input type="checkbox" data-quick-edge="${value}" ${(line.sides || []).includes(value) ? "checked" : ""}>${label}</label>`,
          )
          .join("")}</fieldset>
        <div id="quick-result" class="quote-result quick-result">${quickResultHtml(result, total)}</div>
        ${documentFields()}<div class="quote-toolbar"><button type="button" id="quote-pdf">PDF para cliente</button><button type="button" id="quick-copy">Copiar mensaje</button><button type="button" id="quick-whatsapp">Enviar por WhatsApp</button><button type="button" class="primary" id="quick-save">Guardar como presupuesto</button></div>
      </section>`;
    initMeasures();
  }
  function quickResultHtml(result, total) {
    return `Medida real: ${measures(result.w, result.h)}<br>Medida aplicada: ${measures(result.aw, result.ah)}<br>Superficie aplicada: ${result.area.toFixed(4)} m² por pieza<br>Base: <strong>${money(total.base)}</strong><br>IVA (${esc(pricing(draft).vat ?? 21)} %): <strong>${money(total.iva)}</strong><br>Total: <strong class="quote-grand-total">${money(total.total)}</strong>`;
  }
  function readQuickForm() {
    const line = draft.lines[0] || emptyLine(),
      client = document.querySelector("#quick-client"),
      width = document.querySelector("#quick-w");
    if (!client || !width) return;
    draft.client = client.value.trim();
    line.w = VSMeasureInput.read(width).cm ?? "";
    line.h = VSMeasureInput.read(document.querySelector("#quick-h")).cm ?? "";
    line.qty = document.querySelector("#quick-qty").value;
    const tariff = tariffs().find(
      (item) => item.id === document.querySelector("#quick-glass").value,
    );
    line.tariff = tariff?.id || "";
    line.glass = tariff?.name || "";
    line.price = tariff?.price ?? "";
    line.edgePrice = tariff?.edge ?? "";
    document.querySelectorAll(".quick-double [data-field]").forEach((input) => {
      line[input.dataset.field] =
        input.type === "checkbox" ? input.checked : input.value;
    });
    if (line.doubleGlazing) readDouble(line);
    line.sides = [
      ...document.querySelectorAll("[data-quick-edge]:checked"),
    ].map((input) => input.dataset.quickEdge);
    draft.lines = [line];
    readDocumentFields();
  }
  function updateQuickResult() {
    readQuickForm();
    const host = document.querySelector("#quick-result");
    if (host)
      host.innerHTML = quickResultHtml(calc(draft.lines[0]), sum(draft));
  }
  function messageQuote(q) {
    const c = config(),
      company = c.company || {},
      breakdown = details(q),
      totals = breakdown.totals,
      detail = q.lines
        .map((line, i) => {
          const result = breakdown.lines[i];
          if (line.kind === "concept")
            return `• ${line.description}: ${money(result.sale)}`;
          return `• ${glassName(line) || "Vidrio"} ${measures(result.w, result.h)} (${result.qty} ud.): ${money(result.glassSale)}${result.separate && result.extraCost ? `\n• ${line.extraDescription || "Otros conceptos"}: ${money(result.extraSale)}` : ""}`;
        })
        .join("\n"),
      template =
        c.whatsappTemplate ||
        "Hola{cliente}, te paso el precio:\n\n{detalle}\n\nBase: {base}\nIVA: {iva}\nTotal: {total}\n\n{empresa}. Presupuesto válido {validez} días.",
      values = {
        cliente: q.client && q.client !== "Sin cliente" ? " " + q.client : "",
        detalle: detail,
        base: money(totals.base),
        iva: money(totals.iva),
        total: money(totals.total),
        empresa: company.name || "Vidres Sosa",
        validez: company.validity || 30,
      };
    return template.replace(
      /\{(cliente|detalle|base|iva|total|empresa|validez)\}/g,
      (_, key) => values[key],
    );
  }
  function phoneForQuote(q) {
    const client = VSStorage.read("vidres-clientes-v1", []).find(
      (item) =>
        String(item.nombre || "")
          .trim()
          .toLocaleLowerCase("es") ===
        String(q.client || "")
          .trim()
          .toLocaleLowerCase("es"),
    );
    let phone = String(client?.telefono || "").replace(/[^+0-9]/g, "");
    phone = phone.replace(/^\+|^00/, "");
    if (/^\d{9}$/.test(phone)) phone = "34" + phone;
    return phone;
  }
  let messageTarget = null,
    messageKind = "quote";
  function openQuoteMessage(q, kind = "quote") {
    messageTarget = q;
    messageKind = kind;
    const dialog = document.querySelector("#quote-message-dialog");
    dialog.querySelector('[name="mensaje"]').value =
      kind === "followup"
        ? `Hola${q.client && q.client !== "Sin cliente" ? " " + q.client : ""}, ¿has podido revisar el presupuesto ${q.id}? Si tienes cualquier duda, estamos a tu disposición.\n\n${config().company?.name || "Vidres Sosa"}`
        : messageQuote(q);
    dialog.showModal();
    requestAnimationFrame(() =>
      dialog.querySelector('[name="mensaje"]').focus(),
    );
  }
  function quickMessage() {
    readQuickForm();
    return messageQuote(draft);
  }
  async function copyText(text) {
    if (navigator.clipboard?.writeText)
      await navigator.clipboard.writeText(text);
    else {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }
  function row(l, i) {
    if (l.kind === "concept")
      return `<div class="quote-line quote-concept" data-line="${i}"><div class="quote-line-head"><strong>Concepto libre</strong><button type="button" data-remove="${i}">Eliminar</button></div><div class="quote-fields"><label>Descripción libre<textarea data-field="description" maxlength="300" rows="2" placeholder="Ej.: montaje, reparación, transporte…">${esc(l.description || "")}</textarea></label><label>Importe de coste (€ sin IVA)<input type="number" min="0" step="0.01" data-field="amount" value="${esc(l.amount ?? "")}"></label></div><p>Importe por todo el concepto, sin medidas ni tarifa. Sin margen; se presenta por separado al cliente.</p></div>`;
    const c = calc(l);
    return `<div class="quote-line" data-line="${i}"><div class="quote-line-head"><strong>Vidrio ${i + 1}</strong><button type="button" data-remove="${i}">Eliminar</button></div>${doubleFields(l)}<div class="quote-fields">${[
      ["w", "Ancho real (" + unit() + ")", display(l.w)],
      ["h", "Alto real (" + unit() + ")", display(l.h)],
      ["qty", "Cantidad", l.qty ?? 1],
    ]
      .map(
        ([k, label, v]) =>
          `<label>${label}<input ${k === "qty" ? 'type="number" min="1" step="1"' : 'data-measure type="text" inputmode="decimal"'} data-field="${k}" value="${esc(v)}"></label>`,
      )
      .join(
        "",
      )}<label>Tarifa de vidrio<select data-field="tariff" ${l.doubleGlazing ? "disabled" : ""}><option value="">Sin tarifa · precio manual</option>${tariffs()
      .map(
        (t) =>
          `<option value="${esc(t.id)}" ${l.tariff === t.id ? "selected" : ""}>${esc(t.name)} · ${money(t.price)}/m²</option>`,
      )
      .join(
        "",
      )}</select></label><label>Tipo de vidrio<input data-field="glass" ${l.doubleGlazing ? "readonly" : ""} value="${esc(glassName(l))}"></label><label>Precio vidrio (€/m², editable sin tarifa)<input type="number" min="0" step="0.01" data-field="price" ${l.doubleGlazing ? "readonly" : ""} value="${esc(l.price)}"></label><label>Precio canto (€/ml)<input type="number" min="0" step="0.01" data-field="edgePrice" value="${esc(l.edgePrice)}"></label></div><div class="quote-edges">${[
      ["top", "Superior"],
      ["bottom", "Inferior"],
      ["left", "Izquierdo"],
      ["right", "Derecho"],
    ]
      .map(
        ([v, label]) =>
          `<label><input type="checkbox" data-edge="${v}" ${(l.sides || []).includes(v) ? "checked" : ""}>${label}</label>`,
      )
      .join(
        "",
      )}</div><div class="quote-fields quote-extras"><label>Descripción del concepto adicional<input data-field="extraDescription" maxlength="160" placeholder="Ej.: montaje, transporte, herrajes" value="${esc(l.extraDescription || "")}"></label><label>Coste adicional (€ por toda esta línea)<input type="number" min="0" step="0.01" data-field="extraAmount" value="${esc(l.extraAmount ?? "")}"></label><label>Presentación al cliente<select data-field="extraMode"><option value="included" ${l.extraMode !== "separate" ? "selected" : ""}>Integrado en el precio del vidrio</option><option value="separate" ${l.extraMode === "separate" ? "selected" : ""}>Como concepto separado</option></select></label></div><div class="quote-result">${lineResult(c)}</div></div>`;
  }
  function lineResult(c) {
    return `Real: ${measures(c.w, c.h)} · ${c.real.toFixed(4)} m²<br>Aplicada: ${measures(c.aw, c.ah)} · ${c.area.toFixed(4)} m²<br>Canto por pieza: ${c.ml.toFixed(2)} ml · Unidades: ${c.qty} · Coste de vidrio y cantos: ${money(c.total)}${c.energy ? "<br>Recargo energético incluido: " + money(c.energy) : ""}`;
  }
  function totalResult(breakdown) {
    const total = breakdown.totals;
    return `Coste interno: <strong>${money(breakdown.cost)}</strong><br>Margen añadido: <strong>${money(breakdown.margin)}</strong><br>Base imponible de venta: <strong>${money(total.base)}</strong><br>IVA (${esc(pricing(draft).vat ?? 21)} %): <strong>${money(total.iva)}</strong><br>Total con IVA: <strong class="quote-grand-total">${money(total.total)}</strong>`;
  }
  function fromForm() {
    if (!draft || !document.querySelector("#quote-client")) return;
    const previous = JSON.stringify(draft);
    draft.client = document.querySelector("#quote-client").value.trim();
    draft.job = document.querySelector("#quote-job").value;
    draft.status = document.querySelector("#quote-status").value;
    draft.pricing = {
      ...pricing(draft),
      margin: document.querySelector("#quote-margin").value,
    };
    document.querySelectorAll(".quote-line").forEach((el) => {
      const l = draft.lines[Number(el.dataset.line)];
      el.querySelectorAll("[data-field]").forEach(
        (input) =>
          (l[input.dataset.field] =
            input.type === "checkbox"
              ? input.checked
              : ["w", "h"].includes(input.dataset.field)
                ? (VSMeasureInput.read(input).cm ?? "")
                : input.value),
      );
      if (l.doubleGlazing) readDouble(l);
      l.sides = [...el.querySelectorAll("[data-edge]:checked")].map(
        (x) => x.dataset.edge,
      );
    });
    if (JSON.stringify(draft) !== previous) {
      draft.pricing.marginMode = "cost";
      draft.pricing.marginScope = "glass";
    }
    readDocumentFields();
  }
  function valid(print = false) {
    if (!VSMeasureInput.validate(document.querySelector("#content")))
      return false;
    const nonNegative = (value) => {
      const n = Number(String(value ?? "").replace(",", "."));
      return Number.isFinite(n) && n >= 0;
    };
    if (
      !nonNegative(pricing(draft).margin) ||
      !Number.isFinite(sum(draft).total) ||
      !draft.lines.every(
        (l) =>
          (!l.doubleGlazing || nonNegative(l.doubleBase)) &&
          nonNegative(l.extraAmount) &&
          (!num(l.extraAmount) ||
            l.extraMode !== "separate" ||
            l.extraDescription?.trim()),
      )
    ) {
      alert(
        "Revisa el margen y los importes: deben ser positivos o cero. Escribe un nombre para los conceptos separados.",
      );
      return false;
    }
    if (
      (!draft.client.trim() && !quickMode) ||
      !draft.lines.length ||
      !draft.lines.every((l) =>
        l.kind === "concept"
          ? Boolean(l.description?.trim()) &&
            String(l.amount ?? "").trim() !== "" &&
            nonNegative(l.amount) &&
            ((!print && draft.status === "Borrador") || num(l.amount) > 0)
          : num(l.w) > 0 &&
            num(l.h) > 0 &&
            Number.isInteger(Number(l.qty)) &&
            Number(l.qty) > 0 &&
            Number(String(l.price).replace(",", ".")) >= 0 &&
            Number(String(l.edgePrice || 0).replace(",", ".")) >= 0 &&
            Number.isFinite(calc(l).total) &&
            ((!print && draft.status === "Borrador") || num(l.price) > 0),
      )
    ) {
      alert(
        "Revisa cliente, medidas, cantidades, descripciones e importes. Para enviar, aceptar o imprimir se requiere precio positivo.",
      );
      return false;
    }
    return true;
  }
  function discard() {
    fromForm();
    if (!draft) return true;
    const old = quotes().find((q) => q.id === draft.id);
    if (
      !old &&
      !draft.client &&
      !draft.job &&
      draft.lines.length === 1 &&
      !draft.lines[0].w &&
      !draft.lines[0].h &&
      !draft.lines[0].glass &&
      !draft.lines[0].price &&
      !draft.lines[0].extraDescription &&
      !draft.lines[0].extraAmount &&
      !pricing(draft).margin
    )
      return true;
    return (
      JSON.stringify(old || fresh()) === JSON.stringify(draft) ||
      confirm("¿Descartar los cambios del presupuesto sin guardar?")
    );
  }
  async function saveDraft() {
    fromForm();
    if (quickMode) readQuickForm();
    if (quickMode && !draft.client.trim()) draft.client = "Sin cliente";
    if (!valid()) return;
    const task = async () => {
      const list = quotes(),
        old = list.find((q) => q.id === draft.id);
      if (!draft.id) draft.id = await nextId();
      if (draft.status === "Enviado") {
        draft.enviado = draft.enviado || localToday();
        draft.seguimiento =
          draft.seguimiento ||
          addDays(draft.enviado, Number(config().followupDays) || 4);
      }
      const i = list.findIndex((q) => q.id === draft.id),
        copy = structuredClone(draft);
      if (i < 0) list.push(copy);
      else list[i] = copy;
      await VSStorage.write(Q, list);
      if (
        copy.status === "Aceptado" &&
        old?.status !== "Aceptado" &&
        copy.job &&
        confirm("¿Cambiar el trabajo vinculado a En producción?")
      )
        await window.vidresChangeJobStatus?.(copy.job, "En producción");
      quickMode = false;
      sync();
    };
    try {
      if (navigator.locks) await navigator.locks.request("vidres-quotes", task);
      else await task();
    } catch (e) {
      alert("No se pudo guardar el presupuesto: " + e.message);
    }
  }
  function printQuote(internal = false) {
    if (quickMode) readQuickForm();
    else fromForm();
    if (!valid(true)) return;
    const c = config(),
      company = c.company || {},
      job = window.vidresGetJobs?.().find((j) => j.id === draft.job),
      client = clientData(draft);
    let host = document.querySelector("#quote-print");
    if (!host) {
      host = document.createElement("section");
      host.id = "quote-print";
      document.body.appendChild(host);
    }
    const breakdown = details(draft),
      t = breakdown.totals;
    const rows = draft.lines
      .map((l, i) => {
        const a = breakdown.lines[i];
        if (l.kind === "concept")
          return `<tr><td>${esc(l.description)}</td>${internal ? `<td>${money(a.cost)}</td><td>${money(a.margin)}</td>` : ""}<td>${money(a.sale)}</td></tr>`;
        const label = `${esc(glassName(l) || "Vidrio")} · ${measures(a.w, a.h)} · ${a.qty} ud.`;
        if (internal)
          return `<tr><td>${label}<br>Precio vidrio: ${money(num(l.price))}/m² · canto: ${money(num(l.edgePrice))}/ml<br>Real: ${a.real.toFixed(4)} m²/pieza · aplicada: ${a.area.toFixed(4)} m²/pieza · canto: ${a.ml.toFixed(2)} ml/pieza<br>Vidrio y cantos: ${money(a.glassCost - a.energy)} · recargo energético: ${money(a.energy)}<br>Otros conceptos: ${esc(l.extraDescription || "Sin concepto")} · ${money(a.extraCost)} (${a.separate ? "separado" : "integrado en vidrio"})</td><td>${money(a.cost)}</td><td>${money(a.margin)}</td><td>${money(a.sale)}</td></tr>`;
        return `<tr><td>${label}</td><td>${money(a.glassSale)}</td></tr>${a.separate && a.extraCost ? `<tr><td>${esc(l.extraDescription || "Otros conceptos")}</td><td>${money(a.extraSale)}</td></tr>` : ""}`;
      })
      .join("");
    const options = pdfOptions(draft),
      number = (n, digits = 2) =>
        Number(n).toLocaleString("es-ES", {
          maximumFractionDigits: digits,
          minimumFractionDigits: digits,
        }),
      dateLabel = (date) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date || "")
          ? date.split("-").reverse().join("/")
          : date || "",
      columns = [
        ["dimensions", "Medidas mm · alto × ancho"],
        ["quantity", "Und."],
        ["area", "m²"],
        ["unitPrice", "Precio €/m²"],
      ].filter(([key]) => options[key]),
      emptyCells = columns.map(() => "<td></td>").join(""),
      customerRows = draft.lines
        .map((line, i) => {
          const a = breakdown.lines[i];
          if (line.kind === "concept")
            return `<tr><td>${esc(line.description)}</td>${emptyCells}<td>${money(a.sale)}</td></tr>`;
          const values = {
            dimensions: `${number(a.h * 10, 1)} × ${number(a.w * 10, 1)}`,
            quantity: a.qty,
            area: number(a.area * a.qty, 4),
            unitPrice: money(a.glassSale / (a.area * a.qty)),
          };
          return `<tr><td>${esc(glassName(line) || "Vidrio")}</td>${columns.map(([key]) => `<td>${esc(values[key])}</td>`).join("")}<td>${money(a.glassSale)}</td></tr>${a.separate && a.extraCost ? `<tr class="quote-doc-extra"><td>${esc(line.extraDescription || "Otros conceptos")}</td>${emptyCells}<td>${money(a.extraSale)}</td></tr>` : ""}`;
        })
        .join(""),
      companyName = company.name || "Vidres Sosa",
      logo = VSUtils.isCompanyLogo(company.logo)
        ? `<img class="quote-doc-logo" src="${esc(company.logo)}" alt="${esc(companyName)}">`
        : `<div class="quote-doc-wordmark"><span>${esc(companyName.toLocaleLowerCase("es") === "vidres sosa" ? "Vidres" : companyName)}</span>${companyName.toLocaleLowerCase("es") === "vidres sosa" ? "<strong>Sosa</strong>" : ""}</div>`,
      lines = (text) => esc(text || "").replace(/\n/g, "<br>"),
      showValidity = internal || options.validity;
    host.innerHTML = `<header class="quote-doc-header"><div>${logo}<div class="quote-doc-company"><strong>${esc(companyName)}</strong>${company.taxId ? `<br>CIF/NIF: ${esc(company.taxId)}` : ""}${[
      company.address,
      company.phone,
      company.email,
    ]
      .filter(Boolean)
      .map((v) => `<br>${lines(v)}`)
      .join(
        "",
      )}</div></div><div><h1>PRESUPUESTO</h1><p class="quote-doc-reference">Nº ${esc(draft.id || "Borrador sin referencia")}</p>${internal ? '<p class="quote-doc-internal">Presupuesto interno · No entregar al cliente</p>' : ""}<section class="quote-doc-client"><h2>CLIENTE</h2><strong>${esc(draft.client || "Sin cliente")}</strong>${client.taxId ? `<br>CIF/NIF: ${esc(client.taxId)}` : ""}${[
      client.address || job?.direccion,
      client.phone,
      client.email,
    ]
      .filter(Boolean)
      .map((v) => `<br>${lines(v)}`)
      .join(
        "",
      )}</section></div></header><div class="quote-doc-dates"><p><strong>Fecha oferta:</strong> ${esc(dateLabel(draft.date))}</p>${showValidity ? `<p><strong>Fecha validez:</strong> ${esc(dateLabel(addDays(draft.date, Number(company.validity) || 30)))}</p>` : ""}${draft.job ? `<p><strong>Parte relacionado:</strong> ${esc(draft.job)}</p>` : ""}</div><table class="quote-doc-items"><thead><tr><th>Concepto</th>${internal ? "<th>Coste</th><th>Margen añadido</th>" : columns.map(([, label]) => `<th>${label}</th>`).join("")}<th>Importe sin IVA</th></tr></thead><tbody>${internal ? rows : customerRows}</tbody></table>${(internal || options.observations) && draft.observations ? `<section class="quote-doc-notes"><h2>OBSERVACIONES</h2><p>${lines(draft.observations)}</p></section>` : ""}${(internal || options.conditions) && company.conditions ? `<section class="quote-doc-notes"><h2>CONDICIONES</h2><p>${lines(company.conditions)}</p></section>` : ""}${internal ? `<p>Coste interno: ${money(breakdown.cost)}<br>Margen sobre ${pricing(draft).marginScope === "glass" ? "precio del vidrio" : pricing(draft).marginMode === "sale" ? "venta sin IVA" : "coste"} (${esc(pricing(draft).margin || 0)} %): ${money(breakdown.margin)}</p>` : ""}<footer class="quote-doc-footer"><div class="quote-doc-summary">${internal || options.quantity ? `<span>Total unidades: ${breakdown.lines.reduce((n, a, i) => n + (draft.lines[i].kind === "concept" ? 0 : a.qty), 0)}</span>` : ""}${
      internal || options.area
        ? `<span>Total m²: ${number(
            breakdown.lines.reduce(
              (n, a, i) =>
                n + (draft.lines[i].kind === "concept" ? 0 : a.area * a.qty),
              0,
            ),
            4,
          )}</span>`
        : ""
    }</div><table class="quote-doc-totals"><thead><tr><th>Base imponible</th><th>IVA ${esc(pricing(draft).vat ?? 21)} %</th><th>TOTAL PRESUPUESTO</th></tr></thead><tbody><tr><td>${money(t.base)}</td><td>${money(t.iva)}</td><td><strong>${money(t.total)}</strong></td></tr></tbody></table>${showValidity ? `<p>Validez: ${esc(company.validity || 30)} días desde la fecha del presupuesto.</p>` : ""}</footer>`;
    const images = [...host.querySelectorAll("img")];
    if (images.length) {
      Promise.all(images.map((img) => img.decode().catch(() => {}))).then(() =>
        window.print(),
      );
      return;
    }
    window.print();
  }
  window.addEventListener("vidres-data-restored", () => {
    draft = null;
  });
  window.vidresQuoteRender = sync;
  window.vidresQuoteClick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.hasAttribute("data-quote-reference")) {
        const image = b.querySelector("img"),
          viewer = document.querySelector("#measure-photo-viewer"),
          enlarged = viewer.querySelector("img");
        enlarged.src = image.src;
        enlarged.alt = image.alt;
        enlarged.style.transform = "scale(1)";
        viewer.showModal();
      } else if (b.id === "quote-measures-retry") {
        await loadMeasurePhotos(b.closest("#quote-measures"));
      } else if (b.id === "quote-new") {
        if (discard()) {
          quickMode = false;
          draft = fresh();
          sync();
        }
      } else if (b.id === "quote-quick") {
        if (discard()) {
          draft = fresh();
          draft.clientSource = "quote";
          quickMode = true;
          sync();
        }
      } else if (b.id === "quick-close") {
        quickMode = false;
        draft = fresh();
        sync();
      } else if (b.id === "quick-copy") {
        updateQuickResult();
        if (!valid(true)) return;
        await copyText(quickMessage());
        alert("Mensaje copiado.");
      } else if (b.id === "quick-whatsapp") {
        updateQuickResult();
        if (!valid(true)) return;
        openQuoteMessage(draft);
      } else if (b.id === "quick-save") {
        await saveDraft();
      } else if (b.id === "quote-settings") {
        fromForm();
        window.vidresNavigate("ajustes-tarifas");
      } else if (b.id === "quote-save") await saveDraft();
      else if (b.id === "quote-whatsapp") {
        fromForm();
        if (valid(true)) openQuoteMessage(draft);
      } else if (b.dataset.whatsapp) {
        const quote = quotes().find((item) => item.id === b.dataset.whatsapp);
        if (quote) openQuoteMessage(quote);
      } else if (b.id === "quote-add") {
        fromForm();
        draft.lines.push(emptyLine());
        sync();
      } else if (b.id === "quote-add-concept") {
        fromForm();
        draft.lines.push({ kind: "concept", description: "", amount: "" });
        sync();
      } else if (b.dataset.remove !== undefined) {
        fromForm();
        if (draft.lines.length > 1)
          draft.lines.splice(Number(b.dataset.remove), 1);
        sync();
      } else if (b.id === "quote-pdf") printQuote();
      else if (b.id === "quote-pdf-internal") printQuote(true);
      else if (b.dataset.load) {
        if (discard()) {
          draft = structuredClone(
            quotes().find((q) => q.id === b.dataset.load),
          );
          sync();
        }
      } else if (b.dataset.deleteQuote) {
        if (confirm("¿Eliminar definitivamente este presupuesto?")) {
          await VSStorage.write(
            Q,
            quotes().filter((q) => q.id !== b.dataset.deleteQuote),
          );
          if (draft?.id === b.dataset.deleteQuote) draft = fresh();
          sync();
        }
      } else if (b.dataset.duplicate) {
        if (discard()) {
          draft = structuredClone(
            quotes().find((q) => q.id === b.dataset.duplicate),
          );
          draft.id = null;
          draft.status = "Borrador";
          draft.date = localToday();
          sync();
        }
      }
    } catch (error) {
      alert(error.message);
    }
  };
  window.vidresQuoteChange = (e) => {
    if (
      e.target.matches(
        "[data-pdf-option], [data-quote-client], #quote-observations",
      )
    ) {
      readDocumentFields();
      return;
    }
    if (quickMode) {
      updateQuickResult();
      if (e.target.closest(".quick-double") || e.target.id === "quick-client")
        sync();
      return;
    }
    fromForm();
    const el = e.target.closest(".quote-line");
    if (el && e.target.dataset.field === "doubleGlazing" && !e.target.checked) {
      const l = draft.lines[Number(el.dataset.line)];
      l.price = "";
      l.glass = "";
      l.tariff = "";
    }
    if (el && ["glass", "tariff"].includes(e.target.dataset.field)) {
      const l = draft.lines[Number(el.dataset.line)],
        t = tariffs().find((t) =>
          e.target.dataset.field === "tariff"
            ? t.id === l.tariff
            : t.name.trim().toLocaleLowerCase("es") ===
              l.glass.trim().toLocaleLowerCase("es"),
        );
      const wasTariff = Boolean(l.tariff);
      l.tariff = t?.id || "";
      if (t) {
        l.glass = t.name;
        l.price = t.price;
        l.edgePrice = t.edge;
        l.tariff = t.id;
      } else if (wasTariff || e.target.dataset.field === "tariff") {
        l.price = "";
        l.edgePrice = "";
      }
    }
    if (
      e.target.id === "quote-job" ||
      [
        "glass",
        "tariff",
        "doubleGlazing",
        "doubleBase",
        "doubleComposition",
        "faceOne",
        "faceTwo",
      ].includes(e.target.dataset.field)
    )
      sync();
    else {
      if (e.target.id === "quote-client")
        document.querySelector(".quote-customer").outerHTML = customerFields();
      window.vidresQuoteInput();
    }
  };
  window.vidresQuoteInput = () => {
    if (quickMode) {
      updateQuickResult();
      return;
    }
    fromForm();
    document.querySelectorAll(".quote-line").forEach((el) => {
      const line = draft.lines[Number(el.dataset.line)];
      if (line.kind !== "concept")
        el.querySelector(".quote-result").innerHTML = lineResult(calc(line));
    });
    const host = document.querySelector(".quote-total-breakdown");
    if (host) host.innerHTML = totalResult(details(draft));
  };
  window.vidresQuotesForJob = (id) =>
    quotes()
      .filter((q) => q.job === id)
      .map((q) => ({
        id: q.id,
        client: q.client,
        date: q.date,
        status: q.status || "Borrador",
        ...sum(q),
        lines: q.lines.length,
      }));
  window.vidresQuoteStartForJob = (id, client, measures) => {
    if (!discard()) return;
    quickMode = false;
    draft = fresh();
    draft.job = id;
    draft.client = client || "";
    if (measures?.length)
      draft.lines = measures.map((m) => ({
        ...emptyLine(),
        w: m.ancho,
        h: m.alto,
        qty: m.cantidad,
        glass: m.tipo,
      }));
    window.vidresQuotePage = "presupuestos";
    window.vidresNavigate("presupuestos");
  };
  window.vidresQuoteOpenSaved = (id) => {
    if (discard()) {
      quickMode = false;
      draft = structuredClone(quotes().find((q) => q.id === id));
      window.vidresQuotePage = "presupuestos";
      window.vidresNavigate("presupuestos");
    }
  };
  window.vidresQuoteWhatsApp = (id) => {
    const quote = quotes().find((item) => item.id === id);
    if (quote) openQuoteMessage(quote);
  };
  const messageDialog = document.querySelector("#quote-message-dialog"),
    messageForm = document.querySelector("#quote-message-form");
  document
    .querySelector("#quote-message-cancel")
    .addEventListener("click", () => messageDialog.close());
  messageForm.addEventListener(
    "submit",
    VSForms.guard(async (event) => {
      event.preventDefault();
      if (!messageTarget || !messageForm.reportValidity()) return;
      const text = messageForm.elements.mensaje.value.trim(),
        phone = phoneForQuote(messageTarget),
        targetId = messageTarget.id;
      window.open(
        "https://wa.me/" + phone + "?text=" + encodeURIComponent(text),
        "_blank",
        "noopener,noreferrer",
      );
      messageDialog.close();
      if (
        messageKind === "quote" &&
        targetId &&
        confirm("¿Marcar este presupuesto como Enviado?")
      ) {
        const today = localToday(),
          followup = addDays(today, Number(config().followupDays) || 4);
        await VSStorage.write(
          Q,
          quotes().map((quote) =>
            quote.id === targetId
              ? {
                  ...quote,
                  status: "Enviado",
                  enviado: today,
                  seguimiento: followup,
                }
              : quote,
          ),
        );
        if (draft?.id === targetId) {
          draft.status = "Enviado";
          draft.enviado = today;
          draft.seguimiento = followup;
        }
        sync();
      }
    }),
  );
  window.vidresQuoteFollowUps = () => {
    const today = localToday();
    return quotes()
      .filter(
        (quote) =>
          (quote.status || "Borrador") === "Enviado" &&
          quote.seguimiento &&
          quote.seguimiento <= today,
      )
      .map((quote) => ({
        id: quote.id,
        client: quote.client,
        sent: quote.enviado || "",
        followup: quote.seguimiento,
        total: sum(quote).total,
        days: quote.enviado
          ? Math.max(
              0,
              Math.floor(
                (new Date(today + "T12:00:00") -
                  new Date(quote.enviado + "T12:00:00")) /
                  86400000,
              ),
            )
          : 0,
      }));
  };
  window.vidresQuoteFollowupWhatsApp = (id) => {
    const quote = quotes().find((item) => item.id === id);
    if (quote) openQuoteMessage(quote, "followup");
  };
  window.vidresQuotePostpone = async (id, days = 3) => {
    const date = addDays(localToday(), days);
    await VSStorage.write(
      Q,
      quotes().map((quote) =>
        quote.id === id ? { ...quote, seguimiento: date } : quote,
      ),
    );
    if (draft?.id === id) draft.seguimiento = date;
  };
  window.vidresQuoteUpdateStatus = async (id, status) => {
    const list = quotes(),
      quote = list.find((item) => item.id === id);
    if (!quote || !statuses.includes(status)) return;
    await VSStorage.write(
      Q,
      list.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    if (draft?.id === id) draft.status = status;
    if (
      status === "Aceptado" &&
      quote.job &&
      confirm("¿Cambiar el trabajo vinculado a En producción?")
    )
      await window.vidresChangeJobStatus?.(quote.job, "En producción");
  };
})();
