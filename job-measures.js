"use strict";
(() => {
  const section = document.querySelector("#new-job-measures");
  const list = section.querySelector(".new-measure-list");
  let sequence = 0;
  const fields = ["ancho", "alto", "cantidad", "espesor", "tipo", "observaciones"];
  function updateArea(row) {
    const value = key => Number(row.querySelector(`[data-new-measure="${key}"]`).value);
    row.querySelector("output").textContent = (value("ancho") * value("alto") * value("cantidad") / 10000).toFixed(4) + " m² reales";
  }
  function addPiece(draw=false) {
    const row = document.createElement("fieldset");
    row.className = "new-measure-piece";
    row.innerHTML = `<legend>Pieza ${++sequence}</legend>
      <div class="measure-fields">
        <label>Ancho (cm)<input data-new-measure="ancho" type="number" inputmode="decimal" min="0.1" step="0.1" required></label>
        <label>Alto (cm)<input data-new-measure="alto" type="number" inputmode="decimal" min="0.1" step="0.1" required></label>
        <label>Cantidad<input data-new-measure="cantidad" type="number" inputmode="numeric" min="1" step="1" value="1" required></label>
        <label>Espesor (mm)<input data-new-measure="espesor" type="number" inputmode="decimal" min="0" step="0.1"></label>
      </div>
      <label>Tipo de vidrio<select data-new-measure="tipo"><option>Laminado</option><option>Templado</option><option>Cámara</option><option>Monolítico</option><option>Otro</option></select></label>
      <label>Observaciones de la pieza<textarea data-new-measure="observaciones" rows="2" maxlength="500"></textarea></label>
      <div class="new-measure-sketch"></div><output aria-live="polite">0.0000 m² reales</output>
      <button type="button" data-new-measure-remove>Quitar pieza</button>`;
    list.appendChild(row);
    window.vidresSketch.mount(row.querySelector(".new-measure-sketch"));
    if(draw)window.vidresSketch.open(row.querySelector(".new-measure-sketch"));
    else row.querySelector("input").focus();
  }
  section.querySelector("#new-measure-add").addEventListener("click",()=>addPiece());
  section.querySelector("#new-measure-draw").addEventListener("click",()=>addPiece(true));
  list.addEventListener("click", event => {
    const button = event.target.closest("[data-new-measure-remove]");
    if (button) button.closest("fieldset").remove();
  });
  list.addEventListener("input", event => {
    const row = event.target.closest("fieldset");
    if (row) updateArea(row);
  });
  window.vidresNewMeasures = {
    reset(editing) {
      list.replaceChildren();
      sequence = 0;
      section.hidden = Boolean(editing);
    },
    read(jobId) {
      return [...list.querySelectorAll("fieldset")].map(row => ({
        id: "M-" + crypto.randomUUID(),
        trabajo: jobId,
        croquis: window.vidresSketch.read(row.querySelector(".new-measure-sketch")),
        ...Object.fromEntries(fields.map(key => [key, row.querySelector(`[data-new-measure="${key}"]`).value.trim()]))
      }));
    }
  };
})();
