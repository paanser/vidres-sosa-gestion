"use strict";
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || document.querySelector("#pwa-update")) return;
    if (document.querySelector("#startup-screen")?.hidden === false) {
      location.reload();
      return;
    }
    const panel = document.createElement("div");
    panel.id = "pwa-update";
    panel.setAttribute("role", "status");
    panel.innerHTML =
      '<span>Hay una versión nueva. Guarda los cambios antes de recargar.</span><button type="button">Recargar</button>';
    panel.querySelector("button").onclick = () => location.reload();
    document.body.appendChild(panel);
  });
  navigator.serviceWorker
    .register("sw.js", { updateViaCache: "none" })
    .then((reg) => reg.update())
    .catch(() =>
      console.info(
        "No se pudo preparar el modo sin conexión. Reintenta con internet.",
      ),
    );
}

(() => {
  const preference = "vidres-push-disabled";
  const path = "/notifications";
  const available = () =>
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  let disabled = false;
  try {
    disabled = localStorage.getItem(preference) === "1";
  } catch {}
  let loading,
    pending,
    prompt,
    settingsOpened = false;
  const request = (method, body) =>
    VSAuth.json(path, method, body, { signal: AbortSignal.timeout(10000) });

  async function load() {
    const registration = await beforeDeadline(
      navigator.serviceWorker.ready,
      10000,
      "No se pudo preparar la aplicación. Recarga e inténtalo de nuevo.",
    );
    const manager = registration.pushManager;
    const subscription = await manager.getSubscription();
    const { publicKey, active } = await request("POST", {
      endpoint: subscription?.endpoint,
    });
    return { manager, subscription, publicKey, active };
  }

  function getState() {
    loading ||= load().catch((error) => {
      loading = null;
      throw error;
    });
    return loading;
  }

  function savePreference(value) {
    disabled = value;
    try {
      if (value) localStorage.setItem(preference, "1");
      else localStorage.removeItem(preference);
    } catch {}
  }

  async function enable(state) {
    const key = Uint8Array.from(
      atob(state.publicKey.replace(/-/g, "+").replace(/_/g, "/")),
      (byte) => byte.charCodeAt(0),
    );
    const existingKey = state.subscription?.options.applicationServerKey;
    if (existingKey) {
      const bytes = new Uint8Array(existingKey);
      if (
        bytes.length !== key.length ||
        !key.every((byte, i) => bytes[i] === byte)
      ) {
        await state.subscription.unsubscribe();
        state.subscription = null;
      }
    }
    // A first subscription must start inside the click on browsers such as Safari.
    state.subscription ||= await state.manager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: key,
    });
    await request("PUT", state.subscription.toJSON());
    state.active = true;
    savePreference(false);
  }

  async function disable(state) {
    if (state.subscription)
      await request("DELETE", { endpoint: state.subscription.endpoint });
    state.active = false;
    savePreference(true);
    if (
      state.subscription &&
      (await state.subscription.unsubscribe().catch(() => false))
    )
      state.subscription = null;
  }

  function change(state, enabled) {
    if (!pending)
      pending = (enabled ? enable(state) : disable(state)).finally(() => {
        pending = null;
      });
    return pending;
  }

  window.vidresStartPush = async () => {
    if (
      disabled ||
      !available() ||
      Notification.permission === "denied" ||
      !(
        navigator.standalone || matchMedia("(display-mode: standalone)").matches
      )
    )
      return;
    try {
      const state = await getState();
      if (disabled || !state.publicKey || state.active || settingsOpened)
        return;
      if (Notification.permission === "granted") {
        try {
          await change(state, true);
          return;
        } catch {
          // Some browsers also require a click when permission was granted earlier.
        }
      }
      if (settingsOpened || Notification.permission === "denied") return;
      prompt = document.createElement("section");
      prompt.className = "panel";
      prompt.innerHTML =
        "<p>Permite las notificaciones para recibir avisos de nuevos partes en este móvil.</p>" +
        '<button type="button" class="primary">Permitir avisos</button> ' +
        '<button type="button">Ahora no</button><p role="status" hidden></p>';
      const [allow, later] = prompt.querySelectorAll("button");
      const status = prompt.querySelector('[role="status"]');
      allow.onclick = async () => {
        allow.disabled = true;
        try {
          await change(state, true);
          prompt.remove();
        } catch {
          if (Notification.permission === "denied") {
            prompt.remove();
            return;
          }
          status.hidden = false;
          status.textContent =
            "No se pudieron preparar los avisos. Inténtalo de nuevo.";
        } finally {
          allow.disabled = false;
        }
      };
      later.onclick = () => prompt.remove();
      document.querySelector("#content").before(prompt);
    } catch {
      // Startup remains usable while push is unavailable or the network is offline.
    }
  };

  window.vidresPushSettings = async (root) => {
    settingsOpened = true;
    prompt?.remove();
    const panel = document.createElement("section");
    panel.className = "panel";
    panel.innerHTML = `
      <h2>Notificaciones</h2>
      <p>Recibe un aviso en este dispositivo cuando se cree un parte de trabajo.</p>
      <p>En iPhone y iPad, abre la aplicación desde la pantalla de inicio.</p>
      <button type="button" class="primary" hidden></button>
      <button type="button" hidden>Desactivar avisos</button>
      <p role="status">Comprobando disponibilidad…</p>`;
    root.append(panel);
    const [allow, stop] = panel.querySelectorAll("button");
    const status = panel.querySelector('[role="status"]');
    if (!available()) {
      status.textContent =
        "Las notificaciones no están disponibles en esta aplicación o navegador.";
      return;
    }
    try {
      const state = await getState();
      await pending?.catch(() => {});
      function update() {
        const denied = Notification.permission === "denied";
        allow.textContent = disabled ? "Activar avisos" : "Permitir avisos";
        allow.hidden =
          !state.publicKey || denied || (state.active && !disabled);
        stop.hidden =
          (disabled && !state.active) || (!state.publicKey && !state.active);
        if (disabled)
          status.textContent = "Avisos desactivados en este dispositivo.";
        else if (denied)
          status.textContent =
            "El dispositivo bloquea los avisos. Puedes cambiar el permiso en sus ajustes.";
        else if (state.active)
          status.textContent = "Avisos activados en este dispositivo.";
        else if (state.publicKey)
          status.textContent =
            "Permite los avisos para completar la activación.";
        else
          status.textContent = "Las notificaciones aún no están disponibles.";
      }
      async function toggle(enabled) {
        allow.disabled = stop.disabled = true;
        try {
          await change(state, enabled);
          update();
        } catch (error) {
          update();
          if (Notification.permission !== "denied" || !enabled)
            status.textContent =
              "No se pudo cambiar el estado de los avisos. " + error.message;
        } finally {
          allow.disabled = stop.disabled = false;
        }
      }
      allow.onclick = () => toggle(true);
      stop.onclick = () => toggle(false);
      update();
    } catch (error) {
      status.textContent =
        "No se pudo comprobar el estado de los avisos. " + error.message;
    }
  };
})();
