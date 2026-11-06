"use strict";
(() => {
  const key = "vs-tariffs-prototype-v1";
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLocaleLowerCase("es");
  function merge(current, items) {
    const result = [],
      index = new Map();
    for (const item of [...current, ...items]) {
      const name = norm(item.name);
      if (!name) continue;
      if (index.has(name)) {
        const i = index.get(name);
        result[i] = { ...result[i], ...item, id: result[i].id };
      } else {
        index.set(name, result.length);
        result.push({ ...item });
      }
    }
    return result;
  }
  // Net glass prices transcribed from pages 1–4. A dash is unavailable, never zero.
  const reuglassRows = [
    ["Float 3", 23.1, null, null],
    ["Float 4", 16.72, null, 29.95],
    ["Float 5", 17.96, 8.98, 31.86],
    ["Float 6", 21.51, 10.75, 36.92],
    ["Float 8", 31.08, 47.09, 48.77],
    ["Float 10", 39.52, 59.88, 60.58],
    ["Float 12", 60.31, 91.37, 100.63],
    ["Float 15", 77.85, 117.95, 158.0],
    ["Float 19", 151.31, null, 291.0],
    ["Mate ácido 4", 28.39, 17.55, 57.87],
    ["Mate ácido 5", 30.15, 18.64, 61.5],
    ["Mate ácido 6", 35.26, 21.8, 70.0],
    ["Mate ácido 8", 46.13, 37.74, 97.0],
    ["Mate ácido 10", 56.01, 45.82, 115.0],
    ["Novomat 5", 60.96, 60.96, null],
    ["Carglass new 4mm", 23.76, 22.7, 43.8],
    ["Carglass incoloro 4mm", 21.78, 20.57, 43.8],
    ["Carglass incoloro 6mm", 31.68, 29.92, 61.0],
    ["Carglass armado incoloro 6", 48.4, null, null],
    ["Baldosilla armada 6mm", 70.0, null, null],
    ["Catedral incoloro", 37.5, null, null],
    ["Catedral Armado", 57.5, 57.5, null],
    ["Flutes 4", 48.37, 48.37, null],
    ["FL 6", 62.94, 62.94, 86.94],
    ["FL 8", 107.78, 107.78, 139.78],
    ["FR 6", 89.18, 89.18, 113.18],
    ["FR 8", 111.3, 111.3, 143.3],
    ["Plata incolora 3", 23.63, null, null],
    ["Plata incolora 4", 26.89, null, null],
    ["Plata incolora 5", 32.58, null, null],
    ["Plata incolora 6", 58.24, null, null],
    ["Plata Gris / Bronce 5", 56.06, null, null],
    ["Plata Mateada 5", 67.52, null, null],
    ["Plata Optica 5", 87.34, null, null],
    ["SNX60 6", null, 46.4, null],
    ["SNX60 44.1", null, 62.03, null],
    ["SNX60 66.1", null, 77.05, null],
    ["SN 70/35 6", null, 30.9, null],
    ["SN 70/35 44.1", null, 43.45, null],
    ["SN 70/35 66.1", null, 60.63, null],
    ["Guardian Sun 4", null, 12.49, null],
    ["Guardian Sun 6", null, 20.18, null],
    ["Guardian Sun 44.1", null, 33.33, null],
    ["Guardian Sun 44.2 P2A", null, 53.88, null],
    ["Guardian Sun 44.2 Acustico P2A", null, 58.86, null],
    ["Guardian Sun 66.1", null, 67.09, null],
    ["WINN 54/31 6", null, 48.01, 94.01],
    ["WINN 54/31 8", null, 81.54, 123.54],
    ["WINN 54/31 44.1", null, 56.19, null],
    ["Climaguard Premium 4", null, 9.44, null],
    ["Climaguard Premium 6", null, 14.89, null],
    ["Climaguard Premium 33.1", null, 30.79, null],
    ["Climaguard Premium 44.1", null, 31.44, null],
    ["Climaguard Premium 44.2 P2A", null, 53.95, null],
    ["Climaguard Premium 44.2 Acustico P2A", null, 59.25, null],
    ["Climaguard Premium 66.1", null, 69.07, null],
    ["Sunguard Royal Blue 20 6", null, 79.52, 83.12],
    ["Sunguard Grey 6", null, 64.36, 70.72],
    ["Sunguard Silver Clear 20 6", null, 66.62, 78.67],
    ["Stopsol Classic Incoloro 5", 40.1, 40.1, 62.11],
    ["Stopsol Classic Incoloro 6", 60.84, 60.84, 79.82],
    ["Stopsol Classic Gris / Bronce 6", 91.65, 91.65, 102.0],
    ["Stopsol Supersilver Incoloro 6", 71.82, 71.82, 79.82],
    ["Stopsol Supersilver Gris / Bronce 6", 91.65, 91.65, 102.0],
    ["Laminado Stopsol Classic 55.1", 133.37, 133.37, null],
    ["Laminado Stopsol Supersilver Gris 66.1", 163.3, 163.3, null],
    ["Laminado 33.1", 26.41, 20.07, null],
    ["Laminado 44.1", 33.14, 25.19, 120.0],
    ["Laminado 55.1", 38.32, 29.12, 150.0],
    ["Laminado 66.1", 44.68, 34.85, 180.0],
    ["Laminado 88.2", 57.95, 52.16, 240.0],
    ["Laminado 33.2", 30.63, 27.03, null],
    ["Laminado 44.2", 36.68, 32.36, null],
    ["Laminado 55.2", 42.94, 37.89, null],
    ["Laminado 66.2", 50.17, 44.26, null],
    ["Laminado 1010.2", 76.44, 68.8, 280.0],
    ["Laminado 1212.2", 96.78, null, 300.0],
    ["Laminado 22.1 mate", 56.78, 51.21, null],
    ["Laminado 33.1 mate", 41.89, 33.16, null],
    ["Laminado 44.1 mate", 49.48, 39.17, 140.0],
    ["Laminado 55.1 mate", 57.67, 52.86, 170.0],
    ["Laminado 66.1 mate", 65.83, 60.35, 200.0],
    ["Laminado 88.2 mate", 95.68, 82.55, 280.0],
    ["Laminado 1010.2 mate", 120.83, 104.24, 310.0],
    ["Laminado 33.1 acústico", 40.07, 31.87, null],
    ["Laminado 44.1 acústico", 45.47, 36.17, null],
    ["Laminado 44.2 acústico P2A", 81.82, 76.48, null],
    ["Laminado 55.1 acústico", 56.02, 57.42, null],
    ["Laminado 55.2 acústico P2A", 87.43, 81.73, null],
    ["Laminado 66.1 acústico", 67.74, 63.12, null],
    ["Laminado 66.2 acústico P2A", 95.42, 89.2, null],
    ["Laminado 88.1 acústico", 115.08, 107.57, null],
    ["Laminado 33.1 color", 47.4, 47.4, null],
    ["Laminado 44.1 color", 56.53, 56.53, 140.0],
    ["Laminado 55.1 color", 66.38, 66.38, 170.0],
    ["Laminado 66.1 color", 76.2, 76.2, 200.0],
    ["Laminado 44.1 mate gris", 172.68, 172.68, null],
    ["Laminado Polar White 33.1", 155.23, 155.23, null],
    ["Laminado Polar White 55.1", 258.02, 258.02, null],
    ["Laminado Espejo Espia 44.1", 165.0, 165.0, null],
    ["Laminado 44.4 P4A", 67.83, 67.83, null],
    ["Laminado 44.6 P5A", 81.14, 81.14, null],
    ["Laminado 66.4 P4A", 87.17, 87.17, null],
    ["Laminado 66.6 P5A", 100.25, 100.25, null],
    ["Laminado 66.8 P6B", 115.14, 115.14, null],
    ["Laminado 666.2", 139.3, 139.3, null],
    ["Laminado 36663.4 (BR2-S)", 296.66, 296.66, null],
    ["Extraclaro 4", 37.91, 37.91, 46.0],
    ["Extraclaro 5", 48.58, 48.58, 57.3],
    ["Extraclaro 6", 56.88, 56.88, 68.51],
    ["Extraclaro 8", 77.44, 77.44, 93.3],
    ["Extraclaro 10", 103.22, 103.22, 119.0],
    ["Extraclaro 12", 136.28, 136.28, 161.3],
    ["Extraclaro 15", 279.71, 279.71, 343.0],
    ["Parsol Gris / Bronce 4", 34.52, 34.52, 46.81],
    ["Parsol Gris / Bronce 5", 43.72, 43.72, 58.21],
    ["Parsol Gris / Bronce 6", 52.35, 52.35, 69.62],
    ["Parsol Gris / Bronce 8", 70.21, 70.21, 109.58],
    ["Parsol Gris / Bronce 10", 89.81, 89.81, 113.51],
    ["Madras 4mm", 162.7, 162.7, null],
    ["Brillglass 4mm", 201.1, 201.1, null],
    ["Brillglass Elegant 4mm", 216.3, 216.3, null],
    ["Velglass", 30.42, null, null],
    ["Neoceram 4mm", 545.94, null, null],
    ["Pyrobel EI-30", 621.75, null, null],
    ["Pyrobel EI-60", 803.31, null, null],
    ["Lacobel blanco 9010 4", 60.94, null, null],
    ["Lacobel negro 9005 4", 60.94, null, null],
    ["Lacobel Pure White 9003 4", 82.33, null, null],
    ["Lacobel blanco 9010 5", 70.35, null, null],
    ["Lacobel negro 9005 5", 70.35, null, null],
    ["Lacobel blanco 9010 6", 85.84, null, null],
    ["Lacobel negro 9005 6", 85.84, null, null],
    ["Lacobel color 4", 108.75, null, null],
    ["Lacobel color 5", 109.93, null, null],
    ["Lacobel color 6", 111.12, null, null],
    ["1010.2 DOT incoloro", 202.5, null, null],
    ["1010.2 DOT translucido", 222.75, null, null],
  ];
  const modes = ["MF", "Sustituciones", "Templado"];
  const builtin = reuglassRows.flatMap(([name, ...prices], row) =>
    prices.flatMap((price, column) =>
      price === null
        ? []
        : [
            {
              id: `reuglass-${row + 1}-${column}`,
              name: `Tarifa Reuglass · ${name} · ${modes[column]}`,
              price,
              edge: 0,
            },
          ],
    ),
  );
  function catalog(current = []) {
    return merge(builtin, current);
  }
  function documentPanel() {
    return '<section class="panel"><h2>Tarifa Reuglass</h2><p>Precios netos de vidrio en €/m², separados por MF, Sustituciones y Templado. El guion del documento indica precio no disponible. Cantos no incluidos.</p><p>Los tratamientos, encolados, recargos por forma o tamaño y mínimos de facturación se consultan en el PDF y se añaden manualmente al presupuesto. EVA no incluye el vidrio float. No se aplican automáticamente.</p><p>UVA 4 / TPS 16 / 4: 27,00 €/m² · Cámaras 22 / 24 / 27: +2,00 €/m² · Gas: +1,25 €/m².</p><p>Documento: TARIFA 2025 · NAVAS_10 · 01.07.2026.</p><a href="documents/tarifa-reuglass.pdf" target="_blank" rel="noopener">Abrir PDF completo de Tarifa Reuglass</a></section>';
  }
  window.vidresTariffs = { merge, key, catalog, documentPanel };
})();
