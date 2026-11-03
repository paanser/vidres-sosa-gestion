"use strict";
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || document.querySelector("#pwa-update")) return;
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
