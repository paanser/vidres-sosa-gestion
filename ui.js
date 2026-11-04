"use strict";
// Interfaz reutilizable y sin dependencias: avisos tipo "toast" y diálogos
// propios (confirmar / pedir un valor) que sustituyen a alert() y confirm().
// Se apoya únicamente en VSUtils.esc. No usa iconos ni fuentes externas.
(function (root) {
  const esc =
    root.VSUtils?.esc ||
    ((v) =>
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
      ));

  let seq = 0;
  const uid = (name) => "vsui-" + name + "-" + ++seq;

  // --- Toast -------------------------------------------------------------
  // Muestra un aviso breve que desaparece solo. Tipos: info, ok, warn, error.
  let toastHost = null;
  function host() {
    if (toastHost) return toastHost;
    toastHost = document.createElement("div");
    toastHost.id = "vsui-toasts";
    toastHost.setAttribute("aria-live", "polite");
    toastHost.setAttribute("aria-atomic", "false");
    document.body.appendChild(toastHost);
    return toastHost;
  }
  function toast(texto, tipo = "info") {
    const t = ["info", "ok", "warn", "error"].includes(tipo) ? tipo : "info";
    const el = document.createElement("div");
    el.className = "toast toast--" + t;
    el.setAttribute("role", t === "error" ? "alert" : "status");
    el.textContent = String(texto ?? "");
    host().appendChild(el);
    requestAnimationFrame(() => el.classList.add("is-visible"));
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      el.classList.remove("is-visible");
      el.addEventListener("transitionend", () => el.remove(), { once: true });
      setTimeout(() => el.remove(), 2200);
    };
    const ttl = t === "error" ? 6500 : t === "warn" ? 5000 : 3500;
    const timer = setTimeout(remove, ttl);
    el.addEventListener("click", () => {
      clearTimeout(timer);
      remove();
    });
    return el;
  }

  // --- Diálogo base ------------------------------------------------------
  function buildDialog() {
    const dialog = document.createElement("dialog");
    dialog.className = "vsui-dialog";
    document.body.appendChild(dialog);
    return dialog;
  }

  // --- Confirmar ---------------------------------------------------------
  // VSUI.confirm({ titulo, texto, aceptar, cancelar, peligro }) -> Promise<boolean>
  function confirm(opts = {}) {
    const titulo = opts.titulo || "Confirmar";
    const texto = opts.texto || "";
    const aceptar = opts.aceptar || "Aceptar";
    const cancelar = opts.cancelar || "Cancelar";
    const peligro = Boolean(opts.peligro);
    const titleId = uid("confirm-title");
    const textId = uid("confirm-text");
    return new Promise((resolve) => {
      const dialog = buildDialog();
      dialog.classList.add("vsui-confirm");
      dialog.setAttribute("aria-labelledby", titleId);
      dialog.setAttribute("aria-describedby", textId);
      dialog.innerHTML =
        '<div class="vsui-dialog-body">' +
        '<h2 class="vsui-dialog-title" id="' +
        titleId +
        '">' +
        esc(titulo) +
        "</h2>" +
        '<p class="vsui-dialog-text" id="' +
        textId +
        '">' +
        esc(texto) +
        "</p>" +
        '<div class="vsui-dialog-actions">' +
        '<button type="button" class="vsui-btn" data-vsui="cancel">' +
        esc(cancelar) +
        "</button>" +
        '<button type="button" class="vsui-btn vsui-btn-primary' +
        (peligro ? " vsui-danger" : "") +
        '" data-vsui="accept">' +
        esc(aceptar) +
        "</button>" +
        "</div></div>";
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve(val);
      };
      dialog
        .querySelector('[data-vsui="cancel"]')
        .addEventListener("click", () => finish(false));
      dialog
        .querySelector('[data-vsui="accept"]')
        .addEventListener("click", () => finish(true));
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        finish(false);
      });
      dialog.showModal();
      requestAnimationFrame(() =>
        dialog
          .querySelector(
            peligro ? '[data-vsui="cancel"]' : '[data-vsui="accept"]',
          )
          .focus(),
      );
    });
  }

  // --- Pedir un valor ----------------------------------------------------
  // VSUI.prompt({ titulo, texto, valor, aceptar, cancelar }) -> Promise<string|null>
  function prompt(opts = {}) {
    const titulo = opts.titulo || "Escribe un valor";
    const texto = opts.texto || "";
    const aceptar = opts.aceptar || "Aceptar";
    const cancelar = opts.cancelar || "Cancelar";
    const valor = opts.valor ?? "";
    const peligro = Boolean(opts.peligro);
    const titleId = uid("prompt-title");
    const textId = uid("prompt-text");
    return new Promise((resolve) => {
      const dialog = buildDialog();
      dialog.classList.add("vsui-prompt");
      dialog.setAttribute("aria-labelledby", titleId);
      if (texto) dialog.setAttribute("aria-describedby", textId);
      dialog.innerHTML =
        '<form class="vsui-dialog-body" novalidate>' +
        '<h2 class="vsui-dialog-title" id="' +
        titleId +
        '">' +
        esc(titulo) +
        "</h2>" +
        (texto
          ? '<p class="vsui-dialog-text" id="' +
            textId +
            '">' +
            esc(texto) +
            "</p>"
          : "") +
        '<label class="vsui-prompt-label"><input class="vsui-prompt-input" type="text" autocomplete="off" value="' +
        esc(valor) +
        '"></label>' +
        '<div class="vsui-dialog-actions">' +
        '<button type="button" class="vsui-btn" data-vsui="cancel">' +
        esc(cancelar) +
        "</button>" +
        '<button type="submit" class="vsui-btn vsui-btn-primary' +
        (peligro ? " vsui-danger" : "") +
        '" data-vsui="accept">' +
        esc(aceptar) +
        "</button>" +
        "</div></form>";
      let done = false;
      const finish = (val) => {
        if (done) return;
        done = true;
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve(val);
      };
      const input = dialog.querySelector(".vsui-prompt-input");
      dialog
        .querySelector('[data-vsui="cancel"]')
        .addEventListener("click", () => finish(null));
      dialog.querySelector("form").addEventListener("submit", (e) => {
        e.preventDefault();
        finish(input.value);
      });
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        finish(null);
      });
      dialog.showModal();
      requestAnimationFrame(() => {
        input.focus();
        input.select();
      });
    });
  }

  const api = { toast, confirm, prompt };
  if (typeof module !== "undefined") module.exports = api;
  else root.VSUI = api;
})(globalThis);
