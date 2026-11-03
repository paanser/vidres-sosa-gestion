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
  const api = { esc, num, money, round6 };
  if (typeof module !== "undefined") module.exports = api;
  else root.VSUtils = api;
})(globalThis);
