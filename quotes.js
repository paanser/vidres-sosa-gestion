"use strict";
(() => {
  const { esc, num, money } = VSUtils,
    Q = "vs-quote-prototype-v1",
    T = "vs-tariffs-prototype-v1",
    C = "vs-config-v1";
  let draft = null;
  const quotes = () => VSStorage.read(Q, []),
    tariffs = () => VSStorage.read(T, []),
    config = () => VSStorage.read(C, {});
  const pricing = (q) =>
    q?.pricing || { vat: 21, energyMode: "pending", energy: "" };
  const calc = (line) => VSCalculations.calc(line, pricing(draft));
  const sum = (q) => VSCalculations.totals(q.lines, pricing(q));
  const statuses = ["Borrador", "Enviado", "Aceptado", "Rechazado"];
  const unit = () => (config().unit === "mm" ? "mm" : "cm"),
    display = (v) => (unit() === "mm" ? String(num(v) * 10) : v);
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
      date: new Date().toLocaleDateString("en-CA"),
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
  function sync() {
    if (!draft) draft = fresh();
    const list = quotes(),
      jobs = window.vidresGetJobs?.() || [],
      total = sum(draft);
    document.querySelector("#content").innerHTML =
      `<div class="quote-toolbar"><button type="button" class="primary" id="quote-new">+ Nuevo presupuesto</button><button type="button" id="quote-settings">Ajustes de tarifas</button></div>
 <section class="panel quote-editor"><h2>Presupuesto de vidrio · ${esc(draft.id || "Sin guardar")}</h2><div class="quote-fields"><label>Cliente<input id="quote-client" maxlength="100" value="${esc(draft.client)}"></label><label>Parte relacionado<select id="quote-job"><option value="">Sin vincular</option>${jobs.map((j) => `<option value="${esc(j.id)}" ${draft.job === j.id ? "selected" : ""}>${esc(j.id + " · " + j.cliente)}</option>`).join("")}</select></label><label>Estado<select id="quote-status">${statuses.map((s) => `<option ${s === (draft.status || "Borrador") ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
 <div id="quote-lines">${draft.lines.map(row).join("")}</div><button type="button" id="quote-add">+ Añadir otro vidrio</button><div class="quote-total"><div class="quote-total-breakdown">Base imponible: <strong>${money(total.base)}</strong><br>IVA (${esc(pricing(draft).vat ?? 21)} %): <strong>${money(total.iva)}</strong><br>Total con IVA: <strong class="quote-grand-total">${money(total.total)}</strong></div></div><div class="quote-toolbar"><button type="button" class="primary" id="quote-save">Guardar presupuesto</button><button type="button" id="quote-pdf">Imprimir / Guardar PDF</button></div></section>
 <section class="panel"><h2>Presupuestos guardados</h2>${list.length ? list.map((q) => `<article class="quote-saved"><span>${esc(q.id)} · ${esc(q.client)} · ${esc(q.status || "Borrador")} · Total: ${money(sum(q).total)}</span><div><button type="button" data-load="${esc(q.id)}">Abrir</button><button type="button" data-duplicate="${esc(q.id)}">Duplicar</button><button type="button" data-delete-quote="${esc(q.id)}">Eliminar</button></div></article>`).join("") : "<p>No hay presupuestos guardados.</p>"}</section>`;
  }
  function row(l, i) {
    const c = calc(l);
    return `<div class="quote-line" data-line="${i}"><div class="quote-line-head"><strong>Vidrio ${i + 1}</strong><button type="button" data-remove="${i}">Eliminar</button></div><div class="quote-fields">${[
      ["w", "Ancho real (" + unit() + ")", display(l.w)],
      ["h", "Alto real (" + unit() + ")", display(l.h)],
      ["qty", "Cantidad", l.qty ?? 1],
    ]
      .map(
        ([k, label, v]) =>
          `<label>${label}<input type="number" min="${k === "qty" ? 1 : 0}" step="${k === "qty" ? 1 : 0.1}" data-field="${k}" value="${esc(v)}"></label>`,
      )
      .join(
        "",
      )}<label>Tipo de vidrio<input data-field="glass" list="glass-options-${i}" value="${esc(l.glass || "")}"></label><datalist id="glass-options-${i}">${tariffs()
      .map((t) => `<option value="${esc(t.name)}"></option>`)
      .join(
        "",
      )}</datalist><label>Precio vidrio (€/m²)<input type="number" min="0" step="0.01" data-field="price" value="${esc(l.price)}"></label><label>Precio canto (€/ml)<input type="number" min="0" step="0.01" data-field="edgePrice" value="${esc(l.edgePrice)}"></label></div><div class="quote-edges">${[
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
      )}</div><div class="quote-result">Real: ${c.w} × ${c.h} cm · ${c.real.toFixed(4)} m²<br>Aplicada: ${c.aw} × ${c.ah} cm · ${c.area.toFixed(4)} m²<br>Canto por pieza: ${c.ml.toFixed(2)} ml · Unidades: ${c.qty} · Importe: ${money(c.total)}${c.energy ? "<br>Recargo energético incluido: " + money(c.energy) : ""}</div></div>`;
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
      !draft.client.trim() ||
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
      alert(
        "Revisa cliente, medidas, cantidades y precios. Para enviar, aceptar o imprimir se requiere precio positivo.",
      );
      return false;
    }
    return true;
  }
  function discard() {
    fromForm();
    if (!draft) return true;
    const old = quotes().find((q) => q.id === draft.id);
    return (
      JSON.stringify(old || fresh()) === JSON.stringify(draft) ||
      confirm("¿Descartar los cambios del presupuesto sin guardar?")
    );
  }
  async function saveDraft() {
    fromForm();
    if (!valid()) return;
    const task = async () => {
      const list = quotes(),
        old = list.find((q) => q.id === draft.id);
      if (!draft.id) draft.id = nextId();
      const i = list.findIndex((q) => q.id === draft.id),
        copy = structuredClone(draft);
      if (i < 0) list.push(copy);
      else list[i] = copy;
      VSStorage.write(Q, list);
      if (
        copy.status === "Aceptado" &&
        old?.status !== "Aceptado" &&
        copy.job &&
        confirm("¿Cambiar el trabajo vinculado a En producción?")
      )
        window.vidresChangeJobStatus?.(copy.job, "En producción");
      sync();
    };
    try {
      if (navigator.locks) await navigator.locks.request("vidres-quotes", task);
      else await task();
    } catch (e) {
      alert("No se pudo guardar el presupuesto: " + e.message);
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
        return `<tr><td>${esc(l.glass || "Vidrio")}</td><td>${a.qty}</td><td>${a.w} × ${a.h}</td><td>${a.real.toFixed(4)}</td><td>${a.aw} × ${a.ah}</td><td>${a.area.toFixed(4)}</td><td>${a.ml.toFixed(2)}</td><td>${money(a.total)}</td></tr>`;
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
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.id === "quote-new") {
        if (discard()) {
          draft = fresh();
          sync();
        }
      } else if (b.id === "quote-settings") {
        fromForm();
        window.vidresNavigate("ajustes");
      } else if (b.id === "quote-save") await saveDraft();
      else if (b.id === "quote-add") {
        fromForm();
        draft.lines.push(emptyLine());
        sync();
      } else if (b.dataset.remove !== undefined) {
        fromForm();
        if (draft.lines.length > 1)
          draft.lines.splice(Number(b.dataset.remove), 1);
        sync();
      } else if (b.id === "quote-pdf") printQuote();
      else if (b.dataset.load) {
        if (discard()) {
          draft = structuredClone(
            quotes().find((q) => q.id === b.dataset.load),
          );
          sync();
        }
      } else if (b.dataset.deleteQuote) {
        if (confirm("¿Eliminar definitivamente este presupuesto?")) {
          VSStorage.write(
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
          draft.date = new Date().toLocaleDateString("en-CA");
          sync();
        }
      }
    } catch (error) {
      alert(error.message);
    }
  };
  window.vidresQuoteChange = (e) => {
    fromForm();
    const el = e.target.closest(".quote-line");
    if (el && e.target.dataset.field === "glass") {
      const l = draft.lines[Number(el.dataset.line)],
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
    }
    sync();
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
      draft = structuredClone(quotes().find((q) => q.id === id));
      window.vidresQuotePage = "presupuestos";
      window.vidresNavigate("presupuestos");
    }
  };
})();
