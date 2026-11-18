const { test } = require("node:test");
const assert = require("node:assert/strict");
const { jobCreatedDate, jobMatchesCreation, sortJobs } = require("../utils.js");
const job = (id, date, fields = {}) => ({
  id,
  historial: date ? [{ de: "", a: "Pendiente", fecha: date }] : [],
  ...fields,
});
test("creación usa el alta original y no la cita ni cambios posteriores", () => {
  const j = job("A", "2026-11-10T12:00:00Z", { fecha: "2027-01-01" });
  j.historial.push({
    de: "Pendiente",
    a: "En medición",
    fecha: "2026-11-18T12:00:00Z",
  });
  assert.equal(jobCreatedDate(j), "2026-11-10");
  assert.equal(jobCreatedDate({ fecha: "2026-11-18" }), "");
  assert.equal(jobCreatedDate({ historial: [j.historial[1]] }), "");
  assert.equal(jobCreatedDate(job("A", "incorrecta")), "");
});
test("rango de creación inclusivo, abierto y sin fechas inventadas", () => {
  const j = job("A", "2026-11-10T12:00:00Z");
  assert.equal(jobMatchesCreation(j, "2026-11-10", "2026-11-10"), true);
  assert.equal(jobMatchesCreation(j, "2026-11-11", ""), false);
  assert.equal(jobMatchesCreation(j, "", "2026-11-09"), false);
  assert.equal(jobMatchesCreation(j, "", "2026-11-10"), true);
  assert.equal(jobMatchesCreation(job("B"), "", ""), true);
  assert.equal(jobMatchesCreation(job("B"), "2026-11-01", ""), false);
});
test("orden cronológico, referencia numérica, responsable y fechas vacías al final sin mutaciones", () => {
  const items = [
    job("VS-10"),
    job("VS-2", "2026-11-10T12:00:00Z", { responsable: "Zoe" }),
    job("VS-1", "2026-11-11T12:00:00Z", { responsable: "Ana" }),
  ];
  const ids = (order) => sortJobs(items, order).map((j) => j.id);
  assert.deepEqual(ids("id:asc"), ["VS-1", "VS-2", "VS-10"]);
  assert.deepEqual(ids("creation:asc"), ["VS-2", "VS-1", "VS-10"]);
  assert.deepEqual(ids("creation:desc"), ["VS-1", "VS-2", "VS-10"]);
  assert.deepEqual(ids("responsable:desc"), ["VS-2", "VS-1", "VS-10"]);
  assert.deepEqual(
    items.map((j) => j.id),
    ["VS-10", "VS-2", "VS-1"],
  );
});
test("rango de creación se expresa en la zona horaria del dispositivo", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "Europe/Madrid";
    assert.equal(
      jobCreatedDate(job("A", "2026-11-10T23:30:00Z")),
      "2026-11-11",
    );
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
