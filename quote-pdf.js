"use strict";
(() => {
  let currentUrl = null;
  // Read the document's selected fields rather than the private quote record.
  function textOf(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    clone.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
    clone.querySelectorAll("img").forEach((img) => img.remove());
    clone.querySelectorAll("h2, div, p").forEach((el) => {
      el.prepend("\n");
      el.append("\n");
    });
    return clone.textContent.trim();
  }
  function build(host) {
    const doc = new jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
    const margin = 14,
      width = 182,
      bottom = 278;
    // Accent colors match the vector logo.
    const green = [0, 170, 114],
      red = [217, 7, 27],
      darkGreen = [19, 78, 59],
      ink = [33, 47, 42],
      muted = [79, 99, 91],
      paleGreen = [237, 247, 242],
      rule = [216, 229, 222];
    let y = 45;
    doc.setProperties({ title: "Presupuesto · Vidres Sosa" });
    const logo = host.querySelector(".quote-doc-logo");
    if (logo?.dataset.vectorLogo === "true") {
      VSBrandLogo.draw(doc, margin, 15, 85);
    } else if (logo) {
      const p = doc.getImageProperties(logo.src);
      const scale = Math.min(85 / p.width, 16 / p.height);
      doc.addImage(logo.src, margin, 15, p.width * scale, p.height * scale);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      doc.setTextColor(...darkGreen);
      doc.text(
        textOf(host.querySelector(".quote-doc-company strong")),
        margin,
        21,
      );
    }
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...darkGreen);
    doc.setFontSize(23);
    doc.text("PRESUPUESTO", 196, 23, { align: "right" });
    doc.setFontSize(10);
    doc.setTextColor(...red);
    doc.text(textOf(host.querySelector(".quote-doc-reference")), 196, 30, {
      align: "right",
    });
    doc.setFillColor(...green);
    doc.rect(margin, 36, width - 16, 1.2, "F");
    doc.setFillColor(...red);
    doc.rect(196 - 16, 36, 16, 1.2, "F");
    const internal = host.querySelector(".quote-doc-internal");
    if (internal) {
      doc.setFontSize(10);
      doc.setTextColor(...red);
      doc.text(textOf(internal), margin, y);
      y += 6;
    }
    const table = ({ styles, ...options }) => {
      doc.autoTable({
        startY: y,
        margin: { left: margin, right: margin, top: 14, bottom: 19 },
        theme: "striped",
        styles: {
          font: "helvetica",
          fontSize: 10,
          cellPadding: 3.5,
          overflow: "linebreak",
          textColor: ink,
          lineWidth: { bottom: 0.2 },
          lineColor: rule,
          valign: "middle",
          ...styles,
        },
        headStyles: { fillColor: darkGreen, textColor: 255 },
        alternateRowStyles: { fillColor: paleGreen },
        ...options,
      });
      y = doc.lastAutoTable.finalY + 5;
    };
    const paragraph = (text, bold = false) => {
      if (!text) return;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(10);
      doc.setTextColor(...(bold ? darkGreen : ink));
      for (const line of doc.splitTextToSize(text, width)) {
        if (y + 5 > bottom) {
          doc.addPage();
          y = 18;
        }
        doc.text(line, margin, y);
        y += 4.5;
      }
      y += 3;
    };
    const client = host.querySelector(".quote-doc-client");
    const clientDetails = client.cloneNode(true);
    clientDetails.querySelector("h2")?.remove();
    table({
      theme: "plain",
      head: [["EMPRESA", textOf(client.querySelector("h2"))]],
      body: [
        [
          textOf(host.querySelector(".quote-doc-company")),
          textOf(clientDetails),
        ],
      ],
      headStyles: {
        fillColor: paleGreen,
        textColor: darkGreen,
        fontSize: 9,
        cellPadding: { top: 3, bottom: 1, left: 4, right: 4 },
      },
      bodyStyles: { fillColor: paleGreen, valign: "top", cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 91 }, 1: { cellWidth: 91 } },
    });
    const dates = [...host.querySelectorAll(".quote-doc-dates p")];
    if (dates.length) {
      table({
        theme: "plain",
        styles: { cellPadding: { top: 2, bottom: 3, left: 4, right: 4 } },
        body: [dates.map(textOf)],
        bodyStyles: { textColor: muted, fontSize: 9 },
      });
    }
    for (const costs of host.querySelectorAll(".quote-glass-cost")) {
      table({
        head: [
          [{ content: textOf(costs.caption), colSpan: 3 }],
          [...costs.tHead.rows[0].cells].map(textOf),
        ],
        body: [...costs.tBodies[0].rows].map((row) =>
          [...row.cells].map(textOf),
        ),
        styles: {
          fontSize: 9,
          cellPadding: { top: 1.1, bottom: 1.1, left: 2, right: 2 },
        },
        rowPageBreak: "avoid",
        columnStyles: {
          0: { cellWidth: 102 },
          1: { cellWidth: 40, halign: "right" },
          2: { cellWidth: 40, halign: "right" },
        },
        didParseCell({ cell, column, row, section }) {
          if (section === "head" && row.index === 1 && column.index > 0)
            cell.styles.halign = "right";
          if (
            section === "body" &&
            costs.tBodies[0].rows[row.index].classList.contains(
              "quote-cost-subtotal",
            )
          )
            cell.styles.fontStyle = "bold";
        },
      });
    }
    paragraph(textOf(host.querySelector(".quote-cost-rounding")));
    const items = host.querySelector(".quote-doc-items");
    const headers = [...items.querySelectorAll("thead th")].map(textOf);
    const rows = [...items.querySelectorAll("tbody tr")];
    const pictures = new Map();
    rows.forEach((row, index) => {
      const img = row.querySelector(".quote-aluminum-drawing");
      if (img) {
        const p = doc.getImageProperties(img.src);
        const scale = Math.min(52 / p.width, 40 / p.height);
        pictures.set(index, {
          src: img.src,
          w: p.width * scale,
          h: p.height * scale,
        });
      }
    });
    table({
      head: [headers],
      body: rows.map((row) => [...row.cells].map(textOf)),
      rowPageBreak: "avoid",
      styles: internal ? { cellPadding: 2.5 } : undefined,
      columnStyles: { 0: { cellWidth: headers.length === 2 ? 140 : "auto" } },
      didParseCell(data) {
        if (data.column.index > 0) data.cell.styles.halign = "right";
        if (data.column.index === headers.length - 1) {
          data.cell.styles.minCellWidth = 26;
          data.cell.styles.fontStyle = "bold";
        }
        if (
          data.section === "body" &&
          data.column.index === 0 &&
          pictures.has(data.row.index)
        ) {
          const img = pictures.get(data.row.index);
          data.cell.styles.cellPadding = {
            top: img.h + 6,
            bottom: 3,
            left: 3,
            right: 3,
          };
        }
      },
      didDrawCell(data) {
        if (
          data.section === "body" &&
          data.column.index === 0 &&
          pictures.has(data.row.index)
        ) {
          const img = pictures.get(data.row.index);
          doc.addImage(
            img.src,
            "JPEG",
            data.cell.x + 3,
            data.cell.y + 3,
            img.w,
            img.h,
          );
        }
      },
    });
    host.querySelectorAll(".quote-doc-notes").forEach((section) => {
      paragraph(textOf(section.querySelector("h2")), true);
      paragraph(textOf(section.querySelector("p")));
    });
    for (const internalCost of [...host.children].filter(
      (el) => el.tagName === "P",
    ))
      paragraph(textOf(internalCost));
    const summary = [...host.querySelectorAll(".quote-doc-summary span")];
    paragraph(summary.map(textOf).join("   ·   "));
    const totals = host.querySelector(".quote-doc-totals");
    table({
      head: [[...totals.querySelectorAll("thead th")].map(textOf)],
      body: [[...totals.querySelectorAll("tbody td")].map(textOf)],
      pageBreak: "avoid",
      styles: {
        fontSize: 10,
        cellPadding: 4,
        fontStyle: "bold",
        halign: "right",
      },
      columnStyles: {
        0: { cellWidth: 53 },
        1: { cellWidth: 53 },
        2: { cellWidth: 76 },
      },
      headStyles: { fillColor: paleGreen, textColor: darkGreen },
      bodyStyles: { fillColor: paleGreen, fontSize: 13 },
      alternateRowStyles: { fillColor: paleGreen },
      didParseCell({ cell, column, section }) {
        if (column.index !== 2) return;
        cell.styles.fillColor = section === "head" ? darkGreen : paleGreen;
        cell.styles.textColor = section === "head" ? 255 : darkGreen;
        if (section === "body") cell.styles.fontSize = 19;
      },
    });
    paragraph(textOf(host.querySelector(".quote-doc-footer > p")));
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.setDrawColor(...rule);
      doc.setLineWidth(0.25);
      doc.line(margin, 283, 196, 283);
      doc.text("VIDRES SOSA", margin, 289);
      doc.text(`Página ${i} / ${pages}`, 196, 289, { align: "right" });
    }
    return { blob: doc.output("blob"), pages };
  }
  function show(host, filename) {
    const { blob, pages } = build(host);
    const file = new File([blob], filename, { type: "application/pdf" });
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = URL.createObjectURL(blob);
    let panel = document.querySelector("#quote-pdf-result");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "quote-pdf-result";
      panel.className = "quote-pdf-result";
      document
        .querySelector(".quote-editor, .quick-quote-editor")
        .appendChild(panel);
    }
    panel.replaceChildren();
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.textContent = `${host.querySelector(".quote-doc-internal") ? "PDF interno preparado · No entregar al cliente" : "PDF preparado"} · ${pages} ${pages === 1 ? "página" : "páginas"}. Abre el documento para revisarlo o guárdalo en tu dispositivo.`;
    const open = document.createElement("a");
    open.textContent = "Abrir PDF";
    open.href = currentUrl;
    open.target = "_blank";
    open.rel = "noopener";
    const save = document.createElement("a");
    save.textContent = "Guardar PDF";
    save.href = currentUrl;
    save.download = filename;
    panel.append(status, open, save);
    status.textContent +=
      " Para enviarlo como archivo adjunto, pulsa Compartir PDF y elige la aplicación.";
    panel.insertBefore(VSSharePDF(file, save, status), open);
    panel.scrollIntoView({ block: "nearest" });
    window.dispatchEvent(
      new CustomEvent("vidres-pdf-ready", {
        detail: { blob, filename, pages },
      }),
    );
  }
  function invalidate() {
    document.querySelector("#quote-pdf-result")?.remove();
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  for (const name of ["input", "change"])
    document.addEventListener(name, (e) => {
      if (e.target.closest(".quote-editor, .quick-quote-editor")) invalidate();
    });
  window.addEventListener("vidres-data-restored", invalidate);
  function create(host, filename) {
    return new File([build(host).blob], filename, { type: "application/pdf" });
  }
  window.VSQuotePDF = { show, create };
})();
