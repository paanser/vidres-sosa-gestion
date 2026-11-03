"use strict";
(() => {
  const T = "vs-tariffs-prototype-v1",
    C = "vs-config-v1",
    P = "vs-pdf-catalog-v1";
  const read = (k, f) => {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? f;
    } catch {
      return f;
    }
  };
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const euro = (n) =>
    Number(n || 0).toLocaleString("es-ES", {
      style: "currency",
      currency: "EUR",
    });
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
  function settings() {
    const c = config(),
      pdfs = read(P, []);
    return (
      '<section class="panel"><h2>Configuración general</h2><p class="muted">Preferencias guardadas solo en este navegador.</p><div class="quote-fields"><label>Unidad de entrada para vidrio<select id="cfg-unit"><option value="cm" ' +
      (c.unit === "cm" ? "selected" : "") +
      '>Centímetros (cm)</option><option value="mm" ' +
      (c.unit === "mm" ? "selected" : "") +
      '>Milímetros (mm)</option></select></label><label>Recargo energético actual (valor de referencia)<input id="cfg-energy" type="number" inputmode="decimal" step="0.01" min="0" placeholder="Pendiente de definir" value="' +
      esc(c.energy) +
      '"></label></div><p class="muted">El recargo energético no se aplica a los cálculos hasta que definamos si es porcentaje o €/m². Las medidas siguen redondeándose a múltiplos de 6 cm (60 mm).</p><button id="cfg-save" class="primary">Guardar configuración</button><p id="cfg-notice" role="status"></p></section><section class="panel"><h2>Tarifas y documentos PDF</h2><p class="muted">Tarifas de precios: importa un CSV con columnas nombre,precio_m2,precio_ml. Cada fila se puede consultar desde Herramientas.</p><label class="tariff-upload">Importar tarifas CSV<input id="cfg-csv" type="file" accept=".csv,text/csv"></label><div id="csv-notice" role="status"></div>' +
      tariffList() +
      '<p class="muted">Para consultar precios, importa tarifas estructuradas en CSV desde el gestor de tarifas. Los PDF se pueden seleccionar para revisión, pero todavía no se extraen sus precios ni se suben al servidor.</p><label class="tariff-upload">Seleccionar PDF de tarifa<input id="cfg-pdf" type="file" accept="application/pdf,.pdf"></label><div id="pdf-notice" role="status"></div><h3>PDF pendientes de procesamiento</h3>' +
      (!pdfs.length
        ? '<p class="muted">Ningún documento registrado.</p>'
        : pdfs
            .map(
              (p, i) =>
                '<div class="quote-saved"><span>' +
                esc(p.name) +
                " · " +
                esc(p.date) +
                ' · Pendiente de importar</span><button data-pdf-remove="' +
                i +
                '">Quitar</button></div>',
            )
            .join("")) +
      "</section>"
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
  };
  window.vidresToolsClick = (e, navigate) => {
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
      localStorage.setItem(
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
        energy = document.querySelector("#cfg-energy").value;
      localStorage.setItem(
        C,
        JSON.stringify({ unit, energy, energyMode: "pending" }),
      );
      document.querySelector("#cfg-notice").textContent =
        "Configuración guardada en este dispositivo.";
      return true;
    }
    if (t.dataset.pdfRemove !== undefined) {
      const pdfs = read(P, []);
      pdfs.splice(Number(t.dataset.pdfRemove), 1);
      localStorage.setItem(P, JSON.stringify(pdfs));
      window.vidresToolsRender("ajustes");
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
        localStorage.setItem(
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
      localStorage.setItem(P, JSON.stringify(pdfs));
      window.vidresToolsRender("ajustes");
      document.querySelector("#pdf-notice").textContent =
        "PDF registrado por nombre. El archivo NO se ha guardado ni enviado al servidor; queda pendiente de procesamiento.";
      return;
    }
  };
})();
