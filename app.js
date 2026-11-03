"use strict";
const KEY = "vidres-sosa-demo-v01";
const demo = [
  {
    id: "VS-0001",
    cliente: "Cliente de ejemplo A",
    descripcion: "Medir escaparate",
    direccion: "",
    responsable: "Equipo 1",
    fecha: "2026-11-05",
    estado: "Pendiente",
    notas: "",
  },
  {
    id: "VS-0002",
    cliente: "Cliente de ejemplo B",
    descripcion: "Instalar mampara",
    direccion: "",
    responsable: "Equipo 2",
    fecha: "2026-11-06",
    estado: "Para instalar",
    notas: "",
  },
  {
    id: "VS-0003",
    cliente: "Cliente de ejemplo C",
    descripcion: "Sustituir cristal",
    direccion: "",
    responsable: "Equipo 1",
    fecha: "2026-11-07",
    estado: "En medición",
    notas: "",
  },
];
let jobs;
try {
  const v = JSON.parse(localStorage.getItem(KEY));
  jobs = Array.isArray(v) ? v : demo.map((x) => ({ ...x }));
} catch {
  jobs = demo.map((x) => ({ ...x }));
}
let page = "inicio",
  editing = null,
  search = "";
let homeView;
try {
  homeView =
    localStorage.getItem("vidres-home-view") === "calendar"
      ? "calendar"
      : "dashboard";
} catch {
  homeView = "dashboard";
}
let shownMonth = new Date();
function calendarHtml() {
  const y = shownMonth.getFullYear(),
    m = shownMonth.getMonth(),
    offset = (new Date(y, m, 1).getDay() + 6) % 7,
    days = new Date(y, m + 1, 0).getDate();
  let cells = ["L", "M", "X", "J", "V", "S", "D"]
    .map((d) => '<div class="cal-weekday">' + d + "</div>")
    .join("");
  for (let i = 0; i < offset; i++)
    cells += '<div class="cal-day cal-empty"></div>';
  for (let d = 1; d <= days; d++) {
    const date =
      y +
      "-" +
      String(m + 1).padStart(2, "0") +
      "-" +
      String(d).padStart(2, "0");
    const items = jobs.filter((j) => j.fecha === date);
    cells +=
      '<div class="cal-day"><span class="cal-number">' +
      d +
      "</span>" +
      items
        .map(
          (j) =>
            '<button type="button" class="cal-job" data-id="' +
            esc(j.id) +
            '" title="' +
            esc(j.descripcion) +
            '">' +
            esc(j.cliente) +
            " · " +
            esc(j.descripcion) +
            "</button>",
        )
        .join("") +
      "</div>";
  }
  return (
    '<section class="panel cal-panel"><div class="cal-toolbar"><h2>' +
    shownMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" }) +
    '</h2><div><button type="button" data-month="-1" aria-label="Mes anterior">‹</button><button type="button" data-month="0">Hoy</button><button type="button" data-month="1" aria-label="Mes siguiente">›</button></div></div><div class="cal-grid">' +
    cells +
    "</div></section>"
  );
}
function homeSwitch() {
  return (
    '<div class="home-switch"><span>Vista principal</span><button type="button" data-home-view="dashboard" class="' +
    (homeView === "dashboard" ? "chosen" : "") +
    '" aria-label="Panel de gestión" title="Panel de gestión"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button><button type="button" data-home-view="calendar" class="' +
    (homeView === "calendar" ? "chosen" : "") +
    '" aria-label="Calendario grande" title="Calendario grande"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 18h3"/></svg></button></div>'
  );
}
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function save() {
  localStorage.setItem(KEY, JSON.stringify(jobs));
}
function status(s) {
  return (
    '<span class="pill ' +
    (s === "Crítico"
      ? "critico"
      : s === "Pendiente"
        ? "pendiente"
        : s === "Finalizado" || s === "Instalado"
          ? "finalizado"
          : s === "En medición"
            ? "medicion"
            : "") +
    '">' +
    esc(s) +
    "</span>"
  );
}
function table(items) {
  if (!items.length)
    return '<p class="muted">No hay trabajos en esta sección.</p>';
  return (
    "<table><thead><tr><th>Referencia</th><th>Cliente</th><th>Trabajo</th><th>Estado</th><th>Fecha</th><th></th></tr></thead><tbody>" +
    items
      .map(
        (j) =>
          "<tr><td>" +
          esc(j.id) +
          "</td><td>" +
          esc(j.cliente) +
          "</td><td>" +
          esc(j.descripcion) +
          "</td><td>" +
          status(j.estado) +
          "</td><td>" +
          esc(j.fecha || "—") +
          '</td><td><button class="edit" data-id="' +
          esc(j.id) +
          '">Editar</button></td></tr>',
      )
      .join("") +
    "</tbody></table>"
  );
}
const isClosed = (j) => ["Instalado", "Finalizado"].includes(j.estado);
const localToday = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
};
let jobScope = "activos";
const usagePanel = document.querySelector(".ai-usage");
let filters = { estado: "", responsable: "", tipoCliente: "" };
const options = (values, selected) =>
  '<option value="">Todos</option>' +
  values
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"))
    .map(
      (v) =>
        '<option value="' +
        esc(v) +
        '" ' +
        (v === selected ? "selected" : "") +
        ">" +
        esc(v) +
        "</option>",
    )
    .join("");
function jobCards(items) {
  if (!items.length)
    return '<div class="empty-state"><strong>No hay trabajos que coincidan</strong><p>Prueba otros filtros o crea un nuevo parte.</p></div>';
  return (
    '<div class="job-cards">' +
    items
      .map(
        (j) =>
          '<article class="job-card"><div class="job-card-top"><span class="job-ref">' +
          esc(j.id) +
          "</span>" +
          status(j.estado) +
          "</div><h3>" +
          esc(j.cliente) +
          "</h3><p>" +
          esc(j.descripcion) +
          '</p><div class="job-meta"><span>📅 ' +
          esc(j.fecha || "Sin fecha") +
          "</span><span>👤 " +
          esc(j.responsable || "Sin asignar") +
          "</span><span>" +
          esc(j.tipoCliente || "Particular") +
          '</span></div><button type="button" class="job-open" data-id="' +
          esc(j.id) +
          '">Ver y editar trabajo</button></article>',
      )
      .join("") +
    "</div>"
  );
}
function workFilters() {
  const states = [
    "Pendiente",
    "En medición",
    "Presupuestado",
    "En producción",
    "Para instalar",
    "Instalado",
    "Finalizado",
    "Crítico",
  ];
  return (
    '<div class="simple-work-search"><label>Buscar trabajo<input id="search" type="search" placeholder="Cliente, dirección o referencia" value="' +
    esc(search) +
    '"></label><label>Mostrar<select id="job-scope">' +
    [
      ["activos", "Activos"],
      ["finalizados", "Finalizados"],
      ["todos", "Todos los trabajos"],
    ]
      .map(
        ([value, label]) =>
          '<option value="' +
          value +
          '" ' +
          (jobScope === value ? "selected" : "") +
          ">" +
          label +
          "</option>",
      )
      .join("") +
    '</select></label></div><details class="advanced-work-filters"><summary>Más filtros</summary><div class="work-filters"><label>Estado<select data-filter="estado">' +
    options(states, filters.estado) +
    '</select></label><label>Responsable<select data-filter="responsable">' +
    options([...new Set(jobs.map((j) => j.responsable))], filters.responsable) +
    '</select></label><label>Tipo de cliente<select data-filter="tipoCliente">' +
    options(
      ["Particular", "Vitralia", "Mapfre", "Otros"],
      filters.tipoCliente,
    ) +
    "</select></label></div></details>"
  );
}
function dashboardHtml() {
  const today = localToday(),
    active = jobs.filter((j) => !isClosed(j)),
    due = active.filter((j) => j.fecha === today),
    critical = active.filter((j) => j.estado === "Crítico");
  const counts = [
    ["Trabajos activos", active.length],
    ["Para hoy", due.length],
    ["Críticos", critical.length],
  ];
  const preview = [...active]
    .sort(
      (a, b) =>
        (b.estado === "Crítico") - (a.estado === "Crítico") ||
        (a.fecha || "9999").localeCompare(b.fecha || "9999"),
    )
    .slice(0, 5);
  return (
    '<div class="stats simple-stats">' +
    counts
      .map(
        ([label, n]) =>
          '<div class="stat"><small>' +
          label +
          "</small><b>" +
          n +
          "</b></div>",
      )
      .join("") +
    '</div><section class="panel"><div class="simple-section-head"><h2>Próximos trabajos</h2><button type="button" data-go="trabajos">Ver trabajos activos</button></div>' +
    (preview.length
      ? '<div class="home-job-list">' +
        preview
          .map(
            (j) =>
              '<button type="button" class="home-job" data-id="' +
              esc(j.id) +
              '"><span><strong>' +
              esc(j.cliente) +
              "</strong><span>" +
              esc(j.descripcion) +
              "</span></span><span>" +
              status(j.estado) +
              "<small>" +
              esc(j.fecha || "Sin fecha") +
              "</small></span></button>",
          )
          .join("") +
        "</div>"
      : '<p class="muted">No hay trabajos activos. Puedes crear un parte desde el menú.</p>') +
    "</section>"
  );
}

// Fichas locales de clientes y mediciones por pieza; se conserva la estructura de trabajos existente.
const CLIENT_KEY = "vidres-clientes-v1",
  MEASURE_KEY = "vidres-mediciones-v1";
const safeRead = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};
let clients = safeRead(CLIENT_KEY, []),
  measurements = safeRead(MEASURE_KEY, []);
const normName = (name) =>
  String(name || "")
    .trim()
    .toLocaleLowerCase("es");
const clientNames = () =>
  [
    ...new Set(
      [...jobs.map((j) => j.cliente), ...clients.map((c) => c.nombre)].filter(
        Boolean,
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, "es"));
const phoneClean = (p) => String(p || "").replace(/[^+0-9]/g, "");
function clientsHtml() {
  const list = clientNames();
  return panel(
    "Clientes",
    '<p class="muted">Fichas locales: teléfono y dirección compartidos con el historial de trabajos de este dispositivo.</p>' +
      (!list.length
        ? '<div class="empty-state">Todavía no hay clientes. Crea un trabajo para empezar.</div>'
        : list
            .map((name) => {
              const c =
                  clients.find((x) => normName(x.nombre) === normName(name)) ||
                  {},
                items = jobs.filter(
                  (j) => normName(j.cliente) === normName(name),
                );
              const tel = phoneClean(c.telefono);
              return (
                '<article class="client-card"><div class="client-heading"><div><h3>' +
                esc(name) +
                '</h3><span class="muted">' +
                items.length +
                ' trabajo(s)</span></div><button type="button" data-client-edit="' +
                esc(name) +
                '">Editar ficha</button></div><p>' +
                esc(c.direccion || "Dirección no indicada") +
                '</p><div class="client-actions">' +
                (tel
                  ? '<a href="tel:' +
                    esc(tel) +
                    '">Llamar</a><a target="_blank" rel="noopener noreferrer" href="https://wa.me/' +
                    esc(tel.replace(/^\+/, "")) +
                    '">WhatsApp</a>'
                  : "") +
                (c.direccion
                  ? '<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=' +
                    encodeURIComponent(c.direccion) +
                    '">Mapa</a>'
                  : "") +
                "</div><details><summary>Historial de trabajos (" +
                items.length +
                ")</summary>" +
                jobCards(items) +
                "</details></article>"
              );
            })
            .join("")),
  );
}
function clientEditor(name) {
  const existing =
    clients.find((c) => normName(c.nombre) === normName(name)) || {};
  const dialog = document.querySelector("#client-editor");
  dialog.querySelector('[name="nombre"]').value = name;
  dialog.querySelector('[name="telefono"]').value = existing.telefono || "";
  dialog.querySelector('[name="direccion"]').value = existing.direccion || "";
  dialog.showModal();
}
function measurementArea(m) {
  const w = Number(m.ancho),
    h = Number(m.alto),
    qty = Number(m.cantidad);
  return Number.isFinite(w) &&
    Number.isFinite(h) &&
    Number.isFinite(qty) &&
    w > 0 &&
    h > 0 &&
    qty > 0
    ? (w * h * qty) / 10000
    : 0;
}
function measurementsHtml() {
  const total = measurements.reduce((n, m) => n + measurementArea(m), 0);
  return (
    '<section class="panel"><div class="measure-heading"><div><h2>Mediciones por pieza</h2><p class="muted">Medidas reales en centímetros. No se aplica aquí el redondeo de facturación.</p></div><button type="button" class="primary" id="measure-add">+ Añadir pieza</button></div><p><strong>' +
    measurements.length +
    " piezas · " +
    total.toFixed(4) +
    " m² reales</strong></p>" +
    (!measurements.length
      ? '<div class="empty-state">No hay mediciones. Añade la primera pieza.</div>'
      : '<div class="measure-list">' +
        measurements
          .map((m) => {
            const job = jobs.find((j) => j.id === m.trabajo);
            return (
              '<article class="measure-card"><div><strong>' +
              esc(job?.cliente || m.trabajo) +
              "</strong><p>" +
              esc(m.tipo) +
              " · " +
              esc(m.espesor || "Espesor sin indicar") +
              " mm · " +
              esc(m.cantidad) +
              " ud.</p><p>" +
              esc(m.ancho) +
              " × " +
              esc(m.alto) +
              " cm · <strong>" +
              measurementArea(m).toFixed(4) +
              ' m²</strong></p><p class="muted">' +
              esc(m.observaciones || "") +
              '</p></div><div><button type="button" data-measure-edit="' +
              esc(m.id) +
              '">Editar</button><button type="button" data-measure-delete="' +
              esc(m.id) +
              '">Eliminar</button></div></article>'
            );
          })
          .join("") +
        "</div>") +
    "</section>"
  );
}
function measurementEditor(id, jobId, draw = false) {
  const m = measurements.find((x) => x.id === id),
    dialog = document.querySelector("#measure-editor"),
    form = dialog.querySelector("form");
  form.reset();
  form.elements.id.value = m?.id || "";
  form.elements.trabajo.innerHTML = jobs
    .map(
      (j) =>
        '<option value="' +
        esc(j.id) +
        '">' +
        esc(j.id + " · " + j.cliente) +
        "</option>",
    )
    .join("");
  if (m)
    for (const k of [
      "trabajo",
      "ancho",
      "alto",
      "espesor",
      "tipo",
      "cantidad",
      "observaciones",
    ])
      form.elements[k].value = m[k] ?? "";
  else if (jobId) form.elements.trabajo.value = jobId;
  window.vidresSketch.mount(
    document.querySelector("#measure-sketch"),
    m?.croquis,
    m
      ? {
          onAccept: (croquis) => {
            const next = measurements.map((item) =>
              item.id === m.id ? { ...item, croquis } : item,
            );
            localStorage.setItem(MEASURE_KEY, JSON.stringify(next));
            measurements = next;
          },
        }
      : {},
  );
  dialog.showModal();
  if (draw) window.vidresSketch.open(document.querySelector("#measure-sketch"));
}
function panel(title, body) {
  return '<section class="panel"><h2>' + title + "</h2>" + body + "</section>";
}
function render() {
  if (usagePanel) {
    document.querySelector("main").appendChild(usagePanel);
    usagePanel.hidden = true;
  }
  const mainPage = [
    "consultor",
    "clientes",
    "calendario",
    "mediciones",
  ].includes(page)
    ? "herramientas"
    : page;
  document.querySelectorAll("#nav [data-page]").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === mainPage);
    if (b.dataset.page === mainPage) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const names = {
    inicio: "Inicio",
    trabajos:
      jobScope === "todos"
        ? "Todos los trabajos"
        : jobScope === "finalizados"
          ? "Trabajos finalizados"
          : "Trabajos activos",
    criticos: "Trabajos críticos",
    clientes: "Clientes",
    mediciones: "Mediciones",
    presupuestos: "Presupuestos",
    herramientas: "Herramientas",
    consultor: "Consultor de tarifas",
    ajustes: "Ajustes",
    produccion: "Producción",
    avisos: "Avisos",
    calendario: "Calendario",
  };
  $("#title").textContent = names[page];
  $("#title").classList.toggle("critical-heading", page === "criticos");
  let html = "";
  if (page === "inicio") {
    html = dashboardHtml();
  } else if (page === "trabajos") {
    const q = search.toLocaleLowerCase("es");
    const filtered = jobs.filter(
      (j) =>
        (jobScope === "todos" ||
          (jobScope === "finalizados" ? isClosed(j) : !isClosed(j))) &&
        (!filters.estado || j.estado === filters.estado) &&
        (!filters.responsable || j.responsable === filters.responsable) &&
        (!filters.tipoCliente ||
          (j.tipoCliente || "Particular") === filters.tipoCliente) &&
        [j.id, j.cliente, j.descripcion, j.direccion, j.responsable].some((v) =>
          String(v || "")
            .toLocaleLowerCase("es")
            .includes(q),
        ),
    );
    html = workFilters() + jobCards(filtered);
  } else if (page === "criticos") {
    const criticalJobs = jobs.filter((j) => j.estado === "Crítico");
    html =
      '<section class="panel critical-panel"><h2>Críticos</h2><p class="muted">Trabajos marcados manualmente como críticos desde el selector de estado.</p></section>' +
      (criticalJobs.length
        ? jobCards(criticalJobs)
        : '<div class="empty-state"><strong>No hay trabajos críticos</strong><p>Para incluir un trabajo aquí, selecciona Crítico en su estado y guarda los cambios.</p></div>');
  } else if (page === "clientes") {
    html = clientsHtml();
  } else if (page === "calendario") {
    html = calendarHtml();
  } else if (page === "mediciones") {
    html = measurementsHtml();
  } else if (page === "ajustes") {
    window.vidresToolsRender?.(page);
    const host = $("#content");
    if (host)
      host.insertAdjacentHTML(
        "beforeend",
        panel(
          "Copia de seguridad de trabajos",
          '<p class="muted">Exporta un JSON antes de cambiar de dispositivo o limpiar el navegador. Incluye trabajos, fichas de clientes y mediciones. No incluye presupuestos ni tarifas.</p><div class="backup-actions"><button type="button" id="backup-export">Descargar copia JSON</button><label>Importar copia JSON<input id="backup-import" type="file" accept=".json,application/json"></label></div>',
        ),
      );
    if (usagePanel) {
      host.appendChild(usagePanel);
      usagePanel.hidden = false;
    }
    return;
  } else if (page === "herramientas" || page === "consultor") {
    window.vidresToolsRender?.(page);
    return;
  } else if (page === "presupuestos") {
    window.vidresQuotePage = page;
    window.vidresQuoteJobs = () =>
      jobs.map((j) => ({ id: j.id, cliente: j.cliente }));
    window.vidresQuoteRender?.();
    return;
  } else {
    const filtered =
      page === "mediciones"
        ? jobs.filter((j) => j.estado === "En medición")
        : page === "produccion"
          ? jobs.filter((j) =>
              ["En producción", "Para instalar"].includes(j.estado),
            )
          : page === "avisos"
            ? jobs.filter((j) => j.estado === "Pendiente")
            : jobs;
    html = panel(
      names[page],
      table(
        page === "calendario"
          ? [...filtered].sort((a, b) =>
              (a.fecha || "9999").localeCompare(b.fecha || "9999"),
            )
          : filtered,
      ),
    );
  }
  $("#content").innerHTML = html;
  const advanced = $(".advanced-work-filters");
  if (advanced && Object.values(filters).some(Boolean)) advanced.open = true;
  const scope = $("#job-scope");
  if (scope)
    scope.addEventListener("change", () => {
      jobScope = scope.value;
      filters = { estado: "", responsable: "", tipoCliente: "" };
      render();
    });
  document.querySelectorAll("[data-filter]").forEach((el) =>
    el.addEventListener("change", () => {
      filters[el.dataset.filter] = el.value;
      render();
    }),
  );
  const input = $("#search");
  if (input)
    input.addEventListener("input", (e) => {
      search = e.target.value;
      render();
      $("#search").focus();
      $("#search").setSelectionRange(search.length, search.length);
    });
}
window.vidresNavigate = (p) => {
  page = p;
  search = "";
  render();
};
document
  .querySelectorAll("[data-page]")
  .forEach((b) =>
    b.addEventListener("click", () => window.vidresNavigate(b.dataset.page)),
  );
function downloadBackup() {
  const payload = {
    format: "vidres-sosa-backup",
    version: 1,
    exportado: new Date().toISOString(),
    trabajos: jobs,
    clientes: clients,
    mediciones: measurements,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "vidres-sosa-copia-" + localToday() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function importBackup(file) {
  if (!file || file.size > 5_000_000) {
    alert("Selecciona una copia JSON de menos de 5 MB.");
    return;
  }
  file
    .text()
    .then((text) => {
      const data = JSON.parse(text);
      if (
        data.format !== "vidres-sosa-backup" ||
        !Array.isArray(data.trabajos) ||
        data.trabajos.some(
          (j) =>
            !j ||
            typeof j.id !== "string" ||
            typeof j.cliente !== "string" ||
            typeof j.descripcion !== "string",
        )
      )
        throw Error(
          "El archivo no es una copia válida de trabajos de Vidres Sosa.",
        );
      if (
        !confirm(
          "Se sustituirán los trabajos guardados en este dispositivo por " +
            data.trabajos.length +
            " trabajos de la copia. También se restaurarán clientes y mediciones cuando estén presentes. ¿Continuar?",
        )
      )
        return;
      localStorage.setItem(KEY, JSON.stringify(data.trabajos));
      if (Array.isArray(data.clientes))
        localStorage.setItem(CLIENT_KEY, JSON.stringify(data.clientes));
      if (Array.isArray(data.mediciones))
        localStorage.setItem(MEASURE_KEY, JSON.stringify(data.mediciones));
      jobs = data.trabajos;
      if (Array.isArray(data.clientes)) clients = data.clientes;
      if (Array.isArray(data.mediciones)) measurements = data.mediciones;
      render();
      alert("Copia restaurada correctamente.");
    })
    .catch((err) => alert("No se pudo importar la copia: " + err.message));
}
const dlg = $("#editor"),
  form = $("#form");
function open(id) {
  editing = id;
  form.reset();
  form.querySelectorAll("details").forEach((el) => (el.open = false));
  window.vidresNewMeasures.reset(id);
  for (const [selector, field] of [
    ["#known-clients", "cliente"],
    ["#known-workers", "responsable"],
  ]) {
    const list = $(selector);
    if (list)
      list.innerHTML = [...new Set(jobs.map((j) => j[field]).filter(Boolean))]
        .map((v) => '<option value="' + esc(v) + '"></option>')
        .join("");
  }
  $("#formtitle").textContent = id ? "Editar trabajo" : "Nuevo parte";
  if (id) {
    const job = jobs.find((j) => j.id === id);
    if (!job) return;
    for (const key of [
      "cliente",
      "descripcion",
      "direccion",
      "responsable",
      "fecha",
      "estado",
      "notas",
    ])
      form.elements[key].value = job[key] || "";
    form.elements["tipoCliente"].value = job.tipoCliente || "Particular";
  }
  dlg.showModal();
}
window.vidresOpenJobEditor = open;
window.vidresGetJobs = () => jobs;
window.vidresGetMeasurements = () => measurements;
window.vidresOpenMeasurement = measurementEditor;
$("#add").addEventListener("click", () => open(null));
$("#cancel").addEventListener("click", () => dlg.close());
$("#content").addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) {
    if (go.dataset.go === "trabajos") {
      jobScope = "activos";
      filters = { estado: "", responsable: "", tipoCliente: "" };
    }
    window.vidresNavigate(go.dataset.go);
    return;
  }
  if (page === "herramientas" || page === "consultor" || page === "ajustes") {
    if (e.target.closest("#backup-export")) {
      downloadBackup();
      return;
    }
    window.vidresToolsClick?.(e, (p) => {
      page = p;
      render();
    });
    return;
  }
  if (page === "presupuestos") {
    window.vidresQuoteClick?.(e);
    return;
  }
  const ce = e.target.closest("[data-client-edit]");
  if (ce) {
    clientEditor(ce.dataset.clientEdit);
    return;
  }
  if (e.target.closest("#measure-add")) {
    if (!jobs.length) {
      alert("Crea primero un trabajo.");
      return;
    }
    measurementEditor(null);
    return;
  }
  const me = e.target.closest("[data-measure-edit]");
  if (me) {
    measurementEditor(me.dataset.measureEdit);
    return;
  }
  const md = e.target.closest("[data-measure-delete]");
  if (md) {
    if (confirm("¿Eliminar esta medición?")) {
      measurements = measurements.filter(
        (x) => x.id !== md.dataset.measureDelete,
      );
      localStorage.setItem(MEASURE_KEY, JSON.stringify(measurements));
      render();
    }
    return;
  }
  const v = e.target.closest("[data-home-view]");
  if (v) {
    homeView = v.dataset.homeView;
    try {
      localStorage.setItem("vidres-home-view", homeView);
    } catch {}
    render();
    return;
  }
  const month = e.target.closest("[data-month]");
  if (month) {
    const delta = Number(month.dataset.month);
    shownMonth =
      delta === 0
        ? new Date()
        : new Date(shownMonth.getFullYear(), shownMonth.getMonth() + delta, 1);
    render();
    return;
  }
  const b = e.target.closest("[data-id]");
  if (b) open(b.dataset.id);
});
$("#content").addEventListener("change", (e) => {
  if (page === "ajustes" && e.target.id === "backup-import") {
    importBackup(e.target.files?.[0]);
    return;
  }
  if (page === "herramientas" || page === "consultor" || page === "ajustes")
    window.vidresToolsChange?.(e);
  else if (page === "presupuestos") window.vidresQuoteChange?.(e);
});
$("#content").addEventListener("input", (e) => {
  if (page === "consultor") window.vidresToolsInput?.(e);
});
document.querySelector("#client-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = new FormData(e.target),
    nombre = String(data.get("nombre") || "").trim();
  if (!nombre) return;
  const item = {
    nombre,
    telefono: String(data.get("telefono") || "").trim(),
    direccion: String(data.get("direccion") || "").trim(),
  };
  const i = clients.findIndex((c) => normName(c.nombre) === normName(nombre));
  if (i < 0) clients.push(item);
  else clients[i] = item;
  try {
    localStorage.setItem(CLIENT_KEY, JSON.stringify(clients));
  } catch {
    alert("No se pudo guardar la ficha. Revisa el espacio disponible.");
    return;
  }
  document.querySelector("#client-editor").close();
  render();
});
document
  .querySelector("#measure-draw")
  .addEventListener("click", () =>
    window.vidresSketch.open(document.querySelector("#measure-sketch")),
  );
document.querySelector("#measure-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!e.target.reportValidity()) return;
  const data = new FormData(e.target),
    m = Object.fromEntries(
      [
        "id",
        "trabajo",
        "ancho",
        "alto",
        "espesor",
        "tipo",
        "cantidad",
        "observaciones",
      ].map((k) => [k, String(data.get(k) || "").trim()]),
    );
  if (
    !jobs.some((j) => j.id === m.trabajo) ||
    !Number.isFinite(Number(m.ancho)) ||
    Number(m.ancho) <= 0 ||
    !Number.isFinite(Number(m.alto)) ||
    Number(m.alto) <= 0 ||
    !Number.isInteger(Number(m.cantidad)) ||
    Number(m.cantidad) <= 0
  ) {
    alert("Revisa trabajo, ancho, alto y cantidad.");
    return;
  }
  m.croquis = window.vidresSketch.read(
    document.querySelector("#measure-sketch"),
  );
  if (!m.id) m.id = "M-" + crypto.randomUUID();
  const next = [...measurements],
    i = next.findIndex((x) => x.id === m.id);
  if (i < 0) next.push(m);
  else next[i] = { ...next[i], ...m };
  try {
    localStorage.setItem(MEASURE_KEY, JSON.stringify(next));
  } catch {
    alert(
      "No se pudo guardar la medición y su croquis. Conserva el formulario e inténtalo de nuevo.",
    );
    return;
  }
  measurements = next;
  document.querySelector("#measure-editor").close();
  render();
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form),
    values = Object.fromEntries(
      [
        "cliente",
        "descripcion",
        "direccion",
        "responsable",
        "fecha",
        "estado",
        "notas",
        "tipoCliente",
      ].map((k) => [k, String(data.get(k) || "").trim()]),
    );
  if (!values.cliente || !values.descripcion) return;
  let nextJobs = [...jobs],
    nextMeasurements = measurements;
  if (editing) {
    const i = jobs.findIndex((j) => j.id === editing);
    if (i < 0) return;
    const old = jobs[i],
      history = Array.isArray(old.historial) ? [...old.historial] : [];
    if (old.estado !== values.estado)
      history.push({
        de: old.estado,
        a: values.estado,
        fecha: new Date().toISOString(),
        responsable: values.responsable || "Sin indicar",
      });
    nextJobs[i] = { ...old, ...values, historial: history };
  } else {
    const max = jobs.reduce(
      (n, j) => Math.max(n, Number(j.id.replace("VS-", "")) || 0),
      0,
    );
    const id = "VS-" + String(max + 1).padStart(4, "0");
    const added = window.vidresNewMeasures.read(id);
    nextJobs.push({
      id,
      ...values,
      historial: [
        {
          de: "",
          a: values.estado,
          fecha: new Date().toISOString(),
          responsable: values.responsable || "Sin indicar",
        },
      ],
    });
    if (added.length) nextMeasurements = [...measurements, ...added];
  }
  // Conservar el formulario y el estado anterior si falla el guardado conjunto.
  let previousJobs,
    previousMeasurements,
    wroteJobs = false,
    wroteMeasurements = false;
  try {
    previousJobs = localStorage.getItem(KEY);
    previousMeasurements = localStorage.getItem(MEASURE_KEY);
    localStorage.setItem(KEY, JSON.stringify(nextJobs));
    wroteJobs = true;
    if (nextMeasurements !== measurements) {
      localStorage.setItem(MEASURE_KEY, JSON.stringify(nextMeasurements));
      wroteMeasurements = true;
    }
  } catch {
    try {
      if (wroteMeasurements) {
        if (previousMeasurements === null) localStorage.removeItem(MEASURE_KEY);
        else localStorage.setItem(MEASURE_KEY, previousMeasurements);
      }
      if (wroteJobs) {
        if (previousJobs === null) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, previousJobs);
      }
    } catch {
      alert(
        "No se pudo completar ni revertir el guardado. Conserva esta ventana y revisa el almacenamiento antes de continuar.",
      );
      return;
    }
    alert(
      "No se pudo guardar el parte y sus medidas. Los datos siguen en el formulario; revisa el espacio disponible e inténtalo de nuevo.",
    );
    return;
  }
  jobs = nextJobs;
  measurements = nextMeasurements;
  dlg.close();
  render();
});
render();
