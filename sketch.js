"use strict";
(() => {
  const instances = new WeakMap();
  const colors = ["#17251e", "#b42318", "#2457a7", "#15523e"];
  const limit = 5000;
  const maxDims = 60;
  function clean(value) {
    const pageHeight = Number.isFinite(value?.pageHeight)
      ? Math.max(400, Math.min(2400, Math.round(value.pageHeight)))
      : 700;
    let count = 0;
    const strokes = [];
    for (const stroke of Array.isArray(value?.strokes) ? value.strokes : []) {
      if (count >= limit) break;
      const points = (Array.isArray(stroke.points) ? stroke.points : [])
        .slice(0, limit - count)
        .filter(
          (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite),
        )
        .map(([x, y]) => [
          Math.max(0, Math.min(1000, x)),
          Math.max(0, Math.min(pageHeight, y)),
        ]);
      count += points.length;
      if (points.length) {
        const tool = stroke.tool === "eraser" ? "eraser" : "pen";
        const allowed = tool === "eraser" ? [24, 48, 80] : [3, 6, 10];
        strokes.push({
          color: colors.includes(stroke.color) ? stroke.color : colors[0],
          tool,
          width: allowed.includes(stroke.width) ? stroke.width : allowed[0],
          points,
        });
      }
    }
    const dims = [];
    for (const d of Array.isArray(value?.dims) ? value.dims : []) {
      if (dims.length >= maxDims) break;
      const ok = (p) =>
        Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
      if (!ok(d?.a) || !ok(d?.b)) continue;
      const valor = typeof d?.valor === "string" ? d.valor.slice(0, 12) : "";
      if (!valor.trim()) continue;
      const a = [
          Math.max(0, Math.min(1000, d.a[0])),
          Math.max(0, Math.min(pageHeight, d.a[1])),
        ],
        b = [
          Math.max(0, Math.min(1000, d.b[0])),
          Math.max(0, Math.min(pageHeight, d.b[1])),
        ];
      dims.push({
        id:
          typeof d?.id === "string" && d.id ? d.id : "D-" + crypto.randomUUID(),
        a,
        b,
        valor,
        eje: ejeOf({ a, b }),
      });
    }
    return {
      pageHeight,
      strokes,
      notes: typeof value?.notes === "string" ? value.notes.slice(0, 1000) : "",
      dims,
    };
  }
  // Ajustes geométricos locales: no interpretan cifras ni cambian medidas.
  function straighten(points) {
    if (points.length < 3) return null;
    const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const first = points[0],
      last = points.at(-1),
      span = distance(first, last);
    const length = points
      .slice(1)
      .reduce((n, p, i) => n + distance(points[i], p), 0);
    if (span >= 20 && length <= span * 1.18) {
      const deviation = Math.max(
        ...points.map(
          (p) =>
            Math.abs(
              (last[0] - first[0]) * (first[1] - p[1]) -
                (first[0] - p[0]) * (last[1] - first[1]),
            ) / span,
        ),
      );
      if (deviation <= Math.max(4, span * 0.08)) {
        let end = [...last];
        if (Math.abs(last[1] - first[1]) <= span * 0.12) end[1] = first[1];
        else if (Math.abs(last[0] - first[0]) <= span * 0.12) end[0] = first[0];
        return { points: [first, end], label: "Línea enderezada" };
      }
    }
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]),
      x = Math.min(...xs),
      y = Math.min(...ys),
      w = Math.max(...xs) - x,
      h = Math.max(...ys) - y;
    if (
      points.length < 8 ||
      w < 20 ||
      h < 20 ||
      span > Math.hypot(w, h) * 0.28 ||
      length < 2 * (w + h) * 0.75 ||
      length > 2 * (w + h) * 1.4
    )
      return null;
    const tolerance = Math.max(6, Math.min(w, h) * 0.14),
      corners = [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ];
    if (
      !corners.every((c) =>
        points.some((p) => distance(c, p) <= tolerance * 1.6),
      )
    )
      return null;
    if (
      points.filter(
        (p) =>
          Math.min(
            Math.abs(p[0] - x),
            Math.abs(p[0] - x - w),
            Math.abs(p[1] - y),
            Math.abs(p[1] - y - h),
          ) <= tolerance,
      ).length <
      points.length * 0.85
    )
      return null;
    // Mantener orientación y dimensiones aproximadas del dibujo original.
    return { points: [...corners, corners[0]], label: "Rectángulo ajustado" };
  }
  function smooth(points) {
    if (points.length < 5) return null;
    return points.map((p, i) => {
      if (i === 0 || i === points.length - 1) return [...p];
      return [0, 1].map((axis) =>
        Math.round(
          (points[i - 1][axis] + 2 * p[axis] + points[i + 1][axis]) / 4,
        ),
      );
    });
  }
  // Clasifica una cota por su orientación a partir de sus extremos.
  function ejeOf(d) {
    const dx = Math.abs(d.b[0] - d.a[0]),
      dy = Math.abs(d.b[1] - d.a[1]);
    if (dx > dy * 2) return "h";
    if (dy > dx * 2) return "v";
    return "d";
  }
  const unitName = () => {
    try {
      return VSStorage.read("vs-config-v1", {}).unit === "mm" ? "mm" : "cm";
    } catch {
      return "cm";
    }
  };
  function mount(host, initial, options = {}) {
    instances.get(host)?.destroy();
    host.replaceChildren();
    const details = document.createElement("details");
    details.className = "sketch-book";
    details.innerHTML = `<summary>✎ Dibujar medidas · Bloc de croquis</summary><div class="sketch-editor">
      <p>Dibuja medidas y formas con el dedo, lápiz táctil o ratón. Se guarda al guardar la pieza.</p>
      <div class="sketch-tools sketch-case" role="group" aria-label="Estuche de dibujo">
        <button type="button" data-case-toggle aria-expanded="false">✎ Estuche</button>
        <span data-case-state>Lápiz negro · fino</span>
        <div class="sketch-case-panel" hidden>
        <button type="button" data-sketch-cota>＋ Cota</button>
        <button type="button" data-sketch-use-dims>Usar cotas como medidas</button>
        <button type="button" data-ink="#17251e" aria-pressed="true">Negro</button>
        <button type="button" data-ink="#b42318" aria-pressed="false">Rojo</button>
        <button type="button" data-ink="#2457a7" aria-pressed="false">Azul</button>
        <button type="button" data-ink="#15523e" aria-pressed="false">Verde</button>
        <button type="button" data-sketch-eraser aria-pressed="false">Goma</button>
        <label>Grosor del lápiz<select data-sketch-width><option value="3">Fino</option><option value="6">Medio</option><option value="10">Grueso</option></select></label>
        <label>Tamaño de goma<select data-eraser-width><option value="24">Pequeña</option><option value="48" selected>Mediana</option><option value="80">Grande</option></select></label>
        <button type="button" data-sketch-notes>Notas escritas</button><button type="button" data-sketch-expand>Abrir pantalla del bloc</button>
        <button type="button" data-sketch-undo>Deshacer</button>
        <button type="button" data-sketch-redo>Rehacer</button>
        <button type="button" data-sketch-clear>Borrar dibujo</button>
        </div>
      </div>
      <div class="sketch-dim-tools" hidden>
        <span class="sketch-dim-tools-label">Cota seleccionada</span>
        <button type="button" data-dim-edit>Editar valor</button>
        <button type="button" data-dim-delete>Eliminar</button>
        <button type="button" data-dim-close aria-label="Cerrar">✕</button>
      </div>
      <p>Mejora automática al levantar el dedo o lápiz: endereza líneas, ajusta rectángulos y suaviza los demás trazos. Dibuja el contorno de una vez. Deshacer recupera el trazo original. No interpreta letras ni medidas. Para una cota, pulsa «＋ Cota» y toca dos puntos de la hoja.</p>
      <div class="sketch-sheet"><canvas width="1000" height="700" aria-label="Hoja de croquis: dibuja con el dedo, lápiz o ratón"></canvas></div>
      <label class="sketch-note" hidden>Notas del croquis<textarea maxlength="1000" rows="3" placeholder="Medidas, detalles de montaje o indicaciones…"></textarea></label>
      <p class="sketch-message" role="status" aria-live="polite"></p></div>`;
    const editor = details.querySelector(".sketch-editor");
    editor.classList.add("sketch-book");
    host.appendChild(details);
    const preview = document.createElement("div");
    preview.className = "sketch-preview";
    preview.hidden = true;
    preview.innerHTML =
      '<button type="button" aria-label="Abrir el croquis guardado"><img alt="Vista previa de la hoja de medidas"></button><p></p>';
    host.appendChild(preview);
    const expanded = document.createElement("dialog");
    expanded.className = "sketch-expanded";
    const titleId = "sketch-title-" + crypto.randomUUID();
    expanded.setAttribute("aria-labelledby", titleId);
    expanded.innerHTML = `<div class="sketch-expanded-header"><h2 id="${titleId}">Bloc de medidas</h2><button type="button" data-sketch-return>Aceptar</button><button type="button" data-sketch-cancel>Cancelar</button></div><div class="sketch-expanded-content"></div>`;
    host.appendChild(expanded);
    const keypad = document.createElement("dialog");
    keypad.className = "sketch-keypad";
    keypad.innerHTML = `<form method="dialog" class="sketch-keypad-form">
      <p class="sketch-keypad-title">Valor de la cota</p>
      <output class="sketch-keypad-value" aria-live="polite">0</output>
      <p class="sketch-keypad-unit">Unidad: <span data-keypad-unit>cm</span></p>
      <div class="sketch-keypad-grid" role="group" aria-label="Teclado numérico">
        <button type="button" data-kp="7">7</button>
        <button type="button" data-kp="8">8</button>
        <button type="button" data-kp="9">9</button>
        <button type="button" data-kp="4">4</button>
        <button type="button" data-kp="5">5</button>
        <button type="button" data-kp="6">6</button>
        <button type="button" data-kp="1">1</button>
        <button type="button" data-kp="2">2</button>
        <button type="button" data-kp="3">3</button>
        <button type="button" data-kp=",">,</button>
        <button type="button" data-kp="0">0</button>
        <button type="button" data-kp="del" aria-label="Borrar">⌫</button>
      </div>
      <div class="sketch-keypad-actions">
        <button type="button" data-kp-cancel>Cancelar</button>
        <button type="button" data-kp-accept class="primary">Aceptar</button>
      </div>
    </form>`;
    host.appendChild(keypad);
    function enlarge() {
      if (expanded.open) return;
      details.open = true;
      expanded.querySelector(".sketch-expanded-content").appendChild(editor);
      expanded.showModal();
      requestAnimationFrame(fitSheet);
    }
    let saving = false;
    preview.querySelector("button").addEventListener("click", enlarge);
    expanded
      .querySelector("[data-sketch-return]")
      .addEventListener("click", async () => {
        if (pointer !== null || saving) return;
        saving = true;
        editor.inert = true;
        expanded
          .querySelectorAll("[data-sketch-return],[data-sketch-cancel]")
          .forEach((b) => (b.disabled = true));
        try {
          const result = read();
          await options.onAccept?.(result);
          accepted = structuredClone(result);
          updatePreview();
          expanded.close();
        } catch {
          message.textContent =
            "No se pudo guardar el croquis. Conserva esta pantalla e inténtalo de nuevo.";
          VSUI.toast(message.textContent, "error");
        } finally {
          saving = false;
          editor.inert = false;
          expanded
            .querySelectorAll("[data-sketch-return],[data-sketch-cancel]")
            .forEach((b) => (b.disabled = false));
        }
      });
    async function cancel() {
      if (saving) return;
      const changed =
        JSON.stringify({
          strokes: state.strokes,
          notes: notes.value.trim(),
          dims: state.dims,
        }) !==
        JSON.stringify({
          strokes: accepted.strokes,
          notes: accepted.notes,
          dims: accepted.dims,
        });
      if (changed) {
        const ok = await VSUI.confirm({
          titulo: "Descartar croquis",
          texto: "Hay cambios sin aceptar. ¿Descartarlos y volver al parte?",
          aceptar: "Descartar",
          cancelar: "Cancelar",
        });
        if (!ok) return;
      }
      state = clean(accepted);
      notes.value = state.notes;
      history = [];
      future = [];
      selectedDim = null;
      cotaStart = null;
      cotaMode = false;
      draggingDim = null;
      previewEnd = null;
      redraw();
      expanded.close();
    }
    expanded
      .querySelector("[data-sketch-cancel]")
      .addEventListener("click", cancel);
    expanded.addEventListener("cancel", (e) => {
      e.preventDefault();
      cancel();
    });
    expanded.addEventListener("close", () => {
      closeCase();
      editor.querySelector(".sketch-note").hidden = true;
      details.open = false;
      if (
        editor.parentNode === expanded.querySelector(".sketch-expanded-content")
      )
        details.appendChild(editor);
      if (active) {
        active = null;
        pointer = null;
        redraw();
      }
    });
    details.querySelector("summary").addEventListener("click", (e) => {
      e.preventDefault();
      enlarge();
    });
    const normalized = clean(initial);
    let state = structuredClone(normalized),
      accepted = structuredClone(normalized),
      ink = colors[0],
      active = null,
      pointer = null,
      history = [],
      future = [],
      tool = "pen",
      selectedDim = null,
      cotaStart = null,
      cotaMode = false,
      draggingDim = null,
      previewEnd = null;
    const canvas = editor.querySelector("canvas"),
      ctx = canvas.getContext("2d"),
      notes = editor.querySelector("textarea"),
      message = editor.querySelector(".sketch-message");
    const casePanel = editor.querySelector(".sketch-case-panel"),
      caseToggle = editor.querySelector("[data-case-toggle]");
    const dimTools = editor.querySelector(".sketch-dim-tools");
    casePanel.id = "sketch-case-" + crypto.randomUUID();
    caseToggle.setAttribute("aria-controls", casePanel.id);
    function closeCase() {
      casePanel.hidden = true;
      caseToggle.setAttribute("aria-expanded", "false");
    }
    function toolStatus() {
      const name = {
        "#17251e": "negro",
        "#b42318": "rojo",
        "#2457a7": "azul",
        "#15523e": "verde",
      }[ink];
      const size = editor.querySelector(
        tool === "eraser" ? "[data-eraser-width]" : "[data-sketch-width]",
      );
      editor.querySelector("[data-case-state]").textContent =
        (tool === "eraser" ? "Goma" : "Lápiz " + name) +
        " · " +
        size.selectedOptions[0].text.toLocaleLowerCase("es");
    }
    editor.addEventListener("change", (e) => {
      if (e.target.matches("[data-sketch-width],[data-eraser-width]"))
        toolStatus();
    });
    function read() {
      return structuredClone({
        pageHeight: state.pageHeight,
        strokes: state.strokes,
        notes: notes.value.trim(),
        dims: state.dims,
      });
    }
    function updatePreview() {
      const page = document.createElement("canvas");
      page.width = 320;
      page.height = Math.round((320 * state.pageHeight) / 1000);
      const pc = page.getContext("2d");
      pc.fillStyle = "#fff";
      pc.fillRect(0, 0, page.width, page.height);
      pc.drawImage(canvas, 0, 0, page.width, page.height);
      preview.querySelector("img").src = page.toDataURL("image/png");
      preview.hidden =
        !state.strokes.length && !notes.value.trim() && !state.dims.length;
      preview.querySelector("p").textContent = options.onAccept
        ? "Croquis guardado en la pieza."
        : "Croquis aceptado. Guarda el parte o la pieza para conservarlo.";
      details.querySelector("summary").textContent =
        "✎ Abrir pantalla del bloc";
    }
    function fitSheet() {
      if (!expanded.open) return;
      const sheet = editor.querySelector(".sketch-sheet"),
        r = sheet.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const target = Math.max(
        400,
        Math.min(2400, Math.round((r.height * 1000) / r.width)),
      );
      state.pageHeight = state.strokes.length
        ? Math.max(state.pageHeight, target)
        : target;
      canvas.height = state.pageHeight;
      const scale = Math.min(r.width / 1000, r.height / state.pageHeight);
      canvas.style.width = 1000 * scale + "px";
      canvas.style.height = state.pageHeight * scale + "px";
      redraw();
    }
    const observer = new ResizeObserver(fitSheet);
    observer.observe(editor.querySelector(".sketch-sheet"));
    notes.value = state.notes;
    if (state.strokes.length || state.notes || state.dims.length)
      details.querySelector("summary").textContent =
        "✎ Dibujar medidas · Con anotaciones";
    function draw(stroke) {
      ctx.save();
      ctx.globalCompositeOperation =
        stroke.tool === "eraser" ? "destination-out" : "source-over";
      ctx.strokeStyle = ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width || (stroke.tool === "eraser" ? 24 : 3);
      ctx.lineCap = ctx.lineJoin = "round";
      const [first, ...rest] = stroke.points;
      if (!first) {
        ctx.restore();
        return;
      }
      if (!rest.length) {
        ctx.beginPath();
        ctx.arc(first[0], first[1], ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      ctx.beginPath();
      ctx.moveTo(...first);
      for (const p of rest) ctx.lineTo(...p);
      ctx.stroke();
      ctx.restore();
    }
    function drawDim(d) {
      const selected = d.id === selectedDim;
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = selected ? "#b42318" : "#315c42";
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(d.a[0], d.a[1]);
      ctx.lineTo(d.b[0], d.b[1]);
      ctx.stroke();
      ctx.setLineDash([]);
      const dx = d.b[0] - d.a[0],
        dy = d.b[1] - d.a[1],
        len = Math.hypot(dx, dy) || 1,
        ux = dx / len,
        uy = dy / len,
        px = -uy,
        py = ux;
      for (const p of [d.a, d.b]) {
        ctx.beginPath();
        ctx.moveTo(p[0] - px * 8, p[1] - py * 8);
        ctx.lineTo(p[0] + px * 8, p[1] + py * 8);
        ctx.stroke();
      }
      for (const p of [d.a, d.b]) {
        ctx.beginPath();
        ctx.arc(p[0], p[1], 3, 0, Math.PI * 2);
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
      }
      const label = d.valor + " " + unitName(),
        mx = (d.a[0] + d.b[0]) / 2,
        my = (d.a[1] + d.b[1]) / 2;
      ctx.font =
        "bold 15px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
      const w = ctx.measureText(label).width,
        pad = 4,
        ty = my - 14;
      ctx.fillStyle = "rgba(255,255,255,0.94)";
      ctx.fillRect(mx - w / 2 - pad, ty - 10, w + pad * 2, 20);
      ctx.fillStyle = "#17251e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, mx, ty);
      ctx.restore();
      if (selected) {
        ctx.save();
        ctx.fillStyle = "#b42318";
        for (const p of [d.a, d.b]) ctx.fillRect(p[0] - 6, p[1] - 6, 12, 12);
        ctx.restore();
      }
    }
    const snapshot = () => ({
      strokes: structuredClone(state.strokes),
      dims: structuredClone(state.dims),
    });
    function remember() {
      future = [];
      history.push(snapshot());
      if (history.length > 20) history.shift();
    }
    function redraw() {
      if (canvas.height !== state.pageHeight) canvas.height = state.pageHeight;
      ctx.clearRect(0, 0, 1000, state.pageHeight);
      state.strokes.forEach(draw);
      if (cotaMode && cotaStart && previewEnd) {
        ctx.save();
        ctx.strokeStyle = "#b42318";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cotaStart[0], cotaStart[1]);
        ctx.lineTo(previewEnd[0], previewEnd[1]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(cotaStart[0], cotaStart[1], 4, 0, Math.PI * 2);
        ctx.fillStyle = "#b42318";
        ctx.fill();
        ctx.restore();
      }
      state.dims.forEach(drawDim);
      editor.querySelector("[data-sketch-undo]").disabled = !history.length;
      editor.querySelector("[data-sketch-clear]").disabled =
        !state.strokes.length;
      editor.querySelector("[data-sketch-redo]").disabled = !future.length;
      dimTools.hidden = !selectedDim;
    }
    const point = (e) => {
      const r = canvas.getBoundingClientRect();
      return [
        Math.round(
          Math.max(0, Math.min(1000, ((e.clientX - r.left) * 1000) / r.width)),
        ),
        Math.round(
          Math.max(
            0,
            Math.min(
              state.pageHeight,
              ((e.clientY - r.top) * state.pageHeight) / r.height,
            ),
          ),
        ),
      ];
    };
    const count = () =>
      state.strokes.reduce((n, s) => n + s.points.length, 0) +
      (active?.points.length || 0);
    // Distancia de un punto al segmento a-b (en coordenadas del lienzo).
    function distanceToSegment(p, a, b) {
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        lenSq = dx * dx + dy * dy;
      let t = lenSq ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
    }
    // Umbral en unidades del lienzo equivalente a píxeles de pantalla.
    const screenPx = (px) => {
      const r = canvas.getBoundingClientRect();
      return r.width > 0 ? (px * 1000) / r.width : px;
    };
    function hitTestDim(p) {
      const nearLine = screenPx(14),
        nearEnd = screenPx(22);
      let best = null,
        bestDist = nearLine;
      for (const d of state.dims) {
        const distA = Math.hypot(p[0] - d.a[0], p[1] - d.a[1]),
          distB = Math.hypot(p[0] - d.b[0], p[1] - d.b[1]);
        if (distA < nearEnd && distA < bestDist) {
          best = { id: d.id, handle: "a" };
          bestDist = distA;
        }
        if (distB < nearEnd && distB < bestDist) {
          best = { id: d.id, handle: "b" };
          bestDist = distB;
        }
        const seg = distanceToSegment(p, d.a, d.b);
        if (seg < nearLine && seg < bestDist) {
          best = { id: d.id, handle: null };
          bestDist = seg;
        }
      }
      return best;
    }
    async function useDimsAsMeasures() {
      const horizontal = state.dims.filter((d) => ejeOf(d) === "h"),
        vertical = state.dims.filter((d) => ejeOf(d) === "v");
      if (!horizontal.length && !vertical.length) {
        VSUI.toast(
          "No hay cotas horizontales ni verticales. Añade una cota horizontal para el ancho y una vertical para el alto.",
          "warn",
        );
        return;
      }
      const unit = unitName(),
        toCm = (d) => VSUtils.dimensionToCm(d.valor, unit),
        hVal = horizontal.length ? toCm(horizontal[0]) : null,
        vVal = vertical.length ? toCm(vertical[0]) : null;
      const parts = [];
      if (hVal != null) parts.push("ancho = " + hVal + " cm");
      if (vVal != null) parts.push("alto = " + vVal + " cm");
      const ok = await VSUI.confirm({
        titulo: "Copiar cotas",
        texto:
          "¿Copiar las cotas a las medidas de la pieza? " +
          parts.join(", ") +
          ".",
        aceptar: "Copiar",
        cancelar: "Cancelar",
      });
      if (!ok) return;
      options.onUseDims?.({ ancho: hVal, alto: vVal });
      message.textContent =
        "Cotas aplicadas a las medidas. Revisa los campos antes de guardar.";
    }
    function openKeypad(initialValue, onAccept) {
      keypad.querySelector(".sketch-keypad-value").textContent =
        initialValue || "0";
      keypad
        .querySelector(".sketch-keypad-value")
        .classList.toggle("empty", !initialValue);
      keypad.querySelector("[data-keypad-unit]").textContent = unitName();
      keypad._value = String(initialValue || "");
      keypad._onAccept = onAccept;
      keypad.showModal();
      requestAnimationFrame(() =>
        keypad.querySelector("[data-kp-accept]").focus(),
      );
    }
    keypad.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      const k = b.dataset.kp;
      if (k === "del") {
        keypad._value = keypad._value.slice(0, -1);
      } else if (k) {
        if (keypad._value.length >= 12) return;
        keypad._value += k;
      } else if (b.hasAttribute("data-kp-cancel")) {
        keypad._value = "";
        keypad.close();
        return;
      } else if (b.hasAttribute("data-kp-accept")) {
        const res = VSUtils.parseDimension(keypad._value);
        if (!res.ok) {
          VSUI.toast(res.error, "warn");
          return;
        }
        const cm = VSUtils.dimensionToCm(res.value, unitName());
        if (cm > 1000) {
          const ok = await VSUI.confirm({
            titulo: "Medida grande",
            texto:
              "La medida equivale a más de 1000 cm. ¿Confirmar este valor?",
            aceptar: "Confirmar",
            cancelar: "Cancelar",
          });
          if (!ok) return;
        }
        const onAccept = keypad._onAccept,
          valor = keypad._value;
        keypad._value = "";
        keypad.close();
        onAccept?.(valor);
        return;
      }
      const out = keypad.querySelector(".sketch-keypad-value");
      out.textContent = keypad._value || "0";
      out.classList.toggle("empty", !keypad._value);
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (saving || pointer !== null || !e.isPrimary || e.button !== 0) return;
      const p = point(e);
      if (cotaMode) {
        if (!cotaStart) {
          cotaStart = p;
          previewEnd = p;
          message.textContent = "Toca el segundo punto de la cota.";
          redraw();
        } else {
          if (p[0] === cotaStart[0] && p[1] === cotaStart[1]) {
            message.textContent =
              "El segundo punto debe ser distinto del primero.";
            return;
          }
          const a = cotaStart,
            b = p;
          cotaStart = null;
          previewEnd = null;
          cotaMode = false;
          canvas.classList.remove("is-cota");
          openKeypad("", (valor) => {
            remember();
            state.dims.push({
              id: "D-" + crypto.randomUUID(),
              a,
              b,
              valor,
              eje: ejeOf({ a, b }),
            });
            selectedDim = null;
            message.textContent =
              "Cota añadida. Tócala para editarla, moverla o eliminarla.";
            redraw();
          });
        }
        return;
      }
      const hit = hitTestDim(p);
      if (hit?.handle) {
        draggingDim = { id: hit.id, handle: hit.handle };
        selectedDim = hit.id;
        remember();
        pointer = e.pointerId;
        canvas.setPointerCapture(pointer);
        message.textContent = "Mueve el extremo de la cota.";
        redraw();
        return;
      }
      if (hit) {
        selectedDim = hit.id;
        closeCase();
        message.textContent =
          "Cota seleccionada. Puedes editar su valor, mover sus extremos o eliminarla.";
        redraw();
        return;
      }
      selectedDim = null;
      if (count() >= limit) {
        message.textContent =
          "Hoja llena. Deshaz algún trazo antes de seguir dibujando.";
        return;
      }
      closeCase();
      e.preventDefault();
      pointer = e.pointerId;
      active = {
        color: ink,
        tool,
        width: Number(
          editor.querySelector(
            tool === "eraser" ? "[data-eraser-width]" : "[data-sketch-width]",
          ).value,
        ),
        points: [p],
      };
      canvas.setPointerCapture(pointer);
      redraw();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (cotaMode && cotaStart && pointer === null) {
        previewEnd = point(e);
        redraw();
        return;
      }
      if (e.pointerId !== pointer) return;
      e.preventDefault();
      if (draggingDim) {
        const p = point(e),
          d = state.dims.find((x) => x.id === draggingDim.id);
        if (d) {
          if (draggingDim.handle === "a") d.a = p;
          else d.b = p;
          d.eje = ejeOf(d);
        }
        redraw();
        return;
      }
      if (!active) return;
      const p = point(e),
        last = active.points.at(-1);
      if (count() < limit && (p[0] !== last[0] || p[1] !== last[1])) {
        active.points.push(p);
        redraw();
      }
      if (count() >= limit)
        message.textContent = "Hoja llena. Puedes guardar o deshacer trazos.";
    });
    function finish(e) {
      if (e.pointerId !== pointer) return;
      if (draggingDim) {
        draggingDim = null;
        pointer = null;
        message.textContent = "Cota movida.";
        redraw();
        return;
      }
      if (e.type === "pointerup" && active) {
        const end = point(e),
          last = active.points.at(-1);
        if (count() < limit && (end[0] !== last[0] || end[1] !== last[1]))
          active.points.push(end);
        remember();
        state.strokes.push(active);
        const assisted =
            active.tool === "pen" ? straighten(active.points) : null,
          points =
            active.tool === "pen"
              ? assisted?.points || smooth(active.points)
              : null;
        if (
          points &&
          JSON.stringify(points) !== JSON.stringify(active.points)
        ) {
          // Deshacer primero restaura el trazo original, después permite quitarlo.
          remember();
          state.strokes[state.strokes.length - 1] = { ...active, points };
          message.textContent =
            (assisted?.label || "Trazo suavizado automáticamente") +
            ". Deshacer recupera el original.";
        } else
          message.textContent =
            active.tool === "eraser"
              ? "Zona borrada. Puedes deshacer."
              : "Trazo conservado.";
      }
      active = null;
      pointer = null;
      redraw();
    }
    canvas.addEventListener("pointerup", finish);
    canvas.addEventListener("pointercancel", finish);
    canvas.addEventListener("lostpointercapture", finish);
    editor.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.hasAttribute("data-case-toggle")) {
        casePanel.hidden = !casePanel.hidden;
        caseToggle.setAttribute("aria-expanded", String(!casePanel.hidden));
        return;
      }
      if (b.hasAttribute("data-sketch-cota")) {
        if (state.dims.length >= maxDims) {
          message.textContent =
            "Has alcanzado el máximo de 60 cotas por croquis.";
          return;
        }
        cotaMode = true;
        cotaStart = null;
        previewEnd = null;
        draggingDim = null;
        selectedDim = null;
        closeCase();
        canvas.classList.add("is-cota");
        message.textContent = "Toca el primer punto de la cota en la hoja.";
        redraw();
        return;
      }
      if (b.hasAttribute("data-sketch-use-dims")) {
        useDimsAsMeasures();
        return;
      }
      if (b.hasAttribute("data-dim-edit")) {
        const d = state.dims.find((x) => x.id === selectedDim);
        if (d)
          openKeypad(d.valor, (valor) => {
            remember();
            d.valor = valor;
            message.textContent = "Valor de la cota actualizado.";
            redraw();
          });
        return;
      }
      if (b.hasAttribute("data-dim-delete")) {
        const d = state.dims.find((x) => x.id === selectedDim);
        if (d) {
          const ok = await VSUI.confirm({
            titulo: "Eliminar cota",
            texto: "¿Eliminar esta cota?",
            aceptar: "Eliminar",
            cancelar: "Cancelar",
            peligro: true,
          });
          if (ok) {
            remember();
            state.dims = state.dims.filter((x) => x.id !== selectedDim);
            selectedDim = null;
            message.textContent = "Cota eliminada.";
            redraw();
          }
        }
        return;
      }
      if (b.hasAttribute("data-dim-close")) {
        selectedDim = null;
        redraw();
        return;
      }
      if (b.hasAttribute("data-sketch-notes")) {
        const note = editor.querySelector(".sketch-note");
        note.hidden = !note.hidden;
        closeCase();
        if (!note.hidden) notes.focus();
        return;
      }
      if (b.hasAttribute("data-sketch-expand")) {
        enlarge();
        return;
      }
      if (b.dataset.ink || b.hasAttribute("data-sketch-eraser")) {
        tool = b.hasAttribute("data-sketch-eraser") ? "eraser" : "pen";
        if (b.dataset.ink) ink = b.dataset.ink;
        cotaMode = false;
        cotaStart = null;
        previewEnd = null;
        canvas.classList.remove("is-cota");
        editor
          .querySelectorAll("[data-ink]")
          .forEach((x) =>
            x.setAttribute(
              "aria-pressed",
              String(tool === "pen" && x.dataset.ink === ink),
            ),
          );
        editor
          .querySelector("[data-sketch-eraser]")
          .setAttribute("aria-pressed", String(tool === "eraser"));
        canvas.classList.toggle("is-erasing", tool === "eraser");
        toolStatus();
        message.textContent =
          tool === "eraser"
            ? "Goma activa: pasa por la zona que quieras borrar."
            : "Lápiz activo.";
      }
      if (b.hasAttribute("data-sketch-undo")) {
        future.push(snapshot());
        if (future.length > 20) future.shift();
        const prev = history.pop();
        if (prev) {
          state.strokes = prev.strokes;
          state.dims = prev.dims;
        } else state.strokes.pop();
        selectedDim = null;
        message.textContent = "Última acción deshecha.";
        redraw();
      }
      if (b.hasAttribute("data-sketch-redo") && future.length) {
        history.push(snapshot());
        if (history.length > 20) history.shift();
        const next = future.pop();
        if (next) {
          state.strokes = next.strokes;
          state.dims = next.dims;
        }
        selectedDim = null;
        message.textContent = "Última acción rehecha.";
        redraw();
      }
      if (b.hasAttribute("data-sketch-clear")) {
        const ok = await VSUI.confirm({
          titulo: "Borrar croquis",
          texto:
            "¿Borrar todos los trazos de este croquis? Las notas se conservarán.",
          aceptar: "Borrar",
          cancelar: "Cancelar",
          peligro: true,
        });
        if (ok) {
          remember();
          state.strokes = [];
          message.textContent =
            "Dibujo borrado. Guarda la pieza para confirmar el cambio.";
          redraw();
        }
      }
    });
    redraw();
    if (state.strokes.length || state.notes || state.dims.length)
      updatePreview();
    const instance = {
      read,
      open: enlarge,
      close() {
        if (keypad.open) keypad.close();
        if (expanded.open) expanded.close();
      },
      destroy() {
        observer.disconnect();
        if (keypad.open) keypad.close();
        if (expanded.open) expanded.close();
      },
    };
    instances.set(host, instance);
    return instance;
  }
  window.vidresSketch = {
    mount,
    destroy: (host) => instances.get(host)?.destroy(),
    open: (host) => instances.get(host)?.open(),
    read: (host) => instances.get(host)?.read() || { strokes: [], notes: "" },
  };
})();
