"use strict";
(() => {
  const button = (id) =>
    id && window.VSAuth?.user?.rol === "administrador"
      ? `<button type="button" data-facturadirecta="${VSUtils.esc(id)}">Emigrar a FacturaDirecta</button>`
      : "";

  function field(label, value) {
    return value
      ? `<div><dt>${label}</dt><dd>${VSUtils.esc(value)}</dd></div>`
      : "";
  }

  function showStatus(dialog, status, isEstimate) {
    const reference = status.number || status.documentId;
    const kind = isEstimate ? "presupuesto" : "factura";
    const message = {
      created: isEstimate
        ? `Presupuesto creado en FacturaDirecta. Número: ${reference}.`
        : status.draft
          ? `Borrador creado en FacturaDirecta. Referencia: ${reference}.`
          : `Factura creada en FacturaDirecta. Número: ${reference}.`,
      review: `Documento creado. Comprueba estado e importes en FacturaDirecta. Referencia: ${reference}.`,
      pending:
        "El envío está en curso o quedó sin confirmar. Comprueba su estado antes de continuar.",
      uncertain: `FacturaDirecta no confirmó el resultado. Comprueba el cliente y el documento (${kind}) en FacturaDirecta.`,
    }[status.status];
    dialog.querySelector("form").innerHTML =
      `<p role="status">${VSUtils.esc(message)}</p>`;
  }

  function showReview(dialog, review, path, isEstimate) {
    const { esc, money } = VSUtils;
    const { customer, existing, invoice, confirmation } = review;
    const form = dialog.querySelector("form");
    form.innerHTML = `
      <h3>${existing ? "Cliente existente en FacturaDirecta" : "Cliente que se dará de alta"}</h3>
      <dl>${
        existing
          ? field("Ficha de FacturaDirecta", existing.name || customer.name) +
            field("NIF", existing.taxCode) +
            field("Dirección fiscal", existing.address)
          : field("Nombre en el presupuesto", customer.name) +
            field("NIF", customer.taxCode) +
            field("Dirección", customer.address) +
            field("Correo", customer.email) +
            field("Teléfono", customer.phone)
      }</dl>
      ${
        existing
          ? ""
          : `
        <label>Tipo de cliente<select name="legalType" required>
          <option value="">Selecciona el tipo</option><option value="F">Persona física</option><option value="J">Empresa</option>
        </select></label>
        <div data-person-fields hidden>
          <label>Nombre fiscal<input name="personName" maxlength="100" disabled></label>
          <label>Apellidos fiscales<input name="personSurname" maxlength="100" disabled></label>
        </div>`
      }
      <h3>Conceptos de venta</h3>
      <dl>${field(isEstimate ? "Fecha del presupuesto" : "Fecha de factura", invoice.date && `${invoice.date.slice(6)}/${invoice.date.slice(4, 6)}/${invoice.date.slice(0, 4)}`)}
        ${field("Moneda", "EUR")}
        ${field("Etiqueta en FacturaDirecta", invoice.sourceReference)}</dl>
      <ul class="facturadirecta-lines">${invoice.lines.map((line) => `<li><span>${esc(line.description)}</span><strong>${money(line.unitPrice)}</strong></li>`).join("")}</ul>
      <dl class="facturadirecta-totals">
        ${field("Base imponible", money(invoice.totals.base))}
        ${field(`IVA ${esc(invoice.vatRate)} %`, money(invoice.totals.vat))}
        ${field("Total", money(invoice.totals.total))}
      </dl>
      ${invoice.notes ? `<h3>Observaciones</h3><p class="facturadirecta-notes">${esc(invoice.notes)}</p>` : ""}
      ${
        isEstimate
          ? ""
          : `<label>Estado de la factura<select name="mode">
        <option value="draft">Borrador</option><option value="final">Factura definitiva</option>
      </select></label>`
      }
      <p data-document-note></p>
      <p role="alert" data-submit-error></p>
      <button type="submit" class="primary"></button>`;
    const mode = form.elements.mode;
    const submit = form.querySelector('[type="submit"]');
    const modeDescription = () => {
      if (isEstimate) {
        submit.textContent = "Crear presupuesto";
        form.querySelector("[data-document-note]").textContent =
          "Se creará un presupuesto en FacturaDirecta sin enviarlo por correo.";
        return;
      }
      const draft = mode.value === "draft";
      submit.textContent = draft
        ? "Crear borrador"
        : "Emitir factura definitiva";
      form.querySelector("[data-document-note]").textContent = draft
        ? "Se guardará un borrador sin numeración definitiva."
        : "Se emitirá una factura definitiva. FacturaDirecta asignará su número.";
    };
    mode?.addEventListener("change", modeDescription);
    modeDescription();
    const type = form.elements.legalType;
    if (type)
      type.addEventListener("change", () => {
        const person = type.value === "F";
        form.querySelector("[data-person-fields]").hidden = !person;
        for (const key of ["personName", "personSurname"]) {
          form.elements[key].disabled = !person;
          form.elements[key].required = person;
        }
      });
    form.onsubmit = async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const errorBox = form.querySelector("[data-submit-error]");
      errorBox.textContent = "";
      const controls = [...form.elements].filter((input) => !input.disabled);
      controls.forEach((input) => {
        input.disabled = true;
      });
      const documentType = dialog.querySelector("[data-document-type]");
      documentType.disabled = true;
      dialog.setAttribute("aria-busy", "true");
      try {
        const result = await VSAuth.json(path, "POST", {
          confirmation,
          ...(isEstimate ? {} : { draft: data.mode === "draft" }),
          legalType: data.legalType,
          personName: data.personName,
          personSurname: data.personSurname,
        });
        showStatus(dialog, result.status, isEstimate);
      } catch (error) {
        errorBox.textContent = error.status
          ? error.message
          : "La conexión se interrumpió. Cierra y vuelve a abrir la revisión para comprobar el estado.";
        if (error.status && [400, 422].includes(error.status))
          controls.forEach((input) => {
            input.disabled = false;
          });
      } finally {
        documentType.disabled = false;
        dialog.removeAttribute("aria-busy");
      }
    };
  }

  async function open(id) {
    const active = document.querySelector("#facturadirecta-review");
    if (active) return;
    const dialog = document.createElement("dialog");
    dialog.id = "facturadirecta-review";
    dialog.className = "facturadirecta-review";
    dialog.dataset.quote = id;
    dialog.setAttribute("aria-labelledby", "facturadirecta-title");
    const path = "/api/facturadirecta/quotes/" + encodeURIComponent(id);
    dialog.innerHTML = `<header><h2 id="facturadirecta-title">FacturaDirecta · ${VSUtils.esc(id)}</h2>
      <button type="button" data-close>Cerrar</button></header>
      <label>Documento en FacturaDirecta<select data-document-type>
        <option value="estimate">Presupuesto</option><option value="invoice">Factura</option>
      </select></label>
      <form></form>`;
    dialog
      .querySelector("[data-close]")
      .addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    const select = dialog.querySelector("[data-document-type]");
    const form = dialog.querySelector("form");
    let revision = 0;
    const load = async () => {
      const current = ++revision;
      const type = select.value;
      const endpoint = path + "?kind=" + type;
      const isEstimate = type === "estimate";
      form.onsubmit = null;
      form.innerHTML =
        '<p role="status">Consultando el presupuesto guardado…</p>';
      try {
        const result = await VSAuth.json(endpoint);
        if (!dialog.open || current !== revision) return;
        if (result.status) showStatus(dialog, result.status, isEstimate);
        else showReview(dialog, result.review, endpoint, isEstimate);
      } catch (error) {
        if (dialog.open && current === revision)
          form.querySelector('[role="status"]').textContent = error.message;
      }
    };
    select.addEventListener("change", load);
    document.body.append(dialog);
    dialog.showModal();
    await load();
  }
  window.VSFacturaDirecta = { button, open };
})();
