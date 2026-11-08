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
    const n = unit === "mm" ? num(value) / 10 : num(value);
    return Math.round(n * 100) / 100;
  };
  const api = {
    esc,
    num,
    money,
    round6,
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
