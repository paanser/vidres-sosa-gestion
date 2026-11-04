"use strict";
document.querySelectorAll("#nav button").forEach((b) => (b.disabled = true));
(async () => {
  let version = "local";
  try {
    const r = await fetch("version.json", { cache: "no-store" });
    if (r.ok) version = (await r.json()).version;
  } catch {}
  window.VIDRES_VERSION = version;
  document.querySelector("#app-style").href =
    "styles.css?v=" + encodeURIComponent(version);
  for (const name of [
    "utils",
    "ui",
    "icons",
    "storage",
    "calculations",
    "files",
    "backup",
    "tariffs",
    "tools",
    "quotes",
    "sketch",
    "job-measures",
    "app",
    "ai-config",
    "voice",
    "enhancements",
    "expediente",
    "pwa",
  ]) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = name + ".js?v=" + encodeURIComponent(version);
      script.onload = resolve;
      script.onerror = () => reject(Error("No se pudo cargar " + name));
      document.body.appendChild(script);
    });
    if (name === "app") {
      await window.vidresAppReady;
      if (window.VSAppError)
        throw Error(document.querySelector("#content").textContent);
    }
  }
  document.querySelectorAll("#nav button").forEach((b) => (b.disabled = false));
})().catch((e) => {
  document.querySelector("#content").textContent = e.message;
});
