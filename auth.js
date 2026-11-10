"use strict";
(() => {
  const endpoint = window.VIDRES_AI_ENDPOINT;
  const KEY = "vidres-session-v1",
    screen = document.querySelector("#auth-screen"),
    login = document.querySelector("#login-form"),
    change = document.querySelector("#password-form"),
    message = document.querySelector("#auth-message");
  let token = "",
    user = null,
    resolveReady;
  const ready = new Promise((resolve) => (resolveReady = resolve));
  const notify = (s) => {
    message.textContent = s;
  };
  function remember(value) {
    localStorage.setItem(KEY, value);
    token = value;
  }
  function hidePrivate() {
    document.body.classList.remove("authenticated");
    document.querySelectorAll("body > .layout").forEach((el) => {
      el.hidden = true;
      el.inert = true;
    });
    document.querySelectorAll("dialog[open]").forEach((d) => d.close());
    document.querySelector("#content").replaceChildren();
    window.VSStorage?.clear?.();
    window.VSFiles?.clear?.();
  }
  function invalidate() {
    hidePrivate();
    user = null;
    token = "";
    try {
      localStorage.removeItem(KEY);
    } catch {}
    location.reload();
  }
  async function rawRequest(path, options = {}) {
    if (!endpoint || new URL(endpoint).protocol !== "https:")
      throw Error("Servidor de acceso sin configurar");
    const headers = new Headers(options.headers || {});
    if (token) headers.set("Authorization", "Bearer " + token);
    let response;
    try {
      response = await fetch(endpoint.replace(/\/$/, "") + path, {
        ...options,
        headers,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      });
    } catch {
      throw Error(
        "No se puede conectar con el servidor. Comprueba la conexión e inténtalo de nuevo.",
      );
    }
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      if (response.status === 401 && path !== "/auth/login") invalidate();
      const e = new Error(
        response.status === 429 && path === "/auth/login"
          ? "Demasiados intentos de inicio de sesión. Espera 15 minutos antes de volver a intentarlo."
          : result.error || "No se pudo completar la operación",
      );
      e.status = response.status;
      throw e;
    }
    return response;
  }
  // Observa escrituras reales; no guarda copias locales ni reintenta en silencio.
  let pendingWrites = 0,
    failedWrite = false,
    lastWriteSaved = false,
    connectionLost = false;
  function showSaveStatus() {
    const elements = document.querySelectorAll(
      "#save-status, [data-save-status]",
    );
    if (!elements.length) return;
    const offline = connectionLost || window.navigator?.onLine === false;
    let state = "idle",
      text = "Sin cambios pendientes";
    if (offline) {
      state = "offline";
      text =
        "Sin conexión · los cambios no se guardarán hasta recuperar la conexión";
    } else if (pendingWrites) {
      state = "saving";
      text = "Guardando…";
    } else if (failedWrite) {
      state = "error";
      text = "No se pudo guardar · vuelve a intentarlo";
    } else if (lastWriteSaved) {
      state = "saved";
      text = "Guardado";
    }
    elements.forEach((element) => {
      element.dataset.state = state;
      element.textContent = text;
    });
  }
  window.addEventListener("online", showSaveStatus);
  window.addEventListener("offline", showSaveStatus);
  showSaveStatus();
  async function request(path, options = {}) {
    const writing =
      path.startsWith("/api/") &&
      !["GET", "HEAD", "OPTIONS"].includes(
        (options.method || "GET").toUpperCase(),
      );
    if (!writing) return rawRequest(path, options);
    if (!pendingWrites) failedWrite = false;
    pendingWrites++;
    showSaveStatus();
    try {
      const response = await rawRequest(path, options);
      lastWriteSaved = true;
      return response;
    } catch (error) {
      failedWrite = true;
      lastWriteSaved = false;
      throw error;
    } finally {
      pendingWrites--;
      showSaveStatus();
    }
  }
  async function json(path, method = "GET", body) {
    return (
      await request(path, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      })
    ).json();
  }
  function enter(active) {
    user = active;
    if (user.cambioObligatorio) {
      login.hidden = true;
      change.hidden = false;
      notify(
        "Debes cambiar tu contraseña antes de acceder. Mínimo 8 caracteres.",
      );
      change.elements.actual.focus();
      return;
    }
    screen.hidden = true;
    document.body.classList.add("authenticated");
    document.querySelectorAll("body > .layout").forEach((el) => {
      el.hidden = false;
      el.inert = false;
    });
    resolveReady(user);
  }
  document.querySelectorAll("[data-show-password]").forEach((button) =>
    button.addEventListener("click", () => {
      const field = document.getElementById(button.dataset.showPassword),
        show = field.type === "password";
      field.type = show ? "text" : "password";
      button.textContent = show ? "Ocultar" : "Mostrar";
      button.setAttribute("aria-pressed", String(show));
    }),
  );
  async function submit(form, task) {
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    notify("Comprobando…");
    try {
      await task();
    } catch (e) {
      notify(e.message);
    } finally {
      button.disabled = false;
    }
  }
  login.addEventListener("submit", (e) => {
    e.preventDefault();
    submit(login, async () => {
      const result = await json("/auth/login", "POST", {
        usuario: login.elements.usuario.value.trim(),
        password: login.elements.password.value,
      });
      remember(result.token);
      login.reset();
      enter(result.user);
    });
  });
  change.addEventListener("submit", (e) => {
    e.preventDefault();
    submit(change, async () => {
      if (change.elements.password.value !== change.elements.confirmacion.value)
        throw Error("Las contraseñas no coinciden");
      const result = await json("/auth/change-password", "POST", {
        actual: change.elements.actual.value,
        password: change.elements.password.value,
      });
      remember(result.token);
      change.reset();
      enter(result.user);
    });
  });
  async function logout() {
    await json("/auth/logout", "POST", {});
    invalidate();
  }
  document
    .querySelector("#auth-logout")
    .addEventListener("click", () => logout().catch((e) => notify(e.message)));
  window.VSAuth = {
    ready,
    json,
    request,
    get user() {
      return user;
    },
    logout,
    useSession(result) {
      remember(result.token);
      user = result.user;
    },
  };
  window.addEventListener("storage", (e) => {
    if (e.key === KEY && e.newValue !== token) {
      hidePrivate();
      location.reload();
    }
  });
  // Revalidate when returning to the app and every 30s; private responses are never cached.
  async function check() {
    if (!user || user.cambioObligatorio || document.hidden) return;
    try {
      const r = await json("/auth/me");
      if (
        r.user.rol !== user.rol ||
        r.user.cambioObligatorio !== user.cambioObligatorio
      ) {
        hidePrivate();
        location.reload();
      }
      user = r.user;
      connectionLost = false;
      showSaveStatus();
    } catch (e) {
      if (e.status === 401 || e.status === 403) {
        if (e.status === 403) invalidate();
        return;
      }
      connectionLost = true;
      showSaveStatus();
      notify("Sin conexión · reintentando en 30 s");
    }
  }
  document.addEventListener("visibilitychange", check);
  setInterval(check, 30000);
  (async () => {
    try {
      token = localStorage.getItem(KEY) || "";
      if (token) {
        notify("Verificando sesión…");
        const r = await json("/auth/me");
        enter(r.user);
      } else notify("Introduce tu usuario y contraseña.");
    } catch (e) {
      notify(e.message);
    }
  })();
})();
