"use strict";
(() => {
  const { esc, num, money, round6 } = VSUtils;

  const dialog = document.querySelector("#expediente");
  if (!dialog) return;
  const body = dialog.querySelector("#exp-body"),
    heading = dialog.querySelector("#exp-title"),
    tabs = [...dialog.querySelectorAll("[data-exp-tab]")];
  let current = null,
    tab = "resumen",
    revision = 0;
  let sheetUrl = null;
  const sheetResult = dialog.querySelector("#exp-sheet-result");
  const sheetDialog = dialog.querySelector("#exp-sheet-dialog");
  sheetDialog.addEventListener("click", (event) => event.stopPropagation());
  sheetDialog.addEventListener("close", (event) => {
    event.stopPropagation();
    clearSheet();
  });
  function clearSheet() {
    if (sheetDialog.open) sheetDialog.close();
    if (sheetUrl) URL.revokeObjectURL(sheetUrl);
    sheetUrl = null;
    sheetResult.replaceChildren();
    sheetResult.hidden = true;
  }
  function showSheet() {
    clearSheet();
    sheetResult.hidden = false;
    sheetDialog.showModal();
    try {
      const job = getJob();
      if (!job) throw Error("El expediente ya no existe.");
      const client = VSStorage.read("vidres-clientes-v1", []).find(
        (c) =>
          String(c.nombre || "")
            .trim()
            .toLocaleLowerCase("es") ===
          String(job.cliente || "")
            .trim()
            .toLocaleLowerCase("es"),
      );
      const company =
        VSStorage.read(VSStorage.keys.configuracion, {}).company || {};
      const blob = VSJobSheetPDF.build(
        job,
        client,
        company,
        VSStorage.measurements.get().filter((m) => m.trabajo === job.id),
      ).output("blob");
      sheetUrl = URL.createObjectURL(blob);
      const filename =
        "visita-" + String(job.id).replace(/[^a-z0-9_-]/gi, "-") + ".pdf";
      sheetResult.innerHTML =
        '<p>Tu hoja de visita está lista.</p><a target="_blank" rel="noopener" href="' +
        sheetUrl +
        '">Abrir e imprimir</a> <a download="' +
        filename +
        '" href="' +
        sheetUrl +
        '">Guardar PDF</a>';
      const file = new File([blob], filename, { type: "application/pdf" });
      const status = sheetResult.querySelector("p");
      status.setAttribute("role", "status");
      status.textContent =
        "Tu hoja de visita está lista. Pulsa Compartir PDF para enviarla como archivo adjunto por la aplicación que elijas.";
      sheetResult.insertBefore(
        VSSharePDF(file, sheetResult.querySelector("a[download]"), status),
        sheetResult.querySelector("a"),
      );
    } catch (error) {
      sheetResult.textContent = "No se pudo preparar la hoja: " + error.message;
    }
  }
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
    window.VSOperations?.unmount();

    clearSheet();
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

  function bindLetterSignature(pad) {
    const canvas = pad.querySelector("canvas");
    const context = canvas.getContext("2d");
    let pointer = null;
    let previous = null;
    let signed = false;
    context.strokeStyle = "#202020";
    context.lineWidth = 4;
    context.lineCap = "round";
    const clear = () => {
      pointer = null;
      previous = null;
      signed = false;
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
    const point = (event) => {
      const bounds = canvas.getBoundingClientRect();
      return [
        ((event.clientX - bounds.left) / bounds.width) * canvas.width,
        ((event.clientY - bounds.top) / bounds.height) * canvas.height,
      ];
    };
    canvas.addEventListener("pointerdown", (event) => {
      if (pointer !== null || event.button !== 0) return;
      pointer = event.pointerId;
      canvas.setPointerCapture(pointer);
      previous = point(event);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointer) return;
      const next = point(event);
      if (Math.hypot(next[0] - previous[0], next[1] - previous[1]) < 1) return;
      context.beginPath();
      context.moveTo(...previous);
      context.lineTo(...next);
      context.stroke();
      previous = next;
      signed = true;
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      canvas.addEventListener(type, (event) => {
        if (event.pointerId === pointer) pointer = null;
      });
    }
    pad.querySelector("button").addEventListener("click", clear);
    return {
      clear,
      hasInk: () => signed,
      image: () => (signed ? canvas.toDataURL("image/png") : null),
    };
  }

  async function createResponsibilityLetter() {
    const job = getJob();
    if (!job) return alert("No se encontró el expediente.");
    const form = document.createElement("dialog");
    form.className = "responsibility-dialog";
    form.style.cssText =
      "width:min(92vw,620px);max-height:90vh;overflow:auto;border:1px solid #b9d6c4;border-radius:14px;padding:24px";
    const field = (label, name, value = "") =>
      '<label style="display:grid;gap:5px;margin:12px 0">' +
      label +
      '<input name="' +
      name +
      '" maxlength="180" value="' +
      esc(value) +
      '" style="padding:10px;width:100%;box-sizing:border-box"></label>';
    const signaturePad = (id, label) =>
      `<fieldset class="responsibility-signature" data-signature="${id}">
        <legend>${label}</legend>
        <canvas width="600" height="240" role="img" aria-label="${label}. Dibuja con el dedo o el ratón."></canvas>
        <button type="button">Borrar firma</button>
      </fieldset>`;
    form.innerHTML =
      '<form method="dialog"><h2>Carta de responsabilidad</h2><p>Documento vinculado al expediente · Revisa las cláusulas antes de firmar.</p>' +
      field("Cliente", "cliente", job.cliente) +
      field(
        "Dirección de intervención",
        "direccion",
        [job.direccion, job.poblacion].filter(Boolean).join(", "),
      ) +
      field("Trabajo (editable)", "trabajo", job.descripcion) +
      '<label style="display:grid;gap:5px;margin:12px 0">Responsabilidad por rotura<select name="rotura"><option value="evaluar">Evaluar según causa acreditada</option><option value="empresa">Vidres Sosa: daños imputables</option><option value="preexistentes">Considerar defectos preexistentes</option></select></label>' +
      '<label style="display:grid;gap:5px;margin:12px 0">Daños a elementos existentes<select name="danos"><option value="preexistentes">Riesgos preexistentes informados</option><option value="evaluar">Evaluar según causa acreditada</option><option value="empresa">Vidres Sosa: daños imputables</option></select></label>' +
      '<label style="display:grid;gap:5px;margin:12px 0">Observaciones<textarea name="observaciones" maxlength="1200" rows="3"></textarea></label>' +
      '<p style="font-size:12px">Borrador sujeto a revisión jurídica. La firma no elimina responsabilidades legalmente exigibles.</p>' +
      "<h3>Firmas</h3><p>Puedes revisar el PDF antes de firmar con el dedo o el ratón. Si cambias los datos después de firmar, se borrarán las firmas.</p>" +
      field(
        "Nombre del empleado que firma",
        "empleado",
        window.VSAuth?.user?.nombre,
      ) +
      signaturePad("employee", "Firma del empleado de Vidres Sosa") +
      signaturePad("client", "Firma del cliente") +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button type="button" data-save-letter class="primary">Guardar PDF en expediente</button><button type="button" data-preview-letter>Vista previa PDF</button><button value="cancel">Cancelar</button></div><p data-letter-status role="status"></p></form>';
    // Keep the editor inside the already modal expediente, so iOS Safari does not hide it behind the parent dialog.
    dialog.appendChild(form);
    form.addEventListener("click", (event) => event.stopPropagation());
    const cleanup = () => form.remove();
    form.addEventListener("close", cleanup, { once: true });
    const employeeSignature = bindLetterSignature(
      form.querySelector('[data-signature="employee"]'),
    );
    const clientSignature = bindLetterSignature(
      form.querySelector('[data-signature="client"]'),
    );
    const status = form.querySelector("[data-letter-status]");
    form.addEventListener("input", () => {
      if (!employeeSignature.hasInk() && !clientSignature.hasInk()) return;
      employeeSignature.clear();
      clientSignature.clear();
      status.textContent =
        "Se han borrado las firmas. Revisa los cambios y vuelve a firmar.";
    });
    form.showModal();
    async function generate(save) {
      const fields = new FormData(form.querySelector("form"));
      const cliente = String(fields.get("cliente") || "").trim();
      if (!cliente) return alert("Introduce el cliente.");
      const doc = new jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
      const red = "#d9071b",
        green = "#00aa72",
        darkGreen = "#006044",
        ink = "#202020",
        rule = "#d9dfdc",
        left = 12,
        width = 186,
        right = left + width,
        bottom = 281,
        lineHeight = 3.8;
      const date = new Date().toLocaleDateString("es-ES");
      const work = String(fields.get("trabajo") || "").trim();
      const robot = /robot|grúa|grua|elevador/i.test(work);

      function bodyText() {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(ink);
        doc.setFontSize(9.5);
      }
      const lineOptions = { lineHeightFactor: 1.13 };
      function section(label, y) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(darkGreen);
        doc.setFillColor(red);
        doc.rect(left, y, 1.4, 4, "F");
        doc.text(label, left + 4, y + 3.2);
      }
      function card(x, y, h, label, accent, background) {
        doc.setDrawColor(rule);
        doc.setFillColor(background);
        doc.setLineWidth(0.25);
        doc.roundedRect(x, y, 91, h, 2, 2, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(accent);
        doc.text(label, x + 4, y + 6);
      }

      const brand = window.VSBrandLogo;
      if (brand?.draw) brand.draw(doc, left, 8, 85);
      else {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(17);
        doc.setTextColor(red);
        doc.text("VIDRES", left, 19);
        doc.setTextColor(green);
        doc.text("SOSA", left + 27, 19);
      }
      bodyText();
      doc.text(
        ["Carrer de la Plata, 8", "43006 Tarragona", "www.vidressosa.com"],
        right,
        12,
        { ...lineOptions, align: "right" },
      );
      doc.setFillColor(darkGreen);
      doc.roundedRect(left, 27, width, 22, 2, 2, "F");
      doc.setFillColor(green);
      doc.rect(left + 3, 31, 1.4, 14, "F");
      doc.setTextColor("#ffffff");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      doc.text("Carta de responsabilidad", left + 8, 37);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.text("Aceptación de riesgos", left + 8, 44);

      // Draw the robot icon only for robot / crane interventions.
      if (robot) {
        doc.setDrawColor("#ffffff");
        doc.setLineWidth(0.75);
        doc.roundedRect(170, 41, 17, 4, 1, 1, "S");
        doc.line(174, 41, 179, 32);
        doc.line(179, 32, 189, 36);
        doc.line(189, 36, 189, 41);
        doc.rect(186, 41, 7, 5);
        doc.circle(189, 43.5, 1);
      }

      bodyText();
      const detailCards = [
        {
          x: left,
          title: "DATOS DEL CLIENTE",
          accent: red,
          tint: "#fff5f5",
          lines: [
            "Cliente: " + cliente,
            "Dirección: " + String(fields.get("direccion") || ""),
            "Teléfono: " + String(job.telefono || ""),
          ],
        },
        {
          x: right - 91,
          title: "DATOS DEL TRABAJO",
          accent: darkGreen,
          tint: "#f1f9f5",
          lines: [
            "Expediente: " + job.id,
            "Fecha: " + date,
            "Trabajo: " + work,
          ],
        },
      ].map((item) => ({
        ...item,
        lines: item.lines.flatMap((line) => doc.splitTextToSize(line, 83)),
      }));
      const detailsY = 54;
      const detailsHeight =
        12 +
        lineHeight * Math.max(...detailCards.map((item) => item.lines.length));
      for (const { x, title, accent, tint, lines } of detailCards) {
        card(x, detailsY, detailsHeight, title, accent, tint);
        bodyText();
        doc.text(lines, x + 4, detailsY + 12, lineOptions);
      }

      const rotura = {
        evaluar:
          "En caso de rotura, la responsabilidad se determinará atendiendo a las circunstancias, causas acreditadas y obligaciones legales y contractuales de las partes.",
        empresa:
          "Vidres Sosa responderá de las roturas que legalmente le sean imputables durante la intervención.",
        preexistentes:
          "Se valorarán los defectos preexistentes y las causas acreditadas, sin excluir las responsabilidades legalmente exigibles.",
      };
      const danos = {
        preexistentes:
          "El cliente declara haber sido informado de los riesgos previsibles sobre elementos existentes. Los daños se atribuirán según su causa acreditada. Esta cláusula no exime a Vidres Sosa de negligencias o incumplimientos imputables.",
        evaluar:
          "Los daños a elementos preexistentes se evaluarán según las causas acreditadas y la responsabilidad legal de cada parte.",
        empresa:
          "Vidres Sosa responderá por los daños a elementos existentes que le sean legalmente imputables.",
      };
      const clauses = [
        [
          "1. OBJETO",
          "Este documento establece las condiciones de ejecución, los riesgos previsibles y las responsabilidades correspondientes a los trabajos de " +
            (work || "la intervención indicada") +
            ".",
        ],
        [
          "2. ROTURA DE VIDRIOS",
          rotura[fields.get("rotura")] || rotura.evaluar,
        ],
        [
          "3. DAÑOS A ELEMENTOS PREEXISTENTES",
          danos[fields.get("danos")] || danos.preexistentes,
        ],
        [
          "4. SEGURIDAD",
          "Vidres Sosa podrá suspender o aplazar los trabajos cuando las condiciones de acceso, estabilidad, climatología o seguridad no permitan realizarlos con garantías suficientes.",
        ],
        [
          "5. CONFORMIDAD",
          "Las partes manifiestan haber leído las condiciones descritas, sin renunciar a derechos legalmente irrenunciables ni excluir responsabilidades exigibles.",
        ],
      ];
      let y = detailsY + detailsHeight + 6;
      section("CONDICIONES Y RESPONSABILIDADES", y);
      y += 7;
      for (const [label, content] of clauses) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const labels = doc.splitTextToSize(label, 41);
        bodyText();
        const lines = doc.splitTextToSize(content, 136);
        const height = 4 + lineHeight * Math.max(labels.length, lines.length);
        doc.setDrawColor(rule);
        doc.setLineWidth(0.2);
        doc.line(left, y, right, y);
        doc.setTextColor(darkGreen);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(labels, left + 3, y + 5, lineOptions);
        bodyText();
        doc.text(lines, left + 47, y + 5, lineOptions);
        y += height;
      }
      doc.line(left, y, right, y);
      y += 5;

      const employee = String(fields.get("empleado") || "").trim();
      const signers = [
        {
          x: left,
          label: "POR VIDRES SOSA",
          name: employee || "______________________",
          accent: darkGreen,
          image: employeeSignature.image(),
        },
        {
          x: right - 91,
          label: "POR EL CLIENTE",
          name: cliente,
          accent: red,
          image: clientSignature.image(),
        },
      ].map((signer) => ({
        ...signer,
        nameLines: doc.splitTextToSize("Nombre: " + signer.name, 83),
      }));
      const signatureOffset =
        12 +
        lineHeight *
          Math.max(...signers.map((signer) => signer.nameLines.length));
      const signatureHeight = signatureOffset + 29;
      const observations = String(fields.get("observaciones") || "").trim();
      const observationLines = doc.splitTextToSize(
        observations || "Sin observaciones adicionales.",
        width - 8,
      );
      const observationHeight = (count) => 12 + count * lineHeight;
      const drawObservations = (lines, continued) => {
        section(
          continued ? "OBSERVACIONES (CONTINUACIÓN)" : "OBSERVACIONES",
          y,
        );
        const height = observationHeight(lines.length);
        doc.setFillColor("#f7f9f8");
        doc.roundedRect(left, y + 7, width, height - 7, 1.5, 1.5, "F");
        bodyText();
        doc.text(lines, left + 4, y + 12, lineOptions);
        y += height;
      };
      const addContinuation = () => {
        doc.addPage();
        section("CARTA DE RESPONSABILIDAD", 13);
        bodyText();
        doc.text("Expediente: " + job.id, right, 16.2, { align: "right" });
        y = 25;
      };
      // Keep the signature cards together with the end of the observations.
      let start = 0;
      while (
        y +
          observationHeight(observationLines.length - start) +
          5 +
          signatureHeight >
        bottom
      ) {
        const capacity = Math.floor(
          (bottom - y - observationHeight(0)) / lineHeight,
        );
        const count = Math.min(capacity, observationLines.length - start - 1);
        if (count > 0) {
          drawObservations(
            observationLines.slice(start, start + count),
            start > 0,
          );
          start += count;
        }
        addContinuation();
      }
      drawObservations(observationLines.slice(start), start > 0);
      y += 5;

      for (const { x, label, nameLines, accent, image } of signers) {
        card(x, y, signatureHeight, label, accent, "#ffffff");
        bodyText();
        doc.text(nameLines, x + 4, y + 12, lineOptions);
        doc.text("Firma:", x + 4, y + signatureOffset + 10);
        if (image) {
          doc.addImage(image, "PNG", x + 20, y + signatureOffset, 50, 20);
        }
        doc.setDrawColor(accent);
        doc.line(
          x + 20,
          y + signatureOffset + 20,
          x + 86,
          y + signatureOffset + 20,
        );
        doc.text(
          "Fecha: " + (image ? date : "____ / ____ / ______"),
          x + 4,
          y + signatureOffset + 25,
        );
      }

      const pages = doc.getNumberOfPages();
      for (let page = 1; page <= pages; page++) {
        doc.setPage(page);
        doc.setFillColor(green);
        doc.rect(left, 284, width - 16, 0.65, "F");
        doc.setFillColor(red);
        doc.rect(right - 16, 284, 16, 0.65, "F");
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(ink);
        doc.text("Vidres Sosa", left, 289);
        doc.text(page + " / " + pages, right, 289, { align: "right" });
      }
      const blob = doc.output("blob");
      const filename =
        "Carta-responsabilidad-" +
        String(job.id).replace(/[^a-zA-Z0-9_-]/g, "-") +
        "-" +
        new Date().toISOString().slice(0, 10) +
        ".pdf";
      if (save) {
        status.textContent = "Guardando documento…";
        await storeDocument({
          id: crypto.randomUUID(),
          trabajo: job.id,
          nombre: filename,
          blob,
          fecha: new Date().toISOString(),
          tipo: "responsabilidad",
        });
        status.textContent = "PDF guardado en Documentos vinculados.";
        // Present the generated PDF to the user as soon as saving finishes.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        tab = "documentos";
        form.close();
        await render();
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    }
    form.addEventListener("click", async (e) => {
      const button = e.target.closest("button");
      if (!button) return;
      const save = button.hasAttribute("data-save-letter");
      if (!save && !button.hasAttribute("data-preview-letter")) return;
      button.disabled = true;
      status.textContent = "";
      try {
        await generate(save);
      } catch (error) {
        status.textContent = "No se pudo generar o guardar: " + error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  const date = (v) => (v ? new Date(v).toLocaleString("es-ES") : "—");
  function quoteSummary(jobId) {
    const quotes = window.vidresQuotesForJob(jobId);
    if (!quotes.length) return "";

    return `<h3>Presupuestos</h3>
      ${quotes
        .map(
          (q) => `<article data-exp-quote-summary>
            <h4>Presupuesto ${esc(q.id)}</h4>
            <ul>${q.descriptions.map((description) => `<li>${esc(description)}</li>`).join("")}</ul>
            <p>Total sin IVA · <strong>${money(q.base)}</strong><br>
            Total con IVA · <strong>${money(q.total)}</strong></p>
          </article>`,
        )
        .join("")}`;
  }

  async function render() {
    clearSheet();
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
    window.VSOperations?.unmount();
    tabs.forEach((button) => {
      const selected = button.dataset.expTab === tab;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-selected", String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected) body.setAttribute("aria-labelledby", button.id);
    });
    const measures = (window.vidresGetMeasurements?.() || []).filter(
      (m) => m.trabajo === current,
    );
    const detail =
      '<div class="exp-details"><div><button type="button" class="exp-status-trigger" data-exp-status-open aria-expanded="false" aria-controls="exp-status-editor"><small>Estado ▾</small><strong class="' +
      (j.estado === "Crítico" ? "critical-heading" : "") +
      '">' +
      esc(VSUtils.jobStatusLabel(j.estado)) +
      "</strong></button>" +
      '<div id="exp-status-editor" hidden><label for="exp-status">Nuevo estado</label><select id="exp-status">' +
      [...document.querySelectorAll('#form [name="estado"] option')]
        .map(
          (option) =>
            '<option value="' +
            esc(option.value) +
            '"' +
            (option.value === j.estado ? " selected" : "") +
            ">" +
            esc(option.textContent) +
            "</option>",
        )
        .join("") +
      '</select><button type="button" data-exp-status-save>Cambiar estado</button><p data-exp-status-message role="status" aria-live="polite"></p></div>' +
      "</div><div><small>Responsable</small><strong>" +
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
    if (tab === "gestion") {
      body.replaceChildren();
      window.VSOperations.mount(body, j.id);
      return;
    }
    if (tab === "resumen") {
      body.innerHTML =
        VSMilestones.badges(j) +
        detail +
        '<div class="exp-two"><section class="exp-section"><h3>Descripción del trabajo</h3><p>' +
        esc(j.descripcion) +
        "</p>" +
        quoteSummary(j.id) +
        "<h3>Dirección</h3><p>" +
        esc(j.direccion || "No indicada") +
        "</p><h3>Población</h3><p>" +
        esc(j.poblacion || "No indicada") +
        "</p>" +
        (j.direccion || j.poblacion
          ? '<a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=' +
            encodeURIComponent(
              [j.direccion, j.poblacion].filter(Boolean).join(", "),
            ) +
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
      const telefono = j.telefono || client?.telefono;
      if (telefono) {
        let tel = String(telefono).replace(/[^+0-9]/g, "");
        let wa = tel.replace(/^\+|^00/, "");
        if (/^\d{9}$/.test(wa)) wa = "34" + wa;
        body.insertAdjacentHTML(
          "beforeend",
          '<section class="exp-section"><h3>Contacto</h3><p>' +
            esc(telefono) +
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
                  VSUtils.formatMeters(m.ancho) +
                  " × " +
                  VSUtils.formatMeters(m.alto) +
                  " m · " +
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
        '<section class="exp-section"><div class="exp-section-head"><h3>Documentos vinculados</h3><button type="button" data-exp-new-letter class="primary">+ Carta de responsabilidad</button><label class="exp-upload">+ Añadir documento<input id="exp-doc-files" type="file" accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,application/pdf" multiple hidden></label></div><p class="muted">Documentos privados compartidos entre dispositivos e incluidos en la copia completa. Máximo 8 MB por archivo.</p><div id="exp-doc-list">Cargando documentos…</div></section>';
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
                  esc(VSUtils.jobStatusLabel(h.de || "Nuevo")) +
                  " → " +
                  esc(VSUtils.jobStatusLabel(h.a)) +
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
  function showTab(section) {
    tab = section;
    body.scrollTop = 0;
    return render();
  }
  function open(id) {
    current = id;
    showTab("resumen");
    dialog.showModal();
    tabs[0].parentElement.scrollLeft = 0;
  }
  dialog.querySelector(".exp-tabs").addEventListener("keydown", (event) => {
    const index = tabs.indexOf(event.target);
    if (index === -1) return;
    let next;
    switch (event.key) {
      case "ArrowLeft":
        next = (index + tabs.length - 1) % tabs.length;
        break;
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });
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
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-text-scale]");
    if (b) changeScale(Number(b.dataset.textScale));
  });

  // Keep page gestures available only when they start on a photo or the notebook.
  // Do not restrict the viewport: the permitted surfaces need native pinch zoom.
  const zoomSurface =
    ".measure-photo-viewer img, .sketch-sheet, .sketch-sheet *";
  let allowPinch = false;
  document.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1)
        allowPinch = Boolean(e.target.closest(zoomSurface));
      if (e.touches.length > 1 && !allowPinch) e.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length > 1 && !allowPinch) e.preventDefault();
    },
    { passive: false },
  );
  for (const type of ["gesturestart", "gesturechange"]) {
    document.addEventListener(
      type,
      (e) => {
        if (!e.target.closest(zoomSurface)) e.preventDefault();
      },
      { passive: false },
    );
  }
  dialog.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (
      b.id === "exp-responsabilidad" ||
      b.hasAttribute("data-exp-new-letter")
    ) {
      await createResponsibilityLetter();
    } else if (b.hasAttribute("data-exp-sheet")) {
      showSheet();
    } else if (b.hasAttribute("data-exp-status-open")) {
      const editor = body.querySelector("#exp-status-editor");
      editor.hidden = !editor.hidden;
      b.setAttribute("aria-expanded", String(!editor.hidden));
      if (!editor.hidden) body.querySelector("#exp-status").focus();
    } else if (b.hasAttribute("data-exp-status-save")) {
      const jobId = current;
      const select = body.querySelector("#exp-status");
      const message = body.querySelector("[data-exp-status-message]");
      if (select.value === getJob()?.estado) {
        message.textContent = "El expediente ya tiene este estado.";
        return;
      }
      b.disabled = select.disabled = true;
      message.textContent = "Guardando estado…";
      try {
        await window.vidresChangeJobStatus(jobId, select.value);
        window.vidresReloadData();
        if (current === jobId && dialog.open) {
          await render();
          const message = body.querySelector("[data-exp-status-message]");
          message.closest("#exp-status-editor").hidden = false;
          body
            .querySelector("[data-exp-status-open]")
            .setAttribute("aria-expanded", "true");
          message.textContent = "Estado guardado.";
        }
      } catch (error) {
        message.textContent = "No se pudo guardar el estado: " + error.message;
      } finally {
        b.disabled = select.disabled = false;
      }
    } else if (b.hasAttribute("data-exp-view-photos")) {
      await showTab("fotos");
    } else if (b.dataset.expTab) {
      await showTab(b.dataset.expTab);
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
