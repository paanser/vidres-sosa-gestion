"use strict";
(() => {
  const { esc, num, money, round6 } = VSUtils;

  const dialog = document.querySelector("#expediente");
  if (!dialog) return;
  const body = dialog.querySelector("#exp-body"),
    heading = dialog.querySelector("#exp-title");
  let current = null,
    tab = "resumen",
    revision = 0;
  const photoUrls = new Set();
  function clearPhotoUrls() {
    for (const url of photoUrls) URL.revokeObjectURL(url);
    photoUrls.clear();
  }
  function photoUrl(blob) {
    const url = URL.createObjectURL(blob);
    photoUrls.add(url);
    return url;
  }
  dialog.addEventListener("close", () => {
    revision++;
    clearPhotoUrls();
  });
  let scale = 1;
  try {
    scale = Math.min(
      1.5,
      Math.max(0.9, Number(VSStorage.local.getItem("vidres-text-scale")) || 1),
    );
  } catch {}
  document.documentElement.style.setProperty("--vs-text-scale", String(scale));
  async function photos(jobId = current) {
    return (await VSFiles.all("photos")).filter((p) => p.trabajo === jobId);
  }
  async function savePhoto(record) {
    return VSFiles.put("photos", record);
  }
  async function removePhoto(id) {
    return VSFiles.remove("photos", id);
  }
  async function documentItems() {
    return (await VSFiles.all("documents")).filter(
      (d) => d.trabajo === current,
    );
  }
  async function storeDocument(record) {
    return VSFiles.put("documents", record);
  }
  async function deleteDocument(id) {
    return VSFiles.remove("documents", id);
  }
  async function openDocument(id) {
    const item = (await documentItems()).find((x) => x.id === id);
    if (!item) return;
    const url = URL.createObjectURL(item.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.nombre;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function compress(file) {
    return VSFiles.compressImage(file);
  }
  const getJob = () => window.vidresGetJobs?.().find((j) => j.id === current);
  const date = (v) => (v ? new Date(v).toLocaleString("es-ES") : "—");
  async function render() {
    const renderId = ++revision,
      jobId = current;
    clearPhotoUrls();
    const active = () => renderId === revision && jobId === current;
    const j = getJob();
    if (!j) {
      dialog.close();
      return;
    }
    heading.textContent = j.cliente + " · " + j.id;
    dialog.querySelectorAll("[data-exp-tab]").forEach((b) => {
      b.classList.toggle("selected", b.dataset.expTab === tab);
      b.setAttribute("aria-selected", String(b.dataset.expTab === tab));
    });
    const measures = (window.vidresGetMeasurements?.() || []).filter(
      (m) => m.trabajo === current,
    );
    const detail =
      '<div class="exp-details"><div><small>Estado</small><strong class="' +
      (j.estado === "Crítico" ? "critical-heading" : "") +
      '">' +
      esc(j.estado) +
      "</strong></div><div><small>Responsable</small><strong>" +
      esc(j.responsable || "Sin asignar") +
      "</strong></div><div><small>Fecha prevista</small><strong>" +
      esc(
        (j.fecha || "Sin fecha") +
          (j.hora ? " · " + j.hora : "") +
          (j.duracion ? " · " + j.duracion + " min" : ""),
      ) +
      "</strong></div><div><small>Tipo de cliente</small><strong>" +
      esc(j.tipoCliente || "Particular") +
      "</strong></div></div>";
    if (tab === "resumen") {
      body.innerHTML =
        detail +
        '<div class="exp-two"><section class="exp-section"><h3>Descripción del trabajo</h3><p>' +
        esc(j.descripcion) +
        "</p><h3>Dirección</h3><p>" +
        esc(j.direccion || "No indicada") +
        "</p>" +
        (j.direccion
          ? '<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=' +
            encodeURIComponent(j.direccion) +
            '">Abrir en mapas</a>'
          : "") +
        '</section><section class="exp-section"><h3>Notas</h3><p>' +
        esc(j.notas || "Sin notas") +
        "</p><h3>Resumen</h3><p>" +
        measures.length +
        " piezas medidas · " +
        (Array.isArray(j.historial) ? j.historial.length : 0) +
        " movimientos registrados</p></section></div>" +
        '<section id="exp-summary-photos" class="exp-section exp-summary-photos" hidden></section>';
      if (j.estado === "Finalizado" || j.archivadoEn) {
        body.insertAdjacentHTML(
          "beforeend",
          '<section class="exp-section"><h3>Cierre administrativo</h3><p>Finalizado: ' +
            esc(
              j.finalizadoEn
                ? new Date(j.finalizadoEn).toLocaleString("es-ES")
                : "Sin fecha registrada",
            ) +
            "</p><p>Facturado: <strong>" +
            (j.facturado ? "Sí" : "Pendiente") +
            "</strong> · Cobrado: <strong>" +
            (j.cobrado ? "Sí" : "Pendiente") +
            "</strong></p><p>" +
            (j.archivadoEn ? "Expediente archivado" : "Pendiente de archivar") +
            "</p></section>",
        );
      }
      const client = VSStorage.read("vidres-clientes-v1", []).find(
        (c) =>
          String(c.nombre || "")
            .trim()
            .toLocaleLowerCase("es") ===
          String(j.cliente || "")
            .trim()
            .toLocaleLowerCase("es"),
      );
      if (client?.telefono) {
        let tel = String(client.telefono).replace(/[^+0-9]/g, "");
        let wa = tel.replace(/^\+|^00/, "");
        if (/^\d{9}$/.test(wa)) wa = "34" + wa;
        body.insertAdjacentHTML(
          "beforeend",
          '<section class="exp-section"><h3>Contacto</h3><p>' +
            esc(client.telefono) +
            '</p><a href="tel:' +
            esc(tel) +
            '">Llamar</a> · <a target="_blank" rel="noopener noreferrer" href="https://wa.me/' +
            esc(wa) +
            '">WhatsApp</a></section>',
        );
      }
      try {
        const items = (await photos(jobId)).filter((p) => p.tipo !== "medidas");
        if (!active()) return;
        const host = body.querySelector("#exp-summary-photos");
        if (items.length && host) {
          host.hidden = false;
          host.innerHTML =
            '<div class="exp-section-head"><h3>Fotos del trabajo</h3><button type="button" data-exp-view-photos>Ver todas (' +
            items.length +
            ')</button></div><div class="exp-summary-gallery">' +
            items
              .slice(0, 3)
              .map(
                (p) =>
                  '<button type="button" data-exp-view-photos aria-label="Ver fotos del trabajo"><img src="' +
                  photoUrl(p.blob) +
                  '" alt="' +
                  esc(p.nombre) +
                  '"></button>',
              )
              .join("") +
            "</div>";
        }
      } catch {
        if (!active()) return;
        const host = body.querySelector("#exp-summary-photos");
        if (host) {
          host.hidden = false;
          host.textContent =
            "No se pudieron cargar las fotos. Inténtalo desde la sección Fotos.";
        }
      }
    }
    if (tab === "medidas") {
      body.innerHTML =
        '<section class="exp-section"><div class="exp-section-head"><h3>Medidas en papel</h3><label class="exp-upload">📷 Foto de medidas<input type="file" accept="image/*" capture="environment" data-exp-measure-photo hidden></label><label class="exp-upload">Elegir de la galería<input type="file" accept="image/*" multiple data-exp-measure-photo hidden></label></div><p class="muted">Las fotos se guardan en el servidor privado y se incluyen en la copia completa.</p><div id="exp-paper-photos" class="measure-paper-grid">Cargando fotos…</div></section>' +
        '<div class="exp-section"><div class="exp-section-head"><h3>Mediciones del expediente</h3><button class="primary" data-exp-draw-measure>✎ Dibujar medidas</button><button type="button" data-exp-add-measure>+ Añadir medida</button><button type="button" data-exp-quote-measures>Crear presupuesto desde medidas</button></div>' +
        (measures.length
          ? '<div class="exp-measure-grid">' +
            measures
              .map(
                (m) =>
                  "<article><strong>" +
                  esc(m.tipo) +
                  "</strong><p>" +
                  esc(m.ancho) +
                  " × " +
                  esc(m.alto) +
                  " cm · " +
                  esc(m.cantidad) +
                  " ud.</p><p>" +
                  (
                    (Number(m.ancho) * Number(m.alto) * Number(m.cantidad)) /
                    10000
                  ).toFixed(4) +
                  ' m² reales</p><button data-exp-measure="' +
                  esc(m.id) +
                  '">Editar medida y croquis</button></article>',
              )
              .join("") +
            "</div>"
          : "<p>Todavía no hay piezas medidas.</p>") +
        "</div>";
      try {
        const paper = (await photos(jobId)).filter(
          (photo) => photo.tipo === "medidas",
        );
        if (!active()) return;
        const host = body.querySelector("#exp-paper-photos");
        if (host)
          host.innerHTML = paper.length
            ? paper
                .map(
                  (photo) =>
                    '<figure><button type="button" class="paper-photo-open" data-exp-paper-open="' +
                    esc(photo.id) +
                    '"><img src="' +
                    photoUrl(photo.blob) +
                    '" alt="' +
                    esc(photo.nombre) +
                    '"></button><label>Nota<input maxlength="180" data-exp-photo-note="' +
                    esc(photo.id) +
                    '" value="' +
                    esc(photo.nota || "") +
                    '"></label><button type="button" data-exp-delete-photo="' +
                    esc(photo.id) +
                    '">Eliminar</button></figure>',
                )
                .join("")
            : '<p class="muted">No hay fotos de medidas en papel.</p>';
      } catch {
        const host = body.querySelector("#exp-paper-photos");
        if (host) host.textContent = "No se pudieron cargar las fotos.";
      }
    }
    if (tab === "fotos") {
      body.innerHTML =
        '<div class="exp-section"><div class="exp-section-head"><h3>Fotografías del trabajo</h3><label class="exp-upload">+ Añadir fotos<input id="exp-files" type="file" accept="image/*" multiple hidden></label></div><p class="muted">Las imágenes se comprimen antes de guardarse. Se guardan en el servidor privado y se incluyen en la copia completa.</p><div id="exp-photos" class="exp-gallery">Cargando fotos…</div></div>';
      try {
        const items = (await photos(jobId)).filter((p) => p.tipo !== "medidas");
        if (!active()) return;
        const host = dialog.querySelector("#exp-photos");
        if (host)
          host.innerHTML = items.length
            ? items
                .map(
                  (p) =>
                    '<figure><img src="' +
                    photoUrl(p.blob) +
                    '" alt="' +
                    esc(p.nombre) +
                    '"><figcaption>' +
                    esc(p.nombre) +
                    '</figcaption><button data-exp-delete-photo="' +
                    esc(p.id) +
                    '">Eliminar</button></figure>',
                )
                .join("")
            : "<p>No hay fotos adjuntas.</p>";
      } catch {
        if (!active()) return;
        const host = dialog.querySelector("#exp-photos");
        if (host)
          host.textContent =
            "No se pudo acceder al almacenamiento de fotografías.";
      }
    }
    if (tab === "presupuestos") {
      const quotes = window.vidresQuotesForJob?.(current) || [];
      body.innerHTML =
        '<section class="exp-section"><div class="exp-section-head"><h3>Presupuestos vinculados</h3><button class="primary" data-exp-new-quote>+ Nuevo presupuesto</button></div><p class="muted">Los presupuestos se guardan en el servidor privado. Se abre el presupuestador existente, con sus tarifas y cálculos.</p>' +
        (quotes.length
          ? '<div class="exp-quote-list">' +
            quotes
              .map(
                (q) =>
                  '<article class="exp-quote-item"><div><strong>' +
                  esc(q.id) +
                  "</strong><p>" +
                  esc(q.date + " · " + (q.status || "Borrador")) +
                  " · " +
                  q.lines +
                  " concepto(s)</p><span>Base: " +
                  money(q.base) +
                  " · IVA: " +
                  money(q.iva) +
                  "</span></div><div><strong>" +
                  money(q.total) +
                  '</strong><button type="button" data-exp-quote="' +
                  esc(q.id) +
                  '">Abrir presupuesto</button><button type="button" data-exp-quote-whatsapp="' +
                  esc(q.id) +
                  '">Enviar por WhatsApp</button></div></article>',
              )
              .join("") +
            "</div>"
          : '<div class="empty-state">No hay presupuestos vinculados a este trabajo.</div>') +
        "</section>";
    }
    if (tab === "documentos") {
      body.innerHTML =
        '<section class="exp-section"><div class="exp-section-head"><h3>Documentos del expediente</h3><label class="exp-upload">+ Añadir documento<input id="exp-doc-files" type="file" accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf" multiple hidden></label></div><p class="muted">Documentos privados compartidos entre dispositivos e incluidos en la copia completa. Máximo 8 MB por archivo.</p><div id="exp-doc-list">Cargando documentos…</div></section>';
      try {
        const items = await documentItems();
        if (tab !== "documentos") return;
        const host = dialog.querySelector("#exp-doc-list");
        if (host)
          host.innerHTML = items.length
            ? '<div class="exp-doc-list">' +
              items
                .map(
                  (d) =>
                    '<article class="exp-doc-item"><div><strong>' +
                    esc(d.nombre) +
                    "</strong><p>" +
                    Math.ceil(d.blob.size / 1024) +
                    " KB · " +
                    esc(date(d.fecha)) +
                    '</p></div><div><button type="button" data-exp-doc-open="' +
                    esc(d.id) +
                    '">Descargar</button><button type="button" data-exp-doc-delete="' +
                    esc(d.id) +
                    '">Eliminar</button></div></article>',
                )
                .join("") +
              "</div>"
            : '<div class="empty-state">Aún no hay documentos adjuntos.</div>';
      } catch {
        const host = dialog.querySelector("#exp-doc-list");
        if (host)
          host.textContent =
            "No se pudo acceder al almacenamiento de documentos.";
      }
    }
    if (tab === "historial")
      body.innerHTML =
        '<section class="exp-section"><h3>Historial de estados</h3>' +
        (Array.isArray(j.historial) && j.historial.length
          ? '<ol class="exp-history">' +
            j.historial
              .slice()
              .reverse()
              .map(
                (h) =>
                  "<li><strong>" +
                  esc(h.de || "Nuevo") +
                  " → " +
                  esc(h.a) +
                  "</strong><span>" +
                  esc(date(h.fecha)) +
                  " · " +
                  esc(h.responsable || "Sin indicar") +
                  "</span></li>",
              )
              .join("") +
            "</ol>"
          : "<p>Este trabajo todavía no tiene cambios de estado registrados.</p>") +
        "</section>";
  }
  function open(id) {
    current = id;
    tab = "resumen";
    render();
    dialog.showModal();
  }
  document.querySelector("#content").addEventListener(
    "click",
    (e) => {
      const b = e.target.closest("[data-id]");
      if (b && window.vidresGetJobs?.().some((j) => j.id === b.dataset.id)) {
        e.stopImmediatePropagation();
        open(b.dataset.id);
      }
    },
    true,
  );
  function changeScale(step) {
    scale =
      step === 0
        ? 1
        : Math.max(
            0.9,
            Math.min(1.5, Math.round((scale + step * 0.1) * 10) / 10),
          );
    document.documentElement.style.setProperty(
      "--vs-text-scale",
      String(scale),
    );
    try {
      VSStorage.local.setItem("vidres-text-scale", String(scale));
    } catch {}
    document
      .querySelectorAll('[data-text-scale="0"]')
      .forEach((b) => (b.textContent = Math.round(scale * 100) + " %"));
  }
  const sideControls = document.querySelector(".global-text-controls");
  sideControls
    ?.querySelector(".text-settings-toggle")
    ?.addEventListener("click", () => {
      const panel = sideControls.querySelector("#text-settings-panel");
      panel.hidden = !panel.hidden;
      sideControls
        .querySelector(".text-settings-toggle")
        .setAttribute("aria-expanded", String(!panel.hidden));
    });
  sideControls?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-text-scale]");
    if (b) changeScale(Number(b.dataset.textScale));
  });
  document
    .querySelectorAll('[data-text-scale="0"]')
    .forEach((b) => (b.textContent = Math.round(scale * 100) + " %"));
  dialog.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.textScale !== undefined) {
      changeScale(Number(b.dataset.textScale));
    } else if (b.hasAttribute("data-exp-view-photos")) {
      tab = "fotos";
      await render();
    } else if (b.dataset.expTab) {
      tab = b.dataset.expTab;
      await render();
    } else if (b.hasAttribute("data-exp-delete")) {
      if (await window.vidresDeleteJob(current)) dialog.close();
    } else if (b.hasAttribute("data-exp-quote-measures")) {
      const pieces = (window.vidresGetMeasurements?.() || []).filter(
        (m) => m.trabajo === current,
      );
      if (!pieces.length) {
        alert("Añade primero una medida al expediente");
        return;
      }
      dialog.close();
      window.vidresQuoteStartForJob(current, getJob()?.cliente, pieces);
    } else if (b.hasAttribute("data-exp-new-quote")) {
      dialog.close();
      window.vidresQuoteStartForJob?.(current, getJob()?.cliente);
    } else if (b.dataset.expQuote) {
      dialog.close();
      window.vidresQuoteOpenSaved?.(b.dataset.expQuote);
    } else if (b.dataset.expQuoteWhatsapp) {
      window.vidresQuoteWhatsApp?.(b.dataset.expQuoteWhatsapp);
    } else if (b.dataset.expDocOpen) {
      try {
        await openDocument(b.dataset.expDocOpen);
      } catch {
        alert("No se pudo descargar el documento.");
      }
    } else if (b.dataset.expDocDelete) {
      if (!confirm("¿Eliminar este documento del expediente?")) return;
      try {
        await deleteDocument(b.dataset.expDocDelete);
        render();
      } catch {
        alert("No se pudo eliminar el documento.");
      }
    } else if (b.hasAttribute("data-exp-edit")) {
      dialog.close();
      window.vidresOpenJobEditor?.(current);
    } else if (b.hasAttribute("data-exp-draw-measure")) {
      dialog.close();
      window.vidresOpenMeasurement?.(null, current, true);
    } else if (b.hasAttribute("data-exp-add-measure")) {
      dialog.close();
      window.vidresOpenMeasurement?.(null, current);
    } else if (b.dataset.expMeasure) {
      dialog.close();
      window.vidresOpenMeasurement?.(b.dataset.expMeasure);
    } else if (b.dataset.expDeletePhoto) {
      if (!confirm("¿Eliminar esta fotografía?")) return;
      await removePhoto(b.dataset.expDeletePhoto);
      render();
    } else if (b.dataset.expPaperOpen) {
      const photo = (await photos()).find(
        (p) => p.id === b.dataset.expPaperOpen,
      );
      if (photo) openMeasurePhoto(photo);
    } else if (b.hasAttribute("data-exp-close")) dialog.close();
  });
  dialog.addEventListener("change", async (e) => {
    if (e.target.dataset.expPhotoNote) {
      const photo = (await photos()).find(
        (item) => item.id === e.target.dataset.expPhotoNote,
      );
      if (photo)
        await savePhoto({ ...photo, nota: String(e.target.value).trim() });
      return;
    }
    if (e.target.hasAttribute("data-exp-measure-photo")) {
      const files = [...e.target.files];
      if (files.length > 12) {
        alert("Añade un máximo de 12 fotos por operación.");
        return;
      }
      for (const file of files) {
        if (!file.type.startsWith("image/") || file.size > 20_000_000) {
          alert("Archivo no admitido: " + file.name);
          continue;
        }
        try {
          await savePhoto({
            id: crypto.randomUUID(),
            trabajo: current,
            tipo: "medidas",
            nota: "",
            nombre: file.name.slice(0, 100),
            blob: await compress(file),
            fecha: new Date().toISOString(),
          });
        } catch (error) {
          alert("No se pudo guardar " + file.name + ": " + error.message);
        }
      }
      render();
      return;
    }
    if (e.target.id === "exp-doc-files") {
      const files = [...e.target.files];
      if (files.length > 12) {
        alert("Añade como máximo 12 documentos a la vez.");
        return;
      }
      const allowed = /\.(pdf|txt|csv|doc|docx|xls|xlsx|jpg|jpeg|png)$/i;
      for (const file of files) {
        if (file.size > 8_000_000 || !allowed.test(file.name)) {
          alert("Documento no admitido (máximo 8 MB): " + file.name);
          continue;
        }
        try {
          await storeDocument({
            id: crypto.randomUUID(),
            trabajo: current,
            nombre: file.name.slice(0, 160),
            blob: file,
            fecha: new Date().toISOString(),
          });
        } catch {
          alert("No se pudo guardar " + file.name);
        }
      }
      render();
      return;
    }
    if (e.target.id !== "exp-files") return;
    const photoJobId = current;
    const files = [...e.target.files];
    if (files.length > 12) {
      alert("Añade un máximo de 12 fotos por operación.");
      return;
    }
    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > 20_000_000) {
        alert("Archivo no admitido: " + file.name);
        continue;
      }
      try {
        const blob = await compress(file);
        await savePhoto({
          id: crypto.randomUUID(),
          trabajo: photoJobId,
          tipo: "normal",
          nombre: file.name.slice(0, 100),
          blob,
          fecha: new Date().toISOString(),
        });
      } catch (err) {
        alert("No se pudo guardar " + file.name + ": " + err.message);
      }
    }
    render();
  });
  const measurePhotoViewer = document.querySelector("#measure-photo-viewer"),
    measurePhotoViewerImage = measurePhotoViewer?.querySelector("img");
  function openMeasurePhoto(photo) {
    const url = photoUrl(photo.blob);
    measurePhotoViewerImage.src = url;
    measurePhotoViewerImage.style.transform = "scale(1)";
    measurePhotoViewer.showModal();
  }
  measurePhotoViewer
    ?.querySelector(".measure-photo-close")
    ?.addEventListener("click", () => measurePhotoViewer.close());
  measurePhotoViewerImage?.addEventListener("dblclick", () => {
    const enlarged = measurePhotoViewerImage.style.transform === "scale(2)";
    measurePhotoViewerImage.style.transform = enlarged
      ? "scale(1)"
      : "scale(2)";
  });
})();
