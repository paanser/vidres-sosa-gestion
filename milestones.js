"use strict";
(() => {
  const labels = {
    M: "Medido",
    F: "Fabricado",
    PM: "Pendiente Montaje",
    MO: "Montado",
  };
  const esc = (v) => VSUtils.esc(String(v));
  const normalize = (v) =>
    String(v || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  function source(record, kind) {
    if (kind === "quote" && record.job) {
      const job = VSStorage.read(VSStorage.keys.trabajos, []).find(
        (j) => j.id === record.job,
      );
      if (job) return { record: job, kind: "job" };
    }
    return { record, kind };
  }
  function badges(record, kind = "job") {
    const s = source(record, kind);
    return `<div class="milestones" role="group" aria-label="Hitos del expediente">${Object.entries(
      labels,
    )
      .map(
        ([key, label]) =>
          `<button type="button" data-milestone="${key}" data-milestone-id="${esc(s.record.id)}" data-milestone-kind="${s.kind}" aria-label="${label}" title="${label}" aria-pressed="${s.record.hitos?.[key] === true}">${key}</button>`,
      )
      .join("")}</div>`;
  }
  function controls(prefix) {
    return `<div class="milestone-filters"><label>Hito<select id="${prefix}-milestone"><option value="">Todos los hitos</option>${Object.entries(
      labels,
    )
      .map(([k, l]) => `<option value="${k}">${k} · ${l}</option>`)
      .join(
        "",
      )}</select></label><label>Situación<select id="${prefix}-completion"><option value="done">Completado</option><option value="pending">Pendiente</option></select></label></div>`;
  }
  function matches(record, kind, query, key, completion) {
    const s = source(record, kind).record;
    const date = record.fecha || record.date || "";
    const text = [
      record.id,
      record.cliente,
      record.client,
      date,
      date.slice(0, 10).split("-").reverse().join("/"),
      record.estado,
      record.status,
    ].join(" ");
    return (
      (!query || normalize(text).includes(normalize(query))) &&
      (!key || (s.hitos?.[key] === true) === (completion !== "pending"))
    );
  }
  document.addEventListener(
    "click",
    async (e) => {
      const b = e.target.closest("[data-milestone]");
      if (!b) return;
      e.stopImmediatePropagation();
      const id = b.dataset.milestoneId,
        kind = b.dataset.milestoneKind,
        key = b.dataset.milestone;
      const peers = () =>
        [...document.querySelectorAll("[data-milestone]")].filter(
          (x) =>
            x.dataset.milestoneId === id &&
            x.dataset.milestoneKind === kind &&
            x.dataset.milestone === key,
        );
      peers().forEach((x) => (x.disabled = true));
      try {
        await VSStorage.updateValues((values) => {
          const record = values[
            VSStorage.keys[kind === "job" ? "trabajos" : "presupuestos"]
          ].find((x) => x.id === id);
          if (!record) throw Error("Expediente no encontrado");
          record.hitos = {
            ...record.hitos,
            [key]: record.hitos?.[key] !== true,
          };
        });
        window.vidresSyncMilestones?.();
        const record = VSStorage.read(
          VSStorage.keys[kind === "job" ? "trabajos" : "presupuestos"],
          [],
        ).find((x) => x.id === id);
        peers().forEach((x) =>
          x.setAttribute("aria-pressed", String(record.hitos[key])),
        );
        window.dispatchEvent(
          new CustomEvent("vidres-milestones-saved", { detail: { id, kind } }),
        );
      } catch (error) {
        alert("No se pudo guardar el hito: " + error.message);
      } finally {
        peers().forEach((x) => (x.disabled = false));
      }
    },
    true,
  );
  window.VSMilestones = { badges, controls, matches };
})();
