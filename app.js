"use strict";
window.vidresAppReady = (async () => {
  await VSStorage.ready;
  await VSBackup.recover();
  const { esc, num, money, round6 } = VSUtils;

  const KEY = "vidres-sosa-demo-v01";
  let jobs = VSStorage.read(KEY, []);
  let page = "inicio",
    editing = null,
    search = "";
  let usersBackPage = "ajustes";
  const isSettingsPage = (value) =>
    value === "ajustes" || value.startsWith("ajustes-") || value === "usuarios";
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
  async function save() {
    await VSStorage.local.setItem(KEY, JSON.stringify(jobs));
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
  const isArchived = (j) => Boolean(j.archivadoEn);
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
    jobFocus = "";
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
            '">Ver y editar trabajo</button>' +
            (j.estado === "Finalizado" && !isArchived(j)
              ? '<button type="button" class="job-archive" data-job-archive="' +
                esc(j.id) +
                '">Archivar</button>'
              : "") +
            (isArchived(j)
              ? '<button type="button" class="job-unarchive" data-job-unarchive="' +
                esc(j.id) +
                '">Reabrir expediente</button>'
              : "") +
            "</article>",
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
        ["finalizados", "Finalizados sin archivar"],
        ["archivo", "Archivo"],
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
  function dashboardHtml() {
    const today = localToday(),
      active = jobs.filter((j) => !isClosed(j) && !isArchived(j)),
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
  async function saveNotes(next = notes) {
    await VSStorage.write(NOTE_KEY, next);
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
      '<p class="muted">Fichas compartidas: teléfono y dirección vinculados al historial de trabajos.</p>' +
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
        onUseDims: ({ ancho, alto }) => {
          const measureForm = document.querySelector("#measure-form");
          const setMeasure = (name, value) => {
            if (value == null) return;
            const input = measureForm.elements[name];
            if (!input) return;
            if (
              input.value.trim() !== "" &&
              !confirm(
                `El campo ${name} ya tiene ${input.value}. ¿Sustituirlo por ${value}?`,
              )
            )
              return;
            input.value = value;
          };
          setMeasure("ancho", ancho);
          setMeasure("alto", alto);
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
  function render() {
    if (usagePanel) {
      document.querySelector("main").appendChild(usagePanel);
      usagePanel.hidden = true;
    }
    const mainPage =
      page === "usuarios"
        ? usersBackPage
        : isSettingsPage(page)
          ? "ajustes"
          : ["consultor", "clientes", "calendario", "mediciones"].includes(page)
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
          : jobScope === "archivo"
            ? "Archivo de trabajos"
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
      "ajustes-general": "Configuración general",
      "ajustes-tarifas": "Tarifas y documentos PDF",
      "ajustes-plantillas": "Plantillas de trabajo",
      "ajustes-copias": "Copias de seguridad",
      "ajustes-cuenta": "Mi cuenta y sesión",
      "ajustes-ia": "Dictado e inteligencia artificial",
      usuarios: "Gestión de usuarios",
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
          ? '<p role="status" class="backup-reminder">Hace más de 14 días que no exportas una copia. <button type="button" data-go="ajustes-copias">Hacer copia</button></p>'
          : "") + dashboardHtml();
    } else if (page === "trabajos") {
      const q = /^[+\d\s()-]+$/.test(search)
        ? search.replace(/\D/g, "")
        : search.toLocaleLowerCase("es");
      const filtered = jobs.filter(
        (j) =>
          (jobFocus !== "late" || (j.fecha && j.fecha < localToday())) &&
          (jobFocus !== "today" || j.fecha === localToday()) &&
          (jobFocus !== "undated" || !j.fecha) &&
          (jobScope === "todos" ||
            (jobScope === "archivo"
              ? isArchived(j)
              : jobScope === "finalizados"
                ? isClosed(j) && !isArchived(j)
                : !isClosed(j) && !isArchived(j))) &&
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
      html =
        (jobFocus
          ? '<button type="button" data-clear-focus>Quitar filtro: ' +
            { late: "Atrasados", today: "Para hoy", undated: "Sin fecha" }[
              jobFocus
            ] +
            "</button>"
          : "") +
        workFilters() +
        jobCards(filtered);
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
    } else if (page === "usuarios") {
      const backLabel =
        usersBackPage === "herramientas" ? "Herramientas" : "Ajustes";
      $("#content").innerHTML = window.vidresSettingsBack(
        backLabel,
        usersBackPage,
      );
      window.VSUsers.renderUsers();
      return;
    } else if (page === "ajustes-cuenta") {
      $("#content").innerHTML = window.vidresSettingsBack();
      window.VSUsers.renderAccount();
      return;
    } else if (page === "ajustes-ia") {
      $("#content").innerHTML = window.vidresSettingsBack();
      if (usagePanel) {
        $("#content").appendChild(usagePanel);
        usagePanel.hidden = false;
      }
      return;
    } else if (page === "ajustes-copias") {
      window.vidresToolsRender?.(page);
      const host = $("#content");
      if (host)
        host.insertAdjacentHTML(
          "beforeend",
          panel(
            "Copia de seguridad de trabajos",
            '<p class="muted">Exporta una copia privada de los datos del servidor. Incluye trabajos, clientes, mediciones con croquis, presupuestos, tarifas y configuración. La copia con archivos incluye además fotos y documentos.</p><div class="backup-actions"><button type="button" id="backup-export">Descargar datos JSON</button><button type="button" id="backup-export-full">Copia completa con fotos y documentos</button><label>Importar copia JSON<input id="backup-import" type="file" accept=".json,application/json"></label></div>',
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
      if (VSAuth.user.rol !== "administrador")
        host.querySelector("#backup-import")?.closest("label")?.remove();
      window.VSUsers.renderMigration();
      return;
    } else if (
      page === "herramientas" ||
      page === "consultor" ||
      isSettingsPage(page)
    ) {
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
        render();
        $("#search").focus();
        $("#search").setSelectionRange(search.length, search.length);
      });
  }
  window.vidresNavigate = (p) => {
    if (p === "usuarios")
      usersBackPage = page === "herramientas" ? "herramientas" : "ajustes";
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
      alert(e.message);
    }
  }
  function importBackup(file) {
    VSBackup.importFile(file).catch((e) =>
      alert("No se pudo importar: " + e.message),
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
      if (form.elements.facturado)
        form.elements.facturado.checked = Boolean(job.facturado);
      if (form.elements.cobrado)
        form.elements.cobrado.checked = Boolean(job.cobrado);
    } else {
      form.elements.cliente.value = prefill.cliente || "";
      form.elements.descripcion.value = prefill.descripcion || "";
    }
    dlg.showModal();
  }
  function applyTemplate(id) {
    const select = $("#start-template");
    if (!id) return;
    const t = (window.vidresPlantillasList?.() || []).find((x) => x.id === id);
    if (!t) return;
    const hasInfo =
      form.elements.descripcion.value.trim() !== "" ||
      form.elements.notas.value.trim() !== "" ||
      (form.elements.tipoCliente.value || "Particular") !== "Particular" ||
      document.querySelectorAll(".new-measure-piece").length > 0;
    if (
      hasInfo &&
      !confirm(
        "Ya hay información escrita. ¿Sustituirla por la plantilla «" +
          t.nombre +
          "»?",
      )
    ) {
      select.value = "";
      return;
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
  window.vidresChangeJobStatus = async (id, status) => {
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
    await VSStorage.write(KEY, next);
    jobs = next;
  };
  window.vidresDeleteJob = async (id) => {
    if (
      prompt(
        "Para eliminar el trabajo y sus medidas, fotos y documentos, escribe " +
          id,
      ) !== id
    )
      return false;
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
      alert("No se pudo eliminar el trabajo: " + e.message);
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
      alert("Añade un máximo de 12 fotos por operación.");
      e.target.value = "";
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > 20_000_000) {
        alert("Archivo no admitido: " + file.name);
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
        alert("No se pudo preparar " + file.name + ": " + error.message);
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
    const archiveButton = e.target.closest(
      "[data-job-archive], [data-job-unarchive]",
    );
    if (archiveButton) {
      const id =
        archiveButton.dataset.jobArchive || archiveButton.dataset.jobUnarchive;
      const job = jobs.find((j) => j.id === id);
      if (!job) return;
      const archive = archiveButton.hasAttribute("data-job-archive");
      if (archive && job.estado !== "Finalizado") {
        alert("Solo se pueden archivar trabajos finalizados.");
        return;
      }
      if (
        !confirm(
          archive
            ? "¿Archivar este trabajo? Seguirá disponible en Archivo."
            : "¿Sacar este expediente del archivo?",
        )
      )
        return;
      const next = jobs.map((j) =>
        j.id === id
          ? { ...j, archivadoEn: archive ? new Date().toISOString() : null }
          : j,
      );
      try {
        await VSStorage.local.setItem(KEY, JSON.stringify(next));
        jobs = next;
        render();
      } catch {
        alert("No se pudo guardar el cambio. No se ha archivado el trabajo.");
      }
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
      await window.vidresQuoteUpdateStatus?.(
        followupStatus.dataset.quoteId,
        followupStatus.dataset.followupStatus,
      );
      render();
      return;
    }
    const postpone = e.target.closest("[data-followup-postpone]");
    if (postpone) {
      await window.vidresQuotePostpone?.(postpone.dataset.followupPostpone, 3);
      render();
      return;
    }
    if (e.target.closest("[data-note-new]")) {
      openQuickNote();
      return;
    }
    const noteDone = e.target.closest("[data-note-done]");
    if (noteDone) {
      await saveNotes(
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
      if (confirm("¿Eliminar esta nota rápida?")) {
        await saveNotes(
          notes.filter((n) => n.id !== noteDelete.dataset.noteDelete),
        );
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
        alert(error.message);
      }
      return;
    }
    const focus = e.target.closest("[data-job-focus]");
    if (focus) {
      jobScope = "activos";
      jobFocus = focus.dataset.jobFocus;
      search = "";
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
        search = "";
        jobScope = "activos";
        jobFocus = "";
        filters = { estado: "", responsable: "", tipoCliente: "" };
      }
      window.vidresNavigate(go.dataset.go);
      return;
    }
    if (
      page === "herramientas" ||
      page === "consultor" ||
      isSettingsPage(page)
    ) {
      if (e.target.closest("#backup-export")) {
        downloadBackup();
        return;
      }
      await window.vidresToolsClick?.(e, window.vidresNavigate);
      return;
    }
    if (page === "presupuestos") {
      await window.vidresQuoteClick?.(e);
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
        const nextMeasurements = measurements.filter(
          (x) => x.id !== md.dataset.measureDelete,
        );
        await VSStorage.measurements.replace(nextMeasurements);
        measurements = nextMeasurements;
        render();
      }
      return;
    }
    const v = e.target.closest("[data-home-view]");
    if (v) {
      homeView = v.dataset.homeView;
      try {
        await VSStorage.local.setItem("vidres-home-view", homeView);
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
    if (page === "ajustes-copias" && e.target.id === "backup-import") {
      importBackup(e.target.files?.[0]);
      return;
    }
    if (page === "herramientas" || page === "consultor" || isSettingsPage(page))
      window.vidresToolsChange?.(e);
    else if (page === "presupuestos") window.vidresQuoteChange?.(e);
  });
  $("#content").addEventListener("input", (e) => {
    if (page === "consultor") window.vidresToolsInput?.(e);
    else if (page === "presupuestos") window.vidresQuoteInput?.(e);
  });
  document.querySelector("#client-form").addEventListener(
    "submit",
    VSForms.guard(async (e) => {
      e.preventDefault();
      const data = new FormData(e.target),
        nombre = String(data.get("nombre") || "").trim();
      if (!nombre) return;
      const item = {
        nombre,
        telefono: String(data.get("telefono") || "").trim(),
        direccion: String(data.get("direccion") || "").trim(),
      };
      const i = clients.findIndex(
        (c) => normName(c.nombre) === normName(nombre),
      );
      const nextClients = [...clients];
      if (i < 0) nextClients.push(item);
      else nextClients[i] = item;
      try {
        await VSStorage.local.setItem(CLIENT_KEY, JSON.stringify(nextClients));
      } catch {
        alert("No se pudo guardar la ficha. Revisa el espacio disponible.");
        return;
      }
      clients = nextClients;
      document.querySelector("#client-editor").close();
      render();
    }),
  );
  document
    .querySelector("#measure-draw")
    .addEventListener("click", () =>
      window.vidresSketch.open(document.querySelector("#measure-sketch")),
    );
  document.querySelector("#measure-form").addEventListener(
    "submit",
    VSForms.guard(async (e) => {
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
        await VSStorage.measurements.replace(next);
      } catch {
        alert(
          "No se pudo guardar la medición y su croquis. Conserva el formulario e inténtalo de nuevo.",
        );
        return;
      }
      measurements = next;
      document.querySelector("#measure-editor").close();
      render();
    }),
  );
  form.addEventListener(
    "submit",
    VSForms.guard(async (e) => {
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
        alert("Revisa la duración: de 1 a 1440 minutos");
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
        nextJobs[i] = {
          ...old,
          ...values,
          historial: history,
          finalizadoEn:
            values.estado === "Finalizado"
              ? old.estado === "Finalizado"
                ? old.finalizadoEn || new Date().toISOString()
                : new Date().toISOString()
              : null,
          facturado: Boolean(form.elements.facturado?.checked),
          cobrado: Boolean(form.elements.cobrado?.checked),
          archivadoEn:
            values.estado === "Finalizado" ? old.archivadoEn || null : null,
        };
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
          finalizadoEn:
            values.estado === "Finalizado" ? new Date().toISOString() : null,
          facturado: Boolean(form.elements.facturado?.checked),
          cobrado: Boolean(form.elements.cobrado?.checked),
          archivadoEn: null,
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
      // One D1 transaction saves the job, pieces and converted note. Attachments are
      // acknowledged individually; on failure the same job can be retried without duplication.
      const nextNotes =
        createdJobId && convertingNote
          ? notes.map((n) =>
              n.id === convertingNote
                ? { ...n, hecha: true, parte: createdJobId }
                : n,
            )
          : notes;
      try {
        const state = {};
        state[KEY] = nextJobs;
        state[VSStorage.keys.mediciones] = nextMeasurements;
        state[NOTE_KEY] = nextNotes;
        await VSStorage.patchValues(state);
      } catch (error) {
        alert(
          "No se pudo confirmar el guardado. Conserva el formulario. " +
            error.message,
        );
        return;
      }
      jobs = nextJobs;
      measurements = nextMeasurements;
      notes = nextNotes;
      if (createdJobId) editing = createdJobId;
      try {
        while (pendingMeasurePhotos.length) {
          const photo = pendingMeasurePhotos[0];
          await VSFiles.put("photos", { ...photo, trabajo: editing });
          pendingMeasurePhotos.shift();
        }
      } catch (error) {
        renderPendingMeasurePhotos();
        alert(
          "El parte y las medidas están guardados. Quedan fotos pendientes; vuelve a pulsar Guardar para reintentar. " +
            error.message,
        );
        return;
      }
      dlg.close();
      pendingMeasurePhotos = [];
      clearPendingPhotoUrls();
      render();
    }),
  );
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
  quickNoteForm.addEventListener(
    "submit",
    VSForms.guard(async (e) => {
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
      await saveNotes(
        old ? notes.map((n) => (n.id === id ? item : n)) : [...notes, item],
      );
      quickNoteDialog.close();
      if (page !== "inicio") window.vidresNavigate("inicio");
      else render();
    }),
  );
  document
    .querySelectorAll("[data-dialog-close]")
    .forEach((b) =>
      b.addEventListener("click", () => b.closest("dialog").close()),
    );
  render();
})().catch((error) => {
  window.VSAppError = true;
  document.querySelector("#content").textContent =
    "No se pudo iniciar la aplicación: " + error.message;
  document.querySelector("#add").disabled = true;
});
