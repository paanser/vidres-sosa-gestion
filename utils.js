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
    const n = Number(String(v ?? "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
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
    guard(handler) {
      return async function (event) {
        event.preventDefault();
        const form = event.currentTarget;
        if (form.dataset.saving) return;
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
