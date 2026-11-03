"use strict";
(() => {
  const { esc, num, money, round6 } = VSUtils;

  const key = "vs-quote-prototype-v1",
    tariffKey = "vs-tariffs-prototype-v1";
  const read = (k, f) => {
    try {
      return JSON.parse(VSStorage.local.getItem(k)) ?? f;
    } catch {
      return f;
    }
  };
  let quotes = read(key, []),
    tariffs = read(tariffKey, []),
    draft = null;
  window.addEventListener("vidres-tariffs-change", () => {
    tariffs = read(tariffKey, []);
  });
  const unit = () => {
    try {
      return JSON.parse(VSStorage.local.getItem("vs-config-v1") || "{}")
        .unit === "mm"
        ? "mm"
        : "cm";
    } catch {
      return "cm";
    }
  };
  const displayed = (cm) =>
    unit() === "mm" ? String(Number((num(cm) * 10).toFixed(1))) : cm;
  const qty = (line) => Math.max(1, Math.floor(num(line.qty) || 1));
  const calc = (line) => {
    const w = num(line.w),
      h = num(line.h),
      aw = round6(w),
      ah = round6(h),
      sides = [...new Set(line.sides || [])].filter((x) =>
        ["top", "bottom", "left", "right"].includes(x),
      );
    const ml = sides.reduce(
      (n, s) => n + (s === "top" || s === "bottom" ? w : h) / 100,
      0,
    );
    const area = (aw * ah) / 10000,
      real = (w * h) / 10000;
    return {
      w,
      h,
      aw,
      ah,
      real,
      area,
      ml,
      total: (area * num(line.price) + ml * num(line.edgePrice)) * qty(line),
      qty: qty(line),
    };
  };
  const save = () => {
    VSStorage.local.setItem(key, JSON.stringify(quotes));
    VSStorage.local.setItem(tariffKey, JSON.stringify(tariffs));
  };
  const totals = (lines) => {
    const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
    const base = round2(lines.reduce((n, l) => n + calc(l).total, 0)),
      iva = round2(base * 0.21);
    return { base, iva, total: round2(base + iva) };
  };
  const fresh = () => ({
    id: "P-" + Date.now(),
    client: "",
    job: "",
    date: new Date().toISOString().slice(0, 10),
    lines: [
      {
        w: "",
        h: "",
        price: "",
        edgePrice: "",
        sides: [],
        tariff: "",
        glass: "",
        qty: 1,
      },
    ],
  });
  const row = (l, i) => {
    const c = calc(l);
    return (
      '<div class="quote-line" data-line="' +
      i +
      '"><div class="quote-line-head"><strong><span class="quote-step">' +
      (i + 1) +
      "</span> Vidrio " +
      (i + 1) +
      '</strong><button type="button" data-remove="' +
      i +
      '" class="quiet">Eliminar</button></div><div class="quote-fields"><label>Ancho real (' +
      unit() +
      ')<input type="number" inputmode="decimal" min="0" step="0.1" data-field="w" value="' +
      esc(displayed(l.w)) +
      '"></label><label>Alto real (' +
      unit() +
      ')<input type="number" inputmode="decimal" min="0" step="0.1" data-field="h" value="' +
      esc(displayed(l.h)) +
      '"></label><label>Cantidad<input type="number" min="1" step="1" inputmode="numeric" data-field="qty" value="' +
      esc(qty(l)) +
      '"></label><label class="quote-glass-label">Tipo de vidrio · buscar o escribir<input type="text" data-field="glass" list="glass-options-' +
      i +
      '" placeholder="Laminado, 5+5 o vidrio especial" value="' +
      esc(l.glass || tariffs.find((t) => t.id === l.tariff)?.name || "") +
      '"></label><datalist id="glass-options-' +
      i +
      '">' +
      tariffs
        .map((t) => '<option value="' + esc(t.name) + '"></option>')
        .join("") +
      '</datalist><label>Precio vidrio (€/m²)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="price" value="' +
      esc(l.price) +
      '"></label><label>Precio canto (€/ml)<input type="number" inputmode="decimal" min="0" step="0.01" data-field="edgePrice" value="' +
      esc(l.edgePrice) +
      '"></label></div><div class="quote-edges"><strong>Cantos a pulir</strong><div>' +
      [
        ["top", "Superior"],
        ["bottom", "Inferior"],
        ["left", "Izquierdo"],
        ["right", "Derecho"],
      ]
        .map(
          ([v, t]) =>
            '<label><input type="checkbox" data-edge="' +
            v +
            '" ' +
            ((l.sides || []).includes(v) ? "checked" : "") +
            ">" +
            t +
            "</label>",
        )
        .join("") +
      '</div></div><div class="quote-result"><span class="quote-metric-label">Cálculo automático</span><br>Real: ' +
      c.w +
      " × " +
      c.h +
      " cm · <b>" +
      c.real.toFixed(4) +
      " m²</b><br>Aplicada: " +
      c.aw +
      " × " +
      c.ah +
      " cm · <b>" +
      c.area.toFixed(4) +
      " m²</b><br>Canto por pieza: <b>" +
      c.ml.toFixed(2) +
      " ml</b> · Unidades: <b>" +
      c.qty +
      "</b> · Importe: <b>" +
      money(c.total) +
      "</b></div></div>"
    );
  };
  function quoteScreen() {
    if (!draft) draft = fresh();
    const jobs = window.vidresQuoteJobs?.() || [];
    return (
      '<div class="quote-toolbar"><button type="button" class="primary" id="quote-new">+ Nuevo presupuesto</button><button type="button" id="quote-settings">⚙ Ajustes de tarifas</button></div><section class="panel quote-editor"><div class="quote-section-heading"><div><p class="quote-eyebrow">PRESUPUESTADOR</p><h2>Presupuesto de vidrio</h2><p class="muted">Precios y medidas en tiempo real · Guardado local en este dispositivo</p></div><span class="quote-status">Borrador</span></div><div class="quote-fields"><label>Cliente<input id="quote-client" maxlength="100" value="' +
      esc(draft.client) +
      '"></label><label>Parte relacionado<select id="quote-job"><option value="">Sin vincular</option>' +
      jobs
        .map(
          (j) =>
            '<option value="' +
            esc(j.id) +
            '" ' +
            (draft.job === j.id ? "selected" : "") +
            ">" +
            esc(j.id + " · " + j.cliente) +
            "</option>",
        )
        .join("") +
      '</select></label></div><div class="quote-lines-heading"><h3>Vidrios del presupuesto</h3><span class="muted">Cada tarjeta representa un tipo de vidrio</span></div><div id="quote-lines">' +
      draft.lines.map(row).join("") +
      '</div><button type="button" id="quote-add">+ Añadir otro vidrio</button><div class="quote-total"><div class="quote-total-title">Resumen del presupuesto</div><div class="quote-total-breakdown">Base imponible: <strong>' +
      money(totals(draft.lines).base) +
      "</strong><br>IVA (21 %): <strong>" +
      money(totals(draft.lines).iva) +
      '</strong><br>Total con IVA: <strong class="quote-grand-total">' +
      money(totals(draft.lines).total) +
      '</strong></div></div><div class="quote-toolbar quote-final-actions"><button type="button" class="primary" id="quote-save">Guardar presupuesto</button><button type="button" id="quote-pdf">Imprimir / Guardar PDF</button></div></section><section class="panel"><h2>Presupuestos guardados</h2><p class="muted">Solo están disponibles en este navegador hasta que conectemos el servidor.</p>' +
      (!quotes.length
        ? '<p class="muted">Todavía no hay presupuestos.</p>'
        : quotes
            .map(
              (q) =>
                '<div class="quote-saved"><span>' +
                esc(q.id) +
                " · " +
                esc(q.client || "Sin cliente") +
                " · " +
                money(q.lines.reduce((n, l) => n + calc(l).total, 0)) +
                '</span><button type="button" data-load="' +
                esc(q.id) +
                '">Abrir</button></div>',
            )
            .join("")) +
      "</section>"
    );
  }
  function settingsScreen() {
    return (
      '<section class="panel"><h2>Ajustes · Tarifas de vidrio</h2><p class="muted">Importación de prueba: se guarda únicamente en este navegador. No se suben archivos a GitHub ni a Dinahosting. Formato CSV: nombre,precio_m2,precio_ml (cabecera obligatoria; separador coma o punto y coma).</p><label class="tariff-upload">Importar archivo CSV<input type="file" id="tariff-file" accept=".csv,text/csv"></label><div id="tariff-notice" role="status"></div><h3>Tarifas disponibles</h3>' +
      (!tariffs.length
        ? '<p class="muted">No hay tarifas cargadas.</p>'
        : tariffs
            .map(
              (t) =>
                '<div class="quote-saved"><span>' +
                esc(t.name) +
                " · " +
                money(t.price) +
                "/m² · " +
                money(t.edge) +
                '/ml</span><button type="button" data-delete-tariff="' +
                esc(t.id) +
                '">Eliminar</button></div>',
            )
            .join("")) +
      "</section>"
    );
  }
  function sync() {
    const host = document.querySelector("#content");
    if (!host) return;
    host.innerHTML =
      window.vidresQuotePage === "ajustes" ? settingsScreen() : quoteScreen();
  }
  function fromForm() {
    if (!draft) return;
    const client = document.querySelector("#quote-client"),
      job = document.querySelector("#quote-job");
    if (client) draft.client = client.value;
    if (job) draft.job = job.value;
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
  function printQuote() {
    fromForm();
    const lines = draft.lines
      .map((l, i) => {
        const c = calc(l);
        return (
          "<tr><td>" +
          esc(
            l.glass ||
              tariffs.find((t) => t.id === l.tariff)?.name ||
              "Vidrio " + (i + 1),
          ) +
          "</td><td>" +
          c.qty +
          "</td><td>" +
          c.w +
          " × " +
          c.h +
          "</td><td>" +
          c.real.toFixed(4) +
          "</td><td>" +
          c.aw +
          " × " +
          c.ah +
          "</td><td>" +
          c.area.toFixed(4) +
          "</td><td>" +
          c.ml.toFixed(2) +
          "</td><td>" +
          money(c.total) +
          "</td></tr>"
        );
      })
      .join("");
    const html =
      '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' +
      esc(draft.id) +
      "</title><style>body{font:12px Arial,sans-serif;margin:0;color:#24342b}h1{font-size:23px;letter-spacing:-.5px;color:#155b43;margin:0 0 14px;padding-bottom:14px;border-bottom:3px solid #155b43}p{line-height:1.8}table{border-collapse:collapse;width:100%;margin:20px 0;font-size:10px}thead{background:#eaf3ed}td,th{border-bottom:1px solid #e1e8e3;padding:9px 6px;text-align:right}td:first-child,th:first-child{text-align:left}tbody tr{break-inside:avoid}h2{font-size:18px;color:#155b43;text-align:right}footer{margin-top:24px;padding-top:12px;border-top:1px solid #d9e5dc;color:#6a7970;font-size:10px}@page{size:A4;margin:14mm}</style></head><body><h1>Vidres Sosa · Presupuesto</h1><p>Referencia: " +
      esc(draft.id) +
      "<br>Cliente: " +
      esc(draft.client) +
      "<br>Fecha: " +
      esc(draft.date) +
      "</p><table><thead><tr><th>Vidrio</th><th>Uds.</th><th>Medida real cm</th><th>m² reales</th><th>Medida aplicada cm</th><th>m² aplicados</th><th>ml canto</th><th>Importe</th></tr></thead><tbody>" +
      lines +
      "</tbody></table><p>Base imponible: " +
      money(totals(draft.lines).base) +
      "<br>IVA (21 %): " +
      money(totals(draft.lines).iva) +
      "</p><h2>Total con IVA: " +
      money(totals(draft.lines).total) +
      "</h2><footer>Presupuesto generado desde la versión de prueba. Revisar datos fiscales y condiciones antes de entregar al cliente.</footer><script>window.onload=()=>window.print()<\/script></body></html>";
    const w = window.open("", "_blank");
    if (!w) {
      alert("Permite las ventanas emergentes para imprimir o guardar en PDF.");
      return;
    }
    w.document.write(html);
    w.document.close();
  }
  function parseCSV(s) {
    const lines = s
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((x) => x.trim());
    if (lines.length < 2) throw Error("El CSV no contiene filas.");
    const delim = lines[0].includes(";") ? ";" : ",";
    const headers = lines
      .shift()
      .split(delim)
      .map((x) => x.trim().toLowerCase());
    const ix = ["nombre", "precio_m2", "precio_ml"].map((x) =>
      headers.indexOf(x),
    );
    if (ix.some((x) => x < 0))
      throw Error("Faltan columnas: nombre, precio_m2, precio_ml.");
    const parsed = lines.map((s, i) => {
      const cells = s.split(delim).map((x) => x.trim().replace(/^"|"$/g, ""));
      const name = cells[ix[0]],
        price = num(cells[ix[1]]),
        edge = num(cells[ix[2]]);
      if (!name || !Number.isFinite(price) || price <= 0)
        throw Error("Fila " + (i + 2) + " inválida.");
      return { id: "T-" + Date.now() + "-" + i, name, price, edge };
    });
    return parsed;
  }
  window.vidresQuoteRender = () => {
    sync();
  };
  window.vidresQuoteClick = async (e) => {
    const t = e.target.closest("button");
    if (!t) return false;
    const id = t.id;
    if (id === "quote-settings") {
      fromForm();
      window.vidresNavigate?.("ajustes");
      return true;
    }
    if (id === "quote-new") {
      if (
        draft &&
        document.querySelector("#quote-client") &&
        !confirm(
          "¿Crear un presupuesto nuevo? Los cambios sin guardar se perderán.",
        )
      )
        return true;
      draft = fresh();
      sync();
      return true;
    }
    if (id === "quote-add") {
      fromForm();
      draft.lines.push({
        w: "",
        h: "",
        price: "",
        edgePrice: "",
        sides: [],
        tariff: "",
        glass: "",
        qty: 1,
      });
      sync();
      return true;
    }
    if (t.dataset.remove !== undefined) {
      fromForm();
      if (draft.lines.length > 1)
        draft.lines.splice(Number(t.dataset.remove), 1);
      sync();
      return true;
    }
    if (id === "quote-save") {
      fromForm();
      if (
        !draft.lines.every(
          (l) =>
            num(l.w) > 0 &&
            num(l.h) > 0 &&
            num(l.price) > 0 &&
            Number.isInteger(Number(l.qty || 1)) &&
            Number(l.qty || 1) > 0,
        )
      ) {
        alert(
          "Revisa medidas, precio por m² y cantidades de todos los vidrios.",
        );
        return true;
      }
      if (!draft.client.trim()) {
        alert("Introduce un cliente.");
        return true;
      }
      const idx = quotes.findIndex((q) => q.id === draft.id);
      if (idx >= 0) quotes[idx] = structuredClone(draft);
      else quotes.push(structuredClone(draft));
      save();
      sync();
      return true;
    }
    if (id === "quote-pdf") {
      fromForm();
      if (
        !draft.lines.every(
          (l) => num(l.w) > 0 && num(l.h) > 0 && num(l.price) > 0,
        )
      ) {
        alert(
          "Completa medidas y precio de cada vidrio antes de generar el PDF.",
        );
        return true;
      }
      printQuote();
      return true;
    }
    if (t.dataset.load) {
      const found = quotes.find((q) => q.id === t.dataset.load);
      if (!found) return true;
      draft = structuredClone(found);
      sync();
      return true;
    }
    if (t.dataset.deleteTariff) {
      if (confirm("¿Eliminar esta tarifa local?")) {
        tariffs = tariffs.filter((x) => x.id !== t.dataset.deleteTariff);
        save();
        sync();
      }
      return true;
    }
    return false;
  };
  window.vidresQuoteChange = async (e) => {
    if (e.target.id === "tariff-file") {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > 250000)
          throw Error("Archivo demasiado grande (máximo 250 KB).");
        const items = parseCSV(await file.text());
        tariffs = window.vidresTariffs.merge(tariffs, items);
        save();
        sync();
        document.querySelector("#tariff-notice").textContent =
          items.length + " tarifas importadas.";
      } catch (err) {
        document.querySelector("#tariff-notice").textContent = err.message;
      }
      return;
    }
    if (window.vidresQuotePage !== "presupuestos") return;
    fromForm();
    const line = e.target.closest(".quote-line");
    if (line && e.target.dataset.field === "glass") {
      const l = draft.lines[Number(line.dataset.line)],
        match = tariffs.find(
          (x) =>
            x.name.trim().toLocaleLowerCase("es") ===
            String(l.glass || "")
              .trim()
              .toLocaleLowerCase("es"),
        );
      const wasTariff = Boolean(l.tariff);
      l.tariff = match?.id || "";
      if (match) {
        l.price = match.price;
        l.edgePrice = match.edge;
      } else if (wasTariff) {
        l.price = "";
        l.edgePrice = "";
      }
    }
    if (line && e.target.dataset.field === "tariff") {
      const l = draft.lines[Number(line.dataset.line)],
        t = tariffs.find((x) => x.id === l.tariff);
      if (t) {
        l.price = t.price;
        l.edgePrice = t.edge;
      }
    }
    sync();
  };
  // API local para integrar presupuestos con el expediente sin duplicar cálculos.
  window.vidresQuotesForJob = (jobId) =>
    quotes
      .filter((q) => q.job === jobId)
      .map((q) => ({
        id: q.id,
        client: q.client,
        date: q.date,
        base: totals(q.lines).base,
        iva: totals(q.lines).iva,
        total: totals(q.lines).total,
        lines: q.lines.length,
      }));
  window.vidresQuoteStartForJob = (jobId, client) => {
    draft = fresh();
    draft.job = jobId;
    draft.client = client || "";
    window.vidresQuotePage = "presupuestos";
    window.vidresNavigate?.("presupuestos");
  };
  window.vidresQuoteOpenSaved = (id) => {
    const found = quotes.find((q) => q.id === id);
    if (!found) return;
    draft = structuredClone(found);
    window.vidresQuotePage = "presupuestos";
    window.vidresNavigate?.("presupuestos");
  };
})();
