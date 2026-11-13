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
    let y = 16;
    doc.setProperties({ title: "Presupuesto · Vidres Sosa" });
    const logo = host.querySelector(".quote-doc-logo");
    if (logo?.dataset.vectorLogo === "true") {
      VSBrandLogo.draw(doc, margin, 12, 85);
    } else if (logo) {
      const p = doc.getImageProperties(logo.src);
      const scale = Math.min(60 / p.width, 15 / p.height);
      doc.addImage(logo.src, margin, 12, p.width * scale, p.height * scale);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(19);
      doc.setTextColor(21, 82, 62);
      doc.text(
        textOf(host.querySelector(".quote-doc-company strong")),
        margin,
        21,
      );
    }
    doc.setFont("helvetica", "bold");
    doc.setTextColor(21, 82, 62);
    doc.setFontSize(16);
    doc.text("PRESUPUESTO", 118, 19);
    doc.setFontSize(9);
    doc.setTextColor(35, 45, 40);
    doc.text(textOf(host.querySelector(".quote-doc-reference")), 118, 25);
    y = 32;
    const internal = host.querySelector(".quote-doc-internal");
    if (internal) {
      doc.setFontSize(10);
      doc.setTextColor(150, 35, 35);
      doc.text(textOf(internal), margin, y);
      y += 6;
    }
    const table = (options) => {
      doc.autoTable({
        startY: y,
        margin: { left: margin, right: margin, top: 14, bottom: 19 },
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 9,
          cellPadding: 3,
          overflow: "linebreak",
          textColor: [35, 45, 40],
        },
        headStyles: { fillColor: [21, 82, 62], textColor: 255 },
        ...options,
      });
      y = doc.lastAutoTable.finalY + 5;
    };
    const paragraph = (text, bold = false) => {
      if (!text) return;
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(9);
      doc.setTextColor(35, 45, 40);
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
    table({
      theme: "plain",
      body: [
        [
          textOf(host.querySelector(".quote-doc-company")),
          textOf(host.querySelector(".quote-doc-client")),
        ],
      ],
      columnStyles: { 0: { cellWidth: 91 }, 1: { cellWidth: 91 } },
    });
    host
      .querySelectorAll(".quote-doc-dates p")
      .forEach((p) => paragraph(textOf(p)));
    const items = host.querySelector(".quote-doc-items");
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
      head: [[...items.querySelectorAll("thead th")].map(textOf)],
      body: rows.map((row) => [...row.cells].map(textOf)),
      rowPageBreak: "avoid",
      columnStyles: {
        0: {
          cellWidth:
            items.querySelectorAll("thead th").length === 2
              ? 140
              : internal
                ? 97
                : 77,
        },
      },
      didParseCell(data) {
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
    const internalCost = [...host.children].find((el) => el.tagName === "P");
    paragraph(textOf(internalCost));
    host
      .querySelectorAll(".quote-doc-summary span")
      .forEach((el) => paragraph(textOf(el)));
    const totals = host.querySelector(".quote-doc-totals");
    table({
      head: [[...totals.querySelectorAll("thead th")].map(textOf)],
      body: [[...totals.querySelectorAll("tbody td")].map(textOf)],
      styles: { fontSize: 10, cellPadding: 3, fontStyle: "bold" },
    });
    paragraph(textOf(host.querySelector(".quote-doc-footer > p")));
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
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
    let canShare = false;
    try {
      canShare = Boolean(
        navigator.share && navigator.canShare?.({ files: [file] }),
      );
    } catch {}
    if (canShare) {
      const share = document.createElement("button");
      share.type = "button";
      share.textContent = "Compartir PDF";
      share.addEventListener("click", async () => {
        try {
          await navigator.share({ files: [file], title: "Presupuesto" });
        } catch (error) {
          if (error.name !== "AbortError")
            status.textContent =
              "No se pudo compartir. Usa Abrir PDF o Guardar PDF.";
        }
      });
      panel.append(share);
    }
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
  window.VSQuotePDF = { show };
})();
