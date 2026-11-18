"use strict";
(() => {
  const { esc, num, money } = VSUtils,
    Q = "vs-quote-prototype-v1",
    T = "vs-tariffs-prototype-v1",
    C = "vs-config-v1";
  let draft = null,
    editorOpen = false,
    quickMode = false,
    uploadingDrawing = false;
  const quotes = () => VSStorage.read(Q, []),
    tariffs = () => window.vidresTariffs.catalog(VSStorage.read(T, [])),
    config = () => VSStorage.read(C, {});
  const pricing = (q) =>
    q?.pricing || { vat: 21, energyMode: "kg", energy: "" };
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
  const normalizeClient = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("es");
  const clientNameKey = (value) =>
    String(value || "")
      .trim()
      .toLocaleLowerCase("es");
  function clientOptions() {
    const cards = VSStorage.read("vidres-clientes-v1", []);
    const options = [...cards];
    for (const job of window.vidresGetJobs?.() || []) {
      if (
        !options.some(
          (c) => clientNameKey(c.nombre) === clientNameKey(job.cliente),
        )
      )
        options.push({
          nombre: job.cliente,
          telefono: job.telefono || "",
          direccion: job.direccion || "",
        });
    }
    for (const quote of quotes()) {
      if (
        !quote.client ||
        quote.client === "Sin cliente" ||
        options.some((c) =>
          quote.clientId
            ? c.id === quote.clientId
            : clientNameKey(c.nombre) === clientNameKey(quote.client),
        )
      )
        continue;
      const data = quote.clientData || {};
      options.push({
        ...(quote.clientId ? { id: quote.clientId } : {}),
        nombre: quote.client,
        telefono: data.phone || "",
        direccion: data.address || "",
        nif: data.taxId || "",
        email: data.email || "",
      });
    }
    return options;
  }
  const clientCard = (q) =>
    q.clientSource === "quote"
      ? undefined
      : clientOptions().find((c) =>
          q.clientId
            ? c.id === q.clientId
            : String(c.nombre).trim().toLocaleLowerCase("es") ===
              q.client.trim().toLocaleLowerCase("es"),
        );
  function clientPicker() {
    return `<label>Relacionar con un cliente existente (opcional)<select id="quote-existing-client" data-search-select="Nombre, teléfono o dirección"><option value="">Crear cliente nuevo</option>${clientOptions()
      .map(
        (c, i) =>
          `<option value="${i}" data-search-text="${esc([c.telefono, c.direccion].join(" "))}" ${(draft.clientId ? draft.clientId === c.id : draft.clientSource !== "quote" && !c.id && draft.client === c.nombre) ? "selected" : ""}>${esc(c.nombre)} · ${esc(c.telefono || c.direccion || "Sin datos de contacto")}</option>`,
      )
      .join(
        "",
      )}</select></label><p class="muted">Puedes crear un cliente nuevo aunque coincida el nombre. Añade otro apellido o mote para distinguirlo.</p>`;
  }
  function chooseClient(c) {
    if (c) {
      draft.client = c.nombre;
      draft.clientId = c.id || "";
      delete draft.clientSource;
    } else {
      delete draft.clientId;
      draft.clientSource = "quote";
      draft.clientData = {};
    }
    applyClientProfile();
    sync();
  }
  function showClientMatches() {
    const host = document.querySelector("#quote-client-matches");
    if (!host) return;
    const query = normalizeClient(draft.client);
    host.innerHTML = query
      ? clientOptions()
          .map((c, i) => ({ c, i }))
          .filter(({ c }) =>
            query
              .split(/\s+/)
              .every((word) =>
                normalizeClient(
                  [c.nombre, c.telefono, c.direccion].join(" "),
                ).includes(word),
              ),
          )
          .slice(0, 12)
          .map(
            ({ c, i }) =>
              `<button type="button" data-quote-client-option="${i}">Usar ${esc(c.nombre)}${c.telefono || c.direccion ? ` · ${esc(c.telefono || c.direccion)}` : ""}</button>`,
          )
          .join("") +
        `<button type="button" data-quote-client-new>Crear cliente nuevo: ${esc(draft.client)}</button>`
      : "";
  }
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
  function applyClientProfile() {
    const profile = clientCard(draft)?.priceProfile;
    draft.pricing.priceMode = profile?.mode === "fixed" ? "fixed" : "markup";
    draft.pricing.fixedPrice = profile?.mode === "fixed" ? profile.value : "";
    draft.pricing.margin = profile?.mode === "markup" ? profile.value : "";
    draft.pricing.marginMode = "cost";
    draft.pricing.marginScope = "glass";
  }
  function customerFields() {
    const data = clientData(draft),
      fromCard = draft.clientSource !== "quote" && clientCard(draft);
    return `<details class="quote-customer"><summary>Datos del cliente${fromCard ? " · de su ficha" : " · de este presupuesto"}</summary><p class="muted">${fromCard ? "Estos datos se obtienen de la ficha del cliente. Puedes modificarlos en Clientes." : "Al guardar el presupuesto se creará una ficha de cliente con estos datos."}</p><div class="quote-fields">${[
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
    return `<details class="quote-document-options"><summary>Datos visibles en el PDF para cliente</summary><div class="quote-document-body"><p>Marca los datos que quieres mostrar. Ocultarlos no cambia el cálculo ni el total. El precio por m² incluye los conceptos integrados en el vidrio.</p><div class="quote-document-checks">${pdfFields.map(([key, label]) => `<label><input type="checkbox" data-pdf-option="${key}" ${options[key] ? "checked" : ""}>${label}</label>`).join("")}</div><label>Observaciones del presupuesto<textarea id="quote-observations" maxlength="3000" rows="3">${esc(draft.observations || "")}</textarea></label></div></details>`;
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
  function doubleComposition(line) {
    const base = (line.doubleComposition || "4/16/4").split("/");
    const face = (selected, name, original) => {
      if (!selected) return original;
      // El último número independiente es el espesor, no el código de
      // una capa (SN 70/35, SNX60) ni su clase de seguridad (P2A).
      const thickness = (name || "")
        .split(/\s+/)
        .filter((part) => /^\d+(?:[.,]\d+)?(?:mm)?$/i.test(part))
        .pop();
      return thickness ? thickness.replace(/mm$/i, "") : name || original;
    };
    if (base.length !== 3)
      return `${line.faceOneName || "Float 4"} / ${line.faceTwoName || "Float 4"}`;
    base[0] = face(line.faceOne, line.faceOneName, base[0]);
    base[2] = face(line.faceTwo, line.faceTwoName, base[2]);
    return base.join("/");
  }
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
    line.glass = `Doble acristalamiento ${doubleComposition(line)} · ${line.faceOneName || "Float 4"} / ${line.faceTwoName || "Float 4"}`;
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
  function weightFields(l) {
    return `<label>Espesor total de vidrio (mm)<input data-field="thickness" type="number" min="0.01" step="any" inputmode="decimal" value="${esc(l.thickness ?? "")}" placeholder="Ej.: 8; doble 4/16/4 = 8"></label><p class="muted">Suma los espesores de vidrio, sin cámara de aire. Necesario para aplicar el recargo por kg.</p>`;
  }
  function doubleFields(l) {
    const face = (field, label) =>
      `<label>${label}<select data-field="${field}" data-search-select="Vidrio, tarifa o precio"><option value="">Float 4 · sin cambio (+0 €/m²)</option>${substitutions()
        .map(
          (t) =>
            `<option value="${esc(t.id)}" data-search-text="${esc(t.name)}" ${l[field] === t.id ? "selected" : ""}>${esc(glassName({ glass: t.name }))} · +${money(t.price)}/m²</option>`,
        )
        .join("")}</select></label>`;
    return `<label class="quote-edges"><input type="checkbox" data-field="doubleGlazing" ${l.doubleGlazing ? "checked" : ""}>Calcular doble acristalamiento</label>${l.doubleGlazing ? `<div class="quote-fields"><label>Composición base<input data-field="doubleComposition" maxlength="40" value="${esc(l.doubleComposition || "4/16/4")}"></label><label>Precio base del doble (€/m²)<input data-field="doubleBase" type="text" inputmode="decimal" data-price-input value="${esc(l.doubleBase ?? 27)}"></label>${face("faceOne", "Sustitución cara 1")}${face("faceTwo", "Sustitución cara 2")}</div><p>Base ${money(num(l.doubleBase))}/m² + cara 1 ${money(num(l.faceOnePrice))}/m² + cara 2 ${money(num(l.faceTwoPrice))}/m² = <strong>${money(num(l.price))}/m²</strong>. Selecciona solo las caras que cambian respecto al vidrio base de 4 mm.</p>` : ""}`;
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
  function minimumAreaFields() {
    const value = String(pricing(draft).minimumArea ?? "legacy");
    return `<div class="quote-fields"><label>Metraje mínimo por pieza<select id="quote-minimum-area">${[
      ["auto", "Automático · simple 0,50 m² / doble 0,70 m²"],
      ["0.35", "0,35 m²"],
      ["0.5", "0,50 m²"],
      ["0.7", "0,70 m²"],
      ["1", "1 m²"],
      ...(value === "legacy"
        ? [["legacy", "Sin mínimo · presupuesto anterior"]]
        : []),
    ]
      .map(
        ([key, label]) =>
          `<option value="${key}" ${value === key ? "selected" : ""}>${label}</option>`,
      )
      .join("")}</select></label></div>`;
  }
  function energyFields() {
    const p = pricing(draft);
    return `<fieldset class="quote-energy"><legend>Recargo energético</legend><label>Tarifa de energía (€/kg)<input id="quote-energy" type="text" inputmode="decimal" readonly value="${esc(p.energyMode === "kg" ? (p.energy ?? "") : "")}"></label><label class="quote-energy-presentation"><input id="quote-energy-separate" type="checkbox" ${p.energySeparate === true ? "checked" : ""}>Mostrar el recargo energético por separado al cliente</label><p class="muted">Sin marcar, se incluye en el precio del vidrio. El total no cambia.</p><p class="muted">Tarifa tomada de Ajustes → Configuración general. Los presupuestos guardados conservan su tarifa. Peso real × tarifa. El canto pulido no modifica el recargo energético. En doble acristalamiento suma el espesor de las dos piezas de vidrio, sin la cámara. En monolítico usa el espesor de una pieza. No se aplica el metraje mínimo al peso.</p>${p.energyMode && p.energyMode !== "kg" && num(p.energy) ? "<p>Este presupuesto conserva un recargo anterior. Los nuevos usan la tarifa en €/kg de Ajustes.</p>" : ""}</fieldset>`;
  }
  function readEnergyPresentation() {
    const input = document.querySelector("#quote-energy-separate");
    if (!input) return;
    draft.pricing ||= { ...pricing(draft) };
    draft.pricing.energySeparate = input.checked;
  }
  function readMinimumArea() {
    const input = document.querySelector("#quote-minimum-area");
    if (input && input.value !== "legacy") {
      draft.pricing ||= { ...pricing(draft) };
      draft.pricing.minimumArea = input.value;
    }
  }
  function fresh() {
    const c = config();
    return {
      id: null,
      client: "",
      clientSource: "quote",
      job: "",
      status: "Borrador",
      date: localToday(),
      pricing: {
        vat: c.vat ?? 21,
        energy: c.energyMode === "kg" ? c.energy || "" : "",
        energyMode: "kg",
        margin: "",
        marginMode: "cost",
        marginScope: "glass",
        minimumArea: "auto",
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
  let quoteSearch = "",
    quoteMilestone = "",
    quoteCompletion = "done";
  function savedQuoteRow(q) {
    const total = sum(q),
      status = q.status || "Borrador",
      state = {
        Borrador: [
          "draft",
          "Presupuesto no enviado",
          '<path d="M8 10h8M8 14h5"/>',
        ],
        Enviado: [
          "sent",
          "Presupuesto enviado",
          '<path d="m8 13 8-4-3 8-2-4-3-2Z"/>',
        ],
        Aceptado: [
          "accepted",
          "Presupuesto aceptado",
          '<path d="m8 13 3 3 5-6"/>',
        ],
        Rechazado: [
          "rejected",
          "Presupuesto rechazado",
          '<path d="m9 10 6 6m0-6-6 6"/>',
        ],
      }[status] || ["draft", status, ""],
      date = (q.date || "").slice(0, 10),
      dateText = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? date.split("-").reverse().join("-")
        : date || "—",
      description = (q.lines || [])
        .map((line) =>
          ["concept", "aluminum"].includes(line.kind)
            ? line.description
            : `${glassName(line) || "Vidrio"} ${measures(line.w, line.h)} · ${num(line.qty) || 1} ud.`,
        )
        .filter(Boolean)
        .join(" · "),
      detail = [q.client || "Sin cliente", description]
        .filter(Boolean)
        .join(" / ");
    return `<tr class="quote-saved" data-saved-quote="${esc(q.id)}">
      <td class="quote-saved-client"><div class="quote-saved-detail" title="${esc(detail)}">${esc(detail)}</div><details class="quote-saved-options"><summary aria-label="Opciones del presupuesto ${esc(q.id)}" title="Opciones del presupuesto">···</summary><div class="quote-saved-actions">${VSMilestones.badges(q, "quote")}<div><button type="button" data-whatsapp="${esc(q.id)}">WhatsApp</button>${window.VSFacturaDirecta?.button(q.id) || ""}<button type="button" data-duplicate="${esc(q.id)}">Duplicar</button><button type="button" data-delete-quote="${esc(q.id)}">Eliminar</button></div></div></details></td>
      <td class="quote-saved-state"><span class="quote-state-icon quote-state-${state[0]}" role="img" aria-label="${esc(state[1])}" title="${esc(state[1])}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v4h4"/>${state[2]}</svg></span></td>
      <td><button type="button" class="quote-saved-number" data-load="${esc(q.id)}" aria-label="Abrir presupuesto ${esc(q.id)}">${esc(q.id)}</button></td>
      <td class="quote-saved-date">${esc(dateText)}</td>
      <td class="quote-saved-amount">${money(total.base)}</td><td class="quote-saved-amount">${money(total.total)}</td>
    </tr>`;
  }
  function savedQuotesTable(list) {
    return `<div class="quote-list-scroll" role="region" aria-label="Listado de presupuestos guardados" tabindex="0"><table class="quote-saved-table" aria-label="Presupuestos guardados"><colgroup><col class="quote-col-client"><col class="quote-col-state"><col class="quote-col-number"><col class="quote-col-date"><col class="quote-col-amount"><col class="quote-col-amount"></colgroup><thead><tr><th scope="col">Cliente / Detalle</th><th scope="col">Estado</th><th scope="col">Número<br>presupuesto</th><th scope="col">Fecha</th><th scope="col" class="quote-saved-amount" title="Importe neto sin IVA">T. neto</th><th scope="col" class="quote-saved-amount" title="Total con IVA">Total</th></tr></thead><tbody>${list.map(savedQuoteRow).join("")}</tbody></table></div>`;
  }
  function savedQuotesView(list, view) {
    if (!list.length) return "<p>No hay presupuestos guardados.</p>";
    if (!view) {
      try {
        view = JSON.parse(
          localStorage.getItem(
            "vidres-section-view-v1:" + VSAuth.user.id + ":presupuestos",
          ),
        )?.view;
      } catch {}
    }
    const sorted = [...list].sort(
      (a, b) =>
        (b.date || "").localeCompare(a.date || "") ||
        b.id.localeCompare(a.id, "es", { numeric: true }),
    );
    const content =
      view === "cards"
        ? `<div class="quote-saved-cards">${sorted.map((q) => `<article class="quote-saved-card" data-saved-quote="${esc(q.id)}"><span>${esc(q.id)} · ${esc(q.client)} · ${esc(q.status || "Borrador")} · Total: ${money(sum(q).total)}</span>${VSMilestones.badges(q, "quote")}<div class="quote-card-actions"><button type="button" data-load="${esc(q.id)}">Abrir</button><button type="button" data-whatsapp="${esc(q.id)}">WhatsApp</button>${window.VSFacturaDirecta?.button(q.id) || ""}<button type="button" data-duplicate="${esc(q.id)}">Duplicar</button><button type="button" data-delete-quote="${esc(q.id)}">Eliminar</button></div></article>`).join("")}</div>`
        : savedQuotesTable(sorted);
    return `${content}<p id="quote-search-empty" class="muted" role="status" hidden>No hay presupuestos que coincidan con la búsqueda o los filtros.</p>`;
  }
  window.vidresQuoteSetView = (view) => {
    const host = document.querySelector("#quote-saved-results");
    if (!host) return;
    host.innerHTML = savedQuotesView(quotes(), view);
    filterSavedQuotes();
  };
  function filterSavedQuotes() {
    const list = quotes();
    let visible = 0;
    document.querySelectorAll("[data-saved-quote]").forEach((article) => {
      const q = list.find((q) => q.id === article.dataset.savedQuote);
      article.hidden =
        !q ||
        !VSMilestones.matches(
          q,
          "quote",
          quoteSearch.replace(/^(\d{2})-(\d{2})-(\d{4})$/, "$3-$2-$1"),
          quoteMilestone,
          quoteCompletion,
        );
      if (!article.hidden) visible++;
    });
    const empty = document.querySelector("#quote-search-empty");
    if (empty) empty.hidden = visible > 0;
  }
  window.addEventListener("vidres-milestones-saved", filterSavedQuotes);
  function toolbar() {
    return `<div class="quote-toolbar"><button type="button" class="quick-quote-button" id="quote-quick">⚡ Presupuesto rápido</button><button type="button" class="primary" id="quote-new">+ Nuevo presupuesto</button><button type="button" id="quote-settings">Ajustes de tarifas</button>${editorOpen ? '<button type="button" id="quote-close">← Volver a presupuestos</button>' : ""}</div>`;
  }
  function savedPanel(list) {
    return `<section class="panel quote-saved-panel"><h2>Presupuestos guardados</h2><label>Buscar presupuesto<input id="quote-search" type="search" placeholder="Cliente, referencia o fecha" value="${esc(quoteSearch)}"></label>${VSMilestones.controls("quotes")}<div id="quote-saved-results">${savedQuotesView(list)}</div></section>`;
  }
  function sync() {
    if (quickMode) {
      quickSync();
      return;
    }
    if (!editorOpen) {
      document.querySelector("#content").innerHTML =
        toolbar() + savedPanel(quotes());
      initSavedFilters();
      return;
    }
    if (!draft) draft = fresh();
    const list = quotes(),
      jobs = window.vidresGetJobs?.() || [],
      breakdown = details(draft);
    const previousMeasures = document.querySelector("#quote-measures");
    document.querySelector("#content").innerHTML = `${toolbar()}
 <section class="panel quote-editor"><h2>Presupuesto · ${esc(draft.id || "Sin guardar")}</h2><div class="quote-fields">${clientPicker()}<label>Cliente · escribe para buscar<input id="quote-client" type="search" autocomplete="off" aria-controls="quote-client-matches" maxlength="100" value="${esc(draft.client)}"></label><div id="quote-client-matches" class="quote-client-matches" role="group" aria-label="Coincidencias de clientes"></div><datalist id="quote-clients">${(window.vidresClientNames?.() || []).map((name) => `<option value="${esc(name)}"></option>`).join("")}</datalist><label>Parte relacionado<select id="quote-job" data-search-select="Cliente, referencia o dirección"><option value="">Sin vincular</option>${jobs.map((j) => VSSelectSearch.jobOption(j, draft.job)).join("")}</select></label><label>Estado<select id="quote-status">${statuses.map((s) => `<option ${s === (draft.status || "Borrador") ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
 ${draft.id ? VSMilestones.badges(quotes().find((q) => q.id === draft.id) || draft, "quote") : ""}${minimumAreaFields()}${energyFields()}${measurePanel()}${customerFields()}<div class="quote-margin"><label>Precio para este presupuesto<select id="quote-price-mode" data-search-select="Margen, recargo o tarifa"><option value="markup" ${pricing(draft).priceMode !== "fixed" ? "selected" : ""}>Recargo porcentual</option><option value="fixed" ${pricing(draft).priceMode === "fixed" ? "selected" : ""}>Tarifa de venta por m²</option></select></label><label>Tarifa de venta del vidrio (€/m²)<input id="quote-fixed-price" type="text" inputmode="decimal" data-price-input value="${esc(pricing(draft).fixedPrice ?? "")}"></label><p>Perfil copiado del cliente al seleccionarlo; editable solo para esta oferta. La tarifa fija sustituye el precio de venta del vidrio, con cantos, energía y extras aparte.</p><label>Margen (%)<input id="quote-margin" type="text" inputmode="decimal" data-price-input value="${esc(pricing(draft).margin || "")}"></label><p>Incremento sobre el precio del vidrio: 100 € con 20 % → 120 €. Mano de obra, cantos, recargos y conceptos adicionales sin margen. Antes del IVA; solo visible en la copia interna.</p>${pricing(draft).marginScope !== "glass" && num(pricing(draft).margin) ? "<p>Presupuesto anterior: conserva el cálculo guardado. Al editar se aplicará el incremento solo al vidrio.</p>" : ""}</div><div id="quote-lines">${draft.lines.map(row).join("")}</div><button type="button" id="quote-add">+ Añadir otro vidrio</button><button type="button" id="quote-add-aluminum">+ Añadir aluminio con dibujo</button><button type="button" id="quote-add-concept">+ Añadir concepto libre</button><div class="quote-total"><div class="quote-total-breakdown">${totalResult(breakdown)}</div></div>${documentFields()}<div class="quote-toolbar"><button type="button" class="primary" id="quote-save">Guardar presupuesto</button><button type="button" id="quote-whatsapp">Enviar por WhatsApp</button><button type="button" id="quote-pdf">PDF para cliente</button><button type="button" id="quote-pdf-internal">PDF interno · Vidres Sosa</button>${window.VSFacturaDirecta?.button(list.find((q) => q.id === draft.id)?.id) || ""}</div></section>
 ${savedPanel(list)}`;
    const panel = document.querySelector("#quote-measures");
    if (panel && previousMeasures?.dataset.job === draft.job) {
      panel.replaceWith(previousMeasures);
    } else if (panel) {
      panel.addEventListener("toggle", () => {
        if (panel.open) loadMeasurePhotos(panel);
      });
    }
    initSavedFilters();
    initMeasures();
  }
  function initSavedFilters() {
    const search = document.querySelector("#quote-search"),
      milestone = document.querySelector("#quotes-milestone"),
      completion = document.querySelector("#quotes-completion");
    search.oninput = () => {
      quoteSearch = search.value;
      filterSavedQuotes();
    };
    milestone.value = quoteMilestone;
    completion.value = quoteCompletion;
    milestone.onchange = () => {
      quoteMilestone = milestone.value;
      filterSavedQuotes();
    };
    completion.onchange = () => {
      quoteCompletion = completion.value;
      filterSavedQuotes();
    };
    filterSavedQuotes();
  }
  function initMeasures() {
    const content = document.querySelector("#content");
    VSSelectSearch.init(content);
    VSMeasureInput.init(content);
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
        ${minimumAreaFields()}${energyFields()}
        <div class="quote-fields">
          <label>Cliente (opcional)<input id="quick-client" list="quick-quote-clients" maxlength="100" value="${esc(draft.client)}"></label>
          <datalist id="quick-quote-clients">${names.map((name) => `<option value="${esc(name)}"></option>`).join("")}</datalist>
          <label>Ancho (${unit()})<input id="quick-w" data-measure type="text" inputmode="decimal" value="${esc(display(line.w))}"></label>
          <label>Alto (${unit()})<input id="quick-h" data-measure type="text" inputmode="decimal" value="${esc(display(line.h))}"></label>
          <label>Cantidad<input id="quick-qty" type="number" min="1" step="1" value="${esc(line.qty || 1)}"></label>
          <label>Tipo de vidrio<select id="quick-glass" data-search-select="Vidrio, tarifa o precio" ${line.doubleGlazing ? "disabled" : ""}><option value="">Selecciona una tarifa</option>${tariffs()
            .map(
              (tariff) =>
                `<option value="${esc(tariff.id)}" ${line.tariff === tariff.id ? "selected" : ""}>${esc(tariff.name)} · ${money(tariff.price)}/m²</option>`,
            )
            .join("")}</select></label>
        </div>
        ${customerFields()}<section class="quick-double">${doubleFields(line)}${weightFields(line)}</section>
        ${edgeFields(line, true)}
        <div id="quick-result" class="quote-result quick-result">${quickResultHtml(result, total)}</div>
        ${documentFields()}<div class="quote-toolbar"><button type="button" id="quote-pdf">PDF para cliente</button><button type="button" id="quick-copy">Copiar mensaje</button><button type="button" id="quick-whatsapp">Enviar por WhatsApp</button><button type="button" class="primary" id="quick-save">Guardar como presupuesto</button></div>
      </section>`;
    initMeasures();
  }
  function quickResultHtml(result, total) {
    return `Medida real: ${measures(result.w, result.h)}<br>Medida aplicada: ${measures(result.aw, result.ah)}<br>Superficie aplicada: ${result.area.toFixed(4)} m² por pieza<br>Canto pulido: ${result.ml.toFixed(2)} ml × ${result.edgeParts} vidrio(s) × ${result.qty} ud. = ${(result.ml * result.edgeParts * result.qty).toFixed(2)} ml<br>Peso vidrio: ${result.weight.toFixed(2)} kg<br>Recargo energético calculado: <strong>${money(result.energy)}</strong><br>Base: <strong>${money(total.base)}</strong><br>IVA (${esc(pricing(draft).vat ?? 21)} %): <strong>${money(total.iva)}</strong><br>Total: <strong class="quote-grand-total">${money(total.total)}</strong>`;
  }
  function readQuickForm() {
    const line = draft.lines[0] || emptyLine(),
      client = document.querySelector("#quick-client"),
      width = document.querySelector("#quick-w");
    if (!client || !width) return;
    readMinimumArea();
    readEnergyPresentation();
    const previousClient = draft.client;
    draft.client = client.value.trim();
    if (previousClient !== draft.client) applyClientProfile();
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
          if (["concept", "aluminum"].includes(line.kind))
            return `• ${line.description}: ${money(result.sale)}`;
          return `• ${glassName(line) || "Vidrio"} ${measures(result.w, result.h)} (${result.qty} ud.): ${money(result.glassSale)}${result.energySale ? `\n• Recargo energético: ${money(result.energySale)}` : ""}${result.separate && result.extraCost ? `\n• ${line.extraDescription || "Otros conceptos"}: ${money(result.extraSale)}` : ""}`;
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
  function normalizePhone(value) {
    let phone = String(value || "").replace(/[^+0-9]/g, "");
    phone = phone.replace(/^\+|^00/, "");
    if (/^\d{9}$/.test(phone)) phone = "34" + phone;
    return phone;
  }
  const phoneForQuote = (q) => normalizePhone(clientData(q).phone);
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
    const savedPhone = clientData(q).phone || "";
    const recipient = dialog.querySelector('[name="destinatario"]');
    recipient.options[0].textContent = savedPhone
      ? `Número de la ficha: ${savedPhone}`
      : "Número de la ficha · sin teléfono";
    recipient.options[0].disabled = !/^\d{7,15}$/.test(phoneForQuote(q));
    recipient.value = recipient.options[0].disabled ? "other" : "card";
    const phoneInput = dialog.querySelector('[name="telefono"]');
    phoneInput.value = "";
    phoneInput.setCustomValidity("");
    updateMessageRecipient();
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
  function edgeFields(line, quick = false) {
    return `<fieldset class="quote-edge-panel"><legend>Canto pulido · ${line.doubleGlazing ? "dos vidrios" : "un vidrio"}</legend><div class="quote-edge-controls">${quick ? "" : `<label class="quote-edge-price">Precio (€/ml)<input type="text" inputmode="decimal" data-price-input data-field="edgePrice" value="${esc(line.edgePrice)}"></label>`}<div class="quote-edge-options">${[
      ["top", "Superior"],
      ["bottom", "Inferior"],
      ["left", "Izquierdo"],
      ["right", "Derecho"],
    ]
      .map(
        ([value, label]) =>
          `<label><input type="checkbox" ${quick ? "data-quick-edge" : "data-edge"}="${value}" ${(line.sides || []).includes(value) ? "checked" : ""}>${label}</label>`,
      )
      .join("")}</div></div></fieldset>`;
  }
  const drawingHtml = (l) =>
    typeof l.drawing === "string" &&
    l.drawing.length <= 60000 &&
    /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(l.drawing)
      ? `<img class="quote-aluminum-drawing" src="${esc(l.drawing)}" alt="Dibujo de aluminio">`
      : "";
  const aluminumDescription = (l) =>
    `${drawingHtml(l)}<div class="quote-aluminum-description">${esc(l.description)}</div>`;
  function row(l, i) {
    if (l.kind === "aluminum") {
      const a = details(draft).lines[i];
      return `<div class="quote-line quote-aluminum" data-line="${i}"><div class="quote-line-head"><strong>Aluminio · dibujo de fábrica</strong><button type="button" data-remove="${i}">Eliminar</button></div>
      <p>Sube solo el dibujo recortado, sin los precios ni datos de fábrica. Aparecerá en el PDF del cliente. Añade los vidrios como líneas de vidrio con sus medidas de corte.</p>
      ${drawingHtml(l)}<label>Dibujo recortado (JPG, PNG o WebP, máximo 8 MB)<input type="file" accept="image/jpeg,image/png,image/webp" data-aluminum-upload></label>${l.drawing ? `<button type="button" data-remove-drawing="${i}">Quitar dibujo</button>` : ""}
      <div class="quote-fields"><label>Descripción para el cliente<textarea data-field="description" maxlength="3000" rows="4" placeholder="Puerta de aluminio, dos hojas, acabado blanco…">${esc(l.description || "")}</textarea></label><label>Coste de fábrica (€ sin IVA, por toda la línea)<input type="text" inputmode="decimal" data-price-input data-field="amount" value="${esc(l.amount ?? "")}"></label><label>Incremento sobre coste de aluminio (%)<input type="number" min="0" max="10000" step="0.01" data-field="aluminumMargin" value="${esc(l.aluminumMargin ?? 0)}"></label></div><div class="quote-aluminum-result">Venta sin IVA: ${money(a.sale)}</div></div>`;
    }
    if (l.kind === "concept")
      return `<div class="quote-line quote-concept" data-line="${i}"><div class="quote-line-head"><strong>Concepto libre</strong><button type="button" data-remove="${i}">Eliminar</button></div><div class="quote-fields"><label>Descripción libre<textarea data-field="description" maxlength="300" rows="2" placeholder="Ej.: montaje, reparación, transporte…">${esc(l.description || "")}</textarea></label><label>Importe de coste (€ sin IVA)<input type="text" inputmode="decimal" data-price-input data-field="amount" value="${esc(l.amount ?? "")}"></label></div><p>Importe por todo el concepto, sin medidas ni tarifa. Sin margen; se presenta por separado al cliente.</p></div>`;
    const c = details(draft).lines[i];
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
      )}<label>Tarifa de vidrio<select data-field="tariff" data-search-select="Vidrio, tarifa o precio" ${l.doubleGlazing ? "disabled" : ""}><option value="">Sin tarifa · precio manual</option>${tariffs()
      .map(
        (t) =>
          `<option value="${esc(t.id)}" ${l.tariff === t.id ? "selected" : ""}>${esc(t.name)} · ${money(t.price)}/m²</option>`,
      )
      .join(
        "",
      )}</select></label><label>Tipo de vidrio<input data-field="glass" ${l.doubleGlazing ? "readonly" : ""} value="${esc(glassName(l))}"></label><label>Precio vidrio (€/m², editable sin tarifa)<input type="text" inputmode="decimal" data-price-input data-field="price" ${l.doubleGlazing ? "readonly" : ""} value="${esc(l.price)}"></label></div>${weightFields(l)}${edgeFields(l)}<div class="quote-fields quote-extras"><label>Descripción del concepto adicional<input data-field="extraDescription" maxlength="160" placeholder="Ej.: montaje, transporte, herrajes" value="${esc(l.extraDescription || "")}"></label><label>Coste adicional (€ por toda esta línea)<input type="text" inputmode="decimal" data-price-input data-field="extraAmount" value="${esc(l.extraAmount ?? "")}"></label><label>Presentación al cliente<select data-field="extraMode"><option value="included" ${l.extraMode !== "separate" ? "selected" : ""}>Integrado en el precio del vidrio</option><option value="separate" ${l.extraMode === "separate" ? "selected" : ""}>Como concepto separado</option></select></label></div><div class="quote-result">${lineResult(c)}</div></div>`;
  }
  function lineResult(c) {
    const sale = `<p class="quote-line-sale"><strong>Precio de esta partida sin IVA: ${money(c.glassSale)}</strong>${c.energySale ? `<br>Recargo energético separado sin IVA: ${money(c.energySale)}` : ""}${c.separate && c.extraSale ? `<br>Concepto separado sin IVA: ${money(c.extraSale)}` : ""}${c.energySale || c.extraSale ? `<br>Total de la partida sin IVA: ${money(c.sale)}` : ""}</p>`;
    return `${sale}<div class="quote-line-metrics"><span>Peso vidrio: ${c.weight.toFixed(2)} kg</span><span>Real: ${measures(c.w, c.h)} · ${c.real.toFixed(4)} m²</span><span>Aplicada: ${measures(c.aw, c.ah)} · ${c.area.toFixed(4)} m²</span><span>Canto: ${c.ml.toFixed(2)} ml × ${c.edgeParts} pieza(s) de vidrio · Unidades: ${c.qty} · Canto total: ${(c.ml * c.edgeParts * c.qty).toFixed(2)} ml</span><span>Coste de vidrio y cantos: ${money(c.total)}</span>${c.energy ? "<span>Recargo energético calculado: " + money(c.energy) + "</span>" : ""}</div>`;
  }
  function totalResult(breakdown) {
    const total = breakdown.totals;
    return `Recargo energético calculado: <strong>${money(breakdown.lines.reduce((n, l) => n + l.energy, 0))}</strong><br>Coste interno: <strong>${money(breakdown.cost)}</strong><br>Margen añadido: <strong>${money(breakdown.margin)}</strong><br>Base imponible de venta: <strong>${money(total.base)}</strong><br>IVA (${esc(pricing(draft).vat ?? 21)} %): <strong>${money(total.iva)}</strong><br>Total con IVA: <strong class="quote-grand-total">${money(total.total)}</strong>`;
  }
  function fromForm() {
    if (!draft || !document.querySelector("#quote-client")) return;
    if (!validPriceFields()) return;
    const previous = JSON.stringify(draft);
    readMinimumArea();
    readEnergyPresentation();
    const previousClient = draft.client;
    draft.client = document.querySelector("#quote-client").value.trim();
    if (previousClient !== draft.client) {
      delete draft.clientId;
      draft.clientSource = "quote";
      document.querySelector("#quote-existing-client").value = "";
      VSSelectSearch.refresh(document.querySelector("#quote-existing-client"));
    }
    draft.job = document.querySelector("#quote-job").value;
    draft.status = document.querySelector("#quote-status").value;
    draft.pricing = {
      ...pricing(draft),
      margin: document.querySelector("#quote-margin").value,
      priceMode: document.querySelector("#quote-price-mode").value,
      fixedPrice: document.querySelector("#quote-fixed-price").value,
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
    if (previousClient !== draft.client) {
      applyClientProfile();
      document.querySelector("#quote-margin").value = draft.pricing.margin;
      document.querySelector("#quote-fixed-price").value =
        draft.pricing.fixedPrice;
      const priceMode = document.querySelector("#quote-price-mode");
      priceMode.value = draft.pricing.priceMode;
      VSSelectSearch.refresh(priceMode);
    }
    readDocumentFields();
  }
  function isEmptyGlass(line) {
    const blank = (v) => v == null || String(v).trim() === "";
    return (
      !line.kind &&
      [
        "w",
        "h",
        "glass",
        "tariff",
        "price",
        "edgePrice",
        "extraDescription",
        "extraAmount",
      ].every((key) => blank(line[key])) &&
      !line.doubleGlazing &&
      !(line.sides || []).length &&
      (blank(line.qty) || Number(line.qty) === 1)
    );
  }
  function dropEmptyGlass() {
    if (draft.lines.some((line) => !isEmptyGlass(line))) {
      const lines = draft.lines.filter((line) => !isEmptyGlass(line));
      if (lines.length !== draft.lines.length) {
        draft.lines = lines;
        return true;
      }
    }
    return false;
  }
  function validPriceFields() {
    if (!VSForms.validateNumbers(document.querySelector("#content")))
      return false;
    const input = document.querySelector("#quote-margin");
    if (input) {
      const error =
        pricing(draft).marginMode === "sale" && num(input.value) >= 100
          ? "El margen sobre venta debe ser inferior al 100 %."
          : "";
      input.setCustomValidity(error);
      if (error) {
        input.reportValidity();
        return false;
      }
    }
    return true;
  }
  function valid(print = false) {
    if (!validPriceFields()) return false;
    if (uploadingDrawing) {
      alert("Espera a que termine de cargar el dibujo.");
      return false;
    }
    if (!quickMode && dropEmptyGlass()) sync();
    if (!draft.client.trim() && !quickMode) {
      alert("Escribe el nombre del cliente para guardar o generar el PDF.");
      return false;
    }
    if (!draft.lines.length) {
      alert(
        "Añade al menos una línea de aluminio, un concepto libre o un vidrio.",
      );
      return false;
    }
    if (!VSMeasureInput.validate(document.querySelector("#content")))
      return false;
    if (
      pricing(draft).energyMode === "kg" &&
      num(pricing(draft).energy) &&
      draft.lines.some(
        (l) => !["concept", "aluminum"].includes(l.kind) && !num(l.thickness),
      )
    ) {
      alert(
        "Indica el espesor total del vidrio en mm para calcular el recargo por kg.",
      );
      return false;
    }
    const nonNegative = (value) => {
      return !VSUtils.priceError(value);
    };
    if (
      (pricing(draft).priceMode === "fixed" &&
        (String(pricing(draft).fixedPrice).trim() === "" ||
          !nonNegative(pricing(draft).fixedPrice))) ||
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
    const invalidIndex = draft.lines.findIndex(
      (l) =>
        !(["concept", "aluminum"].includes(l.kind)
          ? (l.kind !== "aluminum" ||
              (nonNegative(l.aluminumMargin) &&
                num(l.aluminumMargin) <= 10000)) &&
            Boolean(l.description?.trim()) &&
            String(l.amount ?? "").trim() !== "" &&
            nonNegative(l.amount) &&
            ((!print && draft.status === "Borrador") || num(l.amount) > 0)
          : num(l.w) > 0 &&
            num(l.h) > 0 &&
            Number.isInteger(Number(l.qty)) &&
            Number(l.qty) > 0 &&
            nonNegative(l.price) &&
            nonNegative(l.edgePrice) &&
            Number.isFinite(calc(l).total) &&
            ((!print && draft.status === "Borrador") || num(l.price) > 0)),
    );
    if (invalidIndex !== -1) {
      const line = draft.lines[invalidIndex];
      const prefix = `Línea ${invalidIndex + 1}: `;
      if (["concept", "aluminum"].includes(line.kind)) {
        if (!line.description?.trim())
          alert(prefix + "escribe la descripción para el cliente.");
        else if (
          line.kind === "aluminum" &&
          (!nonNegative(line.aluminumMargin) ||
            num(line.aluminumMargin) > 10000)
        )
          alert(
            prefix + "revisa el incremento de aluminio (entre 0 y 10000 %).",
          );
        else
          alert(
            prefix +
              "revisa el importe; para imprimir o enviar debe ser positivo.",
          );
      } else
        alert(
          prefix +
            "completa las medidas, cantidad y precio del vidrio, o elimina esta línea si no corresponde.",
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
      !draft.lines[0].kind &&
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
      if (
        draft.client.trim() &&
        draft.client !== "Sin cliente" &&
        !VSStorage.read("vidres-clientes-v1", []).some(
          (c) =>
            draft.clientSource !== "quote" &&
            (draft.clientId
              ? c.id === draft.clientId
              : clientNameKey(c.nombre) === clientNameKey(draft.client)),
        )
      ) {
        const clients = VSStorage.read("vidres-clientes-v1", []);
        const id = draft.clientId || crypto.randomUUID();
        const data = clientData(draft);
        if (!clients.some((c) => c.id === id)) {
          await VSStorage.write("vidres-clientes-v1", [
            ...clients,
            {
              id,
              nombre: draft.client,
              telefono: data.phone || "",
              direccion: data.address || "",
              nif: data.taxId || "",
              email: data.email || "",
            },
          ]);
        }
        draft.clientId = id;
        delete draft.clientSource;
      }
      if (draft.status === "Enviado") {
        draft.enviado = draft.enviado || localToday();
        draft.seguimiento =
          draft.seguimiento ||
          addDays(draft.enviado, Number(config().followupDays) || 4);
      }
      const i = list.findIndex((q) => q.id === draft.id),
        copy = structuredClone(draft);
      if (old?.hitos) copy.hitos = structuredClone(old.hitos);
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
      editorOpen = true;
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
        if (["concept", "aluminum"].includes(l.kind))
          return `<tr><td>${l.kind === "aluminum" ? aluminumDescription(l) : esc(l.description)}</td>${internal ? `<td>${money(a.cost)}</td><td>${money(a.margin)}</td>` : ""}<td>${money(a.sale)}</td></tr>`;
        const label = `${esc(glassName(l) || "Vidrio")} · ${measures(a.w, a.h)} · ${a.qty} ud.`;
        if (internal)
          return `<tr><td>${label}<br>Precio vidrio: ${money(num(l.price))}/m² · canto: ${money(num(l.edgePrice))}/ml<br>Real: ${a.real.toFixed(4)} m²/pieza · aplicada: ${a.area.toFixed(4)} m²/pieza · canto: ${a.ml.toFixed(2)} ml × ${a.edgeParts} vidrio(s)/pieza<br>Peso vidrio: ${a.weight.toFixed(2)} kg<br>Vidrio y cantos: ${money(a.glassCost - a.energy)} · recargo energético: ${money(a.energy)}<br>Otros conceptos: ${esc(l.extraDescription || "Sin concepto")} · ${money(a.extraCost)} (${a.separate ? "separado" : "integrado en vidrio"})</td><td>${money(a.cost)}</td><td>${money(a.margin)}</td><td>${money(a.sale)}</td></tr>`;
        return `<tr><td>${label}</td><td>${money(a.glassSale)}</td></tr>${a.energySale ? `<tr><td>Recargo energético</td><td>${money(a.energySale)}</td></tr>` : ""}${a.separate && a.extraCost ? `<tr><td>${esc(l.extraDescription || "Otros conceptos")}</td><td>${money(a.extraSale)}</td></tr>` : ""}`;
      })
      .join("");
    const options = pdfOptions(draft),
      hasGlass = draft.lines.some(
        (line) => !["concept", "aluminum"].includes(line.kind),
      ),
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
        ["area", "m² facturables"],
        ["unitPrice", "Precio €/m²"],
      ].filter(([key]) => hasGlass && options[key]),
      emptyCells = columns.map(() => "<td></td>").join(""),
      customerRows = draft.lines
        .map((line, i) => {
          const a = breakdown.lines[i];
          if (["concept", "aluminum"].includes(line.kind))
            return `<tr><td>${line.kind === "aluminum" ? aluminumDescription(line) : esc(line.description)}</td>${emptyCells}<td>${money(a.sale)}</td></tr>`;
          const values = {
            dimensions: `${number(a.h * 10, 1)} × ${number(a.w * 10, 1)}`,
            quantity: a.qty,
            area: number(a.area * a.qty, 4),
            unitPrice: money(a.glassSale / (a.area * a.qty)),
          };
          return `<tr><td>${esc(glassName(line) || "Vidrio")}</td>${columns.map(([key]) => `<td>${esc(values[key])}</td>`).join("")}<td>${money(a.glassSale)}</td></tr>${a.energySale ? `<tr class="quote-doc-energy"><td>Recargo energético</td>${emptyCells}<td>${money(a.energySale)}</td></tr>` : ""}${a.separate && a.extraCost ? `<tr class="quote-doc-extra"><td>${esc(line.extraDescription || "Otros conceptos")}</td>${emptyCells}<td>${money(a.extraSale)}</td></tr>` : ""}`;
        })
        .join(""),
      companyName = company.name || "Vidres Sosa",
      logo = VSUtils.isCompanyLogo(company.logo)
        ? `<img class="quote-doc-logo" src="${esc(company.logo)}" alt="${esc(companyName)}">`
        : `<img class="quote-doc-logo" data-vector-logo="true" src="icons/vidres-sosa-horizontal.svg" alt="Vidres Sosa · Cristalleria i alumini">`,
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
      )}</section></div></header><div class="quote-doc-dates"><p><strong>Fecha oferta:</strong> ${esc(dateLabel(draft.date))}</p>${showValidity ? `<p><strong>Fecha validez:</strong> ${esc(dateLabel(addDays(draft.date, Number(company.validity) || 30)))}</p>` : ""}${draft.job ? `<p><strong>Parte relacionado:</strong> ${esc(draft.job)}</p>` : ""}</div><table class="quote-doc-items"><thead><tr><th>Concepto</th>${internal ? "<th>Coste</th><th>Margen añadido</th>" : columns.map(([, label]) => `<th>${label}</th>`).join("")}<th>Importe sin IVA</th></tr></thead><tbody>${internal ? rows : customerRows}</tbody></table>${(internal || options.observations) && draft.observations ? `<section class="quote-doc-notes"><h2>OBSERVACIONES</h2><p>${lines(draft.observations)}</p></section>` : ""}${(internal || options.conditions) && company.conditions ? `<section class="quote-doc-notes"><h2>CONDICIONES</h2><p>${lines(company.conditions)}</p></section>` : ""}${internal && pricing(draft).priceMode === "fixed" ? `<p>Tarifa de venta del vidrio: ${money(num(pricing(draft).fixedPrice))}/m²</p>` : ""}${internal ? `<p>Coste interno: ${money(breakdown.cost)}<br>${draft.lines.some((l) => l.kind === "aluminum") ? "El aluminio aplica su incremento propio por línea. " : ""}${pricing(draft).priceMode === "fixed" ? "Diferencia entre venta y coste" : `Margen sobre ${pricing(draft).marginScope === "glass" ? "precio del vidrio" : pricing(draft).marginMode === "sale" ? "venta sin IVA" : "coste"} (${esc(pricing(draft).margin || 0)} %)`}: ${money(breakdown.margin)}</p>` : ""}<footer class="quote-doc-footer"><div class="quote-doc-summary">${hasGlass && (internal || options.quantity) ? `<span>Total unidades: ${breakdown.lines.reduce((n, a, i) => n + (["concept", "aluminum"].includes(draft.lines[i].kind) ? 0 : a.qty), 0)}</span>` : ""}${
      hasGlass && (internal || options.area)
        ? `<span>Total m²: ${number(
            breakdown.lines.reduce(
              (n, a, i) =>
                n +
                (["concept", "aluminum"].includes(draft.lines[i].kind)
                  ? 0
                  : a.area * a.qty),
              0,
            ),
            4,
          )}</span>`
        : ""
    }</div><table class="quote-doc-totals"><thead><tr><th>Base imponible</th><th>IVA ${esc(pricing(draft).vat ?? 21)} %</th><th>TOTAL PRESUPUESTO</th></tr></thead><tbody><tr><td>${money(t.base)}</td><td>${money(t.iva)}</td><td><strong>${money(t.total)}</strong></td></tr></tbody></table>${showValidity ? `<p>Validez: ${esc(company.validity || 30)} días desde la fecha del presupuesto.</p>` : ""}</footer>`;
    try {
      const reference = String(draft.id || "borrador").replace(
        /[^a-zA-Z0-9_-]/g,
        "_",
      );
      VSQuotePDF.show(
        host,
        `Presupuesto-${reference}-${internal ? "interno" : "cliente"}.pdf`,
      );
    } catch (error) {
      alert("No se pudo preparar el PDF. " + error.message);
    }
  }
  window.addEventListener("vidres-data-restored", () => {
    draft = null;
    editorOpen = false;
    quickMode = false;
  });
  window.vidresQuoteRender = sync;
  window.vidresQuoteClick = async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.facturadirecta)
      return window.VSFacturaDirecta.open(b.dataset.facturadirecta);
    if (!validPriceFields()) return;
    try {
      if (
        b.hasAttribute("data-quote-client-option") ||
        b.hasAttribute("data-quote-client-new")
      ) {
        fromForm();
        chooseClient(
          b.hasAttribute("data-quote-client-option")
            ? clientOptions()[b.dataset.quoteClientOption]
            : undefined,
        );
      } else if (b.hasAttribute("data-quote-reference")) {
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
          editorOpen = true;
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
      } else if (b.id === "quick-close" || b.id === "quote-close") {
        if (discard()) {
          quickMode = false;
          editorOpen = false;
          draft = null;
          sync();
        }
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
      } else if (b.id === "quote-add-aluminum") {
        fromForm();
        draft.lines.push({
          kind: "aluminum",
          description: "",
          amount: "",
          aluminumMargin: 0,
        });
        dropEmptyGlass();
        sync();
      } else if (b.hasAttribute("data-remove-drawing")) {
        fromForm();
        delete draft.lines[Number(b.dataset.removeDrawing)].drawing;
        sync();
      } else if (b.id === "quote-add-concept") {
        fromForm();
        draft.lines.push({ kind: "concept", description: "", amount: "" });
        dropEmptyGlass();
        sync();
      } else if (b.dataset.remove !== undefined) {
        fromForm();
        draft.lines.splice(Number(b.dataset.remove), 1);
        sync();
      } else if (b.id === "quote-pdf") printQuote();
      else if (b.id === "quote-pdf-internal") printQuote(true);
      else if (b.dataset.load) {
        if (discard()) {
          editorOpen = true;
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
          if (draft?.id === b.dataset.deleteQuote) {
            draft = null;
            editorOpen = false;
          }
          sync();
        }
      } else if (b.dataset.duplicate) {
        if (discard()) {
          editorOpen = true;
          draft = structuredClone(
            quotes().find((q) => q.id === b.dataset.duplicate),
          );
          const c = config();
          draft.pricing = {
            ...pricing(draft),
            energyMode: "kg",
            energy: c.energyMode === "kg" ? (c.energy ?? "") : "",
          };
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
  window.vidresQuoteChange = async (e) => {
    if (!validPriceFields()) return;
    if (e.target.matches("[data-aluminum-upload]")) {
      const input = e.target,
        file = input.files?.[0];
      if (!file) return;
      fromForm();
      const line =
        draft.lines[Number(input.closest(".quote-line").dataset.line)];
      input.disabled = true;
      uploadingDrawing = true;
      try {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 8000000
        )
          throw Error("Sube una imagen JPG, PNG o WebP de hasta 8 MB.");
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        let drawing;
        try {
          for (const size of [1200, 1000, 800, 600]) {
            const scale = Math.min(
              1,
              size / Math.max(bitmap.width, bitmap.height),
            );
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            drawing = canvas.toDataURL("image/jpeg", 0.85);
            if (drawing.length <= 60000) break;
          }
        } finally {
          bitmap.close();
        }
        if (drawing.length > 60000)
          throw Error("Recorta más la imagen para guardar un dibujo legible.");
        if (
          draft.lines.reduce(
            (n, l) =>
              n + (l === line ? drawing.length : l.drawing?.length || 0),
            0,
          ) > 350000
        )
          throw Error(
            "Demasiados dibujos. Divide el presupuesto o reduce las imágenes.",
          );
        line.drawing = drawing;
        if (draft?.lines.includes(line)) sync();
      } catch (error) {
        alert(error.message);
      } finally {
        uploadingDrawing = false;
        input.disabled = false;
        input.value = "";
      }
      return;
    }
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
      if (
        e.target.closest(".quick-double") ||
        ["quick-client"].includes(e.target.id)
      )
        sync();
      return;
    }
    if (e.target.id === "quote-existing-client") {
      fromForm();
      chooseClient(clientOptions()[e.target.value]);
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
  window.vidresQuoteInput = (event) => {
    if (!validPriceFields()) return;
    if (quickMode) {
      updateQuickResult();
      return;
    }
    fromForm();
    if (event?.target?.id === "quote-client") {
      showClientMatches();
      document.querySelector(".quote-customer").outerHTML = customerFields();
    }
    document.querySelectorAll(".quote-line").forEach((el) => {
      const line = draft.lines[Number(el.dataset.line)];
      if (line.kind === "aluminum")
        el.querySelector(".quote-aluminum-result").textContent =
          "Venta sin IVA: " +
          money(details(draft).lines[Number(el.dataset.line)].sale);
      else if (line.kind !== "concept")
        el.querySelector(".quote-result").innerHTML = lineResult(
          details(draft).lines[Number(el.dataset.line)],
        );
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
    editorOpen = true;
    draft = fresh();
    draft.job = id;
    draft.client = client || "";
    delete draft.clientSource;
    applyClientProfile();
    if (measures?.length)
      draft.lines = measures.map((m) => ({
        ...emptyLine(),
        w: m.ancho,
        h: m.alto,
        qty: m.cantidad,
        thickness: m.espesor || "",
        glass: m.tipo,
      }));
    window.vidresQuotePage = "presupuestos";
    window.vidresNavigate("presupuestos");
  };
  window.vidresQuoteOpenSaved = (id) => {
    if (discard()) {
      quickMode = false;
      editorOpen = true;
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
  function updateMessageRecipient() {
    const other = messageForm.elements.destinatario.value === "other";
    const input = messageForm.elements.telefono;
    input.closest("label").hidden = !other;
    input.disabled = !other;
    input.required = other;
    input.setCustomValidity("");
  }
  messageForm.elements.destinatario.addEventListener(
    "change",
    updateMessageRecipient,
  );
  messageForm.elements.telefono.addEventListener("input", () =>
    messageForm.elements.telefono.setCustomValidity(""),
  );
  messageForm.addEventListener(
    "submit",
    VSForms.guard(async (event) => {
      event.preventDefault();
      if (!messageTarget || !messageForm.reportValidity()) return;
      const text = messageForm.elements.mensaje.value.trim(),
        phone =
          messageForm.elements.destinatario.value === "card"
            ? phoneForQuote(messageTarget)
            : normalizePhone(messageForm.elements.telefono.value),
        targetId = messageTarget.id;
      const phoneInput = messageForm.elements.telefono;
      phoneInput.setCustomValidity(
        /^\d{7,15}$/.test(phone)
          ? ""
          : "Introduce un teléfono válido con prefijo internacional.",
      );
      if (!messageForm.reportValidity()) return;
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
