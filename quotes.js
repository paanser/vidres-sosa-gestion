"use strict";
(() => {
  const { esc, num, money } = VSUtils,
    Q = "vs-quote-prototype-v1",
    T = "vs-tariffs-prototype-v1",
    C = "vs-config-v1";
  let draft = null,
    quickMode = false,
    quoteSort = { key: "date", dir: -1 };
  const quotes = () => VSStorage.read(Q, []),
    tariffs = () => VSStorage.read(T, []),
    config = () => VSStorage.read(C, {});
  const pricing = (q) =>
    q?.pricing || { vat: 21, energyMode: "pending", energy: "" };
  const calc = (line) => VSCalculations.calc(line, pricing(draft));
  const sum = (q) => VSCalculations.totals(q.lines, pricing(q));
  const statuses = ["Borrador", "Enviado", "Aceptado", "Rechazado"];
  const localToday = () => new Date().toLocaleDateString("en-CA");
  function addDays(date, days) {
    const value = new Date(date + "T12:00:00");
    value.setDate(value.getDate() + days);
    return value.toLocaleDateString("en-CA");
  }
  const unit = () => (config().unit === "mm" ? "mm" : "cm"),
    display = (v) => (unit() === "mm" ? String(num(v) * 10) : v);
  const glassName = (l) =>
    l.glass || tariffs().find((t) => t.id === l.tariff)?.name || "";
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
      },
      lines: [emptyLine()],
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
                '">Abrir</button><button type="button" data-whatsapp="' +
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
                `<article class="quote-saved"><span>${esc(q.id)} · ${esc(q.client)} · ${esc(q.status || "Borrador")} · Total: ${money(sum(q).total)}</span><div><button type="button" data-load="${esc(q.id)}">Abrir</button><button type="button" data-whatsapp="${esc(q.id)}">WhatsApp</button><button type="button" data-duplicate="${esc(q.id)}">Duplicar</button><button type="button" data-delete-quote="${esc(q.id)}">Eliminar</button></div></article>`,
            )
            .join("")
        : "<p>No hay presupuestos guardados.</p>") +
      "</div>";
    return table + cards;
  }
  function renderQuoteList() {
    const host = document.querySelector("#quote-list");
    if (host) host.innerHTML = quoteListHtml();
  }
  function sync() {
    if (!draft) draft = fresh();
    if (quickMode) {
      quickSync();
      return;
    }
    const list = quotes(),
      jobs = window.vidresGetJobs?.() || [],
      total = sum(draft);
    document.querySelector("#content").innerHTML =
      `<div class="quote-toolbar"><button type="button" class="quick-quote-button" id="quote-quick">${VSIcons.icon("chispa", 18)} Presupuesto rápido</button><button type="button" class="primary" id="quote-new">${VSIcons.icon("anadir", 18)} Nuevo presupuesto</button><button type="button" id="quote-settings">Ajustes de tarifas</button></div>
 <section class="panel quote-editor"><h2>Presupuesto de vidrio · ${esc(draft.id || "Sin guardar")}</h2><div class="quote-fields"><label>Cliente<input id="quote-client" maxlength="100" value="${esc(draft.client)}"></label><label>Parte relacionado<select id="quote-job"><option value="">Sin vincular</option>${jobs.map((j) => `<option value="${esc(j.id)}" ${draft.job === j.id ? "selected" : ""}>${esc(j.id + " · " + j.cliente)}</option>`).join("")}</select></label><label>Estado<select id="quote-status">${statuses.map((s) => `<option ${s === (draft.status || "Borrador") ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
 <div id="quote-lines">${draft.lines.map(row).join("")}</div><button type="button" id="quote-add">${VSIcons.icon("anadir", 18)} Añadir otro vidrio</button><div class="quote-total"><div class="quote-total-breakdown">Base imponible: <strong>${money(total.base)}</strong><br>IVA (${esc(pricing(draft).vat ?? 21)} %): <strong>${money(total.iva)}</strong><br>Total con IVA: <strong class="quote-grand-total">${money(total.total)}</strong></div></div><div class="quote-toolbar"><button type="button" class="primary" id="quote-save">Guardar presupuesto</button><button type="button" id="quote-whatsapp">Enviar por WhatsApp</button><button type="button" id="quote-pdf">Imprimir / Guardar PDF</button></div></section>
 <section class="panel"><h2>Presupuestos guardados</h2><div id="quote-list">${quoteListHtml()}</div></section>`;
  }
  function quickSync() {
    const line = draft.lines[0] || emptyLine(),
      result = calc(line),
      total = sum(draft),
      names = [
        ...new Set([
          ...(window.vidresGetJobs?.() || []).map((job) => job.cliente),
          ...VSStorage.read("vidres-clientes-v1", []).map(
            (client) => client.nombre,
          ),
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
        <div class="quote-toolbar"><button type="button" id="quick-copy">Copiar mensaje</button><button type="button" id="quick-whatsapp">Enviar por WhatsApp</button><button type="button" class="primary" id="quick-save">Guardar como presupuesto</button></div>
      </section>`;
  }
  function quickResultHtml(result, total) {
    return `Medida real: ${result.w} × ${result.h} cm<br>Medida aplicada: ${result.aw} × ${result.ah} cm<br>Superficie aplicada: ${result.area.toFixed(4)} m² por pieza<br>Base: <strong>${money(total.base)}</strong><br>IVA (${esc(pricing(draft).vat ?? 21)} %): <strong>${money(total.iva)}</strong><br>Total: <strong class="quote-grand-total">${money(total.total)}</strong>`;
  }
  function readQuickForm() {
    const line = draft.lines[0] || emptyLine(),
      client = document.querySelector("#quick-client"),
      width = document.querySelector("#quick-w");
    if (!client || !width) return;
    draft.client = client.value.trim();
    line.w =
      unit() === "mm" ? String(num(width.value) / 10) : width.value.trim();
    const height = document.querySelector("#quick-h").value;
    line.h = unit() === "mm" ? String(num(height) / 10) : height.trim();
    line.qty = document.querySelector("#quick-qty").value;
    const tariff = tariffs().find(
      (item) => item.id === document.querySelector("#quick-glass").value,
    );
    line.tariff = tariff?.id || "";
    line.glass = tariff?.name || "";
    line.price = tariff?.price ?? "";
    line.edgePrice = tariff?.edge ?? "";
    line.sides = [
      ...document.querySelectorAll("[data-quick-edge]:checked"),
    ].map((input) => input.dataset.quickEdge);
    draft.lines = [line];
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
      totals = sum(q),
      detail = q.lines
        .map((line) => {
          const result = VSCalculations.calc(line, pricing(q));
          return `• ${glassName(line) || "Vidrio"} ${result.w}×${result.h} cm (${result.qty} ud.): ${money(result.total)}`;
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
    return `<div class="quote-line" data-line="${i}"><div class="quote-line-head"><strong>Vidrio ${i + 1}</strong><button type="button" data-remove="${i}">Eliminar</button></div><div class="quote-fields">${[
      ["w", "Ancho real (" + unit() + ")", display(l.w), "decimal"],
      ["h", "Alto real (" + unit() + ")", display(l.h), "decimal"],
      ["qty", "Cantidad", l.qty ?? 1, "numeric"],
    ]
      .map(
        ([k, label, v, mode]) =>
          `<label>${label}<input type="number" inputmode="${mode}" min="${k === "qty" ? 1 : 0}" step="${k === "qty" ? 1 : 0.1}" data-field="${k}" value="${esc(v)}"></label>`,
      )
      .join(
        "",
      )}<label>Tipo de vidrio<input data-field="glass" list="glass-options-${i}" value="${esc(glassName(l))}"></label><datalist id="glass-options-${i}">${tariffs()
      .map((t) => `<option value="${esc(t.name)}"></option>`)
      .join(
        "",
      )}</datalist><label>Precio vidrio (€/m²)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="price" value="${esc(l.price)}"></label><label>Precio canto (€/ml)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="edgePrice" value="${esc(l.edgePrice)}"></label></div><div class="quote-edges">${[
      ["top", "Superior"],
      ["bottom", "Inferior"],
      ["left", "Izquierdo"],
      ["right", "Derecho"],
    ]
      .map(
        ([v, label]) =>
          `<label><input type="checkbox" data-edge="${v}" ${(l.sides || []).includes(v) ? "checked" : ""}>${label}</label>`,
      )
      .join("")}</div>${resultHtml(l)}</div>`;
  }
  function resultHtml(l) {
    const c = calc(l);
    return `<div class="quote-result">Real: ${c.w} × ${c.h} cm · ${c.real.toFixed(4)} m²<br>Aplicada: ${c.aw} × ${c.ah} cm · ${c.area.toFixed(4)} m²<br>Canto por pieza: ${c.ml.toFixed(2)} ml · Unidades: ${c.qty} · Importe: ${money(c.total)}${c.energy ? "<br>Recargo energético incluido: " + money(c.energy) : ""}</div>`;
  }
  function totalsHtml() {
    const total = sum(draft);
    return `Base imponible: <strong>${money(total.base)}</strong><br>IVA (${esc(pricing(draft).vat ?? 21)} %): <strong>${money(total.iva)}</strong><br>Total con IVA: <strong class="quote-grand-total">${money(total.total)}</strong>`;
  }
  function updateTotals() {
    const host = document.querySelector(".quote-total-breakdown");
    if (host) host.innerHTML = totalsHtml();
  }
  function renderLines() {
    const host = document.querySelector("#quote-lines");
    if (host) host.innerHTML = draft.lines.map(row).join("");
  }
  function updateAllResults() {
    document.querySelectorAll(".quote-line").forEach((el) => {
      const l = draft.lines[Number(el.dataset.line)];
      if (!l) return;
      const host = el.querySelector(".quote-result");
      if (host) host.outerHTML = resultHtml(l);
    });
    updateTotals();
  }
  function fromForm() {
    if (!draft || !document.querySelector("#quote-client")) return;
    draft.client = document.querySelector("#quote-client").value.trim();
    draft.job = document.querySelector("#quote-job").value;
    draft.status = document.querySelector("#quote-status").value;
    document.querySelectorAll(".quote-line").forEach((el) => {
      const l = draft.lines[Number(el.dataset.line)];
      el.querySelectorAll("[data-field]").forEach(
        (input) =>
          (l[input.dataset.field] =
            unit() === "mm" && ["w", "h"].includes(input.dataset.field)
              ? String(num(input.value) / 10)
              : input.value),
      );
      l.sides = [...el.querySelectorAll("[data-edge]:checked")].map(
        (x) => x.dataset.edge,
      );
    });
  }
  function valid(print = false) {
    if (
      (!draft.client.trim() && !quickMode) ||
      !draft.lines.length ||
      !draft.lines.every(
        (l) =>
          num(l.w) > 0 &&
          num(l.h) > 0 &&
          Number.isInteger(Number(l.qty)) &&
          Number(l.qty) > 0 &&
          Number(String(l.price).replace(",", ".")) >= 0 &&
          Number(String(l.edgePrice || 0).replace(",", ".")) >= 0 &&
          Number.isFinite(calc(l).total) &&
          ((!print && draft.status === "Borrador") || num(l.price) > 0),
      )
    ) {
      VSUI.toast(
        "Revisa cliente, medidas, cantidades y precios. Para enviar, aceptar o imprimir se requiere precio positivo.",
        "warn",
      );
      return false;
    }
    return true;
  }
  async function discard() {
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
      !draft.lines[0].price
    )
      return true;
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
  function printQuote() {
    fromForm();
    if (!valid(true)) return;
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
    const t = sum(draft),
      energy = draft.lines.reduce((n, l) => n + calc(l).energy, 0);
    host.innerHTML = `<h1>${esc(company.name || "Vidres Sosa")} · Presupuesto</h1><p>${[company.taxId, company.address, company.phone, company.email].filter(Boolean).map(esc).join("<br>")}</p><p>Referencia: ${esc(draft.id || "Borrador sin referencia")}<br>Fecha: ${esc(draft.date)}<br>Cliente: ${esc(draft.client)}<br>${esc(client.telefono || "")}<br>${esc(client.direccion || job?.direccion || "")}</p><table><thead><tr><th>Vidrio</th><th>Uds.</th><th>Real cm</th><th>m²/pieza reales</th><th>Aplicada cm</th><th>m²/pieza aplicados</th><th>ml/pieza canto</th><th>Importe</th></tr></thead><tbody>${draft.lines
      .map((l) => {
        const a = calc(l);
        return `<tr><td>${esc(glassName(l) || "Vidrio")}</td><td>${a.qty}</td><td>${a.w} × ${a.h}</td><td>${a.real.toFixed(4)}</td><td>${a.aw} × ${a.ah}</td><td>${a.area.toFixed(4)}</td><td>${a.ml.toFixed(2)}</td><td>${money(a.total)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table>${energy ? `<p>Recargo energético incluido en la base: ${money(energy)} (${esc(pricing(draft).energy)} ${pricing(draft).energyMode === "m2" ? "€/m²" : "%"})</p>` : ""}<p>Base: ${money(t.base)}<br>IVA (${esc(pricing(draft).vat ?? 21)} %): ${money(t.iva)}<br><strong>Total: ${money(t.total)}</strong></p><p>${esc(company.conditions || "").replace(/\n/g, "<br>")}</p><p>Validez: ${esc(company.validity || 30)} días desde la fecha del presupuesto.</p>${["name", "taxId", "address", "phone", "email"].every((k) => company[k]?.trim()) ? "" : "<p>Versión de prueba: completar los datos fiscales antes de entregar.</p>"}`;
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
        await copyText(quickMessage());
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
      } else if (b.dataset.whatsapp) {
        const quote = quotes().find((item) => item.id === b.dataset.whatsapp);
        if (quote) openQuoteMessage(quote);
      } else if (b.id === "quote-add") {
        fromForm();
        draft.lines.push(emptyLine());
        renderLines();
        updateTotals();
      } else if (b.dataset.remove !== undefined) {
        fromForm();
        if (draft.lines.length > 1)
          draft.lines.splice(Number(b.dataset.remove), 1);
        renderLines();
        updateTotals();
      } else if (b.id === "quote-pdf") printQuote();
      else if (b.dataset.load) {
        if (await discard()) {
          draft = structuredClone(
            quotes().find((q) => q.id === b.dataset.load),
          );
          sync();
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
    if (el && e.target.dataset.field === "glass") {
      const i = Number(el.dataset.line),
        l = draft.lines[i],
        t = tariffs().find(
          (t) =>
            t.name.trim().toLocaleLowerCase("es") ===
            l.glass.trim().toLocaleLowerCase("es"),
        );
      const wasTariff = Boolean(l.tariff);
      l.tariff = t?.id || "";
      if (t) {
        l.price = t.price;
        l.edgePrice = t.edge;
        l.tariff = t.id;
      } else if (wasTariff) {
        l.price = "";
        l.edgePrice = "";
      }
      const priceInput = el.querySelector('[data-field="price"]');
      const edgeInput = el.querySelector('[data-field="edgePrice"]');
      if (priceInput) priceInput.value = l.price ?? "";
      if (edgeInput) edgeInput.value = l.edgePrice ?? "";
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
        lines: q.lines.length,
      }));
  window.vidresQuoteStartForJob = async (id, client, measures) => {
    if (!(await discard())) return;
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
