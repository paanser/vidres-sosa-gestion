"use strict";
(() => {
  const { esc, num, money, round6 } = VSUtils;

  const T = "vs-tariffs-prototype-v1",
    C = "vs-config-v1",
    P = "vs-pdf-catalog-v1",
    PL = "vidres-plantillas-v1";
  const read = (k, f) => {
    try {
      return JSON.parse(VSStorage.local.getItem(k)) ?? f;
    } catch {
      return f;
    }
  };
  function defaultPlantillas() {
    return [
      {
        id: "T-" + crypto.randomUUID(),
        nombre: "Mampara de ducha",
        descripcion: "Instalar mampara de ducha",
        tipoCliente: "Particular",
        notas: "",
        piezas: [
          { tipo: "Templado", espesor: "8", observaciones: "Cantos pulidos" },
        ],
      },
      {
        id: "T-" + crypto.randomUUID(),
        nombre: "Escaparate",
        descripcion: "Sustituir vidrio de escaparate",
        tipoCliente: "Particular",
        notas: "",
        piezas: [
          {
            tipo: "Laminado",
            espesor: "6",
            observaciones: "Vidrio de seguridad",
          },
        ],
      },
      {
        id: "T-" + crypto.randomUUID(),
        nombre: "Cambio de luna",
        descripcion: "Cambio de luna",
        tipoCliente: "Particular",
        notas: "",
        piezas: [{ tipo: "Monolítico", espesor: "4", observaciones: "" }],
      },
    ];
  }
  function plantillas() {
    const v = read(PL, null);
    if (Array.isArray(v)) return v;
    const seed = defaultPlantillas();
    VSStorage.local.setItem(PL, JSON.stringify(seed));
    return seed;
  }
  const euro = money;
  const config = () => ({
    ...{ unit: "cm", energy: "", energyMode: "pending" },
    ...read(C, {}),
  });
  let query = "",
    selected = "all",
    pendingPdf = null;
  const catalog = () => read(T, []);
  function toolHome() {
    return '<section class="panel"><h2>Herramientas de consulta</h2><div class="tool-tiles"><button data-tool-go="consultor"><strong>Consultar tarifas</strong><small>Buscar precios de vidrio</small></button><button data-tool-go="tarifas"><strong>Tarifas</strong><small>Gestionar precios y catálogo</small></button><button data-tool-go="clientes"><strong>Clientes</strong><small>Datos de contacto e historial</small></button><button data-tool-go="calendario"><strong>Calendario</strong><small>Consultar fechas de los trabajos</small></button></div></section>';
  }

  function consult() {
    const list = catalog();
    const filtered = list.filter(
      (t) =>
        (selected === "all" || t.id === selected) &&
        [t.name, t.price, t.edge]
          .join(" ")
          .toLocaleLowerCase("es")
          .includes(query.toLocaleLowerCase("es")),
    );
    return (
      '<section class="panel"><h2>Consultor de tarifas</h2><p class="muted">Consulta rápida de los artículos importados en CSV. No crea presupuestos.</p><div class="quote-fields"><label>Tarifa<select id="consult-filter"><option value="all">Todas las tarifas</option>' +
      list
        .map(
          (t) =>
            '<option value="' +
            esc(t.id) +
            '" ' +
            (selected === t.id ? "selected" : "") +
            ">" +
            esc(t.name) +
            "</option>",
        )
        .join("") +
      '</select></label><label>Buscar vidrio<input id="consult-search" placeholder="Laminado, 5+5, templado…" value="' +
      esc(query) +
      '" autocomplete="off"></label></div><div id="consult-results">' +
      results(filtered) +
      "</div></section>"
    );
  }
  function results(list) {
    return list.length
      ? '<div class="consult-table"><table><thead><tr><th>Descripción</th><th>€/m²</th><th>€/ml canto</th></tr></thead><tbody>' +
          list
            .map(
              (t) =>
                "<tr><td>" +
                esc(t.name) +
                "</td><td>" +
                euro(t.price) +
                "</td><td>" +
                euro(t.edge) +
                "</td></tr>",
            )
            .join("") +
          "</tbody></table></div>"
      : '<p class="muted">No hay resultados. Importa una tarifa CSV desde Ajustes o cambia la búsqueda.</p>';
  }
  function tariffList() {
    const items = catalog();
    return (
      '<div class="tariff-list">' +
      items
        .map(
          (t) =>
            '<div class="quote-saved"><span>' +
            esc(t.name) +
            " · " +
            euro(t.price) +
            "/m² · " +
            euro(t.edge) +
            '/ml</span><button type="button" data-tariff-delete="' +
            esc(t.id) +
            '">Eliminar</button></div>',
        )
        .join("") +
      (items.length
        ? '<button type="button" id="tariffs-clear">Eliminar todas las tarifas</button>'
        : "<p>No hay tarifas.</p>") +
      "</div>"
    );
  }
  function plantillasHtml() {
    const items = plantillas();
    return (
      '<section class="panel"><h2>Plantillas de trabajo</h2><p class="muted">Plantillas para empezar un nuevo parte: descripción, tipo de cliente, notas y piezas sin medidas.</p><button type="button" id="plantilla-new" class="primary">+ Nueva plantilla</button>' +
      (items.length
        ? '<div class="plantilla-list">' +
          items
            .map(
              (t) =>
                '<article class="plantilla-item"><div><strong>' +
                esc(t.nombre) +
                "</strong><p>" +
                esc(t.descripcion || "") +
                " · " +
                esc(t.tipoCliente || "Particular") +
                " · " +
                (Array.isArray(t.piezas) ? t.piezas.length : 0) +
                ' pieza(s)</p></div><div><button type="button" data-plantilla-edit="' +
                esc(t.id) +
                '">Editar</button><button type="button" data-plantilla-delete="' +
                esc(t.id) +
                '">Eliminar</button></div></article>',
            )
            .join("") +
          "</div>"
        : '<p class="muted">No hay plantillas.</p>') +
      "</section>"
    );
  }
  function settings() {
    const c = config(),
      company = c.company || {},
      pdfs = read(P, []);
    return (
      '<section class="panel"><h2>Configuración general</h2><div class="quote-fields"><label>Unidad de entrada<select id="cfg-unit"><option value="cm" ' +
      (c.unit !== "mm" ? "selected" : "") +
      '>Centímetros</option><option value="mm" ' +
      (c.unit === "mm" ? "selected" : "") +
      '>Milímetros</option></select></label><label>Días hasta reclamar un presupuesto<input id="cfg-followup-days" type="number" min="1" max="365" step="1" value="' +
      esc(c.followupDays || 4) +
      '"></label><label>IVA (%)<input id="cfg-vat" type="number" min="0" max="100" step="0.01" value="' +
      esc(c.vat ?? 21) +
      '"></label><label>Recargo energético<input id="cfg-energy" type="number" min="0" step="0.01" value="' +
      esc(c.energy || "") +
      '"></label><label>Aplicar recargo como<select id="cfg-energy-mode">' +
      [
        ["pending", "Sin aplicar"],
        ["percent", "Porcentaje"],
        ["m2", "Euros por m²"],
      ]
        .map(
          ([v, t]) =>
            '<option value="' +
            v +
            '" ' +
            (c.energyMode === v ? "selected" : "") +
            ">" +
            t +
            "</option>",
        )
        .join("") +
      '</select></label></div><details><summary>Datos de empresa y condiciones del presupuesto</summary><div class="quote-fields">' +
      [
        ["name", "Nombre"],
        ["taxId", "CIF/NIF"],
        ["address", "Dirección"],
        ["phone", "Teléfono"],
        ["email", "Correo"],
      ]
        .map(
          ([k, t]) =>
            "<label>" +
            t +
            '<input data-company="' +
            k +
            '" value="' +
            esc(company[k] || "") +
            '"></label>',
        )
        .join("") +
      '<label>Validez (días)<input data-company="validity" type="number" min="1" value="' +
      esc(company.validity || 30) +
      '"></label></div><label>Condiciones<textarea data-company="conditions" rows="4">' +
      esc(company.conditions || "") +
      '</textarea></label><label>Plantilla de WhatsApp<textarea id="cfg-whatsapp-template" rows="7" maxlength="3000">' +
      esc(
        c.whatsappTemplate ||
          "Hola{cliente}, te paso el precio:\n\n{detalle}\n\nBase: {base}\nIVA: {iva}\nTotal: {total}\n\n{empresa}. Presupuesto válido {validez} días.",
      ) +
      '</textarea></label><p class="muted">Campos disponibles: {cliente}, {detalle}, {base}, {iva}, {total}, {empresa}, {validez}.</p></details><p>Los impuestos y recargos se copian a los presupuestos nuevos. Los guardados conservan sus condiciones.</p><button id="cfg-save" class="primary">Guardar configuración</button><p id="cfg-notice" role="status"></p></section><section class="panel"><h2>Tarifas y documentos PDF</h2><label>Importar tarifas CSV<input id="cfg-csv" type="file" accept=".csv,text/csv"></label><p id="csv-notice" role="status"></p>' +
      tariffList() +
      '<label>Seleccionar PDF de tarifa<input id="cfg-pdf" type="file" accept=".pdf,application/pdf"></label><p id="pdf-notice" role="status"></p><p>El catálogo PDF solo registra el nombre, no guarda el archivo. Los documentos de cada expediente se guardan en su sección Documentos.</p>' +
      pdfs
        .map(
          (p, i) =>
            '<div class="quote-saved">' +
            esc(p.name) +
            ' <button data-pdf-remove="' +
            i +
            '">Quitar</button></div>',
        )
        .join("") +
      "</section>" +
      plantillasHtml()
    );
  }
  // --- Catálogo de conceptos frecuentes (se añaden de un toque) ---
  function defaultConceptos() {
    return [
      {
        nombre: "Desplazamiento",
        tipo: "desplazamiento",
        forma: "fijo",
        precio: 30,
      },
      { nombre: "Instalación", tipo: "mano_obra", horas: 1, tarifa: 45 },
      { nombre: "Siliconado", tipo: "material", cantidad: 1, precio: 8 },
      { nombre: "Retirada de residuos", tipo: "residuos", precio: 40 },
    ];
  }
  function conceptoPrecio(c) {
    if (c.tipo === "mano_obra")
      return (Number(c.tarifa) || 0) * (Number(c.horas) || 1);
    if (c.tipo === "material")
      return (Number(c.precio) || 0) * (Number(c.cantidad) || 1);
    return Number(c.precio) || 0;
  }
  function conceptos() {
    const c = read(C, {});
    return Array.isArray(c.conceptos) && c.conceptos.length
      ? c.conceptos
      : defaultConceptos();
  }
  window.vidresConceptos = conceptos;

  // --- Gestión de tarifas ---
  function tariffManager() {
    const items = catalog().map((t) => window.vidresTariffs.normalize(t));
    const proveedores = [
      ...new Set(items.map((t) => t.proveedor).filter(Boolean)),
    ].sort((a, b) => a.localeCompare(b, "es"));
    const tabla = items.length
      ? `<div class="tariff-table-wrap"><table><thead><tr><th>Nombre</th><th>Familia</th><th>Espesor</th><th>Coste</th><th>Margen</th><th>Venta €/m²</th><th>Proveedor</th><th>Mín.</th><th>Act.</th><th></th></tr></thead><tbody>${items
          .map(
            (t) =>
              `<tr><td>${esc(t.name)}</td><td>${esc(t.familia || "—")}</td><td>${esc(t.espesor || "—")}</td><td>${t.coste ? euro(t.coste) : "—"}</td><td>${t.margen ? esc(t.margen) + " %" : "—"}</td><td>${euro(t.price)}</td><td>${esc(t.proveedor || "—")}</td><td>${t.minimoM2 ? esc(t.minimoM2) + " m²" : "—"}</td><td>${esc(t.updatedAt || "—")}</td><td><button data-tariff-edit="${esc(t.id)}">Editar</button><button data-tariff-delete="${esc(t.id)}">Eliminar</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : '<p class="muted">No hay tarifas. Importa un CSV o crea una.</p>';
    const conceptosHtml = conceptos()
      .map(
        (c) =>
          `<div class="quote-saved"><span>${esc(c.nombre)} · ${euro(conceptoPrecio(c))}</span></div>`,
      )
      .join("");
    return `<section class="panel"><div class="simple-section-head"><h2>Tarifas de vidrio</h2><button type="button" class="primary" id="tariff-new">+ Nueva tarifa</button></div>${tabla}<div class="tariff-actions"><button type="button" id="tariff-export">Exportar CSV</button><label class="exp-upload">Importar CSV<input id="tariff-csv" type="file" accept=".csv,text/csv" hidden></label></div><p id="tariff-notice" role="status"></p></section>
<section class="panel"><h2>Actualización masiva</h2><p class="muted">Sube el precio de venta un porcentaje a un proveedor (o a todos).</p><div class="quote-fields"><label>Proveedor<select id="bulk-proveedor"><option value="">Todos</option>${proveedores.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("")}</select></label><label>Subir (%)<input id="bulk-pct" type="number" inputmode="decimal" min="0" step="0.1" value="5"></label></div><div id="bulk-preview" class="muted"></div><button type="button" class="primary" id="bulk-apply">Aplicar subida</button></section>
<section class="panel"><h2>Conceptos frecuentes</h2><p class="muted">Disponibles al crear presupuestos (botón "+ Concepto").</p>${conceptosHtml || '<p class="muted">Sin conceptos.</p>'}</section>`;
  }

  function downloadCsv(text, name) {
    const blob = new Blob(["\uFEFF" + text], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function openTariffEditor(id = "") {
    const dialog = document.querySelector("#tariff-editor");
    if (!dialog) return;
    const form = dialog.querySelector("form");
    form.reset();
    const t = id ? catalog().find((x) => x.id === id) : null;
    form.elements.id.value = t?.id || "";
    form.elements.name.value = t?.name || "";
    form.elements.familia.value = t?.familia || "";
    form.elements.espesor.value = t?.espesor || "";
    form.elements.coste.value = t?.coste ?? "";
    form.elements.margen.value = t?.margen ?? "";
    form.elements.price.value = t?.price ?? "";
    form.elements.edge.value = t?.edge ?? "";
    form.elements.proveedor.value = t?.proveedor || "";
    form.elements.minimoM2.value = t?.minimoM2 ?? "";
    form.elements.minimoImporte.value = t?.minimoImporte ?? "";
    form.elements.redondeo.value = String(t?.redondeo ?? 6);
    dialog.querySelector("#tariff-title").textContent = t
      ? "Editar tarifa"
      : "Nueva tarifa";
    dialog.showModal();
  }
  function renderBulkPreview() {
    const host = document.querySelector("#bulk-preview");
    if (!host) return;
    const proveedor = document.querySelector("#bulk-proveedor")?.value || "";
    const pct = Number(document.querySelector("#bulk-pct")?.value);
    const preview = window.vidresTariffs.previewBulk(catalog(), proveedor, pct);
    if (!preview.length) {
      host.textContent = "";
      return;
    }
    host.innerHTML =
      "Vista previa: " +
      preview
        .slice(0, 8)
        .map((p) => `${esc(p.name)}: ${euro(p.de)} → ${euro(p.a)}`)
        .join(" · ") +
      (preview.length > 8 ? " · …" : "");
  }
  async function applyBulkFromForm() {
    const proveedor = document.querySelector("#bulk-proveedor")?.value || "";
    const pct = Number(document.querySelector("#bulk-pct")?.value);
    if (!Number.isFinite(pct) || pct <= 0) {
      VSUI.toast("Indica un porcentaje positivo.", "warn");
      return;
    }
    const actual = catalog();
    const preview = window.vidresTariffs.previewBulk(actual, proveedor, pct);
    if (!preview.length) {
      VSUI.toast("No hay tarifas que actualizar para ese proveedor.", "warn");
      return;
    }
    const ok = await VSUI.confirm({
      titulo: "Actualizar tarifas",
      texto:
        "Se actualizarán " +
        preview.length +
        " tarifas (subida del " +
        pct +
        " %).",
      aceptar: "Aplicar",
      cancelar: "Cancelar",
    });
    if (!ok) return;
    VSStorage.local.setItem(
      T,
      JSON.stringify(window.vidresTariffs.applyBulk(actual, proveedor, pct)),
    );
    window.dispatchEvent(new Event("vidres-tariffs-change"));
    window.vidresToolsRender("tarifas");
    VSUI.toast("Tarifas actualizadas.", "ok");
  }

  window.vidresToolsRender = (page) => {
    const root = document.querySelector("#content");
    if (!root) return;
    root.innerHTML =
      page === "herramientas"
        ? toolHome()
        : page === "consultor"
          ? consult()
          : page === "tarifas"
            ? tariffManager()
            : settings();
  };
  window.vidresToolsClick = async (e, navigate) => {
    const t = e.target.closest("button");
    if (!t) return false;
    if (t.dataset.toolGo) {
      navigate(t.dataset.toolGo);
      return true;
    }
    if (t.id === "tariff-new") {
      openTariffEditor();
      return true;
    }
    if (t.dataset.tariffEdit) {
      openTariffEditor(t.dataset.tariffEdit);
      return true;
    }
    if (t.id === "tariff-export") {
      const items = catalog().map((x) => window.vidresTariffs.normalize(x));
      downloadCsv(window.vidresTariffs.exportCsv(items), "tarifas.csv");
      VSUI.toast("CSV descargado.", "ok");
      return true;
    }
    if (t.id === "bulk-apply") {
      await applyBulkFromForm();
      return true;
    }
    if (t.dataset.tariffDelete || t.id === "tariffs-clear") {
      const todas = t.id === "tariffs-clear";
      const ok = await VSUI.confirm({
        titulo: todas ? "Eliminar todas las tarifas" : "Eliminar tarifa",
        texto: todas
          ? "¿Eliminar todas las tarifas? Los presupuestos conservan sus precios guardados."
          : "¿Eliminar esta tarifa?",
        aceptar: "Eliminar",
        cancelar: "Cancelar",
        peligro: true,
      });
      if (!ok) return true;
      VSStorage.local.setItem(
        T,
        JSON.stringify(
          t.id === "tariffs-clear"
            ? []
            : catalog().filter((x) => x.id !== t.dataset.tariffDelete),
        ),
      );
      window.dispatchEvent(new Event("vidres-tariffs-change"));
      window.vidresNavigate("tarifas");
      return true;
    }
    if (t.id === "cfg-save") {
      const unit = document.querySelector("#cfg-unit").value,
        energy = document.querySelector("#cfg-energy").value,
        vat = document.querySelector("#cfg-vat").value,
        energyMode = document.querySelector("#cfg-energy-mode").value,
        followupDays = Number(
          document.querySelector("#cfg-followup-days").value,
        );
      if (
        vat.trim() === "" ||
        !Number.isFinite(Number(vat)) ||
        Number(vat) < 0 ||
        Number(vat) > 100 ||
        !Number.isFinite(Number(energy)) ||
        Number(energy) < 0 ||
        !Number.isInteger(followupDays) ||
        followupDays < 1 ||
        followupDays > 365
      ) {
        VSUI.toast("Revisa el IVA, recargo y días de seguimiento", "warn");
        return true;
      }
      const company = Object.fromEntries(
        [...document.querySelectorAll("[data-company]")].map((el) => [
          el.dataset.company,
          el.value.trim(),
        ]),
      );
      if (
        !Number.isInteger(Number(company.validity)) ||
        Number(company.validity) < 1
      ) {
        VSUI.toast("La validez debe ser un número de días positivo", "warn");
        return true;
      }
      VSStorage.write(C, {
        ...config(),
        unit,
        energy,
        vat: Number(vat),
        energyMode,
        followupDays,
        company,
        whatsappTemplate: document
          .querySelector("#cfg-whatsapp-template")
          .value.trim(),
      });
      document.querySelector("#cfg-notice").textContent =
        "Configuración guardada en este dispositivo.";
      return true;
    }
    if (t.dataset.pdfRemove !== undefined) {
      const pdfs = read(P, []);
      pdfs.splice(Number(t.dataset.pdfRemove), 1);
      VSStorage.local.setItem(P, JSON.stringify(pdfs));
      window.vidresToolsRender("ajustes");
      return true;
    }
    if (t.id === "plantilla-new") {
      openPlantillaEditor();
      return true;
    }
    if (t.dataset.plantillaEdit) {
      openPlantillaEditor(t.dataset.plantillaEdit);
      return true;
    }
    if (t.dataset.plantillaDelete) {
      if (
        await VSUI.confirm({
          titulo: "Eliminar plantilla",
          texto: "¿Eliminar esta plantilla?",
          aceptar: "Eliminar",
          cancelar: "Cancelar",
          peligro: true,
        })
      ) {
        VSStorage.local.setItem(
          PL,
          JSON.stringify(
            plantillas().filter((x) => x.id !== t.dataset.plantillaDelete),
          ),
        );
        window.vidresToolsRender("ajustes");
      }
      return true;
    }
    return false;
  };
  window.vidresToolsInput = (e) => {
    if (e.target.id === "consult-search") {
      query = e.target.value;
      const f = catalog().filter(
        (t) =>
          (selected === "all" || t.id === selected) &&
          [t.name, t.price, t.edge]
            .join(" ")
            .toLocaleLowerCase("es")
            .includes(query.toLocaleLowerCase("es")),
      );
      document.querySelector("#consult-results").innerHTML = results(f);
    }
    if (e.target.id === "bulk-pct") renderBulkPreview();
  };
  window.vidresToolsChange = async (e) => {
    if (e.target.id === "consult-filter") {
      selected = e.target.value;
      window.vidresToolsRender("consultor");
      return;
    }
    if (e.target.id === "bulk-proveedor") {
      renderBulkPreview();
      return;
    }
    if (e.target.id === "tariff-csv") {
      const file = e.target.files?.[0];
      if (!file) return;
      const notice = document.querySelector("#tariff-notice");
      try {
        if (file.size > 250000)
          throw Error("CSV demasiado grande (máximo 250 KB).");
        const { items, errors } = window.vidresTariffs.parseCsv(
          await file.text(),
        );
        if (errors.length) throw Error("Errores en: " + errors.join(", "));
        if (!items.length) throw Error("CSV sin artículos.");
        VSStorage.local.setItem(
          T,
          JSON.stringify(window.vidresTariffs.merge(catalog(), items)),
        );
        window.dispatchEvent(new Event("vidres-tariffs-change"));
        window.vidresToolsRender("tarifas");
        if (notice)
          notice.textContent =
            items.length + " artículos importados o actualizados.";
      } catch (err) {
        if (notice) notice.textContent = err.message;
        else VSUI.toast(err.message, "error");
      }
      return;
    }
    if (e.target.id === "cfg-csv") {
      const file = e.target.files?.[0];
      if (!file) return;
      const notice = document.querySelector("#csv-notice");
      try {
        if (file.size > 250000)
          throw Error("CSV demasiado grande (máximo 250 KB).");
        const raw = (await file.text())
          .replace(/^\uFEFF/, "")
          .trim()
          .split(/\r?\n/);
        const sep = raw[0].includes(";") ? ";" : ",";
        const head = raw
          .shift()
          .split(sep)
          .map((x) => x.trim().toLowerCase());
        const indices = ["nombre", "precio_m2", "precio_ml"].map((x) =>
          head.indexOf(x),
        );
        if (indices.some((x) => x < 0))
          throw Error("Columnas necesarias: nombre,precio_m2,precio_ml.");
        const items = raw.filter(Boolean).map((line, i) => {
          const parts = line
            .split(sep)
            .map((x) => x.trim().replace(/^"|"$/g, ""));
          const price = Number((parts[indices[1]] || "").replace(",", ".")),
            edge = Number((parts[indices[2]] || "0").replace(",", ".")),
            name = parts[indices[0]];
          if (
            !name ||
            !Number.isFinite(price) ||
            price <= 0 ||
            !Number.isFinite(edge) ||
            edge < 0
          )
            throw Error("Error en fila " + (i + 2));
          return { id: "T-" + Date.now() + "-" + i, name, price, edge };
        });
        if (!items.length) throw Error("CSV sin artículos.");
        VSStorage.local.setItem(
          T,
          JSON.stringify(window.vidresTariffs.merge(catalog(), items)),
        );
        window.dispatchEvent(new Event("vidres-tariffs-change"));
        window.vidresNavigate("ajustes");
        document.querySelector("#csv-notice").textContent =
          items.length + " artículos importados o actualizados.";
      } catch (err) {
        notice.textContent = err.message;
      }
      return;
    }
    if (e.target.id === "cfg-pdf") {
      const file = e.target.files?.[0];
      if (!file) return;
      const notice = document.querySelector("#pdf-notice");
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        notice.textContent = "Selecciona un archivo PDF.";
        return;
      }
      if (file.size > 15000000) {
        notice.textContent = "El PDF supera 15 MB.";
        return;
      }
      const pdfs = read(P, []);
      pdfs.push({
        name: file.name,
        date: new Date().toLocaleDateString("es-ES"),
      });
      VSStorage.local.setItem(P, JSON.stringify(pdfs));
      window.vidresToolsRender("ajustes");
      document.querySelector("#pdf-notice").textContent =
        "PDF registrado por nombre. El archivo NO se ha guardado ni enviado al servidor; queda pendiente de procesamiento.";
      return;
    }
  };
  const plantillaTypes = [
    "Laminado",
    "Templado",
    "Cámara",
    "Monolítico",
    "Otro",
  ];
  function plantillaPieceRow(p = {}) {
    const row = document.createElement("div");
    row.className = "plantilla-piece";
    row.innerHTML =
      '<label>Tipo de vidrio<select data-pp="tipo">' +
      plantillaTypes
        .map(
          (o) =>
            "<option" +
            (p.tipo === o ? " selected" : "") +
            ">" +
            esc(o) +
            "</option>",
        )
        .join("") +
      '</select></label><label>Espesor (mm)<input data-pp="espesor" type="number" inputmode="decimal" min="0" step="0.1" value="' +
      esc(p.espesor || "") +
      '"></label><label>Observaciones<input data-pp="observaciones" maxlength="500" value="' +
      esc(p.observaciones || "") +
      '"></label><button type="button" data-pp-remove>Quitar pieza</button>';
    return row;
  }
  function openPlantillaEditor(id = "") {
    const dialog = document.querySelector("#plantilla-editor");
    if (!dialog) return;
    const form = dialog.querySelector("#plantilla-form"),
      t = id ? plantillas().find((x) => x.id === id) : null;
    form.reset();
    form.elements.id.value = t?.id || "";
    form.elements.nombre.value = t?.nombre || "";
    form.elements.descripcion.value = t?.descripcion || "";
    form.elements.tipoCliente.value = t?.tipoCliente || "Particular";
    form.elements.notas.value = t?.notas || "";
    const list = dialog.querySelector("#plantilla-piezas");
    list.replaceChildren();
    for (const p of t?.piezas || []) list.appendChild(plantillaPieceRow(p));
    dialog.querySelector("#plantilla-title").textContent = t
      ? "Editar plantilla"
      : "Nueva plantilla";
    dialog.showModal();
  }
  const plantillaDialog = document.querySelector("#plantilla-editor");
  if (plantillaDialog) {
    const form = plantillaDialog.querySelector("#plantilla-form");
    plantillaDialog
      .querySelector("#plantilla-cancel")
      .addEventListener("click", () => plantillaDialog.close());
    plantillaDialog
      .querySelector("#plantilla-add-pieza")
      .addEventListener("click", () => {
        plantillaDialog
          .querySelector("#plantilla-piezas")
          .appendChild(plantillaPieceRow());
      });
    plantillaDialog
      .querySelector("#plantilla-piezas")
      .addEventListener("click", (e) => {
        const b = e.target.closest("[data-pp-remove]");
        if (b) b.closest(".plantilla-piece").remove();
      });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(form),
        nombre = String(data.get("nombre") || "").trim();
      if (!nombre) return;
      const piezas = [
        ...plantillaDialog.querySelectorAll(".plantilla-piece"),
      ].map((row) => ({
        tipo: row.querySelector('[data-pp="tipo"]').value,
        espesor: row.querySelector('[data-pp="espesor"]').value.trim(),
        observaciones: row
          .querySelector('[data-pp="observaciones"]')
          .value.trim(),
      }));
      const item = {
        id: String(data.get("id") || "") || "T-" + crypto.randomUUID(),
        nombre,
        descripcion: String(data.get("descripcion") || "").trim(),
        tipoCliente: String(data.get("tipoCliente") || "Particular"),
        notas: String(data.get("notas") || "").trim(),
        piezas,
      };
      const list = plantillas(),
        i = list.findIndex((x) => x.id === item.id);
      if (i < 0) list.push(item);
      else list[i] = item;
      VSStorage.local.setItem(PL, JSON.stringify(list));
      plantillaDialog.close();
      window.vidresToolsRender("ajustes");
    });
  }
  window.vidresPlantillasList = plantillas;
  window.vidresPlantillasSave = (arr) =>
    VSStorage.local.setItem(PL, JSON.stringify(arr));

  const tariffDialog = document.querySelector("#tariff-editor");
  if (tariffDialog) {
    const tform = tariffDialog.querySelector("form");
    tariffDialog
      .querySelector("#tariff-cancel")
      .addEventListener("click", () => tariffDialog.close());
    tform.addEventListener("submit", (e) => {
      e.preventDefault();
      const data = new FormData(tform),
        name = String(data.get("name") || "").trim();
      if (!name) return;
      const item = window.vidresTariffs.normalize({
        id: String(data.get("id") || "") || undefined,
        name,
        familia: String(data.get("familia") || ""),
        espesor: String(data.get("espesor") || "").trim(),
        coste: String(data.get("coste") || "").trim(),
        margen: String(data.get("margen") || "").trim(),
        price: String(data.get("price") || "").trim(),
        edge: String(data.get("edge") || "").trim(),
        proveedor: String(data.get("proveedor") || "").trim(),
        minimoM2: String(data.get("minimoM2") || "").trim(),
        minimoImporte: String(data.get("minimoImporte") || "").trim(),
        redondeo: Number(data.get("redondeo")) || 6,
        updatedAt: new Date().toISOString().slice(0, 10),
      });
      const list = catalog(),
        i = list.findIndex((x) => x.id === item.id);
      if (i < 0) list.push(item);
      else list[i] = { ...list[i], ...item };
      VSStorage.local.setItem(T, JSON.stringify(list));
      window.dispatchEvent(new Event("vidres-tariffs-change"));
      tariffDialog.close();
      window.vidresToolsRender("tarifas");
    });
  }
  plantillas();
})();
