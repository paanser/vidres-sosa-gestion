"use strict";
(function (root) {
  const esc = (v) =>
    String(v ?? "").replace(
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
  const num = (v) => {
    const s = String(v ?? "");
    const n = Number(
      (s.includes(",") ? s.replace(/\./g, "") : s).replace(",", "."),
    );
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const priceError = (value) => {
    const s = String(value ?? "").trim();
    if (!s) return "";
    const normalized = (s.includes(",") ? s.replace(/\./g, "") : s).replace(
      ",",
      ".",
    );
    if (
      !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ||
      !Number.isFinite(Number(normalized))
    )
      return "Escribe un número válido.";
    return Number(normalized) < 0 ? "El importe no puede ser negativo." : "";
  };
  const money = (n) =>
    Number(n || 0).toLocaleString("es-ES", {
      style: "currency",
      currency: "EUR",
    });
  const round6 = (cm) => Math.ceil((num(cm) - 1e-9) / 6) * 6;
  const isCompanyLogo = (value) =>
    typeof value === "string" &&
    value.length <= 9500 &&
    /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value);

  // Los metros se convierten primero a milímetros enteros.
  const parseMeters = (text) => {
    const s = String(text ?? "").trim();
    const fail = (error) => ({ ok: false, mm: null, cm: null, error });
    if (!s) return fail("El valor no puede estar vacío.");
    if (s.startsWith("-")) return fail("El valor no puede ser negativo.");
    if ((s.match(/[.,]/g) || []).length > 1)
      return fail("Usa un único separador decimal.");
    if (!/^\d+(?:[.,]\d+)?$/.test(s))
      return fail("Escribe un número: el punto o la coma son decimales.");
    const [whole, fraction = ""] = s.split(/[.,]/);
    if (fraction.length > 3) return fail("Máximo 3 decimales: son milímetros");
    const mm = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
    if (!Number.isSafeInteger(mm))
      return fail("La medida es demasiado grande.");
    if (!mm) return fail("El valor no puede ser cero.");
    return {
      ok: true,
      mm,
      cm: mm / 10,
      error: "",
      confirmation: mm > 6000 ? `¿Seguro? ${mm / 1000} m` : "",
    };
  };
  const formatMeters = (cm) => (Math.round(num(cm) * 10) / 1000).toFixed(3);
  const formatMeasure = (cm) => {
    const mm = Math.round(num(cm) * 10);
    return (
      [
        [Math.floor(mm / 1000), "m"],
        [Math.floor((mm % 1000) / 10), "cm"],
        [mm % 10, "mm"],
      ]
        .filter(([n]) => n)
        .map(([n, u]) => `${n} ${u}`)
        .join(" ") || "0 mm"
    );
  };
  // Valida el valor introducido en una cota: no vacío, no cero, no negativo,
  // un único separador decimal y hasta dos decimales.
  const parseDimension = (text) => {
    const s = String(text ?? "").trim();
    if (!s) return { ok: false, error: "El valor no puede estar vacío." };
    if (s.length > 12)
      return { ok: false, error: "El valor no puede superar 12 caracteres." };
    if (!/^\d+([.,]\d{1,2})?$/.test(s))
      return {
        ok: false,
        error:
          "Escribe un número con una única coma decimal y hasta dos decimales.",
      };
    const value = Number(s.replace(",", "."));
    if (!Number.isFinite(value))
      return { ok: false, error: "El valor no es válido." };
    if (value <= 0)
      return {
        ok: false,
        error:
          value === 0
            ? "El valor no puede ser cero."
            : "El valor no puede ser negativo.",
      };
    return { ok: true, value };
  };
  // Convierte un valor de cota (en la unidad configurada) a centímetros,
  // que es la unidad interna de las mediciones.
  const dimensionToCm = (value, unit) => {
    if (unit === "m") return parseMeters(value).cm ?? 0;
    const n = unit === "mm" ? num(value) / 10 : num(value);
    return Math.round(n * 100) / 100;
  };
  const api = {
    esc,
    num,
    priceError,
    money,
    round6,
    parseMeters,
    formatMeters,
    formatMeasure,
    parseDimension,
    dimensionToCm,
    isCompanyLogo,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.VSUtils = api;
})(globalThis);

// Await server confirmation and prevent duplicate submits. Keep the form open on errors.
if (typeof window !== "undefined") {
  window.VSForms = {
    validateNumbers(root) {
      for (const input of root.querySelectorAll(
        'input[type="number"][min="0"], input[data-price-input]',
      )) {
        const error = input.validity?.badInput
          ? "Escribe un número válido."
          : window.VSUtils.priceError(input.value);
        input.setCustomValidity(error);
        input.setAttribute("aria-invalid", String(Boolean(error)));
        if (error) {
          input.reportValidity();
          return false;
        }
      }
      return true;
    },
    guard(handler) {
      return async function (event) {
        event.preventDefault();
        const form = event.currentTarget;
        if (form.dataset.saving || !window.VSForms.validateNumbers(form))
          return;
        form.dataset.saving = "true";
        const buttons = [...form.querySelectorAll('[type="submit"]')];
        buttons.forEach((b) => (b.disabled = true));
        try {
          await handler.call(this, event);
        } catch (error) {
          alert(
            "No se pudo confirmar la operación. Conserva el formulario. " +
              error.message,
          );
        } finally {
          delete form.dataset.saving;
          buttons.forEach((b) => (b.disabled = false));
        }
      };
    },
  };
}

// Entrada compartida de medidas. No modifica el campo al escribir.
if (typeof window !== "undefined") {
  const U = window.VSUtils,
    confirmed = new WeakMap();
  const unit = () => {
    const value = VSStorage.read("vs-config-v1", {}).unit;
    return ["cm", "mm", "m"].includes(value) ? value : "m";
  };
  const display = (cm, selected = unit()) =>
    cm === "" || cm == null
      ? ""
      : selected === "m"
        ? U.formatMeters(cm)
        : selected === "mm"
          ? String(Math.round(U.num(cm) * 100) / 10)
          : String(cm);
  function read(input) {
    const selected = input.dataset.measureUnit || unit();
    const parsed =
      selected === "m"
        ? U.parseMeters(input.value)
        : U.parseDimension(input.value);
    const cm =
      parsed.ok &&
      input.dataset.measureOriginal != null &&
      input.value === input.dataset.measureDisplay
        ? Number(input.dataset.measureOriginal)
        : parsed.ok
          ? U.dimensionToCm(
              selected === "m" ? input.value : parsed.value,
              selected,
            )
          : null;
    return {
      ...parsed,
      cm,
      confirmation: parsed.ok && cm > 600 ? `¿Seguro? ${cm / 100} m` : "",
    };
  }
  function update(input) {
    const result = read(input);
    input.setCustomValidity(result.ok ? "" : result.error);
    input.setAttribute("aria-invalid", String(!result.ok));
    const hint = input.parentElement.querySelector(".measure-feedback");
    if (hint) {
      hint.textContent = result.ok
        ? "= " + U.formatMeasure(result.cm)
        : result.error;
      hint.classList.toggle("measure-error", !result.ok);
    }
    return result;
  }
  function accept(input) {
    const r = update(input);
    if (!r.ok) return false;
    if (r.confirmation && confirmed.get(input) !== input.value) {
      if (!confirm(r.confirmation)) {
        input.setCustomValidity("Confirma la medida o corrígela.");
        return false;
      }
      confirmed.set(input, input.value);
    }
    return true;
  }
  function init(root) {
    root.querySelectorAll("[data-measure]").forEach((input) => {
      if (input.dataset.measureReady) return;
      input.dataset.measureReady = "true";
      input.dataset.measureUnit = unit();
      input.type = "text";
      input.inputMode = "decimal";
      input.removeAttribute("min");
      input.removeAttribute("step");
      const hint = document.createElement("small");
      hint.className = "measure-feedback";
      hint.setAttribute("aria-live", "polite");
      hint.id = "measure-hint-" + crypto.randomUUID();
      input.setAttribute("aria-describedby", hint.id);
      input.after(hint);
      input.addEventListener("input", () => {
        delete input.dataset.measureOriginal;
        update(input);
      });
      input.addEventListener("change", () => accept(input));
      update(input);
    });
  }
  function validate(root) {
    for (const input of root.querySelectorAll("[data-measure]")) {
      if (!accept(input)) {
        input.reportValidity();
        input.focus();
        return false;
      }
    }
    return true;
  }
  function set(input, cm) {
    input.dataset.measureUnit = unit();
    input.value = display(cm);
    input.dataset.measureDisplay = input.value;
    if (cm !== "" && cm != null) input.dataset.measureOriginal = String(cm);
    else delete input.dataset.measureOriginal;
    update(input);
  }
  window.VSMeasureInput = { unit, display, read, update, init, validate, set };
}

// Los importes admiten separadores españoles y conservan los errores en el campo.
if (typeof document !== "undefined") {
  for (const name of ["input", "change"]) {
    document.addEventListener(
      name,
      (event) => {
        const input = event.target;
        if (
          !input.matches?.(
            'input[data-price-input], input[type="number"][min="0"]',
          )
        )
          return;
        const error = input.validity?.badInput
          ? "Escribe un número válido."
          : VSUtils.priceError(input.value);
        input.setCustomValidity(error);
        input.setAttribute("aria-invalid", String(Boolean(error)));
        if (error) {
          if (name === "change") input.reportValidity();
          event.stopImmediatePropagation();
        } else if (name === "change" && input.value.trim()) {
          input.value = String(VSUtils.num(input.value));
        }
      },
      true,
    );
  }
}

// Conserva el select como valor del formulario y comparte un buscador entre pantallas.
if (typeof document !== "undefined") {
  const enhancedSelects = new WeakMap();
  const normalizeOption = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .replace(/(\d)\s*\+\s*(?=\d)/g, "$1");
  const optionPageSize = 30;
  let picker;

  function openSelectSearch(select, title) {
    if (!picker) {
      picker = document.createElement("dialog");
      picker.className = "select-search-dialog";
      picker.setAttribute("aria-labelledby", "select-search-title");
      picker.innerHTML = `
        <div class="select-search-header">
          <h2 id="select-search-title"></h2>
          <button type="button" data-select-close>Cerrar</button>
        </div>
        <input type="search" aria-label="Buscar opciones" autocomplete="off" autofocus>
        <p class="muted" role="status"></p>
        <ul class="select-search-results"></ul>
        <div class="select-search-pages">
          <button type="button" data-select-page="-1">Anterior</button>
          <button type="button" data-select-page="1">Siguiente</button>
        </div>`;
      document.body.append(picker);
      picker.querySelector("[data-select-close]").onclick = () =>
        picker.close();
    }
    const search = picker.querySelector("input");
    const results = picker.querySelector("ul");
    const status = picker.querySelector("[role=status]");
    const pages = picker.querySelector(".select-search-pages");
    const previous = pages.querySelector('[data-select-page="-1"]');
    const next = pages.querySelector('[data-select-page="1"]');
    const options = Array.from(select.options)
      .filter((option) => !option.disabled && !option.hidden)
      .map((option) => ({
        option,
        searchText: normalizeOption(
          [option.label, option.dataset.searchDetail, option.dataset.searchText]
            .filter(Boolean)
            .join(" "),
        ),
      }));
    let matches = options;
    let page = 0;
    function renderResults() {
      const start = page * optionPageSize;
      const end = Math.min(start + optionPageSize, matches.length);
      const fragment = document.createDocumentFragment();
      for (const { option } of matches.slice(start, end)) {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.value = option.value;
        button.textContent = option.label;
        if (option.selected) button.setAttribute("aria-current", "true");
        if (option.dataset.searchDetail) {
          const detail = document.createElement("small");
          detail.textContent = option.dataset.searchDetail;
          button.append(detail);
        }
        button.onclick = () => {
          picker.close();
          if (!select.isConnected || option.selected) return;
          select.selectedIndex = option.index;
          select.dispatchEvent(new Event("change", { bubbles: true }));
        };
        item.append(button);
        fragment.append(item);
      }
      results.replaceChildren(fragment);
      results.scrollTop = 0;
      status.textContent = matches.length
        ? `${start + 1}–${end} de ${matches.length} opciones`
        : "No hay opciones que coincidan.";
      pages.hidden = matches.length <= optionPageSize;
      previous.disabled = page === 0;
      next.disabled = end >= matches.length;
    }
    search.oninput = () => {
      const terms = normalizeOption(search.value.trim()).split(/\s+/);
      matches = options.filter(({ searchText }) =>
        terms.every((term) => searchText.includes(term)),
      );
      page = 0;
      renderResults();
    };
    search.onkeydown = (event) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        picker.close();
        return;
      }
      const first = results.querySelector("button");
      if (event.key === "ArrowDown" && first) {
        event.preventDefault();
        first.focus();
      }
      if (event.key === "Enter" && matches.length === 1) {
        event.preventDefault();
        first.click();
      }
    };
    for (const button of [previous, next]) {
      button.onclick = () => {
        page += Number(button.dataset.selectPage);
        renderResults();
        results.querySelector("button")?.focus();
      };
    }
    picker.querySelector("h2").textContent = title;
    search.placeholder = select.dataset.searchSelect || "Escribe para buscar";
    search.value = "";
    renderResults();
    picker.showModal();
    search.focus();
  }

  window.VSSelectSearch = {
    init(root) {
      for (const select of root.querySelectorAll(
        "select[data-search-select]",
      )) {
        if (enhancedSelects.has(select)) {
          this.refresh(select);
          continue;
        }
        const label = select.parentElement;
        const title = label.textContent.replace(select.textContent, "").trim();
        const button = document.createElement("button");
        button.type = "button";
        button.id = `search-select-${crypto.randomUUID()}`;
        button.className = "select-search-trigger";
        button.setAttribute("aria-haspopup", "dialog");
        button.onclick = () => openSelectSearch(select, title);
        label.htmlFor = button.id;
        label.append(button);
        label.after(select);
        select.hidden = true;
        enhancedSelects.set(select, { button, title });
        select.addEventListener("change", () => this.refresh(select));
        select.addEventListener("invalid", (event) => {
          event.preventDefault();
          if (!picker?.open) button.click();
        });
        this.refresh(select);
      }
    },
    refresh(select) {
      const control = enhancedSelects.get(select);
      if (!control) return;
      const { button, title } = control;
      const value = select.selectedOptions[0]?.label || "Selecciona";
      button.textContent = value;
      button.setAttribute("aria-label", `${title} · ${value}`);
      button.disabled = select.disabled;
    },
    jobOption(job, selected = "") {
      const { esc } = VSUtils;
      const detail = [job.direccion, job.poblacion].filter(Boolean).join(" · ");
      return `<option value="${esc(job.id)}" data-search-detail="${esc(detail)}" data-search-text="${esc(job.descripcion)}" ${job.id === selected ? "selected" : ""}>${esc(job.id)} · ${esc(job.cliente)}</option>`;
    },
  };
}
