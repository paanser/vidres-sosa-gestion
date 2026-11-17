"use strict";
(() => {
  // Misma silueta de Vidres Sosa que utiliza el bloc de croquis.
  const logoPath = [
    { op: "m", c: [155.0, 0.0] },
    { op: "l", c: [171.0, 32.0] },
    { op: "l", c: [87.0, 233.0] },
    { op: "c", c: [80.0, 184.0, 56.0, 148.0, 0.0, 126.0] },
    { op: "c", c: [35.0, 115.0, 65.0, 128.0, 93.0, 154.0] },
    { op: "h", c: [] },
    { op: "m", c: [199.0, 89.0] },
    { op: "l", c: [299.0, 89.0] },
    { op: "l", c: [273.0, 115.0] },
    { op: "l", c: [191.0, 115.0] },
    { op: "c", c: [178.0, 115.0, 169.0, 120.0, 169.0, 131.0] },
    { op: "c", c: [169.0, 143.0, 180.0, 148.0, 194.0, 148.0] },
    { op: "l", c: [243.0, 148.0] },
    { op: "c", c: [277.0, 148.0, 298.0, 163.0, 298.0, 191.0] },
    { op: "c", c: [298.0, 218.0, 276.0, 233.0, 243.0, 233.0] },
    { op: "l", c: [137.0, 233.0] },
    { op: "l", c: [160.0, 206.0] },
    { op: "l", c: [244.0, 206.0] },
    { op: "c", c: [258.0, 206.0, 266.0, 201.0, 266.0, 191.0] },
    { op: "c", c: [266.0, 181.0, 257.0, 174.0, 243.0, 174.0] },
    { op: "l", c: [193.0, 174.0] },
    { op: "c", c: [159.0, 174.0, 137.0, 160.0, 137.0, 134.0] },
    { op: "c", c: [137.0, 107.0, 160.0, 89.0, 199.0, 89.0] },
    { op: "h", c: [] },
  ];
  // Vector lines stay visible even when printing without background graphics.
  function build(job, client = {}, company = {}, measurements = []) {
    const doc = new jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
    const left = 15,
      width = 180,
      bottom = 280;
    let y;
    const text = (value) => String(value || "").replace(/\t/g, " ");
    function header(continued = false) {
      doc.setTextColor(30);
      doc.setFont("helvetica", "bold");
      const brand =
        typeof module !== "undefined" && module.exports
          ? require("./brand-logo.js")
          : window.VSBrandLogo;
      brand.draw(doc, left, 12, 85);
      doc.setFontSize(11);
      doc.text("HOJA DE VISITA", left + width, 19, { align: "right" });
      if (continued) {
        doc.setFontSize(9);
        doc.text("Continuación", left + width, 25, { align: "right" });
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const lines = doc.splitTextToSize("Expediente: " + text(job.id), width);
      doc.text(lines, left, 33);
      y = 36 + lines.length * 4.5;
      doc.setDrawColor(100);
      doc.setLineWidth(0.25);
      doc.line(left, y, left + width, y);
      y += 7;
    }
    function next() {
      doc.addPage();
      header(true);
    }
    function field(label, value) {
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(
        label + ": " + (text(value) || "—"),
        width,
      );
      for (const line of lines) {
        if (y > bottom - 5) next();
        doc.text(line, left, y);
        y += 4.7;
      }
      y += 2;
    }
    doc.setProperties({ title: "Hoja de visita · " + text(job.id) });
    header();
    field("Cliente", job.cliente || client.nombre);
    field("Teléfono", job.telefono || client.telefono);
    field("Dirección", job.direccion || client.direccion);
    field("Población", job.poblacion || client.poblacion);
    const planned = /^\d{4}-\d{2}-\d{2}$/.test(job.fecha || "")
      ? job.fecha.split("-").reverse().join("/")
      : job.fecha;
    field("Cita prevista", [planned, job.hora].filter(Boolean).join(" · "));
    field("Responsable", job.responsable);
    y += 2;
    field("Trabajo a realizar", job.descripcion);
    if (text(job.notas).trim()) field("Observaciones", job.notas);
    // Keep at least 12 cm of uninterrupted grid for measurements and sketches.
    if (bottom - y < 142) next();
    function grid() {
      y += 2;
      doc.text(
        "Fecha visita: ____ / ____ / ______    Operario: __________________________",
        left,
        y,
      );
      y += 8;
      doc.setFont("helvetica", "bold");
      doc.text("MEDIDAS, CROQUIS Y ANOTACIONES", left, y);
      doc.setFont("helvetica", "normal");
      y += 5;
      const height = Math.floor((bottom - y) / 5) * 5;
      const scale = Math.min(100 / 299, (height - 10) / 233);
      const logoX = left + (width - 299 * scale) / 2;
      const logoY = y + (height - 233 * scale) / 2;
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.06 }));
      doc.setFillColor(100);
      doc.path(
        logoPath.map(({ op, c }) => ({
          op,
          c: c.map((v, i) => v * scale + (i % 2 ? logoY : logoX)),
        })),
      );
      doc.fill();
      doc.restoreGraphicsState();
      doc.setDrawColor(190);
      doc.setLineWidth(0.1);
      for (let x = left; x <= left + width; x += 5)
        doc.line(x, y, x, y + height);
      for (let row = 0; row <= height; row += 5)
        doc.line(left, y + row, left + width, y + row);
      doc.setDrawColor(100);
      doc.setLineWidth(0.25);
      doc.rect(left, y, width, height);
      return { top: y, height };
    }
    let area = grid();
    let cursor = area.top + 6;
    function continueGrid() {
      next();
      area = grid();
      cursor = area.top + 6;
    }
    function writeLines(value, bold = false) {
      doc.setFont("helvetica", bold ? "bold" : "normal");
      doc.setFontSize(10);
      doc.setTextColor(30);
      for (const line of doc.splitTextToSize(text(value), width - 10)) {
        if (cursor + 2 > area.top + area.height - 4) continueGrid();
        doc.text(line, left + 5, cursor);
        cursor += 5;
      }
    }
    measurements.forEach((piece, index) => {
      if (cursor + 15 > area.top + area.height - 4) continueGrid();
      writeLines(`Pieza ${index + 1}`, true);
      const details = [
        piece.ancho != null && piece.ancho !== ""
          ? `Ancho: ${piece.ancho} cm`
          : "",
        piece.alto != null && piece.alto !== "" ? `Alto: ${piece.alto} cm` : "",
        piece.cantidad ? `Cantidad: ${piece.cantidad}` : "",
        piece.tipo,
        piece.espesor ? `Espesor: ${piece.espesor} mm` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      if (details) writeLines(details);
      if (piece.observaciones) writeLines(piece.observaciones);
      const sketch = piece.croquis;
      if (sketch?.strokes?.length || sketch?.dims?.length) {
        const image = window.vidresSketch.preview(sketch);
        const size = doc.getImageProperties(image);
        // Keep each drawing proportional and together on a gridded page.
        let imageWidth = width - 10;
        let imageHeight = (imageWidth * size.height) / size.width;
        if (imageHeight > area.height - 12) {
          imageHeight = area.height - 12;
          imageWidth = (imageHeight * size.width) / size.height;
        }
        if (cursor + imageHeight > area.top + area.height - 4) continueGrid();
        doc.addImage(
          image,
          "PNG",
          left + (width - imageWidth) / 2,
          cursor,
          imageWidth,
          imageHeight,
        );
        cursor += imageHeight + 5;
      }
      if (sketch?.notes?.trim()) writeLines(sketch.notes);
      cursor += 4;
    });
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      doc.setPage(page);
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text("Hoja de visita · " + page + " / " + pages, left, 289);
    }
    return doc;
  }
  if (typeof module !== "undefined" && module.exports)
    module.exports = { build };
  else window.VSJobSheetPDF = { build };
})();
