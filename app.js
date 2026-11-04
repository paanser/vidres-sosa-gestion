"use strict";
window.vidresAppReady = (async () => {
  await VSStorage.ready;
  await VSBackup.recover();
  const { esc, num, money, round6 } = VSUtils;

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
    const v = JSON.parse(VSStorage.local.getItem(KEY));
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
      VSStorage.local.getItem("vidres-home-view") === "calendar"
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
              esc(
                (j.hora ? j.hora + " · " : "") +
                  j.cliente +
                  (j.duracion ? " (" + j.duracion + " min)" : ""),
              ) +
              " · " +
              esc(j.descripcion) +
              "</button>",
          )
          .join("") +
        "</div>";
    }
    return (
      '<section class="panel cal-panel"><div class="cal-toolbar"><h2>' +
      shownMonth.toLocaleDateString("es-ES", {
        month: "long",
        year: "numeric",
      }) +
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
  function save() {
    VSStorage.local.setItem(KEY, JSON.stringify(jobs));
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
  let jobScope = "activos",
    jobFocus = "",
    jobSort = { key: "fecha", dir: 1 };
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
            '</p><div class="job-meta"><span>' +
            VSIcons.icon("calendario", 16) +
            " " +
            esc(j.fecha || "Sin fecha") +
            "</span><span>" +
            VSIcons.icon("cliente", 16) +
            " " +
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
      options(
        [...new Set(jobs.map((j) => j.responsable))],
        filters.responsable,
      ) +
      '</select></label><label>Tipo de cliente<select data-filter="tipoCliente">' +
      options(
        ["Particular", "Vitralia", "Mapfre", "Otros"],
        filters.tipoCliente,
      ) +
      "</select></label></div></details>"
    );
  }
  function filterJobs() {
    const q = /^[+\d\s()-]+$/.test(search)
      ? search.replace(/\D/g, "")
      : search.toLocaleLowerCase("es");
    return jobs.filter(
      (j) =>
        (jobFocus !== "late" || (j.fecha && j.fecha < localToday())) &&
        (jobFocus !== "today" || j.fecha === localToday()) &&
        (jobFocus !== "undated" || !j.fecha) &&
        (jobScope === "todos" ||
          (jobScope === "finalizados" ? isClosed(j) : !isClosed(j))) &&
        (!filters.estado || j.estado === filters.estado) &&
        (!filters.responsable || j.responsable === filters.responsable) &&
        (!filters.tipoCliente ||
          (j.tipoCliente || "Particular") === filters.tipoCliente) &&
        [
          j.id,
          j.cliente,
          j.descripcion,
          j.direccion,
          j.responsable,
          j.notas,
          clients.find((c) => normName(c.nombre) === normName(j.cliente))
            ?.telefono,
          String(
            clients.find((c) => normName(c.nombre) === normName(j.cliente))
              ?.telefono || "",
          ).replace(/\D/g, ""),
        ].some((v) =>
          String(v || "")
            .toLocaleLowerCase("es")
            .includes(q),
        ),
    );
  }
  function sortedJobs() {
    const items = filterJobs();
    const { key, dir } = jobSort;
    return items.slice().sort((a, b) => {
      const av = a[key] || "",
        bv = b[key] || "";
      if (key === "fecha")
        return (av || "9999").localeCompare(bv || "9999") * dir;
      return String(av).localeCompare(String(bv), "es") * dir;
    });
  }
  function jobTable(items) {
    const arrow = (k) =>
      jobSort.key === k
        ? jobSort.dir === 1
          ? ' class="asc"'
          : ' class="desc"'
        : "";
    return (
      '<div class="job-table-wrap desktop-only"><table class="sortable"><thead><tr>' +
      '<th data-sort="id"' +
      arrow("id") +
      ">Referencia</th>" +
      '<th data-sort="cliente"' +
      arrow("cliente") +
      ">Cliente</th>" +
      '<th data-sort="descripcion"' +
      arrow("descripcion") +
      ">Trabajo</th>" +
      '<th data-sort="estado"' +
      arrow("estado") +
      ">Estado</th>" +
      '<th data-sort="fecha"' +
      arrow("fecha") +
      ">Fecha</th>" +
      "<th></th></tr></thead><tbody>" +
      (items.length
        ? items
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
                '</td><td><button type="button" class="edit" data-id="' +
                esc(j.id) +
                '">Abrir</button></td></tr>',
            )
            .join("")
        : '<tr><td colspan="6" class="muted">No hay trabajos.</td></tr>') +
      "</tbody></table></div>"
    );
  }
  function jobResultsHtml() {
    const items = sortedJobs();
    return (
      jobTable(items) + '<div class="mobile-only">' + jobCards(items) + "</div>"
    );
  }
  function renderJobResults() {
    const host = $("#job-results");
    if (host) host.innerHTML = jobResultsHtml();
  }
  function dashboardHtml() {
    const today = localToday(),
      active = jobs.filter((j) => !isClosed(j)),
      due = active.filter((j) => j.fecha === today),
      critical = active.filter((j) => j.estado === "Crítico"),
      pendingNotes = notes.filter((n) => !n.hecha),
      followups = window.vidresQuoteFollowUps?.() || [];
    const counts = [
      ["Trabajos activos", active.length, 'data-job-focus=""'],
      ["Para hoy", due.length, 'data-job-focus="today"'],
      ["Críticos", critical.length, 'data-go="criticos"'],
      [
        "Atrasados",
        active.filter((j) => j.fecha && j.fecha < today).length,
        'data-job-focus="late"',
      ],
      [
        "Sin fecha",
        active.filter((j) => !j.fecha).length,
        'data-job-focus="undated"',
      ],
      ["Pendientes", pendingNotes.length],
      ["Por reclamar", followups.length],
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
          ([label, n, action]) =>
            "<" +
            (action ? 'button type="button" ' + action : "div") +
            ' class="stat ' +
            (label === "Críticos" ? "critical-stat" : "") +
            '"><small>' +
            label +
            "</small><b>" +
            n +
            "</b></" +
            (action ? "button" : "div") +
            ">",
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
      "</section>" +
      pendingNotesHtml(pendingNotes, today) +
      followupsHtml(followups)
    );
  }

  // Fichas locales de clientes y mediciones por pieza; se conserva la estructura de trabajos existente.
  const CLIENT_KEY = "vidres-clientes-v1",
    NOTE_KEY = "vidres-notas-v1",
    MEASURE_KEY = "vidres-mediciones-v1";
  const safeRead = (key, fallback) => {
    try {
      const v = JSON.parse(VSStorage.local.getItem(key));
      return Array.isArray(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  let clients = safeRead(CLIENT_KEY, []),
    notes = safeRead(NOTE_KEY, []),
    measurements = VSStorage.measurements.get();
  function saveNotes(next = notes) {
    VSStorage.write(NOTE_KEY, next);
    notes = next;
  }
  function pendingNotesHtml(items, today) {
    const ordered = [...items].sort(
      (a, b) =>
        Boolean(b.aviso && b.aviso < today) -
          Boolean(a.aviso && a.aviso < today) ||
        (a.aviso || "9999").localeCompare(b.aviso || "9999") ||
        a.creada.localeCompare(b.creada),
    );
    return (
      '<section class="panel quick-notes"><div class="simple-section-head"><h2>Pendientes</h2><button type="button" data-note-new>+ Nota rápida</button></div>' +
      (ordered.length
        ? '<div class="quick-note-list">' +
          ordered
            .map(
              (n) =>
                '<article class="quick-note ' +
                (n.aviso && n.aviso < today ? "overdue" : "") +
                '"><label class="quick-note-check"><input type="checkbox" data-note-done="' +
                esc(n.id) +
                '"><span><strong>' +
                esc(n.texto) +
                "</strong>" +
                (n.cliente
                  ? "<small>Cliente: " + esc(n.cliente) + "</small>"
                  : "") +
                (n.aviso ? "<small>Aviso: " + esc(n.aviso) + "</small>" : "") +
                '</span></label><div class="quick-note-actions"><button type="button" data-note-convert="' +
                esc(n.id) +
                '">Convertir en parte</button><button type="button" data-note-edit="' +
                esc(n.id) +
                '">Editar</button><button type="button" data-note-delete="' +
                esc(n.id) +
                '">Eliminar</button></div></article>',
            )
            .join("") +
          "</div>"
        : '<p class="muted">No hay notas pendientes.</p>') +
      "</section>"
    );
  }
  function followupsHtml(items) {
    return (
      '<section class="panel quote-followups"><h2>Presupuestos por reclamar</h2>' +
      (items.length
        ? '<div class="followup-list">' +
          items
            .map(
              (quote) =>
                '<article class="followup-item"><div><strong>' +
                esc(quote.client || "Sin cliente") +
                " · " +
                esc(quote.id) +
                "</strong><span>" +
                money(quote.total) +
                " · enviado hace " +
                quote.days +
                ' día(s)</span></div><div><button type="button" data-followup-whatsapp="' +
                esc(quote.id) +
                '">Escribir por WhatsApp</button><button type="button" data-followup-status="Aceptado" data-quote-id="' +
                esc(quote.id) +
                '">Marcar aceptado</button><button type="button" data-followup-status="Rechazado" data-quote-id="' +
                esc(quote.id) +
                '">Marcar rechazado</button><button type="button" data-followup-postpone="' +
                esc(quote.id) +
                '">Posponer 3 días</button></div></article>',
            )
            .join("") +
          "</div>"
        : '<p class="muted">No hay presupuestos pendientes de respuesta.</p>') +
      "</section>"
    );
  }
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
                    clients.find(
                      (x) => normName(x.nombre) === normName(name),
                    ) || {},
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
      {
        ...(m
          ? {
              onAccept: async (croquis) => {
                const next = measurements.map((item) =>
                  item.id === m.id ? { ...item, croquis } : item,
                );
                await VSStorage.measurements.replace(next);
                measurements = next;
              },
            }
          : {}),
        onUseDims: async ({ ancho, alto }) => {
          const measureForm = document.querySelector("#measure-form");
          const setMeasure = async (name, value) => {
            if (value == null) return;
            const input = measureForm.elements[name];
            if (!input) return;
            if (input.value.trim() !== "") {
              const ok = await VSUI.confirm({
                titulo: "Sustituir medida",
                texto:
                  "El campo " +
                  name +
                  " ya tiene " +
                  input.value +
                  ". ¿Sustituirlo por " +
                  value +
                  "?",
                aceptar: "Sustituir",
                cancelar: "Cancelar",
              });
              if (!ok) return;
            }
            input.value = value;
          };
          await setMeasure("ancho", ancho);
          await setMeasure("alto", alto);
        },
      },
    );
    dialog.showModal();
    if (draw)
      window.vidresSketch.open(document.querySelector("#measure-sketch"));
  }
  function panel(title, body) {
    return (
      '<section class="panel"><h2>' + title + "</h2>" + body + "</section>"
    );
  }
  // Fundido corto al cambiar de pantalla (respetando menos movimiento).
  function fadeIn() {
    const host = $("#content");
    if (!host || typeof host.animate !== "function") return;
    if (
      window.matchMedia &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    host.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 150,
      easing: "ease",
    });
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
      html =
        (VSBackup.overdue()
          ? '<p role="status" class="backup-reminder">Hace más de 14 días que no exportas una copia. <button type="button" data-go="ajustes">Hacer copia</button></p>'
          : "") + dashboardHtml();
    } else if (page === "trabajos") {
      html =
        (jobFocus
          ? '<button type="button" data-clear-focus>Quitar filtro: ' +
            { late: "Atrasados", today: "Para hoy", undated: "Sin fecha" }[
              jobFocus
            ] +
            "</button>"
          : "") +
        workFilters() +
        '<div id="job-results">' +
        jobResultsHtml() +
        "</div>";
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
            '<p class="muted">Exporta un JSON antes de cambiar de dispositivo o limpiar el navegador. Incluye trabajos, clientes, mediciones con croquis, presupuestos, tarifas y configuración. La copia con archivos incluye además fotos y documentos.</p><div class="backup-actions"><button type="button" id="backup-export">Descargar datos JSON</button><button type="button" id="backup-export-full">Copia completa con fotos y documentos</button><label>Importar copia JSON<input id="backup-import" type="file" accept=".json,application/json"></label></div>',
          ),
        );
      host.insertAdjacentHTML(
        "beforeend",
        "<p>Última copia exportada: " +
          esc(
            VSBackup.last()
              ? new Date(VSBackup.last()).toLocaleString("es-ES")
              : "Ninguna",
          ) +
          "</p>",
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
    fadeIn();
    const advanced = $(".advanced-work-filters");
    if (advanced && Object.values(filters).some(Boolean)) advanced.open = true;
    const scope = $("#job-scope");
    if (scope)
      scope.addEventListener("change", () => {
        jobScope = scope.value;
        jobFocus = "";
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
        renderJobResults();
      });
  }
  window.vidresNavigate = (p) => {
    page = p;
    search = "";
    render();
  };
  document.querySelectorAll("[data-page]").forEach((b) =>
    b.addEventListener("click", () => {
      jobFocus = "";
      window.vidresNavigate(b.dataset.page);
    }),
  );
  async function downloadBackup() {
    try {
      await VSBackup.exportData(false);
    } catch (e) {
      VSUI.toast(e.message, "error");
    }
  }
  function importBackup(file) {
    VSBackup.importFile(file).catch((e) =>
      VSUI.toast("No se pudo importar: " + e.message, "error"),
    );
  }
  const dlg = $("#editor"),
    form = $("#form");
  let pendingMeasurePhotos = [],
    pendingPhotoUrls = [];
  function clearPendingPhotoUrls() {
    pendingPhotoUrls.forEach((url) => URL.revokeObjectURL(url));
    pendingPhotoUrls = [];
  }
  function renderPendingMeasurePhotos() {
    clearPendingPhotoUrls();
    const host = $("#job-measure-photo-list");
    host.innerHTML = pendingMeasurePhotos
      .map((photo, index) => {
        const url = URL.createObjectURL(photo.blob);
        pendingPhotoUrls.push(url);
        return (
          '<figure><img src="' +
          url +
          '" alt="' +
          esc(photo.nombre) +
          '"><figcaption>' +
          esc(photo.nombre) +
          '</figcaption><button type="button" data-pending-photo-delete="' +
          index +
          '">Quitar</button></figure>'
        );
      })
      .join("");
  }
  let convertingNote = "";
  function open(id, prefill = {}) {
    editing = id;
    convertingNote = id ? "" : prefill.noteId || "";
    form.reset();
    form.querySelectorAll("details").forEach((el) => (el.open = false));
    window.vidresNewMeasures.reset(id);
    const tplWrap = $("#template-start"),
      tplSelect = $("#start-template");
    if (tplWrap && tplSelect) {
      tplWrap.hidden = Boolean(id);
      tplSelect.innerHTML =
        '<option value="">Sin plantilla</option>' +
        (window.vidresPlantillasList?.() || [])
          .map(
            (t) =>
              '<option value="' +
              esc(t.id) +
              '">' +
              esc(t.nombre) +
              "</option>",
          )
          .join("");
      tplSelect.value = "";
    }
    pendingMeasurePhotos = [];
    renderPendingMeasurePhotos();
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
        "hora",
        "duracion",
        "estado",
        "notas",
      ])
        form.elements[key].value = job[key] || "";
      form.elements["tipoCliente"].value = job.tipoCliente || "Particular";
    } else {
      form.elements.cliente.value = prefill.cliente || "";
      form.elements.descripcion.value = prefill.descripcion || "";
    }
    dlg.showModal();
  }
  async function applyTemplate(id) {
    const select = $("#start-template");
    if (!id) return;
    const t = (window.vidresPlantillasList?.() || []).find((x) => x.id === id);
    if (!t) return;
    const hasInfo =
      form.elements.descripcion.value.trim() !== "" ||
      form.elements.notas.value.trim() !== "" ||
      (form.elements.tipoCliente.value || "Particular") !== "Particular" ||
      document.querySelectorAll(".new-measure-piece").length > 0;
    if (hasInfo) {
      const ok = await VSUI.confirm({
        titulo: "Aplicar plantilla",
        texto:
          "Ya hay información escrita. ¿Sustituirla por la plantilla «" +
          t.nombre +
          "»?",
        aceptar: "Sustituir",
        cancelar: "Cancelar",
      });
      if (!ok) {
        select.value = "";
        return;
      }
    }
    form.elements.descripcion.value = t.descripcion || "";
    form.elements.tipoCliente.value = t.tipoCliente || "Particular";
    form.elements.notas.value = t.notas || "";
    window.vidresNewMeasures.applyTemplatePieces?.(t.piezas || []);
    select.value = "";
  }
  $("#start-template")?.addEventListener("change", (e) =>
    applyTemplate(e.target.value),
  );
  window.vidresOpenJobEditor = open;
  window.vidresChangeJobStatus = (id, status) => {
    const next = jobs.map((j) =>
      j.id === id
        ? {
            ...j,
            estado: status,
            historial: [
              ...(j.historial || []),
              {
                de: j.estado,
                a: status,
                fecha: new Date().toISOString(),
                responsable: j.responsable || "Sin indicar",
              },
            ],
          }
        : j,
    );
    VSStorage.write(KEY, next);
    jobs = next;
  };
  window.vidresDeleteJob = async (id) => {
    const confirmado = await VSUI.prompt({
      titulo: "Eliminar trabajo",
      texto:
        "Para eliminar el trabajo y sus medidas, fotos y documentos, escribe " +
        id,
      aceptar: "Eliminar",
      cancelar: "Cancelar",
      peligro: true,
    });
    if (confirmado !== id) return false;
    try {
      const after = await VSBackup.snapshot();
      after.trabajos = after.trabajos.filter((j) => j.id !== id);
      after.mediciones = after.mediciones.filter((m) => m.trabajo !== id);
      after.photos = after.photos.filter((x) => x.trabajo !== id);
      after.documents = after.documents.filter((x) => x.trabajo !== id);
      after.presupuestos = after.presupuestos.map((q) =>
        q.job === id ? { ...q, job: "" } : q,
      );
      await VSBackup.transaction(after);
      jobs = after.trabajos;
      measurements = after.mediciones;
      render();
      return true;
    } catch (e) {
      VSUI.toast("No se pudo eliminar el trabajo: " + e.message, "error");
      return false;
    }
  };
  window.vidresRefresh = render;
  window.vidresReloadData = () => {
    jobs = VSStorage.read(KEY, []);
    clients = VSStorage.read(CLIENT_KEY, []);
    notes = VSStorage.read(NOTE_KEY, []);
    measurements = VSStorage.measurements.get();
    window.dispatchEvent(new Event("vidres-data-restored"));
    render();
  };
  window.vidresGetJobs = () => jobs;
  window.vidresGetMeasurements = () => measurements;
  window.vidresOpenMeasurement = measurementEditor;
  $("#add").addEventListener("click", () => open(null));
  $("#cancel").addEventListener("click", () => dlg.close());
  form.addEventListener("change", async (e) => {
    if (!e.target.classList.contains("job-measure-photo")) return;
    const files = [...e.target.files];
    if (files.length > 12) {
      VSUI.toast("Añade un máximo de 12 fotos por operación.", "warn");
      e.target.value = "";
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > 20_000_000) {
        VSUI.toast("Archivo no admitido: " + file.name, "warn");
        continue;
      }
      try {
        const record = {
          id: crypto.randomUUID(),
          trabajo: editing || "",
          tipo: "medidas",
          nota: "",
          nombre: file.name.slice(0, 100),
          blob: await VSFiles.compressImage(file),
          fecha: new Date().toISOString(),
        };
        if (editing) await VSFiles.put("photos", record);
        else pendingMeasurePhotos.push(record);
      } catch (error) {
        VSUI.toast(
          "No se pudo preparar " + file.name + ": " + error.message,
          "error",
        );
      }
    }
    e.target.value = "";
    renderPendingMeasurePhotos();
  });
  form.addEventListener("click", (e) => {
    const button = e.target.closest("[data-pending-photo-delete]");
    if (!button) return;
    pendingMeasurePhotos.splice(Number(button.dataset.pendingPhotoDelete), 1);
    renderPendingMeasurePhotos();
  });
  $("#content").addEventListener("click", async (e) => {
    const sortTh = e.target.closest("th[data-sort]");
    if (sortTh) {
      const key = sortTh.dataset.sort;
      if (jobSort.key === key) jobSort.dir = -jobSort.dir;
      else jobSort = { key, dir: 1 };
      renderJobResults();
      return;
    }
    const followupWhatsApp = e.target.closest("[data-followup-whatsapp]");
    if (followupWhatsApp) {
      window.vidresQuoteFollowupWhatsApp?.(
        followupWhatsApp.dataset.followupWhatsapp,
      );
      return;
    }
    const followupStatus = e.target.closest("[data-followup-status]");
    if (followupStatus) {
      window.vidresQuoteUpdateStatus?.(
        followupStatus.dataset.quoteId,
        followupStatus.dataset.followupStatus,
      );
      render();
      return;
    }
    const postpone = e.target.closest("[data-followup-postpone]");
    if (postpone) {
      window.vidresQuotePostpone?.(postpone.dataset.followupPostpone, 3);
      render();
      return;
    }
    if (e.target.closest("[data-note-new]")) {
      openQuickNote();
      return;
    }
    const noteDone = e.target.closest("[data-note-done]");
    if (noteDone) {
      saveNotes(
        notes.map((n) =>
          n.id === noteDone.dataset.noteDone ? { ...n, hecha: true } : n,
        ),
      );
      render();
      return;
    }
    const noteEdit = e.target.closest("[data-note-edit]");
    if (noteEdit) {
      openQuickNote(noteEdit.dataset.noteEdit);
      return;
    }
    const noteDelete = e.target.closest("[data-note-delete]");
    if (noteDelete) {
      if (
        await VSUI.confirm({
          titulo: "Eliminar nota",
          texto: "¿Eliminar esta nota rápida?",
          aceptar: "Eliminar",
          cancelar: "Cancelar",
          peligro: true,
        })
      ) {
        saveNotes(notes.filter((n) => n.id !== noteDelete.dataset.noteDelete));
        render();
      }
      return;
    }
    const noteConvert = e.target.closest("[data-note-convert]");
    if (noteConvert) {
      const note = notes.find((n) => n.id === noteConvert.dataset.noteConvert);
      if (note)
        open(null, {
          cliente: note.cliente,
          descripcion: note.texto,
          noteId: note.id,
        });
      return;
    }
    if (e.target.closest("#backup-export-full")) {
      try {
        await VSBackup.exportData(true);
      } catch (error) {
        VSUI.toast(error.message, "error");
      }
      return;
    }
    const focus = e.target.closest("[data-job-focus]");
    if (focus) {
      jobScope = "activos";
      jobFocus = focus.dataset.jobFocus;
      filters = { estado: "", responsable: "", tipoCliente: "" };
      window.vidresNavigate("trabajos");
      return;
    }
    if (e.target.closest("[data-clear-focus]")) {
      jobFocus = "";
      render();
      return;
    }
    const go = e.target.closest("[data-go]");
    if (go) {
      if (go.dataset.go === "trabajos") {
        jobScope = "activos";
        jobFocus = "";
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
        VSUI.toast("Crea primero un trabajo.", "warn");
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
      if (
        await VSUI.confirm({
          titulo: "Eliminar medición",
          texto: "¿Eliminar esta medición?",
          aceptar: "Eliminar",
          cancelar: "Cancelar",
          peligro: true,
        })
      ) {
        measurements = measurements.filter(
          (x) => x.id !== md.dataset.measureDelete,
        );
        await VSStorage.measurements.replace(measurements);
        render();
      }
      return;
    }
    const v = e.target.closest("[data-home-view]");
    if (v) {
      homeView = v.dataset.homeView;
      try {
        VSStorage.local.setItem("vidres-home-view", homeView);
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
          : new Date(
              shownMonth.getFullYear(),
              shownMonth.getMonth() + delta,
              1,
            );
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
    else if (page === "presupuestos") window.vidresQuoteInput?.(e);
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
      VSStorage.local.setItem(CLIENT_KEY, JSON.stringify(clients));
    } catch {
      VSUI.toast(
        "No se pudo guardar la ficha. Revisa el espacio disponible.",
        "error",
      );
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
  document
    .querySelector("#measure-form")
    .addEventListener("submit", async (e) => {
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
        VSUI.toast("Revisa trabajo, ancho, alto y cantidad.", "warn");
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
        await VSStorage.measurements.replace(next);
      } catch {
        VSUI.toast(
          "No se pudo guardar la medición y su croquis. Conserva el formulario e inténtalo de nuevo.",
          "error",
        );
        return;
      }
      measurements = next;
      document.querySelector("#measure-editor").close();
      render();
    });
  form.addEventListener("submit", async (e) => {
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
          "hora",
          "duracion",
          "estado",
          "notas",
          "tipoCliente",
        ].map((k) => [k, String(data.get(k) || "").trim()]),
      );
    if (!values.cliente) return;
    if (
      values.duracion &&
      (!Number.isInteger(Number(values.duracion)) ||
        Number(values.duracion) < 1 ||
        Number(values.duracion) > 1440)
    ) {
      VSUI.toast("Revisa la duración: de 1 a 1440 minutos", "warn");
      return;
    }
    let nextJobs = [...jobs],
      nextMeasurements = measurements;
    let createdJobId = "";
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
      createdJobId = id;
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
      wroteMeasurements = false,
      writtenPhotoIds = [];
    try {
      previousJobs = VSStorage.local.getItem(KEY);
      previousMeasurements = measurements;
      VSStorage.local.setItem(KEY, JSON.stringify(nextJobs));
      wroteJobs = true;
      if (nextMeasurements !== measurements) {
        await VSStorage.measurements.replace(nextMeasurements);
        wroteMeasurements = true;
      }
      if (createdJobId && pendingMeasurePhotos.length) {
        for (const photo of pendingMeasurePhotos) {
          const record = { ...photo, trabajo: createdJobId };
          await VSFiles.put("photos", record);
          writtenPhotoIds.push(record.id);
        }
      }
      if (createdJobId && convertingNote) {
        saveNotes(
          notes.map((n) =>
            n.id === convertingNote
              ? { ...n, hecha: true, parte: createdJobId }
              : n,
          ),
        );
      }
    } catch {
      try {
        for (const id of writtenPhotoIds) await VSFiles.remove("photos", id);
        if (wroteMeasurements) {
          await VSStorage.measurements.replace(previousMeasurements);
        }
        if (wroteJobs) {
          if (previousJobs === null) VSStorage.local.removeItem(KEY);
          else VSStorage.local.setItem(KEY, previousJobs);
        }
      } catch {
        VSUI.toast(
          "No se pudo completar ni revertir el guardado. Conserva esta ventana y revisa el almacenamiento antes de continuar.",
          "error",
        );
        return;
      }
      VSUI.toast(
        "No se pudo guardar el parte y sus medidas. Los datos siguen en el formulario; revisa el espacio disponible e inténtalo de nuevo.",
        "error",
      );
      return;
    }
    jobs = nextJobs;
    measurements = nextMeasurements;
    dlg.close();
    pendingMeasurePhotos = [];
    clearPendingPhotoUrls();
    render();
  });
  const quickNoteDialog = $("#quick-note-dialog"),
    quickNoteForm = $("#quick-note-form");
  function openQuickNote(id = "") {
    const note = notes.find((n) => n.id === id);
    quickNoteForm.reset();
    quickNoteForm.elements.id.value = note?.id || "";
    quickNoteForm.elements.texto.value = note?.texto || "";
    quickNoteForm.elements.cliente.value = note?.cliente || "";
    quickNoteForm.elements.aviso.value = note?.aviso || "";
    $("#quick-note-title").textContent = note
      ? "Editar nota rápida"
      : "Nota rápida";
    $("#quick-note-clients").innerHTML = clientNames()
      .map((name) => '<option value="' + esc(name) + '"></option>')
      .join("");
    quickNoteDialog.showModal();
    requestAnimationFrame(() => quickNoteForm.elements.texto.focus());
  }
  $("#quick-note-add").addEventListener("click", () => openQuickNote());
  $("#quick-note-cancel").addEventListener("click", () =>
    quickNoteDialog.close(),
  );
  quickNoteForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!quickNoteForm.reportValidity()) return;
    const data = new FormData(quickNoteForm),
      id = String(data.get("id") || ""),
      old = notes.find((n) => n.id === id),
      item = {
        id: old?.id || "N-" + crypto.randomUUID(),
        texto: String(data.get("texto") || "").trim(),
        cliente: String(data.get("cliente") || "").trim(),
        aviso: String(data.get("aviso") || ""),
        hecha: old?.hecha || false,
        creada: old?.creada || new Date().toISOString(),
        parte: old?.parte || "",
      };
    if (!item.texto) return;
    saveNotes(
      old ? notes.map((n) => (n.id === id ? item : n)) : [...notes, item],
    );
    quickNoteDialog.close();
    if (page !== "inicio") window.vidresNavigate("inicio");
    else render();
  });
  // Modo claro / oscuro opcional.
  const themeToggle = $("#theme-toggle");
  const applyTheme = (theme) => {
    if (theme === "dark")
      document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
  };
  const readTheme = () => {
    try {
      return VSStorage.local.getItem("vidres-theme-v1") || "";
    } catch {
      return "";
    }
  };
  applyTheme(readTheme());
  function refreshThemeIcon() {
    if (!themeToggle) return;
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    themeToggle.innerHTML = VSIcons.icon(dark ? "sol" : "luna", 20);
    themeToggle.setAttribute(
      "aria-label",
      dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro",
    );
  }
  refreshThemeIcon();
  themeToggle?.addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    const next = dark ? "" : "dark";
    applyTheme(next);
    try {
      VSStorage.local.setItem("vidres-theme-v1", next);
    } catch {}
    refreshThemeIcon();
  });

  render();
})().catch((error) => {
  window.VSAppError = true;
  document.querySelector("#content").textContent =
    "No se pudo iniciar la aplicación: " + error.message;
  document.querySelector("#add").disabled = true;
});
