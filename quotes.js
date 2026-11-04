"use strict";
(() => {
  const { esc, num, money } = VSUtils;
  const Q = "vs-quote-prototype-v1",
    T = "vs-tariffs-prototype-v1",
    C = "vs-config-v1";
  let draft = null,
    quickMode = false,
    quoteSort = { key: "date", dir: -1 };

  const quotes = () => VSMigrate.list(VSStorage.read(Q, []), config());
  const tariffs = () => VSStorage.read(T, []);
  const config = () => VSStorage.read(C, {});
  const pricing = (q) =>
    q?.pricing || { vat: 21, energyMode: "pending", energy: "" };
  const allLines = (q) => (q?.capitulos || []).flatMap((c) => c.lineas || []);
  const breakdownOf = (q) =>
    VSCalculations.breakdown(allLines(q), {
      ...pricing(q),
      descuentoGlobal: q.descuentoGlobal,
      recargos: q.recargos,
      anticipo: q.anticipo,
    });
  const sum = (q) => {
    const b = breakdownOf(q);
    return { base: b.base, iva: b.totalIva, total: b.total };
  };
  const calcLine = (l) => VSCalculations.calcLine(l, pricing(draft));
  const statuses = ["Borrador", "Enviado", "Aceptado", "Rechazado"];
  const localToday = () => new Date().toLocaleDateString("en-CA");
  function addDays(date, days) {
    const value = new Date(date + "T12:00:00");
    value.setDate(value.getDate() + days);
    return value.toLocaleDateString("en-CA");
  }
  const unit = () => (config().unit === "mm" ? "mm" : "cm");
  const display = (v) => (unit() === "mm" ? String(num(v) * 10) : v);
  const nid = () => crypto.randomUUID();

  const LINE_TYPES = [
    ["vidrio", "Vidrio a medida"],
    ["tratamiento", "Canto o tratamiento"],
    ["mano_obra", "Mano de obra"],
    ["desplazamiento", "Desplazamiento"],
    ["material", "Material"],
    ["servicio", "Servicio (precio cerrado)"],
    ["residuos", "Retirada y residuos"],
    ["texto", "Texto / nota"],
  ];

  // Recargos como texto: una línea por recargo, "Nombre=valor" o "Nombre=€valor".
  function recargosText(recargos) {
    return (recargos || [])
      .map(
        (r) => `${r.nombre || ""}=${r.tipo === "€" ? "€" : ""}${r.valor ?? ""}`,
      )
      .join("\n");
  }
  function parseRecargos(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(.*?)[=:]\s*(€)?\s*([\d.,]+)\s*$/);
        if (m && m[1].trim())
          return {
            nombre: m[1].trim(),
            tipo: m[2] ? "€" : "%",
            valor: m[3].replace(",", "."),
          };
        return null;
      })
      .filter(Boolean);
  }

  // Descuento e IVA propios de una línea.
  function lineExtrasHtml(l) {
    const iva = l.iva == null || l.iva === "" ? "" : String(l.iva);
    return `<div class="quote-line-extras"><label>Dto. %<input type="number" inputmode="decimal" min="0" max="100" step="0.1" data-field="dtovalor" value="${esc(l.descuento?.valor ?? "")}"></label><label>IVA<select data-field="iva">${[
      ["", "Según config."],
      ["21", "21 %"],
      ["10", "10 %"],
      ["0", "0 %"],
    ]
      .map(
        ([v, t]) =>
          `<option value="${v}" ${iva === v ? "selected" : ""}>${t}</option>`,
      )
      .join("")}</select></label></div>`;
  }

  function emptyLine(tipo = "vidrio") {
    const id = "L-" + nid();
    switch (tipo) {
      case "vidrio":
        return {
          id,
          tipo,
          nombre: "",
          w: "",
          h: "",
          qty: 1,
          vidrio: "",
          tariff: "",
          precioM2: "",
          coste: "",
          redondeo: 6,
          minimoM2: "",
          minimoImporte: "",
          espesor: "",
          tratamientos: [],
          descuento: { tipo: "%", valor: 0 },
          iva: null,
          opcional: false,
          alternativa: "",
        };
      case "tratamiento":
        return {
          id,
          tipo,
          nombre: "",
          forma: "ml",
          precio: "",
          cantidad: "",
          opcional: false,
          alternativa: "",
        };
      case "mano_obra":
        return {
          id,
          tipo,
          nombre: "",
          horas: "",
          tarifa: "",
          opcional: false,
          alternativa: "",
        };
      case "desplazamiento":
        return {
          id,
          tipo,
          nombre: "",
          forma: "fijo",
          km: "",
          precio: "",
          opcional: false,
          alternativa: "",
        };
      case "material":
        return {
          id,
          tipo,
          nombre: "",
          cantidad: "",
          precio: "",
          opcional: false,
          alternativa: "",
        };
      case "servicio":
        return {
          id,
          tipo,
          nombre: "",
          precio: "",
          opcional: false,
          alternativa: "",
        };
      case "residuos":
        return {
          id,
          tipo,
          nombre: "",
          precio: "",
          opcional: false,
          alternativa: "",
        };
      case "texto":
        return {
          id,
          tipo,
          nombre: "",
          texto: "",
          opcional: false,
          alternativa: "",
        };
    }
  }
  function emptyChapter(nombre = "") {
    return { id: "C-" + nid(), nombre, lineas: [emptyLine()] };
  }
  function fresh() {
    const c = config();
    return {
      schema: 2,
      id: null,
      version: 1,
      client: "",
      obra: "",
      job: "",
      status: "Borrador",
      date: localToday(),
      validezDias: Number(c.validity || 30),
      caducidad: "",
      pago: "",
      plazo: "",
      notasInternas: "",
      notasCliente: "",
      descuentoGlobal: { tipo: "%", valor: 0 },
      recargos: [],
      anticipo: { tipo: "%", valor: 0 },
      pricing: {
        vat: c.vat ?? 21,
        energy: c.energy || "",
        energyMode: c.energyMode || "pending",
      },
      historial: [],
      capitulos: [emptyChapter()],
    };
  }
  function nextId() {
    const year = new Date().getFullYear(),
      key = "vs-quote-sequence-v1",
      c = VSStorage.read(key, {});
    const prefix = "P-" + year + "-";
    const max = quotes().reduce(
      (n, q) =>
        q.id?.startsWith(prefix)
          ? Math.max(n, Number(q.id.slice(prefix.length)) || 0)
          : n,
      Number(c[year]) || 0,
    );
    c[year] = max + 1;
    VSStorage.write(key, c);
    return prefix + String(max + 1).padStart(4, "0");
  }

  // ------------------------------------------------------------------
  // Render de líneas
  // ------------------------------------------------------------------
  function treatmentRowHtml(t, ci, li, ti) {
    const forma = t.forma || "ml";
    const sides = ["top", "bottom", "left", "right"]
      .map(
        ([v, label]) =>
          `<label><input type="checkbox" data-trt-side="${v}" ${(t.sides || []).includes(v) ? "checked" : ""}>${label}</label>`,
      )
      .join("");
    return `<div class="treatment-row" data-trt="${ti}"><div class="treatment-fields"><label>Tratamiento<input data-trt="nombre" value="${esc(t.nombre || "")}" placeholder="Canto pulido, taladro…"></label><label>Forma<select data-trt="forma">${[
      ["ml", "Por ml (canto)"],
      ["unidad", "Por unidad"],
      ["m2", "Por m²"],
      ["fijo", "Importe fijo"],
    ]
      .map(
        ([v, label]) =>
          `<option value="${v}" ${forma === v ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Precio (€)<input data-trt="precio" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(t.precio ?? "")}"></label>${forma === "unidad" ? `<label>Cantidad<input data-trt="cantidad" type="number" inputmode="numeric" min="1" step="1" value="${esc(t.cantidad ?? 1)}"></label>` : ""}</div>${forma === "ml" ? `<div class="quote-edges">${sides}</div>` : ""}<button type="button" data-trt-remove="${ti}">Quitar</button></div>`;
  }

  function vidrioFields(l, ci, li) {
    return `<div class="quote-fields">${[
      ["w", "Ancho real (" + unit() + ")", display(l.w), "decimal", "0.1"],
      ["h", "Alto real (" + unit() + ")", display(l.h), "decimal", "0.1"],
      ["qty", "Cantidad", l.qty ?? 1, "numeric", "1"],
    ]
      .map(
        ([k, label, v, mode, step]) =>
          `<label>${label}<input type="number" inputmode="${mode}" min="0" step="${step}" data-field="${k}" value="${esc(v)}"></label>`,
      )
      .join(
        "",
      )}<label>Vidrio<select data-field="tariff"><option value="">Selecciona una tarifa</option>${tariffs()
      .map(
        (t) =>
          `<option value="${esc(t.id)}" ${l.tariff === t.id ? "selected" : ""}>${esc(t.name)} · ${money(t.price)}/m²</option>`,
      )
      .join(
        "",
      )}</select></label><label>Precio (€/m²)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="precioM2" value="${esc(l.precioM2)}"></label><label>Redondeo<select data-field="redondeo">${[
      [6, "6 cm"],
      [5, "5 cm"],
      [10, "10 cm"],
      [0, "Sin redondeo"],
    ]
      .map(
        ([v, label]) =>
          `<option value="${v}" ${Number(l.redondeo ?? 6) === Number(v) ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Mínimo (m²)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="minimoM2" value="${esc(l.minimoM2)}"></label><label>Mínimo (€)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="minimoImporte" value="${esc(l.minimoImporte)}"></label><label>Espesor (mm)<input type="number" inputmode="decimal" min="0" step="0.1" data-field="espesor" value="${esc(l.espesor)}"></label></div><div class="treatments"><div class="quote-lines-heading"><h3>Tratamientos</h3><button type="button" class="btn-secondary" data-trt-add="${ci}-${li}">+ Tratamiento</button></div>${(
      l.tratamientos || []
    )
      .map((t, ti) => treatmentRowHtml(t, ci, li, ti))
      .join("")}</div>`;
  }

  function lineFieldsHtml(l, ci, li) {
    const tipo = l.tipo || "vidrio";
    if (tipo === "vidrio") return vidrioFields(l, ci, li);
    const nom = `<label>Nombre<input data-field="nombre" value="${esc(l.nombre || "")}" placeholder="Descripción"></label>`;
    switch (tipo) {
      case "tratamiento":
        return `<div class="quote-fields">${nom}<label>Forma<select data-field="forma">${[
          ["ml", "Por ml"],
          ["unidad", "Por unidad"],
          ["m2", "Por m²"],
          ["fijo", "Importe fijo"],
        ]
          .map(
            ([v, label]) =>
              `<option value="${v}" ${(l.forma || "ml") === v ? "selected" : ""}>${label}</option>`,
          )
          .join(
            "",
          )}</select></label><label>Precio (€)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="precio" value="${esc(l.precio)}"></label><label>Cantidad<input type="number" inputmode="decimal" min="0" step="0.01" data-field="cantidad" value="${esc(l.cantidad)}"></label></div>`;
      case "mano_obra":
        return `<div class="quote-fields">${nom}<label>Horas<input type="number" inputmode="decimal" min="0" step="0.25" data-field="horas" value="${esc(l.horas)}"></label><label>Tarifa (€/h)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="tarifa" value="${esc(l.tarifa)}"></label></div>`;
      case "desplazamiento":
        return `<div class="quote-fields">${nom}<label>Forma<select data-field="forma">${[
          ["fijo", "Importe fijo"],
          ["km", "Por km"],
        ]
          .map(
            ([v, label]) =>
              `<option value="${v}" ${(l.forma || "fijo") === v ? "selected" : ""}>${label}</option>`,
          )
          .join(
            "",
          )}</select></label>${(l.forma || "fijo") === "km" ? `<label>Kilómetros<input type="number" inputmode="decimal" min="0" step="0.1" data-field="km" value="${esc(l.km)}"></label>` : ""}<label>Precio (€)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="precio" value="${esc(l.precio)}"></label></div>`;
      case "material":
        return `<div class="quote-fields">${nom}<label>Cantidad<input type="number" inputmode="decimal" min="0" step="0.01" data-field="cantidad" value="${esc(l.cantidad)}"></label><label>Precio (€/ud)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="precio" value="${esc(l.precio)}"></label></div>`;
      case "servicio":
      case "residuos":
        return `<div class="quote-fields">${nom}<label>Precio (€)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="precio" value="${esc(l.precio)}"></label></div>`;
      case "texto":
        return `<div class="quote-fields">${nom}<label>Texto<textarea data-field="texto" rows="2">${esc(l.texto || "")}</textarea></label></div>`;
    }
  }

  function resultHtml(l) {
    const r = calcLine(l);
    if (r.tipo === "texto") return "";
    if (r.tipo === "vidrio") {
      const parts = [];
      parts.push(`Real: ${r.w} × ${r.h} cm · ${r.real.toFixed(4)} m²`);
      parts.push(`Aplicada: ${r.aw} × ${r.ah} cm · ${r.area.toFixed(4)} m²`);
      if (r.facturable !== r.area)
        parts.push(`Facturable: ${r.facturable.toFixed(4)} m²`);
      parts.push(`Unidades: ${r.qty} · Importe: ${money(r.total)}`);
      if (r.peso > 0) parts.push(`Peso: ${r.peso.toFixed(1)} kg`);
      if (r.energy) parts.push(`Recargo energético: ${money(r.energy)}`);
      return `<div class="quote-result">${parts.join("<br>")}</div>`;
    }
    return `<div class="quote-result">Importe: ${money(r.total)}</div>`;
  }

  function lineHtml(l, ci, li) {
    const tipo = l.tipo || "vidrio";
    const tag =
      tipo === "texto"
        ? "Texto"
        : LINE_TYPES.find(([v]) => v === tipo)?.[1] || "Línea";
    return `<div class="quote-line" data-chapter="${ci}" data-line="${li}"><div class="quote-line-head"><strong>${esc(l.nombre || tag)}</strong><div class="quote-line-tools"><label class="mini"><input type="checkbox" data-line-opcional ${l.opcional ? "checked" : ""}>Opcional</label><label class="mini">Alt.<select data-line-alternativa><option value="">—</option><option value="A" ${l.alternativa === "A" ? "selected" : ""}>A</option><option value="B" ${l.alternativa === "B" ? "selected" : ""}>B</option></select></label><button type="button" data-line-dup="${ci}-${li}">Duplicar</button><button type="button" data-line-up="${ci}-${li}">↑</button><button type="button" data-line-down="${ci}-${li}">↓</button><button type="button" data-line-del="${ci}-${li}">Eliminar</button></div></div><div class="quote-fields"><label>Tipo<select data-line-tipo>${LINE_TYPES.map(
      ([v, label]) =>
        `<option value="${v}" ${tipo === v ? "selected" : ""}>${label}</option>`,
    ).join(
      "",
    )}</select></label></div>${lineFieldsHtml(l, ci, li)}${lineExtrasHtml(l)}${resultHtml(l)}</div>`;
  }

  function chapterHtml(cap, ci) {
    return `<section class="quote-chapter" data-chapter="${ci}"><div class="quote-chapter-head"><input class="chapter-name" data-chapter-name value="${esc(cap.nombre || "")}" placeholder="Capítulo (ej. Mampara baño)"><div class="chapter-subtotal">${money(
      VSCalculations.quoteTotals(cap.lineas || [], pricing(draft)).base,
    )}</div><button type="button" data-chapter-del="${ci}">Eliminar capítulo</button></div>${(
      cap.lineas || []
    )
      .map((l, li) => lineHtml(l, ci, li))
      .join(
        "",
      )}<button type="button" class="btn-secondary" data-line-add="${ci}">+ Añadir línea</button></section>`;
  }

  function totalsHtml() {
    const b = breakdownOf(draft);
    let html = `Base imponible: <strong>${money(b.base)}</strong>`;
    if (b.descuentoGlobal > 0)
      html += `<br>Descuento global: <strong>−${money(b.descuentoGlobal)}</strong>`;
    b.recargos.forEach((r) => {
      html += `<br>${esc(r.nombre)}: <strong>+${money(r.importe)}</strong>`;
    });
    html += `<br>IVA: <strong>${money(b.totalIva)}</strong>`;
    const tipos = Object.keys(b.ivaPorTipo);
    if (tipos.length > 1)
      for (const k of tipos)
        html += `<br><span class="muted">· ${k} %: ${money(b.ivaPorTipo[k].iva)}</span>`;
    html += `<br>Total con IVA: <strong class="quote-grand-total">${money(b.total)}</strong>`;
    if (b.anticipo > 0)
      html += `<br>Anticipo: <strong>${money(b.anticipo)}</strong> · Pendiente: <strong>${money(b.pendiente)}</strong>`;
    const coste = VSCalculations.costeTotal(allLines(draft), pricing(draft));
    if (coste > 0) {
      const m = VSCalculations.margen(b.total, coste);
      html += `<br><span class="muted">Solo interno · Coste: ${money(coste)} · Margen: ${money(m.enEuros)} (${m.enPct} %)</span>`;
    }
    return html;
  }
  function updateTotals() {
    const host = document.querySelector(".quote-total-breakdown");
    if (host) host.innerHTML = totalsHtml();
  }
  function updateAllResults() {
    document.querySelectorAll(".quote-line").forEach((el) => {
      const ci = Number(el.dataset.chapter),
        li = Number(el.dataset.line);
      const l = draft.capitulos?.[ci]?.lineas?.[li];
      if (!l) return;
      const host = el.querySelector(".quote-result");
      if (host) host.outerHTML = resultHtml(l);
    });
    updateTotals();
  }

  function quoteListHtml() {
    const list = quotes();
    const sorted = list.slice().sort((a, b) => {
      const { key, dir } = quoteSort;
      if (key === "total") return (sum(a).total - sum(b).total) * dir;
      const av = a[key] || "",
        bv = b[key] || "";
      return String(av).localeCompare(String(bv), "es") * dir;
    });
    const arrow = (k) =>
      quoteSort.key === k
        ? quoteSort.dir === 1
          ? ' class="asc"'
          : ' class="desc"'
        : "";
    const table =
      '<div class="quote-table-wrap desktop-only"><table class="sortable"><thead><tr>' +
      '<th data-quote-sort="id"' +
      arrow("id") +
      ">Referencia</th>" +
      '<th data-quote-sort="client"' +
      arrow("client") +
      ">Cliente</th>" +
      '<th data-quote-sort="status"' +
      arrow("status") +
      ">Estado</th>" +
      '<th data-quote-sort="date"' +
      arrow("date") +
      ">Fecha</th>" +
      '<th data-quote-sort="total"' +
      arrow("total") +
      ">Total</th>" +
      "<th></th></tr></thead><tbody>" +
      (sorted.length
        ? sorted
            .map(
              (q) =>
                "<tr><td>" +
                esc(q.id) +
                (q.version > 1 ? " v" + q.version : "") +
                "</td><td>" +
                esc(q.client) +
                "</td><td>" +
                esc(q.status || "Borrador") +
                "</td><td>" +
                esc(q.date || "—") +
                "</td><td>" +
                money(sum(q).total) +
                '</td><td class="quote-row-actions"><button type="button" data-load="' +
                esc(q.id) +
                '">Abrir</button><button type="button" data-version="' +
                esc(q.id) +
                '">Versión</button><button type="button" data-whatsapp="' +
                esc(q.id) +
                '">WhatsApp</button><button type="button" data-duplicate="' +
                esc(q.id) +
                '">Duplicar</button><button type="button" data-delete-quote="' +
                esc(q.id) +
                '">Eliminar</button></td></tr>',
            )
            .join("")
        : '<tr><td colspan="6" class="muted">Todavía no hay presupuestos. Crea el primero.</td></tr>') +
      "</tbody></table></div>";
    const cards =
      '<div class="mobile-only">' +
      (list.length
        ? list
            .map(
              (q) =>
                `<article class="quote-saved"><span>${esc(q.id)}${q.version > 1 ? " v" + q.version : ""} · ${esc(q.client)} · ${esc(q.status || "Borrador")} · Total: ${money(sum(q).total)}</span><div><button type="button" data-load="${esc(q.id)}">Abrir</button><button type="button" data-version="${esc(q.id)}">Versión</button><button type="button" data-whatsapp="${esc(q.id)}">WhatsApp</button><button type="button" data-duplicate="${esc(q.id)}">Duplicar</button><button type="button" data-delete-quote="${esc(q.id)}">Eliminar</button></div></article>`,
            )
            .join("")
        : "<p>Todavía no hay presupuestos. Crea el primero.</p>") +
      "</div>";
    return table + cards;
  }
  function renderQuoteList() {
    const host = document.querySelector("#quote-list");
    if (host) host.innerHTML = quoteListHtml();
  }

  // ------------------------------------------------------------------
  // Render principal
  // ------------------------------------------------------------------
  function sync() {
    if (!draft) draft = fresh();
    if (quickMode) {
      quickSync();
      return;
    }
    const list = quotes(),
      jobs = window.vidresGetJobs?.() || [];
    document.querySelector("#content").innerHTML =
      `<div class="quote-toolbar"><button type="button" class="quick-quote-button" id="quote-quick">${VSIcons.icon("chispa", 18)} Presupuesto rápido</button><button type="button" class="primary" id="quote-new">${VSIcons.icon("anadir", 18)} Nuevo presupuesto</button><button type="button" id="quote-settings">Ajustes de tarifas</button></div>
 <section class="panel quote-editor"><div class="quote-section-heading"><div><p class="quote-eyebrow">PRESUPUESTO</p><h2>${esc(draft.id || "Sin guardar")}${draft.version > 1 ? " · v" + draft.version : ""}</h2></div></div>
 <div class="quote-fields"><label>Cliente<input id="quote-client" maxlength="100" value="${esc(draft.client)}"></label><label>Dirección de obra<input id="quote-obra" maxlength="180" value="${esc(draft.obra)}"></label><label>Parte relacionado<select id="quote-job"><option value="">Sin vincular</option>${jobs.map((j) => `<option value="${esc(j.id)}" ${draft.job === j.id ? "selected" : ""}>${esc(j.id + " · " + j.cliente)}</option>`).join("")}</select></label><label>Estado<select id="quote-status">${statuses.map((s) => `<option ${s === (draft.status || "Borrador") ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Fecha<input id="quote-date" type="date" value="${esc(draft.date)}"></label><label>Validez (días)<input id="quote-validez" type="number" inputmode="numeric" min="1" max="365" step="1" value="${esc(draft.validezDias ?? 30)}"></label><label>Forma de pago<input id="quote-pago" maxlength="180" value="${esc(draft.pago)}" placeholder="50 % al aceptar…"></label><label>Plazo de entrega<input id="quote-plazo" maxlength="180" value="${esc(draft.plazo)}" placeholder="10 días laborables"></label></div>
 <details class="quote-notes"><summary>Notas y condiciones</summary><div class="quote-fields"><label>Notas para el cliente (salen en el PDF)<textarea id="quote-notas-cliente" rows="2" maxlength="1000">${esc(draft.notasCliente)}</textarea></label><label>Notas internas (no salen en el PDF)<textarea id="quote-notas-internas" rows="2" maxlength="1000">${esc(draft.notasInternas)}</textarea></label></div></details>
 <details class="quote-notes"><summary>Descuentos, recargos y anticipo</summary><div class="quote-fields"><label>Descuento global (%)<input id="quote-dto-global" type="number" inputmode="decimal" min="0" max="100" step="0.1" value="${esc(draft.descuentoGlobal?.valor || "")}"></label><label>Anticipo (%)<input id="quote-anticipo" type="number" inputmode="decimal" min="0" max="100" step="0.1" value="${esc(draft.anticipo?.valor || "")}"></label><label>Recargos (uno por línea: «Nombre=10» o «Nombre=€50»)<textarea id="quote-recargos" rows="3">${esc(recargosText(draft.recargos))}</textarea></label></div></details>
 <div id="quote-chapters">${draft.capitulos.map((c, i) => chapterHtml(c, i)).join("")}</div><button type="button" class="btn-secondary" id="chapter-add">+ Añadir capítulo</button>
 <div class="quote-total"><div class="quote-total-breakdown">${totalsHtml()}</div></div><div class="quote-toolbar"><button type="button" class="primary" id="quote-save">Guardar presupuesto</button><button type="button" id="quote-whatsapp">Enviar por WhatsApp</button><button type="button" id="quote-pdf">Imprimir / Guardar PDF</button></div></section>
 <section class="panel"><h2>Presupuestos guardados</h2><div id="quote-list">${quoteListHtml()}</div></section>`;
  }

  function quickSync() {
    const line = draft.capitulos[0]?.lineas[0] || emptyLine(),
      result = calcLine(line),
      total = sum(draft),
      names = [
        ...new Set([
          ...(window.vidresGetJobs?.() || []).map((job) => job.cliente),
          ...VSStorage.read("vidres-clientes-v1", []).map((c) => c.nombre),
        ]),
      ].filter(Boolean);
    document.querySelector("#content").innerHTML = `
      <div class="quote-toolbar"><button type="button" id="quick-close">← Volver a presupuestos</button></div>
      <section class="panel quick-quote-editor">
        <h2>Presupuesto rápido</h2>
        <p class="muted">Calcula un precio sin crear antes un parte.</p>
        <div class="quote-fields">
          <label>Cliente (opcional)<input id="quick-client" list="quick-quote-clients" maxlength="100" value="${esc(draft.client)}"></label>
          <datalist id="quick-quote-clients">${names.map((name) => `<option value="${esc(name)}"></option>`).join("")}</datalist>
          <label>Ancho (${unit()})<input id="quick-w" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(display(line.w))}"></label>
          <label>Alto (${unit()})<input id="quick-h" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(display(line.h))}"></label>
          <label>Cantidad<input id="quick-qty" type="number" inputmode="numeric" min="1" step="1" value="${esc(line.qty || 1)}"></label>
          <label>Tipo de vidrio<select id="quick-glass"><option value="">Selecciona una tarifa</option>${tariffs()
            .map(
              (tariff) =>
                `<option value="${esc(tariff.id)}" ${line.tariff === tariff.id ? "selected" : ""}>${esc(tariff.name)} · ${money(tariff.price)}/m²</option>`,
            )
            .join("")}</select></label>
        </div>
        <div id="quick-result" class="quote-result quick-result">${quickResultHtml(result, total)}</div>
        <div class="quote-toolbar"><button type="button" id="quick-copy">Copiar mensaje</button><button type="button" id="quick-whatsapp">Enviar por WhatsApp</button><button type="button" class="primary" id="quick-save">Guardar como presupuesto</button></div>
      </section>`;
  }
  function quickResultHtml(result, total) {
    if (result.tipo === "vidrio")
      return `Medida real: ${result.w} × ${result.h} cm<br>Medida aplicada: ${result.aw} × ${result.ah} cm<br>Superficie aplicada: ${result.area.toFixed(4)} m² por pieza<br>Base: <strong>${money(total.base)}</strong><br>IVA (${esc(pricing(draft).vat ?? 21)} %): <strong>${money(total.iva)}</strong><br>Total: <strong class="quote-grand-total">${money(total.total)}</strong>`;
    return `Base: <strong>${money(total.base)}</strong><br>IVA (${esc(pricing(draft).vat ?? 21)} %): <strong>${money(total.iva)}</strong><br>Total: <strong class="quote-grand-total">${money(total.total)}</strong>`;
  }
  function readQuickForm() {
    const line = draft.capitulos[0].lineas[0] || emptyLine(),
      client = document.querySelector("#quick-client"),
      width = document.querySelector("#quick-w");
    if (!client || !width) return;
    draft.client = client.value.trim();
    line.w =
      unit() === "mm" ? String(num(width.value) / 10) : width.value.trim();
    line.h =
      unit() === "mm"
        ? String(num(document.querySelector("#quick-h").value) / 10)
        : document.querySelector("#quick-h").value.trim();
    line.qty = document.querySelector("#quick-qty").value;
    const tariff = tariffs().find(
      (item) => item.id === document.querySelector("#quick-glass").value,
    );
    line.tariff = tariff?.id || "";
    line.vidrio = tariff?.name || "";
    line.precioM2 = tariff?.price ?? "";
    draft.capitulos[0].lineas = [line];
  }
  function updateQuickResult() {
    readQuickForm();
    const host = document.querySelector("#quick-result");
    if (host)
      host.innerHTML = quickResultHtml(
        calcLine(draft.capitulos[0].lineas[0]),
        sum(draft),
      );
  }

  // ------------------------------------------------------------------
  // Leer formulario
  // ------------------------------------------------------------------
  function val(sel) {
    return document.querySelector(sel)?.value ?? "";
  }
  function fromForm() {
    if (!draft || !document.querySelector("#quote-client")) return;
    draft.client = val("#quote-client").trim();
    draft.obra = val("#quote-obra").trim();
    draft.job = val("#quote-job");
    draft.status = val("#quote-status");
    draft.date = val("#quote-date");
    draft.validezDias = num(val("#quote-validez")) || 30;
    draft.pago = val("#quote-pago").trim();
    draft.plazo = val("#quote-plazo").trim();
    draft.notasInternas = val("#quote-notas-internas").trim();
    draft.notasCliente = val("#quote-notas-cliente").trim();
    draft.descuentoGlobal = { tipo: "%", valor: val("#quote-dto-global") };
    draft.anticipo = { tipo: "%", valor: val("#quote-anticipo") };
    draft.recargos = parseRecargos(val("#quote-recargos"));
    document.querySelectorAll(".quote-chapter").forEach((ch) => {
      const ci = Number(ch.dataset.chapter);
      const cap = draft.capitulos[ci];
      if (!cap) return;
      cap.nombre = ch.querySelector("[data-chapter-name]")?.value.trim() || "";
      ch.querySelectorAll(".quote-line").forEach((el) => {
        const li = Number(el.dataset.line);
        const l = cap.lineas[li];
        if (!l) return;
        l.tipo = el.querySelector("[data-line-tipo]")?.value || "vidrio";
        el.querySelectorAll("[data-field]").forEach((input) => {
          const k = input.dataset.field;
          if (k === "w" || k === "h")
            l[k] =
              unit() === "mm" ? String(num(input.value) / 10) : input.value;
          else if (k === "dtovalor")
            l.descuento = { tipo: "%", valor: input.value };
          else if (k === "iva")
            l.iva = input.value === "" ? null : Number(input.value);
          else l[k] = input.value;
        });
        l.opcional = el.querySelector("[data-line-opcional]")?.checked || false;
        l.alternativa =
          el.querySelector("[data-line-alternativa]")?.value || "";
        if (l.tipo === "vidrio") {
          l.tratamientos = [...el.querySelectorAll(".treatment-row")].map(
            (row, ti) => {
              const forma =
                row.querySelector('[data-trt="forma"]')?.value || "ml";
              const t = {
                id: l.tratamientos?.[ti]?.id || "T-" + nid(),
                nombre:
                  row.querySelector('[data-trt="nombre"]')?.value.trim() || "",
                forma,
                precio: row.querySelector('[data-trt="precio"]')?.value ?? "",
              };
              if (forma === "ml")
                t.sides = [
                  ...row.querySelectorAll("[data-trt-side]:checked"),
                ].map((x) => x.dataset.trtSide);
              else
                t.cantidad =
                  row.querySelector('[data-trt="cantidad"]')?.value ?? "";
              return t;
            },
          );
        }
      });
    });
  }

  function valid(print = false) {
    if (!draft.client.trim() && !quickMode) {
      VSUI.toast("Indica el cliente del presupuesto.", "warn");
      return false;
    }
    const lines = allLines(draft).filter((l) => l.tipo !== "texto");
    if (!lines.length) {
      VSUI.toast("Añade al menos una línea con importe.", "warn");
      return false;
    }
    return true;
  }
  async function discard() {
    fromForm();
    if (!draft) return true;
    const old = quotes().find((q) => q.id === draft.id);
    if (!old && !draft.client && !draft.job && !draft.capitulos[0]?.nombre) {
      const l = draft.capitulos[0]?.lineas?.[0];
      if (l && !l.w && !l.h && !l.nombre && !l.precio && !l.precioM2)
        return true;
    }
    if (JSON.stringify(old || fresh()) === JSON.stringify(draft)) return true;
    return VSUI.confirm({
      titulo: "Descartar cambios",
      texto: "¿Descartar los cambios del presupuesto sin guardar?",
      aceptar: "Descartar",
      cancelar: "Cancelar",
    });
  }
  async function saveDraft() {
    fromForm();
    if (quickMode) readQuickForm();
    if (quickMode && !draft.client.trim()) draft.client = "Sin cliente";
    if (!valid()) return;
    const task = async () => {
      const list = quotes(),
        old = list.find((q) => q.id === draft.id);
      if (!draft.id) draft.id = nextId();
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
      VSStorage.write(Q, list);
      if (
        copy.status === "Aceptado" &&
        old?.status !== "Aceptado" &&
        copy.job &&
        (await VSUI.confirm({
          titulo: "Trabajo aceptado",
          texto: "¿Cambiar el trabajo vinculado a En producción?",
          aceptar: "Cambiar",
          cancelar: "Cancelar",
        }))
      )
        window.vidresChangeJobStatus?.(copy.job, "En producción");
      quickMode = false;
      sync();
    };
    try {
      if (navigator.locks) await navigator.locks.request("vidres-quotes", task);
      else await task();
    } catch (e) {
      VSUI.toast("No se pudo guardar el presupuesto: " + e.message, "error");
    }
  }

  // ------------------------------------------------------------------
  // Mensaje de WhatsApp e impresión
  // ------------------------------------------------------------------
  function lineText(l, pr) {
    const r = VSCalculations.calcLine(l, pr);
    if (l.tipo === "texto") return "• " + (l.nombre || l.texto || "Nota");
    if (l.tipo === "vidrio")
      return `• ${l.nombre || l.vidrio || "Vidrio"} ${r.w}×${r.h} cm (${r.qty} ud.): ${money(r.total)}`;
    return `• ${l.nombre || LINE_TYPES.find(([v]) => v === l.tipo)?.[1] || ""}: ${money(r.total)}`;
  }
  function messageQuote(q) {
    const c = config(),
      company = c.company || {},
      totals = sum(q),
      pr = pricing(q),
      detail = q.capitulos
        .flatMap((cap) =>
          cap.nombre
            ? ["— " + cap.nombre].concat(
                (cap.lineas || []).map((l) => lineText(l, pr)),
              )
            : (cap.lineas || []).map((l) => lineText(l, pr)),
        )
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
        validez: q.validezDias ?? company.validity ?? 30,
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
  function printQuote() {
    fromForm();
    const c = config(),
      company = c.company || {},
      job = window.vidresGetJobs?.().find((j) => j.id === draft.job),
      client =
        VSStorage.read("vidres-clientes-v1", []).find(
          (x) =>
            String(x.nombre).trim().toLocaleLowerCase("es") ===
            draft.client.trim().toLocaleLowerCase("es"),
        ) || {};
    let host = document.querySelector("#quote-print");
    if (!host) {
      host = document.createElement("section");
      host.id = "quote-print";
      document.body.appendChild(host);
    }
    const t = sum(draft);
    const rows = draft.capitulos
      .flatMap((cap) =>
        (cap.nombre
          ? [
              `<tr class="print-chapter"><td colspan="5">${esc(cap.nombre)}</td></tr>`,
            ]
          : []
        ).concat(
          (cap.lineas || []).map((l) => {
            const r = VSCalculations.calcLine(l, pricing(draft));
            if (l.tipo === "texto")
              return `<tr><td colspan="4">${esc(l.nombre || l.texto || "")}</td><td></td></tr>`;
            if (l.tipo === "vidrio")
              return `<tr><td>${esc(l.nombre || l.vidrio || "Vidrio")}</td><td>${l.qty}</td><td>${r.aw} × ${r.ah} cm</td><td>${r.area.toFixed(4)} m²</td><td>${money(r.total)}</td></tr>`;
            return `<tr><td>${esc(l.nombre || "")}</td><td></td><td></td><td></td><td>${money(r.total)}</td></tr>`;
          }),
        ),
      )
      .join("");
    host.innerHTML = `<h1>${esc(company.name || "Vidres Sosa")} · Presupuesto</h1><p>${[company.taxId, company.address, company.phone, company.email].filter(Boolean).map(esc).join("<br>")}</p><p>Referencia: ${esc(draft.id || "Borrador")}${draft.version > 1 ? " v" + draft.version : ""}<br>Fecha: ${esc(draft.date)}<br>Cliente: ${esc(draft.client)}<br>${esc(draft.obra || client.direccion || job?.direccion || "")}</p><table><thead><tr><th>Concepto</th><th>Uds.</th><th>Medida aplicada</th><th>m²</th><th>Importe</th></tr></thead><tbody>${rows}</tbody></table><p>Base: ${money(t.base)}<br>IVA (${esc(pricing(draft).vat ?? 21)} %): ${money(t.iva)}<br><strong>Total: ${money(t.total)}</strong></p>${draft.notasCliente ? `<p>${esc(draft.notasCliente).replace(/\n/g, "<br>")}</p>` : ""}<p>${esc(company.conditions || "").replace(/\n/g, "<br>")}</p><p>Validez: ${esc(draft.validezDias ?? 30)} días desde la fecha del presupuesto.</p>`;
    window.print();
  }

  window.addEventListener("vidres-data-restored", () => {
    draft = null;
  });
  window.vidresQuoteRender = sync;
  window.vidresQuoteClick = async (e) => {
    const sortTh = e.target.closest("th[data-quote-sort]");
    if (sortTh) {
      const key = sortTh.dataset.quoteSort;
      if (quoteSort.key === key) quoteSort.dir = -quoteSort.dir;
      else quoteSort = { key, dir: 1 };
      renderQuoteList();
      return;
    }
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.id === "quote-new") {
        if (await discard()) {
          quickMode = false;
          draft = fresh();
          sync();
        }
      } else if (b.id === "quote-quick") {
        if (await discard()) {
          draft = fresh();
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
        await copyText(messageQuote(draft));
        VSUI.toast("Mensaje copiado.", "ok");
      } else if (b.id === "quick-whatsapp") {
        updateQuickResult();
        if (!valid(true)) return;
        openQuoteMessage(draft);
      } else if (b.id === "quick-save") {
        await saveDraft();
      } else if (b.id === "quote-settings") {
        fromForm();
        window.vidresNavigate("ajustes");
      } else if (b.id === "quote-save") await saveDraft();
      else if (b.id === "quote-whatsapp") {
        fromForm();
        if (valid(true)) openQuoteMessage(draft);
      } else if (b.id === "chapter-add") {
        fromForm();
        draft.capitulos.push(emptyChapter());
        sync();
      } else if (b.dataset.chapterDel !== undefined) {
        fromForm();
        if (draft.capitulos.length > 1) {
          draft.capitulos.splice(Number(b.dataset.chapterDel), 1);
          sync();
        } else
          VSUI.toast("El presupuesto necesita al menos un capítulo.", "warn");
      } else if (b.dataset.lineAdd !== undefined) {
        fromForm();
        const ci = Number(b.dataset.lineAdd);
        draft.capitulos[ci]?.lineas.push(emptyLine());
        sync();
      } else if (b.dataset.lineDel !== undefined) {
        fromForm();
        const [ci, li] = b.dataset.lineDel.split("-").map(Number);
        const cap = draft.capitulos[ci];
        if (cap && cap.lineas.length > 1) {
          cap.lineas.splice(li, 1);
          sync();
        } else VSUI.toast("El capítulo necesita al menos una línea.", "warn");
      } else if (b.dataset.lineDup !== undefined) {
        fromForm();
        const [ci, li] = b.dataset.lineDup.split("-").map(Number);
        const cap = draft.capitulos[ci];
        if (cap?.lineas[li]) {
          const copy = structuredClone(cap.lineas[li]);
          copy.id = "L-" + nid();
          cap.lineas.splice(li + 1, 0, copy);
          sync();
        }
      } else if (b.dataset.lineUp !== undefined) {
        fromForm();
        const [ci, li] = b.dataset.lineUp.split("-").map(Number);
        const cap = draft.capitulos[ci];
        if (cap && li > 0) {
          [cap.lineas[li - 1], cap.lineas[li]] = [
            cap.lineas[li],
            cap.lineas[li - 1],
          ];
          sync();
        }
      } else if (b.dataset.lineDown !== undefined) {
        fromForm();
        const [ci, li] = b.dataset.lineDown.split("-").map(Number);
        const cap = draft.capitulos[ci];
        if (cap && li < cap.lineas.length - 1) {
          [cap.lineas[li + 1], cap.lineas[li]] = [
            cap.lineas[li],
            cap.lineas[li + 1],
          ];
          sync();
        }
      } else if (b.dataset.trtAdd !== undefined) {
        fromForm();
        const [ci, li] = b.dataset.trtAdd.split("-").map(Number);
        const l = draft.capitulos[ci]?.lineas?.[li];
        if (l && l.tipo === "vidrio") {
          l.tratamientos.push({
            id: "T-" + nid(),
            nombre: "Canto",
            forma: "ml",
            precio: "",
            sides: [],
          });
          sync();
        }
      } else if (b.dataset.trtRemove !== undefined) {
        fromForm();
        const row = b.closest(".treatment-row");
        const lineEl = row?.closest(".quote-line");
        const ci = Number(lineEl?.dataset.chapter),
          li = Number(lineEl?.dataset.line);
        const l = draft.capitulos[ci]?.lineas?.[li];
        if (l) l.tratamientos.splice(Number(b.dataset.trtRemove), 1);
        sync();
      } else if (b.dataset.whatsapp) {
        const quote = quotes().find((item) => item.id === b.dataset.whatsapp);
        if (quote) openQuoteMessage(quote);
      } else if (b.id === "quote-pdf") printQuote();
      else if (b.dataset.load) {
        if (await discard()) {
          draft = structuredClone(
            quotes().find((q) => q.id === b.dataset.load),
          );
          sync();
        }
      } else if (b.dataset.version) {
        if (await discard()) {
          const src = quotes().find((q) => q.id === b.dataset.version);
          draft = structuredClone(src);
          draft.id = null;
          draft.version = (src?.version || 1) + 1;
          draft.status = "Borrador";
          draft.date = localToday();
          draft.historial = src?.historial || [];
          sync();
          VSUI.toast("Nueva versión creada (v" + draft.version + ").", "ok");
        }
      } else if (b.dataset.deleteQuote) {
        if (
          await VSUI.confirm({
            titulo: "Eliminar presupuesto",
            texto: "¿Eliminar definitivamente este presupuesto?",
            aceptar: "Eliminar presupuesto",
            cancelar: "Cancelar",
            peligro: true,
          })
        ) {
          VSStorage.write(
            Q,
            quotes().filter((q) => q.id !== b.dataset.deleteQuote),
          );
          if (draft?.id === b.dataset.deleteQuote) draft = fresh();
          sync();
        }
      } else if (b.dataset.duplicate) {
        if (await discard()) {
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
      VSUI.toast(error.message, "error");
    }
  };
  window.vidresQuoteChange = (e) => {
    if (quickMode) {
      updateQuickResult();
      return;
    }
    fromForm();
    const el = e.target.closest(".quote-line");
    if (el && e.target.dataset.field === "tariff") {
      const ci = Number(el.dataset.chapter),
        li = Number(el.dataset.line);
      const l = draft.capitulos[ci]?.lineas?.[li];
      const t = tariffs().find((item) => item.id === e.target.value);
      if (l && t) {
        l.tariff = t.id;
        l.vidrio = t.name;
        l.precioM2 = t.price;
        l.coste = t.coste;
        l.redondeo = t.redondeo ?? 6;
        l.minimoM2 = t.minimoM2 ?? "";
        l.espesor = t.espesor ?? "";
        const priceInput = el.querySelector('[data-field="precioM2"]');
        if (priceInput) priceInput.value = l.precioM2 ?? "";
        const redInput = el.querySelector('[data-field="redondeo"]');
        if (redInput) redInput.value = String(l.redondeo ?? 6);
        const esInput = el.querySelector('[data-field="espesor"]');
        if (esInput) esInput.value = l.espesor ?? "";
      }
    }
    if (el && e.target.dataset.lineTipo) {
      const ci = Number(el.dataset.chapter),
        li = Number(el.dataset.line);
      const l = draft.capitulos[ci]?.lineas?.[li];
      if (l) {
        const next = emptyLine(e.target.value);
        next.id = l.id;
        next.nombre = l.nombre;
        next.opcional = l.opcional;
        next.alternativa = l.alternativa;
        draft.capitulos[ci].lineas[li] = next;
        sync();
        return;
      }
    }
    updateAllResults();
  };
  window.vidresQuoteInput = () => {
    if (quickMode) {
      updateQuickResult();
      return;
    }
    if (!draft) return;
    fromForm();
    updateAllResults();
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
        lines: allLines(q).length,
      }));
  window.vidresQuoteStartForJob = async (id, client, measures) => {
    if (!(await discard())) return;
    draft = fresh();
    draft.job = id;
    draft.client = client || "";
    if (measures?.length)
      draft.capitulos[0].lineas = measures.map((m) => ({
        ...emptyLine("vidrio"),
        w: m.ancho,
        h: m.alto,
        qty: m.cantidad,
        vidrio: m.tipo,
        espesor: m.espesor,
      }));
    window.vidresQuotePage = "presupuestos";
    window.vidresNavigate("presupuestos");
  };
  window.vidresQuoteOpenSaved = async (id) => {
    if (await discard()) {
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
  messageForm.addEventListener("submit", async (event) => {
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
      (await VSUI.confirm({
        titulo: "Marcar como enviado",
        texto: "¿Marcar este presupuesto como Enviado?",
        aceptar: "Marcar como enviado",
        cancelar: "Cancelar",
      }))
    ) {
      const today = localToday(),
        followup = addDays(today, Number(config().followupDays) || 4);
      VSStorage.write(
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
  });
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
  window.vidresQuotePostpone = (id, days = 3) => {
    const date = addDays(localToday(), days);
    VSStorage.write(
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
    VSStorage.write(
      Q,
      list.map((item) => (item.id === id ? { ...item, status } : item)),
    );
    if (draft?.id === id) draft.status = status;
    if (
      status === "Aceptado" &&
      quote.job &&
      (await VSUI.confirm({
        titulo: "Trabajo aceptado",
        texto: "¿Cambiar el trabajo vinculado a En producción?",
        aceptar: "Cambiar",
        cancelar: "Cancelar",
      }))
    )
      window.vidresChangeJobStatus?.(quote.job, "En producción");
  };
})();
