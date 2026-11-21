"use strict";
(() => {
  const endpoint = window.VIDRES_AI_ENDPOINT;
  const KEY = "vidres-session-v1",
    screen = document.querySelector("#auth-screen"),
    login = document.querySelector("#login-form"),
    change = document.querySelector("#password-form"),
    message = document.querySelector("#auth-message"),
    startup = document.querySelector("#startup-screen"),
    startupMessage = document.querySelector("#startup-message"),
    retry = document.querySelector("#startup-retry"),
    goToLogin = document.querySelector("#startup-login");
  let token = "",
    user = null,
    restoringSession = false,
    resolveReady;
  const ready = new Promise((resolve) => (resolveReady = resolve));
  const notify = (s) => {
    message.textContent = s;
  };
  function showLogin() {
    startup.hidden = true;
    if (goToLogin) goToLogin.hidden = true;
    screen.hidden = false;
  }
  function showStartupError(error) {
    startup.hidden = false;
    screen.hidden = true;
    startupMessage.textContent = error.message;
    retry.hidden = false;
  }
  retry.addEventListener("click", () => location.reload());
  goToLogin?.addEventListener("click", () => {
    restoringSession = false;
    token = "";
    showLogin();
    notify("Introduce tu usuario y contraseña.");
  });
  function remember(value) {
    token = value;
    try {
      localStorage.setItem(KEY, value);
    } catch {}
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
  function forgetSession() {
    token = "";
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }
  function invalidate() {
    hidePrivate();
    user = null;
    forgetSession();
    location.reload();
  }
  async function rawRequest(
    path,
    { invalidateSession = true, ...options } = {},
  ) {
    if (!endpoint || new URL(endpoint).protocol !== "https:")
      throw Error("Servidor de acceso sin configurar");
    const headers = new Headers(options.headers || {});
    const requestToken = token;
    if (requestToken && path !== "/auth/login")
      headers.set("Authorization", "Bearer " + requestToken);
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
    if (response.status === 401 && path !== "/auth/login") {
      if (
        invalidateSession &&
        requestToken === token &&
        !options.signal?.aborted
      )
        invalidate();
      const error = Error(
        "La sesión ya no es válida. Vuelve a iniciar sesión.",
      );
      error.status = 401;
      throw error;
    }
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
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
  async function readJSON(path, method, body, options) {
    return (
      await request(path, {
        ...options,
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
  async function json(path, method = "GET", body, options = {}) {
    const reading = method === "GET";
    if (options.signal || (!reading && !path.startsWith("/auth/")))
      return readJSON(path, method, body, options);
    const operation =
      {
        "/auth/login": "iniciar sesión",
        "/auth/me": "verificar la sesión",
        "/auth/change-password": "cambiar la contraseña",
        "/auth/logout": "cerrar la sesión",
      }[path] || "cargar los datos";
    const controller = new AbortController();
    let timeout;
    const deadline = new Promise((_, reject) => {
      timeout = setTimeout(
        () => {
          reject(
            Error(
              `El servidor tarda demasiado en ${operation}. Vuelve a intentarlo.`,
            ),
          );
          controller.abort();
        },
        reading ? 15000 : 30000,
      );
    });
    try {
      return await Promise.race([
        deadline,
        readJSON(path, method, body, { ...options, signal: controller.signal }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }
  function enter(active) {
    if (goToLogin) goToLogin.hidden = true;
    retry.hidden = true;
    user = active;
    if (user.cambioObligatorio) {
      showLogin();
      login.hidden = true;
      change.hidden = false;
      notify(
        "Debes cambiar tu contraseña antes de acceder. Mínimo 8 caracteres.",
      );
      change.elements.actual.focus();
      return;
    }
    screen.hidden = true;
    startup.hidden = false;
    startupMessage.textContent = "Cargando tus datos y preparando Inicio…";
    document.body.classList.add("authenticated");
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
    if (button.disabled) return;
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
    showStartupError,
    showApp() {
      if (!user || user.cambioObligatorio) return;
      document.querySelectorAll("body > .layout").forEach((el) => {
        el.hidden = false;
        el.inert = false;
      });
      startup.hidden = true;
    },
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
    const checkedToken = token;
    try {
      const r = await json("/auth/me", "GET", undefined, {
        invalidateSession: false,
      });
      if (checkedToken !== token) return;
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
      if (checkedToken !== token) return;
      if (e.status === 401 || e.status === 403) {
        invalidate();
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
        restoringSession = true;
        if (goToLogin) goToLogin.hidden = false;
        startupMessage.textContent = "Verificando sesión…";
        const r = await json("/auth/me", "GET", undefined, {
          invalidateSession: false,
        });
        if (restoringSession) enter(r.user);
      } else {
        showLogin();
        notify("Introduce tu usuario y contraseña.");
      }
    } catch (e) {
      if (restoringSession && e.status === 401) {
        forgetSession();
        showLogin();
        notify(e.message);
      } else if (restoringSession) {
        showStartupError(e);
      } else if (startup.hidden === false) {
        showLogin();
        notify(e.message);
      }
    } finally {
      restoringSession = false;
    }
  })();
})();
