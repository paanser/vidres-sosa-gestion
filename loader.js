"use strict";
document.querySelectorAll("#nav button").forEach((b) => (b.disabled = true));
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
    "quote-pdf",
    "quotes",
    "sketch",
    "job-measures",
    "app",
    "voice",
    "enhancements",
    "expediente",
    "operations-model",
    "operations",
  ];
  // Download public assets together while the session is being checked.
  // Execution and private data requests still wait for authentication.
  const assetsReady = (async () => {
    let version = "local";
    try {
      const r = await fetch("version.json", {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (r.ok) version = (await r.json()).version;
    } catch {}
    window.VIDRES_VERSION = version;
    const suffix = "?v=" + encodeURIComponent(version);
    const style = document.querySelector("#app-style");
    const styled = new Promise((resolve, reject) => {
      style.onload = resolve;
      style.onerror = () => reject(Error("No se pudo cargar el diseño"));
      style.href = "styles.css" + suffix;
    });
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
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = name + ".js" + suffix;
      script.onload = resolve;
      script.onerror = () => reject(Error("No se pudo cargar " + name));
      document.body.appendChild(script);
    });
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
