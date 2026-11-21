"use strict";
document.querySelectorAll("#nav button").forEach((b) => (b.disabled = true));
async function beforeDeadline(task, ms, message) {
  let timeout;
  try {
    return await Promise.race([
      task,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(Error(message)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
function loadAsset(element, start, label) {
  const error = "No se pudo cargar " + label;
  const loaded = new Promise((resolve, reject) => {
    element.onload = resolve;
    element.onerror = () => reject(Error(error));
    start();
  });
  return beforeDeadline(loaded, 20000, error).finally(() => {
    element.onload = null;
    element.onerror = null;
  });
}
(async () => {
  const modules = [
    "utils",
    "storage",
    "calculations",
    "files",
    "backup",
    "migration",
    "users",
    "tariffs",
    "tools",
    "vendor/jspdf.umd.min",
    "vendor/jspdf.plugin.autotable.min",
    "brand-logo",
    "quote-pdf",
    "milestones",
    "facturadirecta",
    "quotes",
    "sketch",
    "job-measures",
    "app",
    "voice",
    "enhancements",
    "job-sheet-pdf",
    "expediente",
    "operations-model",
    "operations",
  ];
  // Download public assets together while the session is being checked.
  // Execution and private data requests still wait for authentication.
  const assetsReady = (async () => {
    let version = "local";
    const controller = new AbortController();
    try {
      const release = fetch("version.json", {
        cache: "no-store",
        signal: controller.signal,
      }).then((response) => (response.ok ? response.json() : null));
      const result = await beforeDeadline(
        release,
        4000,
        "Versión no disponible",
      );
      if (typeof result?.version === "string" && result.version)
        version = result.version;
    } catch {
      controller.abort();
    }
    window.VIDRES_VERSION = version;
    const suffix =
      version === "local" ? "" : "?v=" + encodeURIComponent(version);
    const style = document.querySelector("#app-style");
    const styled = suffix
      ? loadAsset(
          style,
          () => (style.href = "styles.css" + suffix),
          "el diseño",
        )
      : Promise.resolve();
    // Attach a handler now, even if authentication has not finished yet.
    styled.catch(() => {});
    for (const name of modules) {
      const preload = document.createElement("link");
      preload.rel = "preload";
      preload.as = "script";
      preload.href = name + ".js" + suffix;
      document.head.appendChild(preload);
    }
    return { suffix, styled };
  })();
  await VSAuth.ready;
  const { suffix, styled } = await assetsReady;
  for (const name of modules) {
    const script = document.createElement("script");
    script.src = name + ".js" + suffix;
    await loadAsset(script, () => document.body.appendChild(script), name);
    if (name === "storage") VSStorage.ready.catch(() => {});
    if (name === "files") await Promise.all([VSStorage.ready, VSFiles.ready]);
    if (name === "app") {
      await window.vidresAppReady;
      if (window.VSAppError)
        throw Error(document.querySelector("#content").textContent);
    }
  }
  await styled;
  document.querySelectorAll("#nav button").forEach((b) => (b.disabled = false));
  VSAuth.showApp();
})().catch((e) => {
  VSAuth.showStartupError(e);
});
