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
    return read(PL, []);
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
    return '<section class="panel"><h2>Herramientas de consulta</h2><div class="tool-tiles"><button data-tool-go="consultor"><strong>Consultar tarifas</strong><small>Buscar precios de vidrio</small></button><button data-tool-go="clientes"><strong>Clientes</strong><small>Datos de contacto e historial</small></button><button data-tool-go="calendario"><strong>Calendario</strong><small>Consultar fechas de los trabajos</small></button></div></section>';
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
  window.vidresToolsRender = (page) => {
    const root = document.querySelector("#content");
    if (!root) return;
    root.innerHTML =
      page === "herramientas"
        ? toolHome()
        : page === "consultor"
          ? consult()
          : settings();
    if (page === "ajustes") window.VSUsers?.mount();
  };
  window.vidresToolsClick = async (e, navigate) => {
    const t = e.target.closest("button");
    if (!t) return false;
    if (t.dataset.toolGo) {
      navigate(t.dataset.toolGo);
      return true;
    }
    if (t.dataset.tariffDelete || t.id === "tariffs-clear") {
      if (
        !confirm(
          t.id === "tariffs-clear"
            ? "¿Eliminar todas las tarifas? Los presupuestos conservan sus precios guardados."
            : "¿Eliminar esta tarifa?",
        )
      )
        return true;
      await VSStorage.local.setItem(
        T,
        JSON.stringify(
          t.id === "tariffs-clear"
            ? []
            : catalog().filter((x) => x.id !== t.dataset.tariffDelete),
        ),
      );
      window.dispatchEvent(new Event("vidres-tariffs-change"));
      window.vidresNavigate("ajustes");
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
        alert("Revisa el IVA, recargo y días de seguimiento");
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
        alert("La validez debe ser un número de días positivo");
        return true;
      }
      await VSStorage.write(C, {
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
        "Configuración guardada en el servidor.";
      return true;
    }
    if (t.dataset.pdfRemove !== undefined) {
      const pdfs = read(P, []);
      pdfs.splice(Number(t.dataset.pdfRemove), 1);
      await VSStorage.local.setItem(P, JSON.stringify(pdfs));
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
      if (confirm("¿Eliminar esta plantilla?")) {
        await VSStorage.local.setItem(
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
  };
  window.vidresToolsChange = async (e) => {
    if (e.target.id === "consult-filter") {
      selected = e.target.value;
      window.vidresToolsRender("consultor");
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
        await VSStorage.local.setItem(
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
      await VSStorage.local.setItem(P, JSON.stringify(pdfs));
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
    form.addEventListener(
      "submit",
      VSForms.guard(async (e) => {
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
        await VSStorage.local.setItem(PL, JSON.stringify(list));
        plantillaDialog.close();
        window.vidresToolsRender("ajustes");
      }),
    );
  }
  window.vidresPlantillasList = plantillas;
  window.vidresPlantillasSave = async (arr) =>
    await VSStorage.local.setItem(PL, JSON.stringify(arr));
  plantillas();
})();
